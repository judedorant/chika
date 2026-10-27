export type PublicConfigInput = {
  apiUrl?: string;
  reverbHost?: string;
  reverbScheme?: string;
  reverbPort?: string;
  reverbKey?: string;
};
export function validatePublicConfig(
  input: PublicConfigInput,
  options?: { release?: boolean },
): {
  apiUrl: string;
  reverbHost: string;
  reverbScheme: string;
  reverbPort: number;
  reverbKey: string;
};
