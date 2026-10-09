# Multilingual Virtual Assistant Mindfulness

## Problem

Caregivers and other high-stress users often need immediate, low-friction mindfulness support in moments when opening a long program or finding a clinician is unrealistic. The goal of this project is to provide a multilingual mindfulness experience that feels accessible on mobile, supports short guided sessions, and offers an interactive assistant for simple emotional support and mindfulness-related questions.

## What We Implemented

This repository combines a React Native / Expo mobile app with a Python backend and an embedded avatar-based chat experience.

- A mobile mindfulness app built with Expo and React Native
- Guided session flows, including scripted mindfulness exercises
- Firebase authentication for user sign-in and session-linked app data
- A Python backend that powers chat, streaming responses, and text-to-speech
- An embedded avatar / WebView experience for guided interaction and spoken responses
- Session tracking and lightweight progress data tied to authenticated users

## Tech Stack

### Mobile

- React Native
- Expo
- Firebase Auth
- Firestore
- React Navigation
- React Native WebView

### Backend

- Python
- Google Gemini
- Edge TTS
- Render for deployment

## Security Measures

The backend and client were hardened to reduce unauthorized access, cross-user exposure, and model-cost abuse.

### API Access Controls

- Browser CORS is restricted to trusted origins instead of `*`
- Chat sessions are server-issued and use cryptographically strong session tokens
- Session state is bound to the authenticated Firebase user that created it
- Session-scoped endpoints reject access from other authenticated users even if a session ID is known
- The backend now requires a valid Firebase bearer token for protected operations

### Abuse and Cost Controls

- Request body size limits are enforced
- Chat message length and TTS text length are capped
- Rate limiting is applied to general API traffic, chat, streaming chat, and TTS
- User-level limits were added to reduce token and TTS abuse from a single account
- Gemini output token ceilings were reduced to lower spend per request

### Data Exposure Controls

- Raw backend/provider errors are no longer returned directly to clients
- Cache-control and content-type hardening headers are returned by the API
- Session query strings are redacted from server logs
- The avatar transcript no longer persists long-term in `localStorage`; transient chat history is kept in session storage

### Client Hardening

- Production API use defaults to HTTPS
- The WebView path was tightened to reduce mixed-content risk in production
- Auth for the avatar flow is passed in memory through the host bridge rather than URL parameters

## Deployment

The Python backend is configured for Render using [render.yaml](/Users/davidle/Documents/Mindfulness-App/render.yaml:1).

### Required Environment Variables

- `GOOGLE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_API_KEY`
- `ALLOWED_ORIGINS`

Optional hardening and tuning variables:

- `CHAT_RATE_LIMIT`
- `TTS_RATE_LIMIT`
- `GENERAL_RATE_LIMIT`
- `USER_CHAT_RATE_LIMIT`
- `USER_TTS_RATE_LIMIT`
- `USER_GENERAL_RATE_LIMIT`
- `MAX_MESSAGE_LENGTH`
- `MAX_TTS_TEXT_LENGTH`
- `SESSION_TTL_SECONDS`
- `GEMINI_MAX_OUTPUT_TOKENS`
- `ENFORCE_FIREBASE_AUTH`
- `REQUIRE_EMAIL_VERIFIED`

### Local Run

1. Install dependencies:

```bash
npm install
pip install -r requirements.txt
```

2. Create a local `.env` file with the required Firebase and backend keys.

3. Start the mobile app:

```bash
npm start
```

4. Start the backend:

```bash
python3 server.py
```

### Production Notes

- Keep Firebase and Gemini keys in environment variables only
- Set `ALLOWED_ORIGINS` explicitly for your deployed frontend origins
- Keep `ENFORCE_FIREBASE_AUTH=1` in production
- Review Firestore security rules separately, since those are not stored in this repository
