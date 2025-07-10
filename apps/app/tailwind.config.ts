import baseConfig from "@v1/ui/tailwind.config";
import type { Config } from "tailwindcss";
import tailwindcssMotion from "tailwindcss-motion";

export default {
  content: ["./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  presets: [baseConfig],
  plugins: [tailwindcssMotion] 
} satisfies Config;
