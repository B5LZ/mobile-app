import json
import hmac
import os
import re
import secrets
import time
from threading import Lock
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import urllib.error
import urllib.request
from urllib.parse import parse_qs, urlparse

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
DEFAULT_ALLOWED_ORIGINS = {
    "http://localhost:8081",
    "http://127.0.0.1:8081",
    "http://localhost:19006",
    "http://127.0.0.1:19006",
    "https://multilingual-virtual-assistant.onrender.com",
}
ALLOWED_ORIGINS = {
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
}
if not ALLOWED_ORIGINS:
    ALLOWED_ORIGINS = DEFAULT_ALLOWED_ORIGINS
MINDFULNESS_ACTIVITIES = load_mindfulness_activities()
SESSIONS = {}
SESSIONS_LOCK = Lock()
RATE_LIMITS = {}
RATE_LIMITS_LOCK = Lock()
AUTH_CACHE = {}
AUTH_CACHE_LOCK = Lock()

MAX_BODY_BYTES = int(os.getenv("MAX_BODY_BYTES", "16384"))
MAX_MESSAGE_LENGTH = int(os.getenv("MAX_MESSAGE_LENGTH", "4000"))
MAX_TTS_TEXT_LENGTH = int(os.getenv("MAX_TTS_TEXT_LENGTH", "1200"))
MAX_ID_TOKEN_LENGTH = int(os.getenv("MAX_ID_TOKEN_LENGTH", "4096"))
SESSION_TTL_SECONDS = int(os.getenv("SESSION_TTL_SECONDS", "43200"))
RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))
CHAT_RATE_LIMIT = int(os.getenv("CHAT_RATE_LIMIT", "30"))
TTS_RATE_LIMIT = int(os.getenv("TTS_RATE_LIMIT", "20"))
GENERAL_RATE_LIMIT = int(os.getenv("GENERAL_RATE_LIMIT", "60"))
USER_CHAT_RATE_LIMIT = int(os.getenv("USER_CHAT_RATE_LIMIT", "20"))
USER_TTS_RATE_LIMIT = int(os.getenv("USER_TTS_RATE_LIMIT", "12"))
USER_GENERAL_RATE_LIMIT = int(os.getenv("USER_GENERAL_RATE_LIMIT", "40"))
FIREBASE_API_KEY = os.getenv("EXPO_PUBLIC_FIREBASE_API_KEY", "")
ENFORCE_FIREBASE_AUTH = os.getenv("ENFORCE_FIREBASE_AUTH", "1") != "0"
REQUIRE_EMAIL_VERIFIED = os.getenv("REQUIRE_EMAIL_VERIFIED", "0") == "1"

_SENTENCE_SPLIT = re.compile(r'(?<=[.!?:;])\s+')


class _ClientDisconnected(Exception):
    pass


def extract_speakable_chunks(buf):
    """Split buf on sentence boundaries; return (complete_chunks, remainder)."""
    parts = _SENTENCE_SPLIT.split(buf)
    complete = [p.strip() for p in parts[:-1] if p.strip()]
    return complete, parts[-1]


def _now():
    return time.time()


def prune_expired_sessions():
    cutoff = _now() - SESSION_TTL_SECONDS
    with SESSIONS_LOCK:
        expired_ids = [
            session_id
            for session_id, session in SESSIONS.items()
            if session.get("last_seen_at", 0) < cutoff
        ]
        for session_id in expired_ids:
            SESSIONS.pop(session_id, None)

    with AUTH_CACHE_LOCK:
        expired_tokens = [
            token
            for token, entry in AUTH_CACHE.items()
            if entry.get("expires_at", 0) < _now()
        ]
        for token in expired_tokens:
            AUTH_CACHE.pop(token, None)


def create_session():
    prune_expired_sessions()
    session_id = secrets.token_urlsafe(18)
    session_token = secrets.token_urlsafe(32)
    now = _now()
    session = {
        "history": [],
        "summary": "",
        "completed_activities": [],
        "active_activity_id": None,
        "current_step_index": None,
        "session_token": session_token,
        "created_at": now,
        "last_seen_at": now,
    }
    with SESSIONS_LOCK:
        SESSIONS[session_id] = session
    return session_id, session


def get_or_create_session(session_id):
    prune_expired_sessions()
    with SESSIONS_LOCK:
        session = SESSIONS.get(session_id)
        if session is None:
            session = {
                "history": [],
                "summary": "",
                "completed_activities": [],
                "active_activity_id": None,
                "current_step_index": None,
                "session_token": secrets.token_urlsafe(32),
                "created_at": _now(),
                "last_seen_at": _now(),
            }
            SESSIONS[session_id] = session
        else:
            session["last_seen_at"] = _now()
        return session


def get_session(session_id):
    prune_expired_sessions()
    with SESSIONS_LOCK:
        session = SESSIONS.get(session_id)
        if session is not None:
            session["last_seen_at"] = _now()
        return session


def get_session_snapshot(session_id):
    session = get_session(session_id)
    if session is None:
        return {
            "history": [],
            "summary": "",
            "completed_activities": [],
            "active_activity_id": None,
            "current_step_index": None,
        }
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
        session["last_seen_at"] = _now()

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
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("X-Content-Type-Options", "nosniff")
    handler.end_headers()
    handler.wfile.write(response)


def send_bytes(handler, payload, content_type, status=200):
    handler.send_response(status)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(payload)))
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("X-Content-Type-Options", "nosniff")
    handler.end_headers()
    handler.wfile.write(payload)


def send_error_json(handler, status, message):
    send_json(handler, {"error": message}, status=status)


def _verify_firebase_id_token(id_token):
    if not FIREBASE_API_KEY:
        raise RuntimeError("Missing EXPO_PUBLIC_FIREBASE_API_KEY for auth verification.")

    if not id_token or len(id_token) > MAX_ID_TOKEN_LENGTH:
        return None

    with AUTH_CACHE_LOCK:
        cached = AUTH_CACHE.get(id_token)
        if cached and cached.get("expires_at", 0) > _now():
            return cached["user"]

    request = urllib.request.Request(
        url=(
            "https://identitytoolkit.googleapis.com/v1/accounts:lookup"
            f"?key={FIREBASE_API_KEY}"
        ),
        data=json.dumps({"idToken": id_token}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError:
        return None
    except urllib.error.URLError:
        return None

    users = payload.get("users") or []
    if not users:
        return None

    user = users[0]
    if REQUIRE_EMAIL_VERIFIED and not user.get("emailVerified", False):
        return None

    auth_user = {
        "uid": user.get("localId", ""),
        "email": user.get("email", ""),
        "email_verified": bool(user.get("emailVerified", False)),
    }

    with AUTH_CACHE_LOCK:
        AUTH_CACHE[id_token] = {
            "user": auth_user,
            "expires_at": _now() + 300,
        }
    return auth_user


class ChatHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def log_message(self, format, *args):
        if args:
            request_line = str(args[0])
            if "?" in request_line:
                args = (request_line.split("?", 1)[0], *args[1:])
        super().log_message(format, *args)

    def end_headers(self):
        origin = self.headers.get("Origin")
        if origin and origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Authorization, Content-Type, X-Session-Token",
        )
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()

    def do_OPTIONS(self):
        if not self._origin_allowed():
            send_error_json(self, 403, "Origin not allowed")
            return
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if not self._origin_allowed():
            send_error_json(self, 403, "Origin not allowed")
            return

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

    def _origin_allowed(self):
        origin = self.headers.get("Origin")
        return not origin or origin in ALLOWED_ORIGINS

    def _client_identifier(self, auth_user=None):
        if auth_user and auth_user.get("uid"):
            return f'user:{auth_user["uid"]}'
        forwarded_for = self.headers.get("X-Forwarded-For", "")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        host, _, _ = self.client_address
        return host

    def _check_rate_limit(self, bucket, limit, auth_user=None):
        now = _now()
        key = (bucket, self._client_identifier(auth_user))
        with RATE_LIMITS_LOCK:
            entries = RATE_LIMITS.get(key, [])
            entries = [ts for ts in entries if now - ts < RATE_LIMIT_WINDOW_SECONDS]
            if len(entries) >= limit:
                RATE_LIMITS[key] = entries
                return False
            entries.append(now)
            RATE_LIMITS[key] = entries
        return True

    def _extract_bearer_token(self):
        authorization = self.headers.get("Authorization", "").strip()
        if not authorization.startswith("Bearer "):
            return ""
        return authorization[7:].strip()

    def _require_authenticated_user(self):
        if not ENFORCE_FIREBASE_AUTH:
            return {"uid": "dev-anonymous", "email": "", "email_verified": False}
        id_token = self._extract_bearer_token()
        if not id_token:
            send_error_json(self, 401, "Missing bearer token")
            return None
        auth_user = _verify_firebase_id_token(id_token)
        if not auth_user:
            send_error_json(self, 401, "Invalid bearer token")
            return None
        return auth_user

    def _read_json_body(self):
        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length <= 0:
            raise ValueError("Missing request body")
        if content_length > MAX_BODY_BYTES:
            raise OverflowError("Request body too large")
        body = self.rfile.read(content_length)
        try:
            return json.loads(body.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise ValueError("Invalid JSON") from exc

    def _require_json_body(self):
        try:
            return self._read_json_body()
        except OverflowError:
            send_error_json(self, 413, "Request body too large")
            return None
        except ValueError as exc:
            send_error_json(self, 400, str(exc))
            return None

    def _extract_session_credentials(self, payload=None):
        payload = payload or {}
        session_id = str(payload.get("session_id", "")).strip()
        session_token = str(
            payload.get("session_token", "") or self.headers.get("X-Session-Token", "")
        ).strip()
        return session_id, session_token

    def _require_session(self, payload=None):
        session_id, session_token = self._extract_session_credentials(payload)
        if not session_id or not session_token:
            send_error_json(self, 401, "Missing session credentials")
            return None, None
        session = get_session(session_id)
        if session is None:
            send_error_json(self, 404, "Session not found")
            return None, None
        if not hmac.compare_digest(session.get("session_token", ""), session_token):
            send_error_json(self, 403, "Invalid session credentials")
            return None, None
        auth_user = self._require_authenticated_user()
        if auth_user is None:
            return None, None
        if session.get("user_id") and session["user_id"] != auth_user["uid"]:
            send_error_json(self, 403, "Session belongs to a different user")
            return None, None
        return session_id, session

    def _build_session_response(self, session_id, session):
        return {
            "session_id": session_id,
            "session_token": session["session_token"],
            "activities": serialize_activities(session),
            "active_step": build_step_payload(session),
        }

    def do_POST(self):
        if not self._origin_allowed():
            send_error_json(self, 403, "Origin not allowed")
            return

        if not self._check_rate_limit("general", GENERAL_RATE_LIMIT):
            send_error_json(self, 429, "Too many requests. Please try again shortly.")
            return

        if self.path == "/session/start":
            self.handle_start_session()
            return

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
        query = parse_qs(urlparse(self.path).query)
        session_id = (query.get("session_id") or [""])[0].strip()
        session_token = (query.get("session_token") or [""])[0].strip()

        if session_id:
            session = get_session(session_id)
            if session is None:
                send_error_json(self, 404, "Session not found")
                return
            auth_user = self._require_authenticated_user()
            if auth_user is None:
                return
            if not session_token or not hmac.compare_digest(
                session.get("session_token", ""), session_token
            ):
                send_error_json(self, 403, "Invalid session credentials")
                return
            if session.get("user_id") and session["user_id"] != auth_user["uid"]:
                send_error_json(self, 403, "Session belongs to a different user")
                return
            payload = self._build_session_response(session_id, session)
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

    def handle_start_session(self):
        auth_user = self._require_authenticated_user()
        if auth_user is None:
            return
        if not self._check_rate_limit("session_start_user", USER_GENERAL_RATE_LIMIT, auth_user):
            send_error_json(self, 429, "Too many requests. Please try again shortly.")
            return
        session_id, session = create_session()
        with SESSIONS_LOCK:
            session["user_id"] = auth_user["uid"]
            session["user_email"] = auth_user.get("email", "")
        send_json(self, self._build_session_response(session_id, session), status=201)

    def handle_chat(self):
        payload = self._require_json_body()
        if payload is None:
            return
        user_message = str(payload.get("message", "")).strip()

        if not user_message:
            send_error_json(self, 400, "Missing message")
            return
        if len(user_message) > MAX_MESSAGE_LENGTH:
            send_error_json(self, 400, "Message too long")
            return

        auth_user = self._require_authenticated_user()
        if auth_user is None:
            return
        if not self._check_rate_limit("chat_user", USER_CHAT_RATE_LIMIT, auth_user):
            send_error_json(self, 429, "Chat rate limit exceeded. Please slow down.")
            return

        session_id, session = self._require_session(payload)
        if session is None:
            return
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
        except Exception:
            send_error_json(self, 502, "Chat service unavailable")
            return

        updated_snapshot = get_session_snapshot(session_id)
        send_json(
            self,
            {
                "reply": content,
                "session_id": session_id,
                "session_token": session["session_token"],
                "history_count": len(updated_snapshot["history"]),
                "has_summary": bool(updated_snapshot["summary"]),
                "activities": serialize_activities(session),
                "active_step": build_step_payload(session),
            },
        )

    def handle_tts(self):
        payload = self._require_json_body()
        if payload is None:
            return
        text = str(payload.get("text", "")).strip()
        voice_name = str(payload.get("voice_name", "")).strip() or None

        if not text:
            send_error_json(self, 400, "Missing text")
            return
        if len(text) > MAX_TTS_TEXT_LENGTH:
            send_error_json(self, 400, "Text too long")
            return

        auth_user = self._require_authenticated_user()
        if auth_user is None:
            return
        if not self._check_rate_limit("tts_user", USER_TTS_RATE_LIMIT, auth_user):
            send_error_json(self, 429, "TTS rate limit exceeded. Please slow down.")
            return

        try:
            result = synthesize_edge_tts(text=text, voice=voice_name)
        except Exception:
            send_error_json(self, 502, "Speech service unavailable")
            return

        send_bytes(
            self,
            payload=result["audio_bytes"],
            content_type=result["content_type"],
        )

    def handle_activity_select(self):
        payload = self._require_json_body()
        if payload is None:
            return
        session_id, session = self._require_session(payload)
        if session is None:
            return
        activity_id = str(payload.get("activity_id", "")).strip()

        if not activity_id:
            send_error_json(self, 400, "Missing activity_id")
            return

        activity = find_activity(activity_id)
        if not activity:
            send_error_json(self, 404, "Unknown activity")
            return

        with SESSIONS_LOCK:
            session["active_activity_id"] = activity_id
            session["current_step_index"] = 0
            session["last_seen_at"] = _now()

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
                "session_id": session_id,
                "session_token": session["session_token"],
                "activities": serialize_activities(session),
                "active_step": build_step_payload(session),
            },
        )

    def handle_complete_step(self):
        payload = self._require_json_body()
        if payload is None:
            return
        session_id, session = self._require_session(payload)
        if session is None:
            return

        activity_id = session["active_activity_id"]
        current_step_index = session["current_step_index"]
        if not activity_id or current_step_index is None:
            send_error_json(self, 400, "No active activity")
            return

        activity = find_activity(activity_id)
        if not activity:
            send_error_json(self, 404, "Unknown activity")
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
                    "session_id": session_id,
                    "session_token": session["session_token"],
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
                "session_id": session_id,
                "session_token": session["session_token"],
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
        payload = self._require_json_body()
        if payload is None:
            return
        user_message = str(payload.get("message", "")).strip()

        if not user_message:
            send_error_json(self, 400, "Missing message")
            return
        if len(user_message) > MAX_MESSAGE_LENGTH:
            send_error_json(self, 400, "Message too long")
            return

        auth_user = self._require_authenticated_user()
        if auth_user is None:
            return
        if not self._check_rate_limit("chat_stream_user", USER_CHAT_RATE_LIMIT, auth_user):
            send_error_json(self, 429, "Chat rate limit exceeded. Please slow down.")
            return

        session_id, session = self._require_session(payload)
        if session is None:
            return
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
            self._write_sse(
                {
                    "done": True,
                    "session_id": session_id,
                    "session_token": session["session_token"],
                }
            )
        except _ClientDisconnected:
            pass
        except Exception:
            self._write_sse({"error": "Chat service unavailable"})

    def handle_end_session(self):
        payload = self._require_json_body()
        if payload is None:
            return
        session_id, session = self._require_session(payload)
        if session is None:
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
        except Exception:
            send_error_json(self, 502, "Chat service unavailable")
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
