# RChat Firebase / FCM setup

**Real device push has not been verified. Firebase/EAS credentials are missing.** Keep the existing delivery path:

```text
Laravel queued push job → Expo Push Service → FCM v1 → Android expo-notifications
```

The mobile app registers an **Expo push token**, not a raw FCM token. The existing `/api/v1/me/devices` endpoint validates Expo token format and binds registration to the current Sanctum token. Laravel posts to Expo and checks delayed provider receipts. Do not add a parallel direct-FCM sender or create local notifications from Reverb events; those would produce duplicate alerts.

## Firebase Android client configuration

1. Create/select the correct Firebase project and register the Android package **com.judedorant.rchat**.
2. Download its Android **google-services.json**. It is client configuration, not the private service-account key. This repository ignores it even though some client identifiers are public.
3. In each EAS environment, create a file variable named `GOOGLE_SERVICES_JSON` holding that client file. Dynamic Expo config references the file path; on the EAS worker it validates that the client package matches the app ID.
4. Keep a secure local copy outside Git for `npm run preflight:android`. Set `GOOGLE_SERVICES_JSON` to that path when running local validation. Secret-visibility file variables cannot be assumed available to local EAS config resolution.
5. Rebuild the native app when Firebase client configuration changes. A JavaScript update cannot add missing Android Firebase resources.

If restricting the Firebase client API key, allow the FCM Registration and Firebase Installations APIs. Register the correct signing certificate fingerprints. For Play-distributed builds use the Play **app-signing** certificate, not just the upload certificate. Internal EAS APKs may require the EAS signing certificate as well. Incorrect restrictions can block token acquisition.

## Private FCM v1 service credential

1. Enable the FCM v1 API and obtain a service-account key for the same Firebase project using your approved credential process.
2. For an existing account, Expo's current instructions require the **Firebase Cloud Messaging API Admin** role. Apply the least permissions required by your organization.
3. In Expo project settings → Credentials → Android application identifier → FCM V1 service account key, upload/select that credential. The equivalent interactive workflow is `npx eas-cli@latest credentials --platform android` → Google service account → FCM V1.
4. Store/rotate the original key in an approved vault. Never put it into `GOOGLE_SERVICES_JSON`, `EXPO_PUBLIC_*`, app `extra`, Git, the APK, or chat messages.

Laravel does not need this service-account key when using Expo Push Service. If Expo enhanced push security is enabled, configure `EXPO_ACCESS_TOKEN` only in the backend secret environment.

## Device registration and routing

- On a physical Android development/preview build, sign in and open Settings → Enable push notifications.
- The app creates the `messages` channel before requesting Android notification permission. Expo obtains its project-scoped push token and the API registers it against the active session.
- Already-authorized devices re-register on sign-in/foreground and native token rotation. The native token event triggers a fresh **Expo** token lookup; it is not sent directly to the API.
- Logout/password change/session revocation delete token-bound device registrations. Requests that finish after an account switch are checked against the captured session.
- Push data includes conversation ID, message ID, and recipient user ID. A notification tap validates the active account and current conversation membership before navigation. Repeat tap identifiers are consumed once; a transient network failure can retry on foregrounding.
- Foreground banners are suppressed when the same chat is open, and payloads for another account are ignored by the foreground handler. Other chats may show one push banner. Background presentation is handled by Android/FCM; Reverb only refreshes app data.
- Lock-screen bodies are generic and contain no message text. A notification already handed to the OS before logout cannot be recalled reliably; account checks still prevent unauthorized navigation.

## Retry behavior and limits

Accepted Expo tickets are cached for seven days and skipped on job retry; per-message locks prevent concurrent push-job overlap. Read messages, revoked/expired sessions, and messages older than one day are excluded. Pending notifications have a one-hour provider TTL. Delayed receipt checks remove DeviceNotRegistered tokens.

This reduces duplicates, but Expo/FCM are not exactly-once transports. A lost HTTP response after provider acceptance or loss/eviction of Redis markers can still produce duplicates. Provider receipt success means handoff to FCM, not confirmed display on the device. The dedicated backend tests fake provider responses; real delivery is a separate manual gate.

Deploy the enriched backend push payload before rolling out the updated mobile client. Older notifications without recipient identity are deliberately ignored by the new tap/foreground policy.

## Required manual evidence

Use two disposable staging accounts and actual signed preview APKs. Record permission denied/granted, recipient foreground in same/other chat, background, cold-start tap, repeated tap, airplane-mode reconnect, token rotation/reinstall, logout and account switch, unread/read suppression, and actual Expo ticket/receipt IDs in restricted test records. Do not publish push tokens or credentials in QA reports.

Reference: https://docs.expo.dev/push-notifications/fcm-credentials/ and https://docs.expo.dev/versions/v55.0.0/sdk/notifications/.
