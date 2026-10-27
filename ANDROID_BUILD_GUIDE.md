# RChat Android build guide

**Phase 9 is prepared, not complete. No APK or AAB has been built.** EAS CLI 26 is available, but the current session is not signed in to Expo. No build, signing, submission, or production deployment was started.

## Audited baseline

- Expo SDK 55 (`~55.0.32`), React Native 0.83.10, TypeScript, Expo Router; use Node 24.19 and `npm ci`.
- Android application ID: **com.judedorant.rchat**. Preserve it for signing, Firebase, and store updates.
- `app.json` remains the static baseline. `app.config.js` adds environment-specific transport policy, Firebase file selection, optional Expo owner/project linkage, notification channel, and Android permissions.
- Sanctum tokens remain in SecureStore. Existing API/Reverb messaging is reused.
- `eas.json` was validated against the EAS CLI 26 schema; `eas build --help` confirms the platform/profile command flags. This does not verify account access, signing, or build completion.

| Profile | EAS environment | Output | Transport / purpose |
| --- | --- | --- | --- |
| development | development | Development client | Local emulator HTTP allowed; Metro required |
| preview | preview | Internal APK | Explicit staging HTTPS/WSS; remote signing |
| production | production | AAB | Explicit production HTTPS/WSS; remote signing and versionCode increment |

Production Android versions are managed remotely by EAS (`appVersionSource: remote`). Initialize the version when prompted and record it before a release. Profiles intentionally keep the same application ID; preview and production replace one another on a device. Use separate test devices or clear the preview installation before production validation.

## Required account and environment setup

1. Sign in to your **Expo** account with `npx eas-cli@latest login`. Your GitHub identity does not establish an Expo account or project.
2. Create/link the actual Expo project with `npx eas-cli@latest init`. Dynamic config may require setting the real project UUID manually. Supply it as `EAS_PROJECT_ID`, or put the real public project ID in `app.json` under `extra.eas.projectId`. Do not invent an ID. Optionally set `EXPO_ACCOUNT_OWNER` to the actual Expo owner.
3. Configure both EAS preview and production environments in the Expo dashboard. Public variables are embedded in the binary and are not secrets:

| Variable | Value required |
| --- | --- |
| EXPO_PUBLIC_API_URL | Reachable HTTPS API URL ending in `/api/v1` |
| EXPO_PUBLIC_REVERB_HOST | Public socket hostname, without scheme/path |
| EXPO_PUBLIC_REVERB_SCHEME | `https` (the Pusher client uses WSS) |
| EXPO_PUBLIC_REVERB_PORT | Usually `443` |
| EXPO_PUBLIC_REVERB_APP_KEY | Backend public identifier; not the signing secret |
| EAS_PROJECT_ID | Actual linked Expo project UUID; available locally for project discovery |
| GOOGLE_SERVICES_JSON | File environment variable containing the Firebase Android **client** JSON |

The profile sets `EXPO_PUBLIC_APP_ENV`; keep staging and production endpoint values separate. Make the same public variables available in the terminal for local config/preflight. Export `EAS_PROJECT_ID` before EAS needs to discover the project. Secret-visibility file variables are available on EAS workers, not automatically readable by local CLI config resolution. For local preflight, point `GOOGLE_SERVICES_JSON` at a securely stored local client file; remote workers receive their own file path. Do not put private credentials under `EXPO_PUBLIC_*` or `extra`.

Release validation rejects HTTP, missing public endpoints, emulator/IP addresses, example domains, invalid socket ports/keys, missing project IDs, wrong Firebase package IDs, and accidental use of a service-account file. It validates configuration format, not DNS/TLS availability or ownership of the Expo project.

## Firebase and signing

Follow [FIREBASE_SETUP_GUIDE.md](FIREBASE_SETUP_GUIDE.md). Upload the FCM v1 service-account credential to **EAS Credentials**, not to the app or Laravel repository. Store the Android client configuration as an EAS file variable; neither file belongs in Git for this project.

Use `npx eas-cli@latest credentials --platform android` to configure or select the Android keystore under the correct Expo project. Preserve an existing production key. For a new app, let the authorized account manage a new key in EAS; retain a secure recovery copy and record certificate fingerprints. Never commit keystores, credential JSON, passwords, or private signing material. If Google Play App Signing is used, distinguish its app-signing certificate from the EAS upload certificate when configuring Firebase/API restrictions.

## Local checks and build commands

From `mobile/`, after loading the selected environment and local Firebase file path:

```sh
npm ci
npm test
npm run typecheck
npm run lint
npx expo-doctor
npm run preflight:android -- --profile preview
npx eas-cli@latest build --platform android --profile preview
```

For production, load the production environment and run:

```sh
npm run preflight:android -- --profile production
npx eas-cli@latest build --platform android --profile production
```

These correspond to `eas build --platform android --profile preview` and `eas build --platform android --profile production` when EAS CLI is installed on PATH. **Do not add `--auto-submit`.** AAB generation does not publish an app; Google Play submission and any production deployment require separate explicit approval.

Development client:

```sh
npx eas-cli@latest build --platform android --profile development
npx expo start --dev-client
```

Record the EAS build ID, source commit, profile/environment, signing fingerprint, versionCode, artifact checksum, and final EAS status. A build is successful only when EAS finishes and provides the APK/AAB. A Hermes export or schema check is not an Android build.

## Permissions and device validation

The app supports gallery image selection, not camera capture or microphone recording. Configuration blocks camera, audio recording, and video/audio media permissions. Release profiles also block the development client overlay permission; development keeps it for dev tooling. Backup is disabled; SecureStore data must not be restored as usable credentials on another installation. Development permits local cleartext; preview/production disable it through Expo build properties and validate HTTPS/WSS in JavaScript as well.

Android notification permission is requested from Settings → Enable push notifications after creating the `messages` channel. No location, contacts, exact-alarm, or foreground-service permission is intentionally requested. Inspect the generated release manifest and merged native permissions on the actual build before distribution; dependency manifests and OS behavior have not been checked on a device here.

Install the preview artifact on two physical devices. Follow [ANDROID_QA_REPORT.md](ANDROID_QA_REPORT.md), including persistence, offline retry, reconnect, uploads, account switching, notification taps, and foreground/background behavior. Release native tests remain blocked until an actual signed build and Firebase configuration exist.
