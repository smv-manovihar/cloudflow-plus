/**
 * ESLint Flat Configuration File
 *
 * This configuration file uses the new "flat" format introduced in ESLint v8.56.0.
 * It's the default format for ESLint v9+.
 *
 * @see https://eslint.org/docs/latest/use/configure/configuration-files-new
 */

// Import necessary plugins and utilities.
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginNext from "@next/eslint-plugin-next";

/** @type {import('eslint').Linter.FlatConfig[]} */
export default tseslint.config(
  // Global ignores for all configurations.
  {
    ignores: ["node_modules/", ".next/", "out/", "build/", "next-env.d.ts"],
  },

  // Base ESLint recommended rules.
  ...tseslint.configs.base,

  // TypeScript-specific linting rules.
  ...tseslint.configs.recommended,

  // Configuration for React, Hooks, and Next.js projects.
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: {
      react: pluginReact,
      "react-hooks": pluginReactHooks,
      "@next/next": pluginNext,
    },
    languageOptions: {
      // Set parser options for JSX.
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      // Define global variables available in the execution environment.
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    settings: {
      // Automatically detect the version of React to use.
      react: {
        version: "detect",
      },
    },
    rules: {
      // Apply recommended rules from plugins.
      ...pluginReact.configs.recommended.rules,
      ...pluginReactHooks.configs.recommended.rules,
      ...pluginNext.configs.recommended.rules,
      ...pluginNext.configs["core-web-vitals"].rules,

      // --- Your Custom Rules and Overrides ---

      // General rules.
      "no-console": "warn",
      "no-debugger": "warn",

      // Override for TypeScript unused variables.
      // The original `constsIgnorePattern` is not a valid option; `varsIgnorePattern` covers constants.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],

      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",

      "react/no-unknown-property": "off",
      "@next/next/no-html-link-for-pages": "off",
      "@next/next/no-img-element": "off",
    },
  }
);
