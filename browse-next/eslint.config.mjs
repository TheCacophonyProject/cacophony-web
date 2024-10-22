import globals from "globals";

import jsLint from "@eslint/js";
import tsLint from "typescript-eslint";
import vueLint from "eslint-plugin-vue";
import { includeIgnoreFile } from "@eslint/compat";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const gitignorePath = path.resolve(__dirname, ".gitignore");

export default [
  includeIgnoreFile(gitignorePath),
  // config parsers
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,jsx,tsx}"],
    ignores: ["node_modules", "dist", "eslint.config.mjs", "*.d.ts", "public"]
  },
  {
    files: ["*.vue", "**/*.vue"],
    ignores: ["node_modules", "dist", "eslint.config.mjs", "*.d.ts", "public"],
    languageOptions: {
      parserOptions: {
        parser: "@typescript-eslint/parser",
        sourceType: "module"
      }
    },
  },
  // config envs
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node }
    }
  },
  // syntax rules
  jsLint.configs.recommended,
  ...tsLint.configs.recommended,
  ...vueLint.configs["flat/essential"],
  {
    rules: {
      "no-prototype-builtins": "off",
      "linebreak-style": ["warn", "unix"],
      quotes: "off",
      semi: ["warn", "always"],
      curly: ["warn", "all"],
      "no-console": ["warn", { allow: ["warn", "error", "assert"] }],
      "no-debugger": ["warn"],
      "no-undef": ["warn"],
      "no-unused-vars": ["off"],
      "brace-style": ["warn"],
      "prefer-const": ["warn"],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-assertion": ["off"],
      "vue/no-setup-props-destructure": ["off"],
      "@typescript-eslint/no-unused-expressions": ["off"],
      "@typescript-eslint/no-unused-vars": [
        "off",
        {
          // Allow unused vars prefaced by an underscore
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        }],
      "vue/no-unused-vars": [
        "warn",
        {
          ignorePattern: "^_",
        },
      ],
    }
  }
];
