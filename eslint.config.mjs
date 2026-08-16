import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const config = [
  {
    ignores: [".next/**", "node_modules/**", "out/**", "coverage/**", "next-env.d.ts"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // ARCHITECTURE BOUNDARY (blueprint rule 15/16).
    //
    // React components must never reach into a storage implementation. They
    // talk to the ApiClient, which talks to services, which talk to the
    // repository interface. Swapping IndexedDB for Supabase must not touch
    // a single component.
    files: ["components/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/lib/repositories/*", "@/lib/repositories/*", "idb", "idb/*"],
              message:
                "UI must not depend on storage details. Use the ApiClient from @/lib/client instead.",
            },
          ],
        },
      ],
    },
  },
  {
    // The geometry engine is the single source of truth for area, perimeter,
    // and centroid. It must stay free of storage, transport, and UI concerns
    // so it can be verified against PostGIS in isolation.
    files: ["lib/geo/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/lib/repositories/*", "**/lib/client/*", "react", "next/*", "idb"],
              message: "lib/geo must remain a pure, dependency-free calculation module.",
            },
          ],
        },
      ],
    },
  },
];

export default config;
