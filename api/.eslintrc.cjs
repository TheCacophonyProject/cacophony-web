
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
  globals: {
    ReadableStream: "readonly",
    ReadableStreamDefaultReader: "readonly",
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 8,
    sourceType: "module",
  },
  rules: {
    indent: ["error", 2], // Enforces 2-space indentation
    "semi-spacing": ["error", { before: false, after: true }], // No space before, one space after
    "keyword-spacing": ["error", { before: true, after: true }], // Space before and after keywords
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
    // "@typescript-eslint/indent": ["error", 2, {
    //     "SwitchCase": 1 // This indents 'case' clauses by one level relative to the 'switch' statement
    // }],
  },
};
