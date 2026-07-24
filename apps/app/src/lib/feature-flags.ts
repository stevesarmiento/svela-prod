import { env } from '@/env.client.mjs';

export const isAlphaFeaturesEnabled = () => {
  return env.NEXT_PUBLIC_DISABLE_ALPHA_FEATURES !== 'true';
};
