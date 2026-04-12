# Deprecation: POST /soul-converse

## Status: Deprecated (replaced by /soul-send + sync-messages polling)

## Timeline
1. v1.1: /soul-send shipped, iOS uses fire-and-poll
2. v1.2: MIN_SUPPORTED_VERSION bumped to 1.1
3. v1.3: Remove /soul-converse handler and SSE code

## What replaces it
- Send: POST /soul-send (returns `{ status: "accepted" }`, processes LLM in background)
- Receive: POST /sync-messages with `{ after_id }` (poll every 2s for new messages)

## Why
- iOS blocked for 5-15s waiting for LLM response
- 6s minimum artificial delay padded every response
- Send button disabled during streaming
- SSE streaming added complexity without proportional UX benefit

## Migration notes
- /soul-converse remains functional for old iOS clients
- /soul-send uses the same system prompts, LLM routing, and post-response tasks
- Last-write-wins via `processing_request_id` on users table prevents duplicate AI responses
