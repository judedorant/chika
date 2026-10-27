# Verification status

Recorded October 28, 2026. This is a development implementation, not a production release or a signed Android build.

| Check | Observed result |
| --- | --- |
| Backend PHPUnit / SQLite | PASS: 23 tests, 120 assertions |
| Backend PHPUnit / MySQL 8 | PASS: 23 tests, 120 assertions, dedicated rchat_test database |
| Laravel Pint | PASS: 58 PHP files |
| Composer audit | PASS: no vulnerability advisories found |
| npm ci | PASS with the corrected lockfile |
| TypeScript | PASS |
| Expo lint | PASS |
| Expo Doctor | PASS: all 20 checks after enabling the managed proxy for Node fetch |
| Android JavaScript / Hermes export | PASS: 1224 modules; exported bundle, not an APK |
| npm audit --omit=dev | FAIL: 37 dependency-graph findings (35 high, 2 moderate), rooted in zod and decode-uri-component advisories |
| Live Docker API registration | PASS after fixing development-server environment propagation |
| Live Reverb connection and REST channel authorization | Socket connection established; own-user auth accepted and another user's auth rejected |
| Live Reverb private subscription / queued delivery | NOT PASSING: smoke client received 4009 Connection is unauthorized; subsequent investigation interrupted |
| Physical Android UI, background/resume, camera/gallery permissions | NOT RUN: no device/emulator test session |
| FCM / Expo push delivery to a device | NOT RUN: requires EAS/FCM credentials and a physical development build; provider payload behavior is covered with HTTP fakes |
| Signed Android APK/AAB, store submission | NOT RUN: requires signing/build-service setup |
| GitHub Actions | Configured; results must be inspected after push |

The four added security/synchronization tests cover UUID reuse across groups/deletion, protected file access after removal/deletion, group-join unread pointers, presence TTL, and blocked-user discovery. Existing tests cover authentication, private/group authorization, pagination, edits/deletion/replies, receipts, file validation/access, channel authorization, token/device revocation, push payload privacy, and after-commit events.

The blocked-user discovery regression exposed an inherited self-join alias bug; indexed block subqueries now exclude both blocking directions. Presence time travel uses an explicit array cache because Carbon cannot advance a real Redis clock. Channel authorization tests exercise signed REST responses; they are not evidence of actual queued WebSocket delivery.

## Reproduce live checks

Use only a disposable local stack. After `npm ci` in mobile and starting MySQL/Redis/API/worker/Reverb with migrated tables:

```sh
node --env-file=backend/.env scripts/smoke.mjs
```

The smoke script uses the installed mobile tooling's ws package, creates local smoke accounts/messages, and revokes its sessions afterward when it reaches the protected test block. It validates loopback targets and does not print bearer tokens. It should eventually verify real queued message delivery, typing, Redis presence, receipts, file permissions, and blocking. Its full flow is currently blocked by the private subscription authorization error; do not mark it passed.

## Release blockers

1. Diagnose and fix the live private-subscription authorization failure, then rerun the full smoke flow and two-device messaging tests.
2. Resolve dependency advisories with supported SDK/package updates or reviewed compatible patches. `zod@3.25.76` is inherited through Expo CLI; the audit suggests a patched 4.x range, while CLI declares 3.x. `decode-uri-component@0.2.2` is inherited through query-string 7; its patched 0.5.x package uses ESM. Do not force incompatible major/module overrides without verification. The CI audit intentionally remains blocking.
3. Exercise every mobile screen and permission on an Android development build, including session expiry, blocked users, removed membership, photos, message retries, background read behavior, and reconnect synchronization.
4. Provision EAS/FCM/signing credentials and verify real push receipts and notification taps across sign-in/sign-out.
5. Complete load/concurrency, retention, backup/restore, operational monitoring, and the deployment work described in architecture.md. A durable transactional outbox and immediate socket token-revocation enforcement remain documented production gaps.
