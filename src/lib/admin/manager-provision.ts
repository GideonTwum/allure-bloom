import { inviteSecretKind } from "@/lib/supabase/config"

export const provisionStatuses = [
  "auth_pending",
  "role_pending",
  "branch_pending",
  "ready",
  "failed",
  "revoked",
] as const

export type ProvisionStatus = (typeof provisionStatuses)[number]

export type ManagerRecord = {
  userId: string
  email: string
  isActive: boolean
  branchId: string | null
  branchName: string | null
}

export type ProvisionSnapshot = {
  id: string
  email: string
  branchId: string
  status: ProvisionStatus
  lastError: string | null
  authUserId: string | null
}

export type InviteResult = "invited" | "not_configured" | "failed"

export const provisionMessages = {
  notConfigured:
    "New invitations are not configured. An existing account can still be attached.",
  inviteFailed: "The invitation could not be sent. Try again when the account exists.",
  inviteMissing: "The invitation did not create an account. Try again.",
} as const

export type ProvisionDeps = {
  open: (email: string, branchId: string) => Promise<ProvisionSnapshot>
  lookup: (email: string) => Promise<string | null>
  invite: (email: string) => Promise<InviteResult>
  attach: (provisionId: string, userId: string) => Promise<void>
  finish: (provisionId: string) => Promise<ProvisionSnapshot>
  fail: (provisionId: string, reason: string) => Promise<ProvisionSnapshot>
}

const stopped = new Set<ProvisionStatus>(["ready", "revoked"])

export async function runProvisionAttempt(
  input: { email: string; branchId: string },
  deps: ProvisionDeps,
): Promise<ProvisionSnapshot> {
  const opened = await deps.open(input.email, input.branchId)
  if (stopped.has(opened.status)) return opened
  if (opened.authUserId) return deps.finish(opened.id)

  const existing = await deps.lookup(opened.email)
  if (existing) {
    await deps.attach(opened.id, existing)
    return deps.finish(opened.id)
  }

  const invited = await deps.invite(opened.email)
  if (invited === "not_configured") {
    return deps.fail(opened.id, provisionMessages.notConfigured)
  }
  if (invited === "failed") {
    return deps.fail(opened.id, provisionMessages.inviteFailed)
  }

  const created = await deps.lookup(opened.email)
  if (!created) return deps.fail(opened.id, provisionMessages.inviteMissing)
  await deps.attach(opened.id, created)
  return deps.finish(opened.id)
}

export function provisionStatusLabel(status: ProvisionStatus) {
  switch (status) {
    case "auth_pending":
      return "Waiting for an account"
    case "role_pending":
      return "Account found, access not finished"
    case "branch_pending":
      return "Manager role saved, studio not assigned"
    case "ready":
      return "Ready"
    case "failed":
      return "Failed"
    case "revoked":
      return "Revoked"
  }
}

export function secretKind(value: string | null | undefined) {
  return inviteSecretKind(value)
}
