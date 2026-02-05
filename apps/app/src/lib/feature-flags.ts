export const isAlphaFeaturesEnabled = () => {
  return process.env.NEXT_PUBLIC_DISABLE_ALPHA_FEATURES !== 'true';
};
