import json
import os
import re
from threading import Lock
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from chatbot import (
    build_activity_step_message,
    build_chat_prompt,
    build_session_recap,
    call_gemini,
    call_gemini_stream,
    find_activity,
    load_mindfulness_activities,
    summarize_history,
    synthesize_edge_tts,
)


def load_env_file(path):
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key:
                os.environ.setdefault(key, value)


load_env_file(os.path.join(os.path.dirname(__file__), ".env"))

WEB_DIR = os.getenv(
    "WEB_DIR",
    os.path.join(os.path.dirname(__file__), "Web_mindfulnessconnected"),
)
MAX_HISTORY_MESSAGES = 20
SUMMARY_BATCH_SIZE = 10
ALLOWED_ORIGIN = os.getenv("ALLOWED_ORIGIN", "*")
MINDFULNESS_ACTIVITIES = load_mindfulness_activities()
SESSIONS = {}
SESSIONS_LOCK = Lock()

_SENTENCE_SPLIT = re.compile(r'(?<=[.!?:;])\s+')


class _ClientDisconnected(Exception):
    pass


def extract_speakable_chunks(buf):
    """Split buf on sentence boundaries; return (complete_chunks, remainder)."""
    parts = _SENTENCE_SPLIT.split(buf)
    complete = [p.strip() for p in parts[:-1] if p.strip()]
    return complete, parts[-1]


def get_or_create_session(session_id):
    with SESSIONS_LOCK:
        session = SESSIONS.get(session_id)
        if session is None:
            session = {
                "history": [],
                "summary": "",
                "completed_activities": [],
                "active_activity_id": None,
                "current_step_index": None,
            }
            SESSIONS[session_id] = session
        return session


def get_session_snapshot(session_id):
    session = get_or_create_session(session_id)
    with SESSIONS_LOCK:
        return {
            "history": list(session["history"]),
            "summary": session["summary"],
            "completed_activities": list(session["completed_activities"]),
            "active_activity_id": session["active_activity_id"],
            "current_step_index": session["current_step_index"],
        }


def remove_session(session_id):
    with SESSIONS_LOCK:
        return SESSIONS.pop(session_id, None)


def update_session_memory(session, user_message, assistant_message):
    with SESSIONS_LOCK:
        session["history"].append({"role": "user", "content": user_message})
        session["history"].append({"role": "assistant", "content": assistant_message})

        if len(session["history"]) > MAX_HISTORY_MESSAGES:
            overflow = len(session["history"]) - MAX_HISTORY_MESSAGES
            batch_size = max(SUMMARY_BATCH_SIZE, overflow)
            batch_to_summarize = session["history"][:batch_size]
            prior_summary = session["summary"]
            session["history"] = session["history"][batch_size:]
        else:
            batch_to_summarize = None
            prior_summary = None

    # Run summarization outside the lock so other requests aren't blocked
    if batch_to_summarize:
        new_summary = summarize_history(batch_to_summarize, prior_summary)
        with SESSIONS_LOCK:
            session["summary"] = new_summary


def serialize_activities(session):
    completed_ids = set(session["completed_activities"])
    return [
        {
            "id": activity["id"],
            "title": activity["title"],
            "description": activity["description"],
            "completed": activity["id"] in completed_ids,
        }
        for activity in MINDFULNESS_ACTIVITIES
    ]


def build_step_payload(session):
    activity_id = session["active_activity_id"]
    current_step_index = session["current_step_index"]
    if not activity_id or current_step_index is None:
        return None

    activity = find_activity(activity_id)
    if not activity:
        return None

    return {
        "activity_id": activity["id"],
        "activity_title": activity["title"],
        "activity_description": activity["description"],
        "current_step_index": current_step_index,
        "total_steps": len(activity["steps"]),
        "current_step": activity["steps"][current_step_index],
    }


def send_json(handler, payload, status=200):
    response = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(response)))
    handler.end_headers()
    handler.wfile.write(response)


def send_bytes(handler, payload, content_type, status=200):
    handler.send_response(status)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(payload)))
    handler.end_headers()
    handler.wfile.write(payload)


class ChatHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            send_json(self, {"status": "ok"})
            return

        if self.path == "/firebase-config":
            self.handle_firebase_config()
            return

        if self.path.startswith("/activities"):
            self.handle_activities()
            return

        super().do_GET()

    def handle_firebase_config(self):
        config = {
            "apiKey": os.getenv("EXPO_PUBLIC_FIREBASE_API_KEY", ""),
            "authDomain": os.getenv("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN", ""),
            "projectId": os.getenv("EXPO_PUBLIC_FIREBASE_PROJECT_ID", ""),
            "storageBucket": os.getenv("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET", ""),
            "messagingSenderId": os.getenv("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", ""),
            "appId": os.getenv("EXPO_PUBLIC_FIREBASE_APP_ID", ""),
            "measurementId": os.getenv("EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID", ""),
        }
        send_json(self, {"firebaseConfig": config})

    def do_POST(self):
        if self.path == "/chat":
            self.handle_chat()
            return

        if self.path == "/tts":
            self.handle_tts()
            return

        if self.path == "/session/end":
            self.handle_end_session()
            return

        if self.path == "/activities/select":
            self.handle_activity_select()
            return

        if self.path == "/activities/step/complete":
            self.handle_complete_step()
            return

        if self.path == "/chat/stream":
            self.handle_chat_stream()
            return

        self.send_error(404)

    def handle_activities(self):
        query = self.path.partition("?")[2]
        session_id = ""
        if query:
            for part in query.split("&"):
                key, _, value = part.partition("=")
                if key == "session_id":
                    session_id = value
                    break

        if session_id:
            session = get_or_create_session(session_id)
            payload = {
                "activities": serialize_activities(session),
                "active_step": build_step_payload(session),
            }
        else:
            payload = {
                "activities": [
                    {
                        "id": activity["id"],
                        "title": activity["title"],
                        "description": activity["description"],
                        "completed": False,
                    }
                    for activity in MINDFULNESS_ACTIVITIES
                ],
                "active_step": None,
            }

        send_json(self, payload)

    def handle_chat(self):
        content_length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(content_length)
        try:
            payload = json.loads(body.decode("utf-8"))
            user_message = payload.get("message", "").strip()
            session_id = payload.get("session_id", "").strip()
        except json.JSONDecodeError:
            self.send_error(400, "Invalid JSON")
            return

        if not user_message:
            self.send_error(400, "Missing message")
            return

        if not session_id:
            self.send_error(400, "Missing session_id")
            return

        session = get_or_create_session(session_id)
        session_snapshot = get_session_snapshot(session_id)
        activity_context = None
        if session_snapshot["active_activity_id"] and session_snapshot["current_step_index"] is not None:
            activity_context = find_activity(session_snapshot["active_activity_id"])
        prompt = build_chat_prompt(
            user_message=user_message,
            history=session_snapshot["history"],
            summary=session_snapshot["summary"],
            activity_context=(
                {
                    **activity_context,
                    "current_step_index": session_snapshot["current_step_index"],
                }
                if activity_context
                else None
            ),
        )

        try:
            result = call_gemini(prompt)
            content = result["choices"][0]["message"]["content"]
            update_session_memory(session, user_message, content)
        except Exception as exc:
            self.send_error(500, f"Model error: {exc}")
            return

        updated_snapshot = get_session_snapshot(session_id)
        send_json(
            self,
            {
                "reply": content,
                "session_id": session_id,
                "history_count": len(updated_snapshot["history"]),
                "has_summary": bool(updated_snapshot["summary"]),
                "activities": serialize_activities(session),
                "active_step": build_step_payload(session),
            },
        )

    def handle_tts(self):
        content_length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(content_length)
        try:
            payload = json.loads(body.decode("utf-8"))
            text = payload.get("text", "").strip()
            voice_name = payload.get("voice_name", "").strip() or None
        except json.JSONDecodeError:
            self.send_error(400, "Invalid JSON")
            return

        if not text:
            self.send_error(400, "Missing text")
            return

        try:
            result = synthesize_edge_tts(text=text, voice=voice_name)
        except Exception as exc:
            self.send_error(500, f"TTS error: {exc}")
            return

        send_bytes(
            self,
            payload=result["audio_bytes"],
            content_type=result["content_type"],
        )

    def handle_activity_select(self):
        content_length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(content_length)
        try:
            payload = json.loads(body.decode("utf-8"))
            session_id = payload.get("session_id", "").strip()
            activity_id = payload.get("activity_id", "").strip()
        except json.JSONDecodeError:
            self.send_error(400, "Invalid JSON")
            return

        if not session_id or not activity_id:
            self.send_error(400, "Missing session_id or activity_id")
            return

        activity = find_activity(activity_id)
        if not activity:
            self.send_error(404, "Unknown activity")
            return

        session = get_or_create_session(session_id)
        with SESSIONS_LOCK:
            session["active_activity_id"] = activity_id
            session["current_step_index"] = 0

        assistant_message = build_activity_step_message(activity, 0)
        update_session_memory(
            session,
            f"I chose the mindfulness activity: {activity['title']}.",
            assistant_message,
        )

        send_json(
            self,
            {
                "reply": assistant_message,
                "activities": serialize_activities(session),
                "active_step": build_step_payload(session),
            },
        )

    def handle_complete_step(self):
        content_length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(content_length)
        try:
            payload = json.loads(body.decode("utf-8"))
            session_id = payload.get("session_id", "").strip()
        except json.JSONDecodeError:
            self.send_error(400, "Invalid JSON")
            return

        if not session_id:
            self.send_error(400, "Missing session_id")
            return

        session = get_or_create_session(session_id)
        activity_id = session["active_activity_id"]
        current_step_index = session["current_step_index"]
        if not activity_id or current_step_index is None:
            self.send_error(400, "No active activity")
            return

        activity = find_activity(activity_id)
        if not activity:
            self.send_error(404, "Unknown activity")
            return

        completed_step_message = (
            f"I completed step {current_step_index + 1} of {activity['title']}."
        )

        if current_step_index + 1 < len(activity["steps"]):
            next_step_index = current_step_index + 1
            with SESSIONS_LOCK:
                session["current_step_index"] = next_step_index
            assistant_message = build_activity_step_message(activity, next_step_index)
            update_session_memory(session, completed_step_message, assistant_message)
            send_json(
                self,
                {
                    "reply": assistant_message,
                    "activities": serialize_activities(session),
                    "active_step": build_step_payload(session),
                    "activity_completed": False,
                },
            )
            return

        completion_message = (
            f"You completed {activity['title']}. Take a moment to notice how you feel now."
        )
        with SESSIONS_LOCK:
            if activity_id not in session["completed_activities"]:
                session["completed_activities"].append(activity_id)
            session["active_activity_id"] = None
            session["current_step_index"] = None
        update_session_memory(session, completed_step_message, completion_message)
        send_json(
            self,
            {
                "reply": completion_message,
                "activities": serialize_activities(session),
                "active_step": None,
                "activity_completed": True,
            },
        )

    def _write_sse(self, data_dict):
        line = "data: " + json.dumps(data_dict) + "\n\n"
        try:
            self.wfile.write(line.encode("utf-8"))
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            raise _ClientDisconnected()

    def handle_chat_stream(self):
        content_length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(content_length)
        try:
            payload = json.loads(body.decode("utf-8"))
            user_message = payload.get("message", "").strip()
            session_id = payload.get("session_id", "").strip()
        except json.JSONDecodeError:
            self.send_error(400, "Invalid JSON")
            return

        if not user_message:
            self.send_error(400, "Missing message")
            return
        if not session_id:
            self.send_error(400, "Missing session_id")
            return

        session = get_or_create_session(session_id)
        session_snapshot = get_session_snapshot(session_id)
        activity_context = None
        if session_snapshot["active_activity_id"] and session_snapshot["current_step_index"] is not None:
            activity_context = find_activity(session_snapshot["active_activity_id"])
        prompt = build_chat_prompt(
            user_message=user_message,
            history=session_snapshot["history"],
            summary=session_snapshot["summary"],
            activity_context=(
                {
                    **activity_context,
                    "current_step_index": session_snapshot["current_step_index"],
                }
                if activity_context
                else None
            ),
        )

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Accel-Buffering", "no")
        self.close_connection = True
        self.end_headers()

        full_chunks = []
        buf = ""
        try:
            for fragment in call_gemini_stream(prompt):
                buf += fragment
                chunks, buf = extract_speakable_chunks(buf)
                for chunk in chunks:
                    full_chunks.append(chunk)
                    self._write_sse({"chunk": chunk})
            if buf.strip():
                full_chunks.append(buf.strip())
                self._write_sse({"chunk": buf.strip()})
            complete_text = " ".join(full_chunks)
            update_session_memory(session, user_message, complete_text)
            self._write_sse({"done": True, "session_id": session_id})
        except _ClientDisconnected:
            pass
        except Exception as exc:
            self._write_sse({"error": str(exc)})

    def handle_end_session(self):
        content_length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(content_length)
        try:
            payload = json.loads(body.decode("utf-8"))
            session_id = payload.get("session_id", "").strip()
        except json.JSONDecodeError:
            self.send_error(400, "Invalid JSON")
            return

        if not session_id:
            self.send_error(400, "Missing session_id")
            return

        session_snapshot = get_session_snapshot(session_id)
        if not session_snapshot["history"] and not session_snapshot["summary"]:
            remove_session(session_id)
            send_json(self, {"summary": "This session ended before any messages were sent."})
            return

        try:
            recap = build_session_recap(
                summary=session_snapshot["summary"],
                history=session_snapshot["history"],
            )
        except Exception as exc:
            self.send_error(500, f"Model error: {exc}")
            return

        remove_session(session_id)
        send_json(self, {"summary": recap})


def main():
    host = "0.0.0.0"
    port = int(os.getenv("PORT", "8000"))
    with ThreadingHTTPServer((host, port), ChatHandler) as httpd:
        print(f"Serving on http://{host}:{port}")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
