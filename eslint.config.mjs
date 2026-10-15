import { defineConfig, globalIgnores } from "eslint/config";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";
import globals from "globals";
export default defineConfig([
  globalIgnores([".next/**", "public/sw.js", "coverage/**", "playwright-report/**", "test-results/**", "next-env.d.ts"]),
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ["**/*.{ts,tsx}"], languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  { files: ["src/components/**/*.{ts,tsx}"], plugins: { "react-hooks": hooks }, rules: { ...hooks.configs.recommended.rules } },
  { files: ["**/*.mjs"], languageOptions: { globals: globals.node } },
  { files: ["scripts/service-worker.js"], languageOptions: { globals: globals.serviceworker } },
]);
