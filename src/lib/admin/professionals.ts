import "server-only"

import { createServerSupabaseClient } from "@/lib/supabase/server"

import type { StudioProfessional } from "@/lib/admin/professional-input"

export type ProfessionalDeskData =
  | {
      ok: true
      professionals: StudioProfessional[]
      services: { id: string; name: string }[]
      qualificationsReady: boolean
    }
  | { ok: false; message: string }

const migrationMessage =
  "Professional management is not available yet. The professional migration has not been applied."

export async function readProfessionalDesk(branchId: string | null): Promise<ProfessionalDeskData> {
  try {
    const supabase = await createServerSupabaseClient()
    const [professionals, services] = await Promise.all([
      supabase.rpc("admin_list_professionals", { target_branch: branchId }),
      supabase.rpc("admin_list_services"),
    ])
    if (professionals.error) {
      return {
        ok: false,
        message: migrationMissing(professionals.error) ? migrationMessage : "Professionals could not be read.",
      }
    }
    const parsed = parseProfessionals(professionals.data)
    if (!parsed) return { ok: false, message: "Professionals could not be read." }
    const catalogue = services.error ? null : parseServiceOptions(services.data)
    return {
      ok: true,
      professionals: parsed,
      services: catalogue ?? [],
      qualificationsReady: catalogue !== null,
    }
  } catch {
    return { ok: false, message: "Professionals could not be read." }
  }
}

function migrationMissing(error: { code?: string; message?: string }) {
  return (
    error.code === "PGRST202"
    || error.code === "42883"
    || /could not find the function/i.test(error.message ?? "")
  )
}

function parseProfessionals(value: unknown): StudioProfessional[] | null {
  if (!Array.isArray(value)) return null
  const people: StudioProfessional[] = []
  for (const item of value) {
    if (!isRecord(item)) return null
    const serviceIds = stringList(item.service_ids)
    if (
      typeof item.id !== "string"
      || typeof item.full_name !== "string"
      || !optionalText(item.display_name)
      || !optionalText(item.biography)
      || !optionalText(item.image_url)
      || typeof item.is_active !== "boolean"
      || typeof item.is_listed !== "boolean"
      || typeof item.branch_id !== "string"
      || typeof item.branch_name !== "string"
      || !serviceIds
    ) {
      return null
    }
    people.push({
      id: item.id,
      fullName: item.full_name,
      displayName: item.display_name,
      biography: item.biography,
      imageUrl: item.image_url,
      isActive: item.is_active,
      isListed: item.is_listed,
      branchId: item.branch_id,
      branchName: item.branch_name,
      serviceIds,
    })
  }
  return people
}

function parseServiceOptions(value: unknown) {
  if (!Array.isArray(value)) return null
  const services: { id: string; name: string }[] = []
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string") return null
    services.push({ id: item.id, name: item.name })
  }
  return services.sort((left, right) => left.name.localeCompare(right.name))
}

function optionalText(value: unknown): value is string | null {
  return value === null || typeof value === "string"
}

function stringList(value: unknown) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return null
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
