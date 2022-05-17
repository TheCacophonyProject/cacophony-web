// eslint-disable-next-line no-undef
module.exports = {
  plugins: ["@typescript-eslint", "vue"],
  root: true,
  extends: [
    "plugin:vue/essential",
    "plugin:prettier-vue/recommended",
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
  ],

  parserOptions: {
    ecmaVersion: 2018,
    sourceType: "module",
    parser: "@typescript-eslint/parser",
  },
  overrides: [
    {
      files: ["./src/**/*.vue", "./src/**/*.ts"],
    },
  ],
  rules: {
    "no-prototype-builtins": "off",
    "linebreak-style": ["warn", "unix"],
    quotes: "off",
    semi: ["warn", "always"],
    curly: ["warn", "all"],
    "no-console": ["warn"],
    "no-debugger": ["warn"],
    "no-undef": ["warn"],
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": ["warn"],
    "brace-style": ["warn"],
    "prefer-const": ["warn"],
    "prettier-vue/prettier": ["warn"],
  },
};
