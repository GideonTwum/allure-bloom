import "server-only"

import {
  provisionStatuses,
  type ManagerRecord,
  type ProvisionSnapshot,
  type ProvisionStatus,
} from "@/lib/admin/manager-provision"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export type ManagerDesk =
  | {
      ok: true
      managers: ManagerRecord[]
      provisions: ProvisionSnapshot[]
    }
  | { ok: false; message: string }

const migrationMessage =
  "Manager administration is not available yet. The manager migration has not been applied."

export async function readManagerDesk(): Promise<ManagerDesk> {
  try {
    const supabase = await createServerSupabaseClient()
    const [managers, provisions] = await Promise.all([
      supabase.rpc("admin_list_managers"),
      supabase.rpc("admin_list_manager_provisions"),
    ])
    if (managers.error || provisions.error) {
      const missing = migrationMissing(managers.error) || migrationMissing(provisions.error)
      return { ok: false, message: missing ? migrationMessage : "Branch managers could not be read." }
    }
    const parsedManagers = parseManagers(managers.data)
    const parsedProvisions = parseProvisions(provisions.data)
    if (!parsedManagers || !parsedProvisions) {
      return { ok: false, message: "Branch managers could not be read." }
    }
    return { ok: true, managers: parsedManagers, provisions: parsedProvisions }
  } catch {
    return { ok: false, message: "Branch managers could not be read." }
  }
}

export async function readProvision(id: string): Promise<ProvisionSnapshot | null> {
  const supabase = await createServerSupabaseClient()
  const listed = await supabase.rpc("admin_list_manager_provisions")
  if (listed.error) throw listed.error
  const provisions = parseProvisions(listed.data)
  if (!provisions) throw new Error("provision could not be read")
  return provisions.find((provision) => provision.id === id) ?? null
}

export function migrationMissing(error: { code?: string; message?: string } | null) {
  if (!error) return false
  const message = error.message ?? ""
  return error.code === "PGRST202" || error.code === "42883" || /could not find the function/i.test(message)
}

function parseManagers(value: unknown): ManagerRecord[] | null {
  if (!Array.isArray(value)) return null
  const managers: ManagerRecord[] = []
  for (const item of value) {
    if (!isRecord(item)) return null
    if (typeof item.user_id !== "string" || typeof item.email !== "string") return null
    if (typeof item.is_active !== "boolean") return null
    if (item.branch_id !== null && typeof item.branch_id !== "string") return null
    if (item.branch_name !== null && typeof item.branch_name !== "string") return null
    managers.push({
      userId: item.user_id,
      email: item.email,
      isActive: item.is_active,
      branchId: item.branch_id,
      branchName: item.branch_name,
    })
  }
  return managers
}

function parseProvisions(value: unknown): ProvisionSnapshot[] | null {
  if (!Array.isArray(value)) return null
  const provisions: ProvisionSnapshot[] = []
  for (const item of value) {
    if (!isRecord(item)) return null
    if (typeof item.id !== "string" || typeof item.email !== "string") return null
    if (typeof item.branch_id !== "string" || !isStatus(item.status)) return null
    if (item.last_error !== null && typeof item.last_error !== "string") return null
    if (item.auth_user_id !== null && typeof item.auth_user_id !== "string") return null
    provisions.push({
      id: item.id,
      email: item.email,
      branchId: item.branch_id,
      status: item.status,
      lastError: item.last_error,
      authUserId: item.auth_user_id,
    })
  }
  return provisions
}

function isStatus(value: unknown): value is ProvisionStatus {
  return typeof value === "string" && provisionStatuses.some((status) => status === value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object"
}
