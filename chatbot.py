import os
import json
import base64
import io
import wave
import asyncio
import urllib.request
import urllib.error
import edge_tts
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
if not GOOGLE_API_KEY:
    raise RuntimeError("Missing GOOGLE_API_KEY or GEMINI_API_KEY environment variable.")
genai.configure(api_key=GOOGLE_API_KEY)

SYSTEM_PROMPT = (
    "You are a mindfulness virtual assistant for a multilingual mindfulness session. "
    "Respond with calm, supportive, and practical guidance while keeping continuity "
    "with the conversation so far."
)
ACTIVITIES_PATH = os.path.join(os.path.dirname(__file__), "mindfulness_activities.json")
GEMINI_TTS_MODEL = os.getenv("GEMINI_TTS_MODEL", "gemini-3.1-flash-tts-preview")
GEMINI_TTS_VOICE = os.getenv("GEMINI_TTS_VOICE", "Iapetus")
GEMINI_TTS_SAMPLE_RATE = 24000
EDGE_TTS_VOICE = os.getenv("EDGE_TTS_VOICE", "en-US-AndrewMultilingualNeural")


async def _edge_tts_async(text, voice):
    communicate = edge_tts.Communicate(text, voice)
    chunks = []
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            chunks.append(chunk["data"])
    return b"".join(chunks)


def synthesize_edge_tts(text, voice=None):
    prompt_text = (text or "").strip()
    if not prompt_text:
        raise ValueError("Missing text for speech synthesis.")
    audio_bytes = asyncio.run(_edge_tts_async(prompt_text, voice or EDGE_TTS_VOICE))
    return {
        "audio_bytes": audio_bytes,
        "content_type": "audio/mpeg",
        "voice_name": voice or EDGE_TTS_VOICE,
    }


def pcm_to_wav_bytes(pcm_bytes, channels=1, sample_rate=GEMINI_TTS_SAMPLE_RATE, sample_width=2):
    output = io.BytesIO()
    with wave.open(output, "wb") as wav_file:
        wav_file.setnchannels(channels)
        wav_file.setsampwidth(sample_width)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm_bytes)
    return output.getvalue()


def synthesize_gemini_speech(text, voice_name=None, model=GEMINI_TTS_MODEL):
    prompt_text = (text or "").strip()
    if not prompt_text:
        raise ValueError("Missing text for speech synthesis.")

    payload = {
        "contents": [{"parts": [{"text": prompt_text}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {
                        "voiceName": voice_name or GEMINI_TTS_VOICE
                    }
                }
            },
        },
        "model": model,
    }

    request = urllib.request.Request(
        url=f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": GOOGLE_API_KEY,
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            raw_body = response.read()
    except urllib.error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Gemini TTS HTTP {exc.code}: {details}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Gemini TTS request failed: {exc.reason}") from exc

    response_json = json.loads(raw_body.decode("utf-8"))
    candidates = response_json.get("candidates") or []
    if not candidates:
        raise RuntimeError("Gemini TTS returned no candidates.")

    parts = (((candidates[0] or {}).get("content") or {}).get("parts")) or []
    inline_data = (parts[0] or {}).get("inlineData") if parts else None
    audio_b64 = (inline_data or {}).get("data")
    if not audio_b64:
        raise RuntimeError("Gemini TTS returned no audio data.")

    pcm_bytes = base64.b64decode(audio_b64)
    wav_bytes = pcm_to_wav_bytes(pcm_bytes)
    return {
        "audio_bytes": wav_bytes,
        "content_type": "audio/wav",
        "voice_name": voice_name or GEMINI_TTS_VOICE,
        "model": model,
        "sample_rate": GEMINI_TTS_SAMPLE_RATE,
    }


_ACTIVITIES_CACHE = None

def load_mindfulness_activities():
    global _ACTIVITIES_CACHE
    if _ACTIVITIES_CACHE is None:
        with open(ACTIVITIES_PATH, "r", encoding="utf-8") as file_obj:
            _ACTIVITIES_CACHE = json.load(file_obj)
    return _ACTIVITIES_CACHE


def find_activity(activity_id):
    for activity in load_mindfulness_activities():
        if activity["id"] == activity_id:
            return activity
    return None


def build_activity_step_message(activity, step_index):
    total_steps = len(activity["steps"])
    current_step = activity["steps"][step_index]
    return (
        f"{activity['title']}\n"
        f"{activity['description']}\n\n"
        f"Step {step_index + 1} of {total_steps}: {current_step}\n\n"
        "When you are ready, tap the check button so we can move to the next step."
    )


def build_chat_prompt(user_message, history=None, summary="", activity_context=None):
    history = history or []
    sections = [SYSTEM_PROMPT]

    if summary:
        sections.append(f"Conversation summary so far:\n{summary}")

    if activity_context:
        activity_details = (
            f"Active mindfulness activity: {activity_context['title']}\n"
            f"Description: {activity_context['description']}\n"
            f"Current step ({activity_context['current_step_index'] + 1}/"
            f"{len(activity_context['steps'])}): {activity_context['steps'][activity_context['current_step_index']]}\n"
            "Stay aligned with this activity and help the user complete the current step calmly "
            "before moving on."
        )
        sections.append(activity_details)

    if history:
        transcript = "\n".join(
            f"{item['role'].capitalize()}: {item['content']}" for item in history
        )
        sections.append(f"Recent conversation:\n{transcript}")

    sections.append(f"User: {user_message}")
    sections.append("Assistant:")
    return "\n\n".join(sections)


def summarize_history(history, prior_summary="", model="gemini-2.5-flash"):
    if not history:
        return prior_summary

    transcript = "\n".join(
        f"{item['role'].capitalize()}: {item['content']}" for item in history
    )
    prompt = (
        "Summarize the following mindfulness chat for future context. Preserve the user's "
        "goals, emotional state, preferences, key concerns, and useful follow-up items. "
        "Keep it concise and do not invent details.\n\n"
        f"Existing summary:\n{prior_summary or 'None'}\n\n"
        f"New conversation to merge:\n{transcript}\n\n"
        "Updated summary:"
    )
    result = call_gemini(prompt, model=model, temperature=0.3)
    return result["choices"][0]["message"]["content"]


def build_session_recap(summary="", history=None, model="gemini-2.5-flash"):
    history = history or []
    transcript = "\n".join(
        f"{item['role'].capitalize()}: {item['content']}" for item in history
    ) or "No additional recent messages."
    prompt = (
        "Create a short, friendly recap of this mindfulness session. Focus on the main "
        "themes discussed, the user's concerns or goals, and any calming practices or "
        "next steps that came up. Keep it to 3 or 4 sentences.\n\n"
        f"Stored session summary:\n{summary or 'None'}\n\n"
        f"Recent messages:\n{transcript}\n\n"
        "Session recap:"
    )
    result = call_gemini(prompt, model=model, temperature=0.3)
    return result["choices"][0]["message"]["content"]

_MODEL_CACHE = {}


def call_gemini_stream(prompt, model="gemini-3.1-flash-lite-preview", temperature=0.7):
    """Yield text fragments as Gemini streams its response."""
    if model not in _MODEL_CACHE:
        _MODEL_CACHE[model] = genai.GenerativeModel(model)
    model_obj = _MODEL_CACHE[model]
    generation_config = genai.types.GenerationConfig(
        temperature=temperature,
        top_p=0.95,
        top_k=40,
        max_output_tokens=8192,
    )
    response = model_obj.generate_content(
        prompt,
        generation_config=generation_config,
        stream=True,
    )
    for chunk in response:
        if chunk.text:
            yield chunk.text


def call_gemini(prompt, model="gemini-3.1-flash-lite-preview", temperature=0.7):
    if model not in _MODEL_CACHE:
        _MODEL_CACHE[model] = genai.GenerativeModel(model)
    model_obj = _MODEL_CACHE[model]

    generation_config = genai.types.GenerationConfig(
        temperature=temperature,
        top_p=0.95,
        top_k=40,
        max_output_tokens=8192,
    )

    response = model_obj.generate_content(
        prompt,
        generation_config=generation_config
    )

    return {
        "choices": [{
            "message": {
                "role": "assistant",
                "content": response.text
            },
            "finish_reason": response.candidates[0].finish_reason.name if response.candidates else None
        }],
        "usage": {
            "prompt_tokens": response.usage_metadata.prompt_token_count,
            "completion_tokens": response.usage_metadata.candidates_token_count,
            "total_tokens": response.usage_metadata.total_token_count
        },
        "model": model
    }


def main():
    max_history_messages = 20
    summary_batch_size = 10
    context_history = []
    context_summary = ""
    session_ended = False

    while not session_ended:
        userinput = input("Type a message ...")
        prompt = build_chat_prompt(
            user_message=userinput,
            history=context_history,
            summary=context_summary,
        )
        result = call_gemini(prompt)
        content = result["choices"][0]["message"]["content"]
        print(content)
        context_history.append({"role": "user", "content": userinput})
        context_history.append({"role": "assistant", "content": content})

        if len(context_history) > max_history_messages:
            overflow = len(context_history) - max_history_messages
            batch_size = max(summary_batch_size, overflow)
            batch_to_summarize = context_history[:batch_size]
            context_summary = summarize_history(batch_to_summarize, context_summary)
            context_history = context_history[batch_size:]

        continue_session = input("Continue Session? (y/n) ").strip().lower()
        session_ended = continue_session not in {"y", "yes"}
