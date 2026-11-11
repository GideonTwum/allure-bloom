import type { BranchServiceConfiguration, Studio } from "@/lib/supabase/rows"
import type { ServiceRecord } from "@/lib/services/types"

export type CatalogueSnapshot = {
  services: ServiceRecord[]
  offerings: BranchServiceConfiguration[]
  studios: Studio[]
}

export type CatalogueFailureReason = "not_configured" | "unavailable"

export type CatalogueFailure = {
  ok: false
  reason: CatalogueFailureReason
  message: string
}

export type ReadResult<T> = { ok: true; data: T } | CatalogueFailure

export type CatalogueRead = ReadResult<CatalogueSnapshot>

export const catalogueMessages = {
  notConfigured:
    "Supabase is not configured for this site, so the published catalogue and studios cannot be loaded.",
  badUrl:
    "The public Supabase URL must be the project HTTPS address. The catalogue was not loaded from a saved copy.",
  unavailable:
    "The catalogue could not be read from the database. This page is not using a saved copy.",
  missingTables:
    "The catalogue tables are not available yet, so no treatments or studios are shown.",
  emptyServices: "No published treatments were returned.",
  emptyStudios: "No studios were returned.",
} as const
