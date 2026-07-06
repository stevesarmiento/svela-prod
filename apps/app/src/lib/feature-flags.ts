import { env } from '@/env.mjs';

export const isAlphaFeaturesEnabled = () => {
  return env.NEXT_PUBLIC_DISABLE_ALPHA_FEATURES !== 'true';
};
