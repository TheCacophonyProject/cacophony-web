import globals from "globals";
import eslint from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tsEslint from "typescript-eslint";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import { ConfigWithExtends } from "@eslint/config-helpers";
const config = [
  eslint.configs.recommended,
  ...tsEslint.configs.recommended,
  ...tsEslint.configs.stylistic,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          // Allow unused vars prefaced by an underscore
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    rules: {
      quotes: ["error", "double", { allowTemplateLiterals: true }],
    },
  },
  globalIgnores(["node_modules/**", "**/*.js", "**/*.cjs"]),
  // Add the Prettier recommended configuration last
  eslintPluginPrettierRecommended,
];

// NOTE: Write out the final set of rules, if you want to see what's actually being configured.
// let rules = {};
// for (const configItem of config) {
//   if ("rules" in configItem) {
//     rules = { ...rules, ...configItem.rules };
//   }
// }
// fs.writeFileSync("eslint-config.json", JSON.stringify(rules, null, 2), "utf8");
//process.exit(0);

export default defineConfig(config as ConfigWithExtends);
