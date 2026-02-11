# ChurchVote - Firestore Schema

## Overview

Data is stored under the project namespace `artifacts/{appId}/public/data`.

- Poll documents: `artifacts/{appId}/public/data/polls/{pollId}`
- Vote documents: `artifacts/{appId}/public/data/poll_{pollId}_votes/{userId}`

## Poll document

Example path: `artifacts/churchvote-ba9c1/public/data/polls/voh2X0F3ZAys7UwQjUMB`

Typical document fields:

- `questions` (array) — required. Each question object:
  - `prompt` (string)
  - `type` (string) e.g. `single-choice` or `multi-choice`
  - `options` (array of strings or objects with `id` + `text`)
- `accessCode` (string) — short code for attendee access (optional, often generated)
- `isActive` (boolean)
- `createdAt` (timestamp)
- other metadata (optional): `title`, `createdByAppId`, etc.

Example poll document (JSON):

```json
{
  "questions": [
    {
      "prompt": "Which option do you prefer?",
      "type": "single-choice",
      "options": ["Option A","Option B","Option C"]
    }
  ],
  "accessCode": "2117",
  "isActive": true,
  "createdAt": "2026-02-10T14:00:00.000Z"
}
```

## Vote documents

Votes are stored per-poll in a collection named `poll_{pollId}_votes` under the same artifacts path.

Path example: `artifacts/churchvote-ba9c1/public/data/poll_voh2X0F3ZAys7UwQjUMB_votes/USER_ID`

Rules and shape:

- Document ID: the voter's id (for auth'd users this is `uid`; for anonymous QR flows a generated id can be used)
- Fields:
  - `userId` (string) — must match the document id
  - `method` (string) — `anonymous` | `signed-in` | `qr`
  - `votedAt` (timestamp)
  - `selections` — array or map describing selected option indices per question

Example vote document (JSON):

```json
{
  "userId": "abc123",
  "method": "anonymous",
  "votedAt": "2026-02-10T14:05:00.000Z",
  "selections": [{ "questionIndex": 0, "optionIndex": 1 }]
}
```

## Security & rules (summary)

- Clients are NOT allowed to create or modify poll documents — poll creation is server-side only (callable `createPoll`).
- Clients may create a vote document only under the per-poll votes collection, and only when the created doc id equals the voter's id.
- Vote writes are validated for required fields and reasonable timestamps.
- Firestore rules are enforced to guarantee one-document-per-user per poll.

## Callable: `createPoll`

Purpose: server-side creation of polls (leader/admin flows).

Payload (example):

```json
{
  "pin": "1234",
  "appId": "churchvote-ba9c1",
  "questions": [ { "prompt": "...", "type":"single-choice", "options": ["A","B"] } ],
  "accessCode": "optional-string"
}
```

Response (example):

```json
{ "id": "voh2X0F3ZAys7UwQjUMB", "accessCode": "2117" }
```

Notes:

- The callable validates the admin `pin` (stored in runtime config / params) and writes the canonical `questions` array, `accessCode`, `isActive`, and `createdAt` fields.
- Client UI must call this function to create polls because Firestore rules block direct client creation.

## Environment / build notes

- Frontend expects Vite env vars at build time (example names):
  - `VITE_FIREBASE_API_KEY`
  - `VITE_FIREBASE_AUTH_DOMAIN`
  - `VITE_FIREBASE_PROJECT_ID`
  - `VITE_FIREBASE_STORAGE_BUCKET`
  - `VITE_FIREBASE_MESSAGING_SENDER_ID`
  - `VITE_FIREBASE_APP_ID`

## Migration / backward-compatibility

- Legacy single-question fields were removed — the app now requires the `questions` array.
- If you need to migrate older poll documents, write a small Cloud Function or admin script to convert `question`/`options` to `questions`.

---

File: SCHEMA.md
