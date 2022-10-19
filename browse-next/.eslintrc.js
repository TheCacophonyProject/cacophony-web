/* eslint-env node */
require("@rushstack/eslint-patch/modern-module-resolution");

module.exports = {
  root: true,
  extends: [
    "plugin:vue/vue3-essential",
    "eslint:recommended",
    "@vue/eslint-config-typescript/recommended",
    "@vue/eslint-config-prettier",
  ],
  env: {
    "vue/setup-compiler-macros": true,
    browser: true,
    es2022: true,
  },
  parserOptions: {
    ecmaVersion: "latest",
    lib: ["es2022", "DOM"],
    sourceType: "module",
    parser: "@typescript-eslint/parser",
  },
  rules: {
    "no-prototype-builtins": "off",
    "linebreak-style": ["warn", "unix"],
    quotes: "off",
    semi: ["warn", "always"],
    curly: ["warn", "all"],
    "no-console": ["warn", { allow: ["warn", "error", "assert"] }],
    "no-debugger": ["warn"],
    "no-undef": ["warn"],
    "@typescript-eslint/no-unused-vars": [
      "warn",
      {
        // Allow unused vars prefaced by an underscore
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      },
    ],
    "no-unused-vars": ["off"],
    "brace-style": ["warn"],
    "prefer-const": ["warn"],
    "vue/no-unused-vars": [
      "warn",
      {
        ignorePattern: "^_",
      },
    ],
    "@typescript-eslint/no-non-null-assertion": ["off"],
    "vue/no-setup-props-destructure": ["off"],
  },
};
