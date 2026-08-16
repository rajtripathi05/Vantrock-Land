/**
 * Runtime configuration.
 *
 * The local-first MVP must run with zero configuration, so every value has a
 * safe default. Validation is still strict: an unrecognised value fails
 * loudly at first read rather than silently falling back, because a silent
 * fallback to local storage when someone believes they configured Supabase is
 * the worst possible outcome.
 *
 * NO SECRETS. Nothing in this phase requires a credential of any kind.
 */

import { z } from "zod";

const persistenceDriverSchema = z.enum(["indexeddb", "supabase"]).default("indexeddb");
const basemapSchema = z.enum(["osm-dev", "blank"]).default("osm-dev");

export type PersistenceDriver = z.infer<typeof persistenceDriverSchema>;
export type BasemapId = z.infer<typeof basemapSchema>;

/**
 * Next.js inlines NEXT_PUBLIC_* at build time only for literal property
 * accesses, so these cannot be read from a dynamic key.
 */
const rawEnv = {
  persistenceDriver: process.env.NEXT_PUBLIC_PERSISTENCE_DRIVER,
  basemap: process.env.NEXT_PUBLIC_BASEMAP,
};

const envSchema = z.object({
  persistenceDriver: persistenceDriverSchema,
  basemap: basemapSchema,
});

let cached: z.infer<typeof envSchema> | null = null;

function readEnv(): z.infer<typeof envSchema> {
  if (cached) return cached;

  const parsed = envSchema.safeParse({
    persistenceDriver: rawEnv.persistenceDriver || undefined,
    basemap: rawEnv.basemap || undefined,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid Vantrock environment configuration:\n${issues}`);
  }

  cached = parsed.data;
  return cached;
}

export const getPersistenceDriver = (): PersistenceDriver => readEnv().persistenceDriver;
export const getBasemapId = (): BasemapId => readEnv().basemap;

/**
 * Local-mode owner id.
 *
 * MIGRATION: replaced by Supabase `auth.uid()`. The owner_id column and the
 * listByOwner query path exist now precisely so that RLS has something to
 * anchor to later without a schema change.
 */
export const LOCAL_OWNER_ID = "local-analyst";

/** Stamped onto records so future migrations can identify their origin. */
export const ENGINE_VERSION = "vantrock-local@0.1.0";
