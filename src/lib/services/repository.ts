import "server-only"

import { cache } from "react"

import { listStudios } from "@/lib/branches/repository"
import type { CatalogueRead } from "@/lib/catalogue/types"
import { sortListedServices, withOfferings } from "@/lib/services/bookable"
import { catalogueFailure, publicReadClient } from "@/lib/supabase/public-read"
import {
  branchServiceColumns,
  parseBranchServiceRows,
  parseServiceRows,
  serviceColumns,
  toBranchService,
  toCatalogueService,
} from "@/lib/supabase/rows"

const serviceSelect = [
  serviceColumns.id,
  serviceColumns.slug,
  serviceColumns.name,
  serviceColumns.description,
  serviceColumns.category,
  serviceColumns.serviceType,
  serviceColumns.imageUrl,
  serviceColumns.isListed,
  serviceColumns.verificationStatus,
  serviceColumns.sourceUrl,
  serviceColumns.lastVerifiedAt,
].join(", ")

const offeringSelect = [
  branchServiceColumns.branchId,
  branchServiceColumns.serviceId,
  branchServiceColumns.priceGhs,
  branchServiceColumns.durationMinutes,
  branchServiceColumns.bufferMinutes,
  branchServiceColumns.isActive,
  branchServiceColumns.isBookable,
].join(", ")

const listListedServices = cache(async () => {
  const client = await publicReadClient()
  if (!client.ok) return client.read

  const { data, error } = await client.supabase
    .from("services")
    .select(serviceSelect)
    .eq(serviceColumns.isListed, true)

  if (error) return catalogueFailure(error.code)
  const rows = parseServiceRows(data)
  if (!rows) return catalogueFailure(null)
  return { ok: true as const, data: rows.filter((row) => row.is_listed) }
})

const listBranchOfferings = cache(async () => {
  const client = await publicReadClient()
  if (!client.ok) return client.read

  const { data, error } = await client.supabase
    .from("branch_services")
    .select(offeringSelect)
    .eq(branchServiceColumns.isActive, true)

  if (error) return catalogueFailure(error.code)
  const rows = parseBranchServiceRows(data)
  if (!rows) return catalogueFailure(null)

  const offerings = []
  for (const row of rows) {
    if (!row.is_active) continue
    const offering = toBranchService(row)
    if (!offering) continue
    offerings.push(offering)
  }
  return { ok: true as const, data: offerings }
})

/**
 * Reads public.services, public.branches, and public.branch_services.
 * A failed or unconfigured read never falls back to a saved catalogue.
 */
export const readStudioCatalogue = cache(async (): Promise<CatalogueRead> => {
  const [services, offerings, studios] = await Promise.all([
    listListedServices(),
    listBranchOfferings(),
    listStudios(),
  ])
  if (!services.ok) return services
  if (!offerings.ok) return offerings
  if (!studios.ok) return studios

  try {
    return {
      ok: true,
      data: {
        offerings: offerings.data,
        studios: studios.data,
        services: sortListedServices(
          services.data.map((row) =>
            withOfferings(toCatalogueService(row), offerings.data),
          ),
        ),
      },
    }
  } catch {
    return catalogueFailure(null)
  }
})

export const serviceRepository = {
  readCatalogue: readStudioCatalogue,
}
