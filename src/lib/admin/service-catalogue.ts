import "server-only"

import type { ServiceCategoryId, ServiceType, VerificationStatus } from "@/lib/services/types"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export type ManagedService = {
  id: string
  slug: string
  name: string
  description: string
  category: ServiceCategoryId
  serviceType: ServiceType
  imageUrl: string | null
  isListed: boolean
  verificationStatus: VerificationStatus
}

export type ManagedOffering = {
  branchId: string
  serviceId: string
  priceGhs: number | null
  durationMinutes: number | null
  bufferMinutes: number
  isActive: boolean
  isBookable: boolean
}

export type ManagedCatalogue =
  | { ok: true; services: ManagedService[]; offerings: ManagedOffering[] }
  | { ok: false; message: string }

const migrationMessage =
  "Service management is not available yet. The service catalogue migration has not been applied."

export async function readManagedCatalogue(): Promise<ManagedCatalogue> {
  try {
    const supabase = await createServerSupabaseClient()
    const [services, offerings] = await Promise.all([
      supabase.rpc("admin_list_services"),
      supabase.rpc("admin_list_offerings"),
    ])
    if (services.error || offerings.error) {
      return {
        ok: false,
        message: migrationMissing(services.error) || migrationMissing(offerings.error)
          ? migrationMessage
          : "The service catalogue could not be read.",
      }
    }
    const parsedServices = parseServices(services.data)
    const parsedOfferings = parseOfferings(offerings.data)
    if (!parsedServices || !parsedOfferings) {
      return { ok: false, message: "The service catalogue could not be read." }
    }
    return { ok: true, services: parsedServices, offerings: parsedOfferings }
  } catch {
    return { ok: false, message: "The service catalogue could not be read." }
  }
}

function migrationMissing(error: { code?: string; message?: string } | null) {
  if (!error) return false
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /could not find the function/i.test(error.message ?? "")
  )
}

function parseServices(value: unknown): ManagedService[] | null {
  if (!Array.isArray(value)) return null
  const services: ManagedService[] = []
  for (const item of value) {
    if (!isRecord(item)) return null
    const category = categoryOf(item.category)
    const serviceType = typeOf(item.service_type)
    const verificationStatus = verificationOf(item.verification_status)
    if (
      typeof item.id !== "string" ||
      typeof item.slug !== "string" ||
      typeof item.name !== "string" ||
      typeof item.description !== "string" ||
      !category ||
      !serviceType ||
      typeof item.is_listed !== "boolean" ||
      !verificationStatus ||
      !nullableString(item.image_url)
    ) {
      return null
    }
    services.push({
      id: item.id,
      slug: item.slug,
      name: item.name,
      description: item.description,
      category,
      serviceType,
      imageUrl: item.image_url,
      isListed: item.is_listed,
      verificationStatus,
    })
  }
  return services
}

function parseOfferings(value: unknown): ManagedOffering[] | null {
  if (!Array.isArray(value)) return null
  const offerings: ManagedOffering[] = []
  for (const item of value) {
    if (!isRecord(item)) return null
    if (
      typeof item.branch_id !== "string" ||
      typeof item.service_id !== "string" ||
      !nullableInteger(item.price_ghs) ||
      !nullableInteger(item.duration_minutes) ||
      typeof item.buffer_minutes !== "number" ||
      typeof item.is_active !== "boolean" ||
      typeof item.is_bookable !== "boolean"
    ) {
      return null
    }
    offerings.push({
      branchId: item.branch_id,
      serviceId: item.service_id,
      priceGhs: item.price_ghs,
      durationMinutes: item.duration_minutes,
      bufferMinutes: item.buffer_minutes,
      isActive: item.is_active,
      isBookable: item.is_bookable,
    })
  }
  return offerings
}

function categoryOf(value: unknown): ServiceCategoryId | null {
  if (
    value === "lashes" ||
    value === "nails" ||
    value === "brows" ||
    value === "spa" ||
    value === "salon" ||
    value === "makeup"
  ) {
    return value
  }
  return null
}

function typeOf(value: unknown): ServiceType | null {
  return value === "treatment" || value === "addon" ? value : null
}

function verificationOf(value: unknown): VerificationStatus | null {
  return value === "publicly_advertised" || value === "studio_confirmed" ? value : null
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string"
}

function nullableInteger(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isInteger(value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
