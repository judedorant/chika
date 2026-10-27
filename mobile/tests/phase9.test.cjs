const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { validatePublicConfig } = require("../config/public.cjs");
const { validateBuildInputs } = require("../config/build.cjs");
const {
  notificationTarget,
  rememberTap,
  shouldShowNotification,
} = require("../services/notificationPolicy.ts");

const inputs = {
  apiUrl: "https://api.rchat.app/api/v1",
  reverbHost: "ws.rchat.app",
  reverbScheme: "https",
  reverbPort: "443",
  reverbKey: "test-public-key",
};
test("release transport requires explicit secure endpoints and a public key", () => {
  assert.equal(validatePublicConfig(inputs, { release: true }).reverbPort, 443);
  for (const override of [
    { apiUrl: "" },
    { apiUrl: "http://api.rchat.app/api/v1" },
    { apiUrl: "https://user:password@api.rchat.app/api/v1" },
    { apiUrl: "https://api.example.com/api/v1" },
    { apiUrl: "https://10.0.2.2/api/v1" },
    { reverbScheme: "http" },
    { reverbHost: "https://ws.rchat.app" },
    { reverbKey: "invalid:key" },
    { reverbPort: "0" },
  ]) {
    assert.throws(() =>
      validatePublicConfig({ ...inputs, ...override }, { release: true }),
    );
  }
  assert.equal(validatePublicConfig({}).apiUrl, "http://10.0.2.2:8000/api/v1");
});
test("Android preflight requires the linked project and correct Firebase client, never a service account", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rchat-firebase-test-"));
  const file = path.join(dir, "client.json");
  const env = {
    EXPO_PUBLIC_API_URL: inputs.apiUrl,
    EXPO_PUBLIC_REVERB_HOST: inputs.reverbHost,
    EXPO_PUBLIC_REVERB_SCHEME: "https",
    EXPO_PUBLIC_REVERB_APP_KEY: inputs.reverbKey,
    EAS_PROJECT_ID: "80ba4eb3-42b1-47fa-aa8b-3353005d1b98",
    GOOGLE_SERVICES_JSON: file,
  };
  try {
    assert.throws(() => validateBuildInputs({ ...env, EAS_PROJECT_ID: "" }));
    assert.throws(() =>
      validateBuildInputs(env, { requireFirebaseFile: true }),
    );
    fs.writeFileSync(file, JSON.stringify({ type: "service_account" }));
    assert.throws(
      () => validateBuildInputs(env, { requireFirebaseFile: true }),
      /never a service-account/,
    );
    fs.writeFileSync(
      file,
      JSON.stringify({
        client: [
          {
            client_info: {
              android_client_info: { package_name: "wrong.package" },
            },
          },
        ],
      }),
    );
    assert.throws(
      () => validateBuildInputs(env, { requireFirebaseFile: true }),
      /package must match/,
    );
    fs.writeFileSync(
      file,
      JSON.stringify({
        client: [
          {
            client_info: {
              android_client_info: { package_name: "com.judedorant.rchat" },
            },
          },
        ],
      }),
    );
    assert.equal(
      validateBuildInputs(env, { requireFirebaseFile: true }).apiUrl,
      inputs.apiUrl,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("notification routing rejects cross-account and invalid targets", () => {
  const payload = { recipient_user_id: 7, conversation_id: 12 };
  assert.equal(notificationTarget(payload, 7), 12);
  assert.equal(notificationTarget(payload, 8), null);
  assert.equal(notificationTarget(payload, undefined), null);
  for (const id of [
    -1,
    0,
    Infinity,
    "https://evil.test",
    Number.MAX_SAFE_INTEGER + 1,
  ])
    assert.equal(
      notificationTarget({ ...payload, conversation_id: id }, 7),
      null,
    );
});
test("foreground chat suppresses a second banner; repeat tap identifiers route once", () => {
  const payload = { recipient_user_id: 7, conversation_id: 12 };
  assert.equal(shouldShowNotification(payload, 7, true, 12), false);
  assert.equal(shouldShowNotification(payload, 7, true, 99), true);
  assert.equal(shouldShowNotification(payload, 7, false, 12), true);
  assert.equal(shouldShowNotification(payload, 8, true, null), false);
  const seen = new Set();
  assert.equal(rememberTap(seen, "message-1"), true);
  assert.equal(rememberTap(seen, "message-1"), false);
  for (let i = 0; i < 110; i++) rememberTap(seen, `message-${i}`);
  assert.equal(seen.size, 100);
});
