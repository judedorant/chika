const { publicInput, validateBuildInputs } = require("./config/build.cjs");
const { validatePublicConfig } = require("./config/public.cjs");

module.exports = ({ config }) => {
  const profile =
    process.env.EAS_BUILD_PROFILE ||
    process.env.EXPO_PUBLIC_APP_ENV ||
    "development";
  const release = ["preview", "production"].includes(profile);
  const projectId = process.env.EAS_PROJECT_ID || config.extra?.eas?.projectId;
  const env = {
    ...process.env,
    EAS_PROJECT_ID: projectId,
    GOOGLE_SERVICES_JSON:
      process.env.GOOGLE_SERVICES_JSON || config.android?.googleServicesFile,
  };
  if (release)
    validateBuildInputs(env, {
      requireFirebaseFile: process.env.EAS_BUILD === "true",
    });
  else validatePublicConfig(publicInput(env));
  return {
    ...config,
    ...(process.env.EXPO_ACCOUNT_OWNER
      ? { owner: process.env.EXPO_ACCOUNT_OWNER }
      : {}),
    android: {
      ...config.android,
      allowBackup: false,
      permissions: [
        ...new Set([
          ...(config.android?.permissions || []),
          "android.permission.POST_NOTIFICATIONS",
        ]),
      ],
      blockedPermissions: [
        ...(config.android?.blockedPermissions || []),
        "android.permission.RECORD_AUDIO",
        "android.permission.CAMERA",
        "android.permission.READ_MEDIA_VIDEO",
        "android.permission.READ_MEDIA_AUDIO",
        ...(release ? ["android.permission.SYSTEM_ALERT_WINDOW"] : []),
      ],
      ...(env.GOOGLE_SERVICES_JSON || release
        ? {
            googleServicesFile:
              env.GOOGLE_SERVICES_JSON || "./google-services.json",
          }
        : {}),
    },
    extra: {
      ...config.extra,
      ...(projectId ? { eas: { ...config.extra?.eas, projectId } } : {}),
    },
    plugins: [
      ...(config.plugins || []).map((plugin) =>
        plugin === "expo-notifications"
          ? [plugin, { defaultChannel: "messages" }]
          : plugin,
      ),
      [
        "expo-build-properties",
        { android: { usesCleartextTraffic: !release } },
      ],
    ],
  };
};
