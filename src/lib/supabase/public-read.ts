import "server-only"

import { cache } from "react"

import { catalogueMessages, type CatalogueFailure } from "@/lib/catalogue/types"
import { publicSupabaseConfig } from "@/lib/supabase/config"
import { createServerSupabaseClient } from "@/lib/supabase/server"

const missingCatalogueCodes = new Set(["42P01", "PGRST204", "PGRST205"])

export function catalogueFailure(code: string | null | undefined): CatalogueFailure {
  if (code && missingCatalogueCodes.has(code)) {
    return {
      ok: false,
      reason: "unavailable",
      message: catalogueMessages.missingTables,
    }
  }
  return {
    ok: false,
    reason: "unavailable",
    message: catalogueMessages.unavailable,
  }
}

export function catalogueNotConfigured(): CatalogueFailure {
  return {
    ok: false,
    reason: "not_configured",
    message: catalogueMessages.notConfigured,
  }
}

export const publicReadClient = cache(async () => {
  try {
    if (!publicSupabaseConfig()) {
      return { ok: false as const, read: catalogueNotConfigured() }
    }
  } catch (error) {
    const badUrl =
      error instanceof Error &&
      error.message === "The public Supabase URL must be the project HTTPS address."
    return {
      ok: false as const,
      read: badUrl
        ? {
            ok: false as const,
            reason: "not_configured" as const,
            message: catalogueMessages.badUrl,
          }
        : catalogueNotConfigured(),
    }
  }

  try {
    const supabase = await createServerSupabaseClient()
    return { ok: true as const, supabase }
  } catch {
    return { ok: false as const, read: catalogueNotConfigured() }
  }
})
