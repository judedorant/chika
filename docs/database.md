# Database

MySQL 8 is the primary datastore. Migrations also run on SQLite for fast API tests. IDs are unsigned bigint; Laravel timestamps are stored in UTC. The JavaScript client assumes IDs remain below JavaScript's safe integer limit.

| Table | Relationships / constraints |
| --- | --- |
| users | Unique email; hashed password; private avatar path |
| conversations | `created_by → users` restrict delete; private/group type; nullable unique `private_key` is sorted user IDs |
| conversation_participants | FK conversation/user cascade; unique conversation + user; user + conversation index; owner/admin/member; nullable FK last-read message |
| messages | Conversation FK cascade, sender FK restrict, self reply FK null on delete; unique sender + client UUID; SHA-256 payload digest; conversation + ID index; soft deletion |
| message_attachments | Message FK cascade; private path, MIME, byte size |
| message_receipts | Message/user FKs cascade; unique message + user; user + read timestamp index; nullable delivered/read timestamps |
| user_devices | User FK cascade; globally unique Expo push token; platform; token FK cascade so revoked sessions lose registrations |
| blocked_users | Both user FKs cascade; unique blocker + blocked |
| personal_access_tokens | Sanctum token hash, abilities, expiry index; plaintext returned only at creation |
| jobs / failed_jobs / job_batches | Laravel queue tooling (Redis is the configured job broker) |
| cache / cache_locks | Laravel fallback stores (Redis is configured for runtime cache) |

Eloquent models define creators, participants, memberships, messages, reply targets, attachments, receipts, devices, and block relationships. Message history eagerly loads sender, attachments, and receipts and uses descending-ID cursor pagination (30 per page). Conversation lists paginate 25 items, eager load participant/latest-message data, and calculate unread count using the membership's last-read pointer. Deleted messages are tombstones and do not count as unread.

Reads set delivered/read timestamps once and advance the membership pointer with `max(current, requested)`. Reading a message marks earlier received messages in that conversation as read. New participants start at the current maximum message ID; receipts are created for recipients present when a message is sent.

Schema-level foreign keys enforce existence; application policies enforce same-conversation replies and read-pointer membership. The nullable last-read FK introduces a migration dependency: rollback removes it before dropping messages. Real MySQL migration, rollback, and concurrency behavior should be included in release verification; SQLite locking is not equivalent.
