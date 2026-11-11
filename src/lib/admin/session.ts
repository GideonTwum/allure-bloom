import "server-only"

import { connection } from "next/server"
import { cache } from "react"

import {
  isBranchKey,
  resolveAdminScope,
  type AdminBranch,
  type AdminContextRow,
  type AdminScope,
} from "@/lib/admin/access"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export type AdminStudio = AdminBranch & {
  area: string
  phoneDisplay: string | null
  phoneE164: string | null
}

export type AdminAccess =
  | { status: "signed_out"; sessionEnded: boolean }
  | { status: "denied"; email: string | null }
  | { status: "unavailable" }
  | {
      status: "ready"
      email: string | null
      scope: AdminScope
      studios: AdminStudio[]
    }

const getClient = cache(async () => {
  try {
    return await createServerSupabaseClient()
  } catch {
    return null
  }
})

const getVerifiedUser = cache(async () => {
  const supabase = await getClient()
  if (!supabase) return { status: "unavailable" as const }
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    return {
      status: "signed_out" as const,
      sessionEnded: sessionEnded(error),
    }
  }
  return {
    status: "user" as const,
    email: typeof data.user.email === "string" ? data.user.email : null,
  }
})

const getContextRows = cache(async () => {
  const supabase = await getClient()
  if (!supabase) return null
  const { data, error } = await supabase.rpc("admin_context")
  if (error) return null
  return parseContextRows(data)
})

const getStudios = cache(async () => {
  const supabase = await getClient()
  if (!supabase) return null
  const { data, error } = await supabase
    .from("branches")
    .select("id, name, area, phone_display, phone_e164")
  if (error) return null
  return parseStudios(data)
})

const confirmBranch = cache(async (branchId: string) => {
  if (!isBranchKey(branchId) || branchId === "all") return false
  const supabase = await getClient()
  if (!supabase) return false
  const { data, error } = await supabase.rpc("manage_branch", {
    target_branch: branchId,
  })
  return !error && data === branchId
})

export const readAdminAccess = cache(async (requested: string | null): Promise<AdminAccess> => {
  // Supabase checks access-token expiry with Date.now() after the session
  // cookie is read. Partial prefetching still treats that clock read as
  // prerender IO until the request is connected. Authorization stays here.
  await connection()
  const user = await getVerifiedUser()
  if (user.status === "unavailable") return { status: "unavailable" }
  if (user.status === "signed_out") return user

  const rows = await getContextRows()
  const studios = await getStudios()
  if (!rows || !studios) return { status: "unavailable" }

  const resolved = resolveAdminScope(
    rows,
    studios.map((studio) => ({ id: studio.id, name: studio.name })),
    requested,
  )
  if (!resolved.ok) return { status: "denied", email: user.email }

  const confirmed: AdminBranch[] = []
  for (const branch of resolved.scope.branches) {
    if (await confirmBranch(branch.id)) confirmed.push(branch)
  }

  let selected = resolved.scope.selectedBranchId
  let unauthorized = resolved.scope.unauthorizedRequest
  if (
    selected !== "all" &&
    typeof selected === "string" &&
    !confirmed.some((branch) => branch.id === selected)
  ) {
    unauthorized = true
    selected = null
  }

  if (
    unauthorized &&
    requested &&
    requested !== "all" &&
    (await confirmBranch(requested))
  ) {
    const studio = studios.find((item) => item.id === requested)
    if (!confirmed.some((branch) => branch.id === requested)) {
      confirmed.push({ id: requested, name: studio?.name ?? requested })
    }
    selected = requested
    unauthorized = false
  }

  if (confirmed.length === 0) return { status: "denied", email: user.email }

  const ownerAll = selected === "all" && resolved.scope.role === "owner"
  const selectedBranchId = ownerAll ? "all" : selected === "all" ? null : selected
  const confirmedIds = new Set(confirmed.map((branch) => branch.id))
  return {
    status: "ready",
    email: user.email,
    studios: studios.filter((studio) => confirmedIds.has(studio.id)),
    scope: {
      role: resolved.scope.role,
      branches: confirmed.sort(
        (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
      ),
      selectedBranchId,
      unauthorizedRequest: unauthorized || selectedBranchId === null,
    },
  }
})

function sessionEnded(error: { message?: string; code?: string } | null) {
  if (!error) return false
  if (error.code === "session_not_found") return false
  return !/auth session missing/i.test(error.message ?? "")
}

function parseContextRows(value: unknown): AdminContextRow[] | null {
  if (!Array.isArray(value)) return null
  const rows: AdminContextRow[] = []
  for (const item of value) {
    if (!item || typeof item !== "object") return null
    const record = item as { role?: unknown; branch_id?: unknown }
    if (typeof record.role !== "string" || typeof record.branch_id !== "string") return null
    rows.push({ role: record.role, branchId: record.branch_id })
  }
  return rows
}

function parseStudios(value: unknown): AdminStudio[] | null {
  if (!Array.isArray(value)) return null
  const studios: AdminStudio[] = []
  for (const item of value) {
    if (!item || typeof item !== "object") return null
    const record = item as {
      id?: unknown
      name?: unknown
      area?: unknown
      phone_display?: unknown
      phone_e164?: unknown
    }
    if (typeof record.id !== "string" || typeof record.name !== "string") return null
    const name = record.name.trim()
    const area = typeof record.area === "string" ? record.area.trim() : ""
    if (!name || !area) return null
    studios.push({
      id: record.id,
      name,
      area,
      phoneDisplay: optionalText(record.phone_display),
      phoneE164: optionalText(record.phone_e164),
    })
  }
  return studios
}

function optionalText(value: unknown) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}
