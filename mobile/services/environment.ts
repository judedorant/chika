import { validatePublicConfig } from "../config/public.cjs";

// Expo only inlines direct EXPO_PUBLIC_* references. Never read secrets here.
export const environment = validatePublicConfig(
  {
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
    reverbHost: process.env.EXPO_PUBLIC_REVERB_HOST,
    reverbPort: process.env.EXPO_PUBLIC_REVERB_PORT,
    reverbScheme: process.env.EXPO_PUBLIC_REVERB_SCHEME,
    reverbKey: process.env.EXPO_PUBLIC_REVERB_APP_KEY,
  },
  { release: !__DEV__ },
);
