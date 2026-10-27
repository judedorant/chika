# RChat Android / Phase 9 QA report

Recorded October 28, 2026 (Asia/Singapore). **Phase 9 remains INCOMPLETE.** Build preparation and local automated validation are complete; no EAS build, real-device verification, production deployment, or Play publication has succeeded or been attempted in this phase.

## Audit findings and changes

Existing Expo 55 / React Native 0.83.10 source, Android package `com.judedorant.rchat`, Sanctum REST authentication, Reverb, private local storage, Expo push registration/jobs, migrations, profiles, and Phase 8 tests were retained. Missing production pieces were explicit secure release endpoints, EAS/Firebase linkage, release permission policy, deployable host templates, and notification retry/tap guards.

Prepared changes:

- Dynamic Expo config preserves the static app baseline and adds project/Firebase environment linkage, release cleartext blocking, backup disabling, notification permission/channel, and permission removals. Dev-client overlay permission is kept for development and blocked in release profiles.
- Development, preview APK, and production AAB profiles explicitly select EAS environments, remote signing and remote versioning. Production increments versionCode. Endpoint/public-key checks prevent emulator/HTTP/example configuration from shipping in release profiles.
- Firebase preflight checks package identity and rejects service-account material as Android client configuration. No external keys or IDs were invented.
- Notification permission, token registration/rotation, foreground suppression, account/membership-safe navigation and repeated-tap handling are prepared. Backend push jobs skip known accepted tickets on retry and fail unaccepted provider tickets instead of silently reporting success.
- Production Nginx HTTPS/WSS, FPM, Supervisor and scheduler examples, protected environment template, explicit proxy trust, and a read-only readiness command were added.
- All five requested root guides/checklists were produced. A Maestro native registration/login/logout/persistence flow is prepared under `qa/android/`.

## Executed automated checks

| Check | Observed result | Limit |
| --- | --- | --- |
| Backend PHPUnit / SQLite | PASS: 32 tests, 141 assertions | Isolated test database; provider calls faked where appropriate |
| Backend PHPUnit / MySQL 8 | PASS: 32 tests, 141 assertions | Dedicated rchat_test database, not production |
| Real HTTP/MySQL/Redis/worker/Reverb smoke | PASS: 40 checks before cleanup | Node socket client, not a native Android client |
| Mobile unit/security compatibility suite | PASS: 8 tests | Pure configuration/notification policy and tooling compatibility; not full UI automation |
| TypeScript / Expo lint | PASS | Static checks |
| Expo Doctor | PASS: 20/20 | Development config / dependency compatibility |
| Android JavaScript/Hermes export | PASS: 1227 modules | Not a signed APK/AAB; no device execution |
| Full npm audit | PASS: zero reported vulnerabilities | Registry advisory snapshot, not a security guarantee |
| Laravel Pint | PASS: 65 files | Formatting validation |
| Existing local MySQL migrations | PASS: all five migrations marked Ran | Production schema/state and migration lock time not tested |
| eas.json schema | PASS using EAS CLI 26.0.0 schema | Does not establish account/project/credential access |
| EAS build command syntax | PASS via CLI build help for platform/profile options | Neither build command was launched |
| EAS account check | BLOCKED: CLI reports Not logged in | Requires approved Expo login/project access |
| Preview / production Android preflight | BLOCKED as expected | Actual HTTPS/WSS endpoints, project ID and Firebase client are not configured |
| Backend production readiness on current stack | BLOCKED as expected | Current environment is local, debug enabled and HTTP; no production environment was substituted |
| Nginx template syntax | PASS in disposable nginx container with temporary self-signed certificate | No real DNS/certificate/HTTPS endpoint validated |
| PHP 8.5 FPM pool syntax | PASS in disposable FPM container | Target host users, socket, extensions and resources still need verification |
| Supervisor / cron | Prepared and reviewed | Not installed or started on a production host |

Development Android manifest introspection confirms backup disabled, local cleartext enabled, INTERNET/VIBRATE/POST_NOTIFICATIONS, legacy external-storage permissions limited to API 32, and camera/audio/video removal directives. SYSTEM_ALERT_WINDOW is development-only by release configuration. This is project-manifest introspection, not the final Gradle-merged release manifest; verify merged permissions and runtime dialogs on the actual APK.

## Required feature coverage

| Feature | Automated evidence | Native/manual status |
| --- | --- | --- |
| Registration/login/logout | PHPUnit and real HTTP smoke, including revoked token rejected with 401 | Maestro flow prepared, not run |
| Authentication persistence | Existing SecureStore restore path audited; authenticated session retained across socket reconnect | Process restart/persistence not tested on device |
| Send/receive/private/group chat | PHPUnit and real queued private/group socket delivery | Two-device Android UI not run |
| History/receipts/member removal | Real database/API/socket checks and authorization tests | Native scrolling/read/background behavior not run |
| Images/private attachments | Validation/permission tests and real uploaded PNG streaming | Gallery/OS permissions not run |
| Network interruption/reconnection | Real socket closed, message sent during gap, reauthorized subscription, REST gap recovery and new event received | Airplane mode / Wi-Fi-cellular transitions not run |
| Push notifications | Faked Expo response/ticket/error tests, retry deduplication, token/session lifecycle, pure client policy tests | Real FCM permission/token/delivery/receipt not run |
| Foreground/background/taps | Same-chat banner suppression and repeated/cross-account tap policy tests | OS foreground/background/cold-start behavior not run |

The smoke accounts and messages are generated in the disposable local database and are not a substitute for working features. Provider test tokens are fixtures and are never sent to Expo. Actual device tokens, credentials, signing keys and production environments are not committed.

## Prepared native execution

After producing a signed preview APK and configuring a disposable staging backend, install the app on a test device and run the prepared Maestro flow with a unique account email and a strong temporary password:

```sh
maestro test -e QA_EMAIL=<unique-staging-email> -e QA_PASSWORD=<temporary-test-password> qa/android/auth-session.yaml
```

This clears that test app's local state and creates an account, logs out/in, stops/reopens the app, verifies restored access, then logs out. It has NOT been executed here; Maestro/ADB/device access is unavailable. Use a staging account only, keep test credentials out of committed files and shared logs, and adapt selectors if actual native rendering differs.

Manual two-device matrix:

1. Register/login and create private/group chats; send text/replies/photos; edit/delete; verify histories and receipts.
2. Disable network without killing the app, send and observe failure, reconnect and retry the same draft; verify one canonical message. In-memory drafts do not survive process termination.
3. Background/resume, kill/reopen, switch Wi-Fi/mobile data, and verify no missed messages or premature reads.
4. Deny notification permission, enable later, then verify recipient same-chat foreground, other-chat foreground, background and cold-start delivery/taps. Force-stopped Android apps may not receive notifications until reopened.
5. Repeat taps, remove membership, revoke tokens, log out and switch accounts. Verify no unauthorized navigation, stale banner content, duplicate alerts, or push registration retained after session revocation.
6. Record Expo tickets/provider receipts privately and distinguish FCM handoff from actual device display.

## Missing credentials and manual actions

- Expo login/organization access, real EAS project ID, environment values and signing credential access.
- Firebase Android client JSON and FCM v1 service-account credential uploaded privately to EAS; correct signing certificate restrictions.
- Approved staging/production API/socket DNS and TLS certificates, hosting access, MySQL/Redis credentials, persistent storage, backup/monitoring configuration.
- Backend Expo access token if enhanced push security is enabled.
- Actual preview APK/AAB build artifacts and two physical Android devices for release validation.

Follow `ANDROID_BUILD_GUIDE.md`, `FIREBASE_SETUP_GUIDE.md`, `BACKEND_DEPLOYMENT_GUIDE.md` and `PRODUCTION_CHECKLIST.md`. Do not send secrets in chat. No production deploy or Play submission may proceed without separate explicit approval.

## Build/deployment status

| Deliverable | Status |
| --- | --- |
| Preview APK | NOT BUILT; no EAS build ID or artifact |
| Production AAB | NOT BUILT; no EAS build ID or artifact |
| Real FCM delivery | NOT VERIFIED |
| Production backend | NOT DEPLOYED |
| Google Play | NOT PUBLISHED |
| Phase 9 | INCOMPLETE — external setup, builds, device checks and approved deployment remain |

## Modified and added files

- `.gitignore`
- `ANDROID_BUILD_GUIDE.md`
- `ANDROID_QA_REPORT.md`
- `BACKEND_DEPLOYMENT_GUIDE.md`
- `FIREBASE_SETUP_GUIDE.md`
- `PRODUCTION_CHECKLIST.md`
- `README.md`
- `backend/app/Console/Commands/ProductionCheck.php`
- `backend/app/Http/Middleware/TrustProxies.php`
- `backend/app/Jobs/SendMessagePush.php`
- `backend/bootstrap/app.php`
- `backend/config/deployment.php`
- `backend/tests/Feature/ProductionReadinessTest.php`
- `backend/tests/Feature/ProxyTrustTest.php`
- `backend/tests/Feature/PushDeliveryTest.php`
- `deploy/backend.env.example`
- `deploy/cron/rchat`
- `deploy/nginx/rchat.conf`
- `deploy/php-fpm/rchat.conf`
- `deploy/supervisor/rchat.conf`
- `docs/qa.md`
- `docs/setup.md`
- `mobile/.env.example`
- `mobile/app.config.js`
- `mobile/config/build.cjs`
- `mobile/config/public.cjs`
- `mobile/config/public.d.cts`
- `mobile/eas.json`
- `mobile/package-lock.json`
- `mobile/package.json`
- `mobile/scripts/android-preflight.cjs`
- `mobile/services/api.ts`
- `mobile/services/environment.ts`
- `mobile/services/notificationPolicy.ts`
- `mobile/services/notifications.ts`
- `mobile/services/realtime.ts`
- `mobile/tests/phase9.test.cjs`
- `qa/android/auth-session.yaml`
- `scripts/smoke.mjs`
