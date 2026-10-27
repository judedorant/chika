# Phase 8 verification

Recorded October 28, 2026 (Asia/Singapore). The automated Phase 8 checks below pass locally. Physical Android testing, push delivery, signed builds, and production operational validation remain outstanding.

| Check | Observed result |
| --- | --- |
| Backend PHPUnit / SQLite | PASS: 26 tests, 125 assertions |
| Backend PHPUnit / MySQL 8 | PASS: 26 tests, 125 assertions in dedicated rchat_test database |
| Laravel Pint | PASS: 59 PHP files |
| Composer audit | PASS: no vulnerability advisories found |
| Clean npm ci | PASS; query-string security compatibility patch reapplied automatically |
| Mobile security compatibility tests | PASS: 4 tests, including the actual Expo CLI schemas and bounded malformed-input processing |
| Full npm audit | PASS: 0 vulnerabilities, including development dependencies |
| TypeScript / Expo lint | PASS |
| Expo Doctor | PASS: all 20 checks |
| Android JavaScript / Hermes export | PASS: 1224 modules; exported bundle, not an APK |
| Live local HTTP / Redis / queue worker / Reverb | PASS: 31 checks before session cleanup |
| Physical Android UI, background/resume, gallery permissions | NOT RUN: no device/emulator test session |
| FCM / Expo push to a device | NOT RUN: requires EAS/FCM credentials and a physical development build; provider payload behavior is tested with HTTP fakes |
| Signed Android APK/AAB, store submission | NOT RUN: requires signing/build-service setup |
| GitHub Actions | SQLite/MySQL, mobile, and live Docker jobs configured; consult PR checks for hosted results |

## Corrected issues

- Blocked-user discovery used a self-join alias incorrectly. Indexed block subqueries now exclude both blocking directions.
- The local public Reverb app key contained a colon. Reverb separates public key and HMAC signature with a colon, so the key produced a valid REST authorization response but an invalid socket subscription. The public example identifier is now `rchat-local`; startup rejects invalid public identifiers and private secrets shorter than 32 characters. Three configuration regression tests exercise these cases.
- Laravel's development server discarded Docker environment overrides when launching its child process. `--no-reload` preserves the container DB/Redis/Reverb settings.
- Queued broadcasts went through the outbound proxy, which could not resolve the Docker-owned Reverb hostname. Compose preserves the existing proxy and adds only its own service hostnames to `NO_PROXY`/`no_proxy`.
- Redis's reservation timeout equaled the worker timeout. Reservations now default to 120 seconds, exceeding the 90-second worker timeout.
- The live smoke test expected 200 for a newly created conversation; the resource correctly returns 201. The test now reflects that contract and waits for API startup.

## Dependency security updates

The earlier audit flagged Zod and decode-uri-component with propagated graph findings. The verified tree now uses:

- `zod@4.6.7`, scoped through npm overrides to Expo CLI and pinned in the root dependency tree. Tests import Expo CLI's real plugin/output schemas and MCP extension schema builder to check accepted commands, types, strict validation, readonly arrays, and issue reporting.
- `decode-uri-component@0.5.1`, which fixes malformed percent-decoding work amplification. It is an ESM package; query-string 7 expects a CommonJS callable. The tracked `patches/query-string+7.1.3.patch` only normalizes that import to its default export, preserving Router's existing query-string API. No dependency directories are committed.

Compatibility tests cover Unicode, arrays/null query parameters, Router-style serialization, malformed byte sequences, and a large malformed input in a subprocess with a timeout. Clean installation, lint, TypeScript, Expo Doctor, and Android export passed after applying the patch. The overrides are maintenance obligations: review them on Expo/Router upgrades and remove them when upstream dependencies include the fixes. Broader Expo devtools/MCP interaction and native UI still need their own runtime testing.

## Coverage and reproduction

Backend tests cover authentication, private/group authorization, pagination, idempotency across groups and deleted messages, edits/deletion/replies, monotonic receipts, file validation and access after deletion/removal, channel authorization, token/device revocation, push payload privacy, presence expiry, unread pointers, and after-commit events.

Presence time travel uses an explicit array cache because Carbon cannot advance a real Redis clock. The separate live smoke test uses actual Redis and queued Reverb delivery, without broadcast/queue fakes:

```sh
# From the root, after mobile npm ci and starting the migrated local stack:
node --env-file=backend/.env scripts/smoke.mjs
```

The smoke script validates loopback targets and exercises connection establishment, private subscription signing, rejection of another user's channel authorization, real queued private/group events, retry deduplication, receipts, member removal and access revocation, Redis presence/typing, protected attachments, and blocking. It prints no bearer tokens. Its accounts/messages are disposable local records; sessions are revoked after the protected test block. GitHub Actions generates temporary local credentials and removes that job's Docker volumes afterward.

## Remaining release checks

1. Exercise every mobile screen and permission on an Android development build, including session expiry, blocked users, photos, retries, background read behavior, notification taps, and reconnect synchronization across two devices.
2. Provision EAS/FCM/signing credentials and verify real push delivery and provider receipt handling across sign-in/sign-out.
3. Complete load/concurrency, retention, backup/restore, monitoring, and deployment validation. A durable transactional outbox and immediate socket token-revocation enforcement remain documented production gaps in architecture.md.
4. Inspect hosted GitHub Actions results. Passing local checks do not imply a hosted workflow has completed or passed.
