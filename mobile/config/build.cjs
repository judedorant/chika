const fs = require("node:fs");
const { validatePublicConfig } = require("./public.cjs");
const androidPackage = "com.judedorant.rchat";
function publicInput(env) {
  return {
    apiUrl: env.EXPO_PUBLIC_API_URL,
    reverbHost: env.EXPO_PUBLIC_REVERB_HOST,
    reverbPort: env.EXPO_PUBLIC_REVERB_PORT,
    reverbScheme: env.EXPO_PUBLIC_REVERB_SCHEME,
    reverbKey: env.EXPO_PUBLIC_REVERB_APP_KEY,
  };
}
function validateBuildInputs(env, { requireFirebaseFile = false } = {}) {
  const config = validatePublicConfig(publicInput(env), { release: true });
  if (
    !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(
      env.EAS_PROJECT_ID || "",
    )
  )
    throw new Error("EAS_PROJECT_ID must identify your linked Expo project.");
  if (requireFirebaseFile) {
    if (!env.GOOGLE_SERVICES_JSON || !fs.existsSync(env.GOOGLE_SERVICES_JSON))
      throw new Error(
        "GOOGLE_SERVICES_JSON must point to the Firebase Android client configuration file.",
      );
    let firebase;
    try {
      firebase = JSON.parse(fs.readFileSync(env.GOOGLE_SERVICES_JSON, "utf8"));
    } catch {
      throw new Error(
        "The Firebase Android client configuration must be valid JSON.",
      );
    }
    if (firebase.type === "service_account")
      throw new Error(
        "Use the Android client google-services.json, never a service-account key.",
      );
    if (
      !firebase.client?.some(
        (client) =>
          client.client_info?.android_client_info?.package_name ===
          androidPackage,
      )
    )
      throw new Error(
        "Firebase Android package must match com.judedorant.rchat.",
      );
  }
  return config;
}
module.exports = { publicInput, validateBuildInputs, androidPackage };
