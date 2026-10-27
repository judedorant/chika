function validatePublicConfig(input, { release = false } = {}) {
  const errors = [];
  const apiUrl = (
    input.apiUrl || (!release ? "http://10.0.2.2:8000/api/v1" : "")
  ).replace(/\/$/, "");
  const reverbHost = input.reverbHost || (!release ? "10.0.2.2" : "");
  const reverbScheme = input.reverbScheme || (release ? "https" : "http");
  const reverbPort = Number(
    input.reverbPort || (reverbScheme === "https" ? 443 : 8080),
  );
  const reverbKey = input.reverbKey || "";
  const publicHost = (host) =>
    /^[a-z\d.-]+$/i.test(host) &&
    host.includes(".") &&
    !/^(\d+\.){3}\d+$/.test(host) &&
    !/(^|\.)(localhost|local|test|invalid|example|example\.com|example\.org|example\.net)$/i.test(
      host,
    );
  try {
    const url = new URL(apiUrl);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/api/v1"
    )
      throw new Error();
    if (release && (url.protocol !== "https:" || !publicHost(url.hostname)))
      throw new Error();
  } catch {
    errors.push(
      "EXPO_PUBLIC_API_URL must be a valid /api/v1 URL; release builds require HTTPS and a real DNS hostname.",
    );
  }
  if (!/^[a-z\d.-]+$/i.test(reverbHost) || (release && !publicHost(reverbHost)))
    errors.push(
      "EXPO_PUBLIC_REVERB_HOST must be a hostname without a scheme or path; releases require a real DNS hostname.",
    );
  if (
    !["http", "https"].includes(reverbScheme) ||
    (release && reverbScheme !== "https")
  )
    errors.push(
      "EXPO_PUBLIC_REVERB_SCHEME must be https for release builds (WSS).",
    );
  if (!Number.isInteger(reverbPort) || reverbPort < 1 || reverbPort > 65535)
    errors.push("EXPO_PUBLIC_REVERB_PORT must be a valid TCP port.");
  if ((release || reverbKey) && !/^[A-Za-z0-9_-]+$/.test(reverbKey))
    errors.push(
      "EXPO_PUBLIC_REVERB_APP_KEY must be the public Reverb identifier, without colons.",
    );
  if (errors.length) throw new Error(errors.join("\n"));
  return Object.freeze({
    apiUrl,
    reverbHost,
    reverbScheme,
    reverbPort,
    reverbKey,
  });
}
module.exports = { validatePublicConfig };
