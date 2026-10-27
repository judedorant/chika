# API v1

Base path: `/api/v1`. Authenticated requests use `Authorization: Bearer <Sanctum token>` and `Accept: application/json`. Never put tokens in URLs. Tokens expire after 30 days. Public registration/login are limited to 10 requests/minute/IP; authenticated APIs to 300/minute/user, sends to 60/minute/user, typing to 30/minute/user.

| Method | Path | Input / result |
| --- | --- | --- |
| GET | /health | Public liveness response (not a database readiness check) |
| POST | /auth/register | name, email, password, password_confirmation, device_name; 201 `{user,token}` |
| POST | /auth/login | email, password, device_name; 200 `{user,token}` |
| POST | /auth/logout | Revoke current token/device; 204 |
| DELETE | /auth/tokens | Revoke every token/device; 204 |
| GET / PATCH | /me | Own profile; PATCH accepts name |
| PUT | /me/password | current_password, password, password_confirmation; revoke all sessions |
| POST | /me/avatar | Multipart avatar, JPEG/PNG/WebP, max 2 MiB / 2048×2048 |
| POST | /me/heartbeat | Presence TTL refresh |
| POST / DELETE | /me/devices | push_token; POST also platform (android/ios) |
| GET | /me/blocks | Paginated blocked profiles |
| GET | /users?q=Al | Name prefix search, minimum 2 characters; excludes blocked pairs |
| GET | /users/{id} | Shared-conversation profile (or self) |
| GET | /users/{id}/avatar | Authenticated private image; shared conversation required |
| GET | /users/{id}/presence | `{online:boolean}`; shared conversation required |
| POST / DELETE | /users/{id}/block | Block/unblock user |
| GET | /conversations?page=1 | Paginated conversations with unread counts |
| POST | /conversations | type, participant_ids, name for groups; returns canonical private chat if already present |
| GET / PATCH | /conversations/{id} | Members can GET; owner/admin PATCH name |
| POST | /conversations/{id}/participants | Owner/admin adds user_id; max 50 members |
| DELETE | /conversations/{id}/participants/{user} | Owner/admin removes member; cannot remove owner |
| POST | /conversations/{id}/typing | Membership required; TTL-throttled hint |
| GET | /conversations/{id}/messages?cursor=… | Descending history, 30 per page, tombstones included |
| POST | /conversations/{id}/messages | UUID client_message_id, body and/or image, optional reply_to_message_id |
| PATCH | /messages/{id} | Sender only; body, max 5000 characters |
| DELETE | /messages/{id} | Sender only; soft-delete tombstone |
| POST | /messages/{id}/delivered | Recipient delivery acknowledgment |
| POST | /messages/{id}/read | Recipient read acknowledgment and advance read pointer |
| GET | /attachments/{id} | Stream private file after current membership check |
| POST | /broadcasting/auth | socket_id, channel_name; signs only `private-users.{own_id}` |

Resource responses use `{data: ...}`; authentication returns `{user,token}` directly. Collections include `links` and `meta`; message `meta.next_cursor` is used to fetch older history. Avatars and attachment URLs are absolute and derive from `APP_URL`. Configure it as reachable by the Android device.

```json
{
  "client_message_id": "77f79157-306a-4226-baf8-3f969f2fe4d2",
  "body": "Hello",
  "reply_to_message_id": 12
}
```

Send JSON for text, multipart with `image` for photos (JPEG/PNG/WebP, max 5 MiB and 4096×4096). Preserve the UUID and original payload after timeout: 201 means created, 200 means an identical retry, 409 means the ID was used with another payload. An edited or deleted original message still owns its UUID.

Errors use JSON `{message, errors?}`: 401 unauthenticated/expired, 403 denied, 404 missing or deleted resource, 409 idempotency conflict, 422 validation, 429 rate limited. Passwords require 12 characters, mixed case, and a number. User resources never expose another user's email.

Socket event `.chat.changed` carries `{conversation_id,kind,data}`. Kinds: `message`, `receipt`, `conversation`, `removed`, `typing`. The typing data contains user_id/name; other hints contain a message ID where applicable. Refetch authorized REST resources for canonical state. A removed member must discard cached messages and return to the list.
