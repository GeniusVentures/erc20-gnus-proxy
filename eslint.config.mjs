import typescriptEslint from "@typescript-eslint/eslint-plugin";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";
import security from "eslint-plugin-security";
import diamondRules from "./eslint-diamond-rules.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default [{
    ignores: ["**/node_modules", "**/artifacts", "**/cache", "**/coverage"],
}, ...compat.extends(
    "plugin:@typescript-eslint/recommended",
    "plugin:prettier/recommended"
), {
    plugins: {
        "@typescript-eslint": typescriptEslint,
        "security": security,
        "diamond-rules": diamondRules,
    },

    languageOptions: {
        globals: {
            ...Object.fromEntries(Object.entries(globals.browser).map(([key]) => [key, "off"])),
            ...globals.mocha,
            ...globals.node,
        },

        parser: tsParser,
        ecmaVersion: 2021,
        sourceType: "module",

        parserOptions: {
            project: "./tsconfig.json",
        },
    },

    rules: {
        "@typescript-eslint/no-namespace": "off",
        "@typescript-eslint/no-var-requires": "off",
        '@typescript-eslint/no-unused-expressions': 'off',
        // Security rules
        "security/detect-eval-with-expression": "error",
        "security/detect-no-csrf-before-method-override": "error",
        "security/detect-possible-timing-attacks": "error",
        "security/detect-new-buffer": "error",
        "security/detect-non-literal-regexp": "warn",
        "security/detect-non-literal-require": "error",
        "security/detect-object-injection": "warn",
        "security/detect-unsafe-regex": "error",
        // Diamond proxy specific security rules
        "@typescript-eslint/no-explicit-any": "warn", // Encourage type safety
        "@typescript-eslint/explicit-function-return-type": "warn",
        // Custom Diamond proxy patterns
        "no-console": "warn", // Warn about console statements in production code
        "no-debugger": "error", // Prevent debugger statements
        // Security-focused rules for smart contract interactions
        "@typescript-eslint/no-non-null-assertion": "warn", // Warn about non-null assertions
        "@typescript-eslint/prefer-nullish-coalescing": "warn",
        "@typescript-eslint/prefer-optional-chain": "warn",
        // Custom Diamond rules
        "diamond-rules/diamond-storage-pattern": "error",
        "diamond-rules/diamond-selector-validation": "error",
        "diamond-rules/secure-external-calls": "warn",
    },
}];
