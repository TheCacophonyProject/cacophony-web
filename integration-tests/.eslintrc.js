module.exports = {
  plugins: ["@typescript-eslint", "cypress", "no-only-tests"],
  root: true,
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:cypress/recommended",
    "prettier",
  ],
  env: {
    node: true,
    es6: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 8,
    sourceType: "module",
  },
  rules: {
    "no-prototype-builtins": "off",
    "linebreak-style": ["error", "unix"],
    quotes: "off",
    semi: ["error", "always"],
    curly: ["warn", "all"],
    "no-console": ["off"],
    "no-debugger": ["warn"],
    "no-undef": ["warn"],
    "no-var": ["error"],
    "no-unused-vars": ["off"],
    "@typescript-eslint/no-unused-vars": ["warn"],
    "brace-style": ["warn"],
    "prefer-const": ["error"],
    "no-only-tests/no-only-tests": ["warn"],
    "cypress/no-assigning-return-values": ["off"],
  },
  overrides: [
    {
      files: ["./**/*.d.ts"],
      rules: {
        "no-undef": "off",
      },
    },
  ],
};
