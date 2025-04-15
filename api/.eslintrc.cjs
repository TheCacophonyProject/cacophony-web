module.exports = {
  plugins: ["@typescript-eslint"],
  root: true,
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
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
    semi: ["error", "always"],
    curly: ["warn", "all"],
    "no-console": ["off"],
    "no-debugger": ["warn"],
    "no-undef": ["warn"],
    "no-var": ["error"],
    "no-unused-vars": ["off"],
    quotes: ["error", "double", { allowTemplateLiterals: true }],
    "comma-dangle": ["error", "always-multiline"],
    "@typescript-eslint/no-unused-vars": [
      "warn",
      {
        // Allow unused vars prefaced by an underscore
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      },
    ],
    "brace-style": ["warn"],
    "prefer-const": ["error"],
    "@typescript-eslint/consistent-type-imports": [
      "error",
      {
        prefer: "type-imports",
        fixStyle: "separate-type-imports",
      },
    ],
    "@typescript-eslint/no-import-type-side-effects": "error",
  },
};
