// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*', 'supabase/*'],
  },
  {
    // The plugin has to be registered in the same config object as the rules
    // that reference it — flat config does not inherit plugin registrations.
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      // `any` defeats the point of a typed domain layer (CLAUDE.md §60).
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "TSAsExpression > TSAnyKeyword",
          message: 'Casting to `any` is not allowed. Model the type properly.',
        },
      ],
    },
  },
  {
    // ADR-002: the domain layer is pure. It must not reach into React, the
    // platform, the database, or any I/O. This rule is the enforcement.
    //
    // Tests are excluded: `*.test.ts` never ships, and one of them deliberately
    // reads a seed file off disk to assert it matches the catalogue it mirrors.
    files: ['src/domain/**/*.ts'],
    ignores: ['src/domain/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react-*',
                'react-native',
                '@react-native*',
                'expo',
                'expo-*',
                '@expo/*',
                '@supabase/*',
                '@tanstack/*',
                '@/components/*',
                '@/features/*',
                '@/hooks/*',
                '@/services/*',
                '@/lib/*',
                '@/integrations/*',
                '@/theme/*',
                'node:*',
                'fs',
                'path',
              ],
              message:
                'src/domain must stay pure (ARCHITECTURE.md ADR-002). Only src/domain, src/types, src/utils and zod may be imported.',
            },
          ],
        },
      ],
    },
  },
]);
