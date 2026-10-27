const { validateBuildInputs } = require("../config/build.cjs");
const config = require("../app.json").expo;
const index = process.argv.indexOf("--profile");
const profile =
  index >= 0 ? process.argv[index + 1] : process.env.EAS_BUILD_PROFILE;
try {
  if (!["preview", "production"].includes(profile))
    throw new Error("Specify --profile preview or --profile production.");
  validateBuildInputs(
    {
      ...process.env,
      EAS_PROJECT_ID:
        process.env.EAS_PROJECT_ID || config.extra?.eas?.projectId,
      GOOGLE_SERVICES_JSON:
        process.env.GOOGLE_SERVICES_JSON || config.android?.googleServicesFile,
    },
    { requireFirebaseFile: true },
  );
  console.log(
    `PASS: ${profile} Android inputs validated locally. EAS account access, signing, and FCM delivery still require external verification.`,
  );
} catch (error) {
  console.error(`BLOCKED: ${error.message}`);
  process.exitCode = 1;
}
