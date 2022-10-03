module.exports = {
  root: true,
  extends: [
    "eslint:recommended",
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
    "brace-style": ["warn"],
    "prefer-const": ["error"],
  },
};
