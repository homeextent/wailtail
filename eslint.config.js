
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "firebase-debug.log",
      ".vercel/**",
    ],
  },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
    },
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Progressive adoption: avoid turning existing code patterns
      // into hundreds of unrelated CI failures.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-empty": "off",
      "prefer-const": "off",
      "no-useless-escape": "off",
    },
  },
  {
    files: ["**/*.{jsx,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // Retain the critical Rules of Hooks check.
      "react-hooks/rules-of-hooks": "error",

      // Review dependency warnings separately to avoid
      // forcing potentially behaviour-changing edits.
      "react-hooks/exhaustive-deps": "off",
    },
  },
  {
    files: ["public/firebase-messaging-sw.js"],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        firebase: "readonly",
      },
    },
  },
);
