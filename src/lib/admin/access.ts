export const adminRoles = ["owner", "manager"] as const

export type AdminRole = (typeof adminRoles)[number]

export type AdminBranch = {
  id: string
  name: string
}

export type AdminScope = {
  role: AdminRole
  branches: AdminBranch[]
  selectedBranchId: "all" | string | null
  unauthorizedRequest: boolean
}

export type AdminContextRow = {
  role: string
  branchId: string
}

export type ScopeResolution =
  | { ok: true; scope: AdminScope }
  | { ok: false; reason: "none" }

const fallbackPath = "/admin"

export function adminRoleLabel(role: AdminRole) {
  return role === "owner" ? "Owner" : "Studio manager"
}

export function canAdministerManagers(role: AdminRole) {
  return role === "owner"
}

export function adminRoleDescription(role: AdminRole) {
  return role === "owner"
    ? "Every studio returned for this account can be opened."
    : "Only studios assigned to this account can be opened."
}

export function isBranchKey(value: string) {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(value)
}

export function requestedBranchParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== "string") return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.length > 128) return " "
  return trimmed
}

/**
 * Keeps a post-login path inside the studio desk. External, protocol-relative,
 * and login paths fall back to the overview.
 */
export function safeAdminReturnPath(value: unknown) {
  if (typeof value !== "string") return fallbackPath
  const trimmed = value.trim()
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\")) {
    return fallbackPath
  }
  if (trimmed.includes("://") || /%5c|%00|%0a|%0d/i.test(trimmed)) return fallbackPath

  let url: URL
  try {
    url = new URL(trimmed, "https://allure.local")
  } catch {
    return fallbackPath
  }

  if (url.origin !== "https://allure.local" || url.username || url.password) {
    return fallbackPath
  }

  const path = url.pathname
  if (path !== "/admin" && !path.startsWith("/admin/")) return fallbackPath
  if (path === "/admin/login" || path.startsWith("/admin/login/")) return fallbackPath
  if (path.includes("//")) return fallbackPath
  return `${path}${url.search}`
}

export function loginPath(returnPath: string, sessionEnded: boolean) {
  const params = new URLSearchParams()
  params.set("next", safeAdminReturnPath(returnPath))
  if (sessionEnded) params.set("reason", "session")
  return `/admin/login?${params.toString()}`
}

export function visibleBranchIds(scope: AdminScope) {
  if (scope.unauthorizedRequest || scope.selectedBranchId === null) return []
  if (scope.selectedBranchId === "all") return scope.branches.map((branch) => branch.id)
  return [scope.selectedBranchId]
}

export function resolveAdminScope(
  rows: AdminContextRow[],
  studios: AdminBranch[],
  requested: string | null,
): ScopeResolution {
  const accepted = rows.filter(
    (row): row is { role: AdminRole; branchId: string } =>
      isAdminRole(row.role) && isBranchKey(row.branchId),
  )
  const roles = new Set(accepted.map((row) => row.role))
  if (accepted.length === 0 || roles.size !== 1) return { ok: false, reason: "none" }

  const role = accepted[0]?.role
  if (!role) return { ok: false, reason: "none" }

  const allowedIds = new Set(accepted.map((row) => row.branchId))
  const named = new Map(studios.map((studio) => [studio.id, studio.name]))
  const branches = [...allowedIds]
    .map((id) => ({ id, name: named.get(id)?.trim() || id }))
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))

  if (branches.length === 0) return { ok: false, reason: "none" }

  if (role === "owner") {
    if (requested === null || requested === "all") {
      return {
        ok: true,
        scope: { role, branches, selectedBranchId: "all", unauthorizedRequest: false },
      }
    }
    if (allowedIds.has(requested)) {
      return {
        ok: true,
        scope: { role, branches, selectedBranchId: requested, unauthorizedRequest: false },
      }
    }
    return {
      ok: true,
      scope: { role, branches, selectedBranchId: null, unauthorizedRequest: true },
    }
  }

  if (requested === null) {
    const first = branches[0]
    if (!first) return { ok: false, reason: "none" }
    return {
      ok: true,
      scope: { role, branches, selectedBranchId: first.id, unauthorizedRequest: false },
    }
  }

  if (requested !== "all" && allowedIds.has(requested)) {
    return {
      ok: true,
      scope: { role, branches, selectedBranchId: requested, unauthorizedRequest: false },
    }
  }

  return {
    ok: true,
    scope: { role, branches, selectedBranchId: null, unauthorizedRequest: true },
  }
}

function isAdminRole(value: string): value is AdminRole {
  return value === "owner" || value === "manager"
}
