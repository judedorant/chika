# RChat production checklist

**Phase 9: INCOMPLETE — preparation and local automated validation only.** Do not turn a prepared configuration, JavaScript export, or mocked provider test into a claim of successful deployment or device delivery.

## Prepared in source

- [x] Audit existing SDK, application ID, REST/Sanctum/Reverb/storage/push architecture.
- [x] Development, preview APK, and production AAB EAS profiles with environment selection and remote signing/versioning.
- [x] Release HTTPS/WSS checks, project/Firebase preflight, Android backup/permission settings.
- [x] Device token refresh, account-safe tap routing, foreground suppression, accepted-ticket retry deduplication.
- [x] Production environment, Nginx HTTPS/WSS, PHP-FPM, Supervisor, and scheduler templates.
- [x] Read-only backend production-readiness command and new configuration/security tests.
- [x] Build, backend, Firebase, and QA guides; prepared Android authentication/persistence flow.

## External configuration / access — not completed

- [ ] Approved Expo account/organization, linked EAS project ID, environment values, and build quota/access.
- [ ] Firebase Android client file for com.judedorant.rchat and matching FCM v1 service credential uploaded privately to EAS.
- [ ] Android keystore/remote credentials configured and recovery procedure verified.
- [ ] Actual staging and production API/socket domains, trusted TLS certificates, and working DNS.
- [ ] Target hosting access, PHP 8.5/FPM, private MySQL 8/Redis credentials, persistent private storage.
- [ ] Expo access token configured on the backend if enhanced push security is enabled.
- [ ] Backup encryption, restore test, retention/deletion policy, log redaction/rotation, and monitoring alerts.

## Build and device gates — not completed

- [ ] Preview EAS build finished successfully; record build ID, commit, profile, versionCode, checksum, signing fingerprint.
- [ ] Preview APK installed and tested on two physical Android devices.
- [ ] Registration/login/logout and SecureStore persistence across process restart verified natively.
- [ ] Sending/receiving/history/photos/receipts/private/group permissions verified natively.
- [ ] Airplane mode, failed-send retry, background/resume, reconnect and gap synchronization verified natively.
- [ ] FCM permission/token registration, real push receipts, foreground/background/cold-start taps and account switching verified.
- [ ] Merged Android manifest/permissions and Play target-SDK requirements reviewed on the actual build.
- [ ] Production AAB completed and verified; correct Play app-signing/upload keys and versionCode recorded.

## Deployment gates — explicit approval required

- [ ] Production target, release commit, migration/rollback plan and maintenance window approved.
- [ ] Database/private-file backup and restore evidence reviewed.
- [ ] Templates adapted to actual users, paths, domains, certificates, ingress CIDRs, resources and secret sources.
- [ ] Production readiness check (including connections) passes on target; migrations reviewed before application.
- [ ] Deployment executed after approval; FPM, Nginx, workers, Reverb and one scheduler healthy.
- [ ] External HTTPS/WSS, authenticated API and attachment access validated against approved accounts.
- [ ] Load/concurrency, queue recovery, Redis durability, rate limits, monitoring and rollback validated.
- [ ] Durable outbox/immediate socket-revocation requirements reviewed; remaining architecture limitations accepted or implemented.
- [ ] Google Play publication separately approved. No automated submit/publish action is configured.

Current status: **APK not built; AAB not built; production not deployed; Play not published.** See `ANDROID_QA_REPORT.md` for observed checks and limitations.
