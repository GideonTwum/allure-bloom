"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { canAdministerManagers, loginPath } from "@/lib/admin/access"
import { inviteManager } from "@/lib/admin/manager-auth"
import { runProvisionAttempt } from "@/lib/admin/manager-provision"
import { migrationMissing, readProvision } from "@/lib/admin/managers"
import { readAdminAccess } from "@/lib/admin/session"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export type ManagerActionState = {
  error?: string
  saved?: boolean
  status?: string
}

export async function provisionManager(formData: FormData): Promise<ManagerActionState> {
  const gate = await ownerGate()
  if (!gate.ok) return { error: gate.error }
  const email = text(formData, "email")
  const branchId = text(formData, "branchId")
  if (!isEmail(email)) return { error: "Enter a valid email address." }
  if (!gate.branches.some((branch) => branch.id === branchId)) return { error: "Choose Accra or Kumasi." }

  try {
    const supabase = await createServerSupabaseClient()
    const snapshot = await runProvisionAttempt({ email, branchId }, {
      open: async (targetEmail, targetBranch) => {
        const opened = await supabase.rpc("admin_open_manager_provision", {
          target_email: targetEmail,
          target_branch: targetBranch,
        })
        if (opened.error) throw opened.error
        return requiredProvision(opened.data)
      },
      lookup: async (targetEmail) => {
        const found = await supabase.rpc("admin_lookup_manager_user", { target_email: targetEmail })
        if (found.error) throw found.error
        return typeof found.data === "string" ? found.data : null
      },
      invite: inviteManager,
      attach: async (provisionId, userId) => {
        const attached = await supabase.rpc("admin_attach_manager_provision", {
          provision_id: provisionId,
          target_user: userId,
        })
        if (attached.error) throw attached.error
      },
      finish: async (provisionId) => {
        const finished = await supabase.rpc("admin_finish_manager_provision", {
          provision_id: provisionId,
        })
        if (finished.error) throw finished.error
        return requiredProvision(finished.data)
      },
      fail: async (provisionId, reason) => {
        const failed = await supabase.rpc("admin_fail_manager_provision", {
          provision_id: provisionId,
          reason,
        })
        if (failed.error) throw failed.error
        return requiredProvision(failed.data)
      },
    })
    revalidatePath("/admin/settings")
    if (snapshot.status === "failed") {
      return { error: snapshot.lastError ?? "The manager could not be saved.", status: snapshot.status }
    }
    return { saved: true, status: snapshot.status }
  } catch (error) {
    return { error: friendlyError(error) }
  }
}

export async function reassignManager(formData: FormData): Promise<ManagerActionState> {
  const gate = await ownerGate()
  if (!gate.ok) return { error: gate.error }
  const userId = text(formData, "userId")
  const branchId = text(formData, "branchId")
  if (!isUuid(userId)) return { error: "That manager could not be found." }
  if (!gate.branches.some((branch) => branch.id === branchId)) return { error: "Choose Accra or Kumasi." }
  return change("reassign_manager_branch", { target_user: userId, target_branch: branchId })
}

export async function deactivateManager(formData: FormData): Promise<ManagerActionState> {
  const gate = await ownerGate()
  if (!gate.ok) return { error: gate.error }
  const userId = text(formData, "userId")
  if (!isUuid(userId)) return { error: "That manager could not be found." }
  return change("admin_deactivate_manager", { target_user: userId })
}

export async function reactivateManager(formData: FormData): Promise<ManagerActionState> {
  const gate = await ownerGate()
  if (!gate.ok) return { error: gate.error }
  const userId = text(formData, "userId")
  const branchId = text(formData, "branchId")
  if (!isUuid(userId)) return { error: "That manager could not be found." }
  if (!gate.branches.some((branch) => branch.id === branchId)) return { error: "Choose Accra or Kumasi." }
  return change("admin_reactivate_manager", { target_user: userId, target_branch: branchId })
}

async function change(fn: string, args: Record<string, string>) {
  try {
    const supabase = await createServerSupabaseClient()
    const result = await supabase.rpc(fn, args)
    if (result.error) return { error: friendlyError(result.error) }
    revalidatePath("/admin/settings")
    return { saved: true }
  } catch (error) {
    return { error: friendlyError(error) }
  }
}

async function ownerGate(): Promise<{ ok: true; branches: { id: string }[] } | { ok: false; error: string }> {
  const access = await readAdminAccess(null)
  if (access.status === "signed_out") redirect(loginPath("/admin/settings", access.sessionEnded))
  if (access.status !== "ready" || !canAdministerManagers(access.scope.role)) {
    return { ok: false, error: "You do not have permission to manage branch managers." }
  }
  return { ok: true, branches: access.scope.branches.map((branch) => ({ id: branch.id })) }
}

async function requiredProvision(id: unknown) {
  if (typeof id !== "string") throw new Error("provision could not be read")
  const provision = await readProvision(id)
  if (!provision) throw new Error("provision could not be read")
  return provision
}

function text(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

function isEmail(value: string) {
  return value.length >= 3 && value.length <= 254 && /^[^\s@]+@[^\s@]+$/.test(value)
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function friendlyError(error: unknown) {
  const record = error as { code?: string; message?: string }
  const message = record?.message ?? ""
  if (migrationMissing(record)) {
    return "Manager administration is not available yet. The manager migration has not been applied."
  }
  if (/not authorized/i.test(message)) return "You do not have permission to manage branch managers."
  if (/valid email/i.test(message)) return "Enter a valid email address."
  if (/unknown studio/i.test(message)) return "Choose Accra or Kumasi."
  if (/already has an active studio/i.test(message)) {
    return "That manager already has an active studio. Reassign them explicitly."
  }
  if (/cannot be granted manager access/i.test(message)) return "An owner cannot become a branch manager."
  if (/cannot change their own role/i.test(message)) return "An owner cannot change their own access here."
  if (/email does not match/i.test(message)) return "That account does not use this email."
  if (/not attached yet/i.test(message)) return "The account is not attached yet. Try again."
  if (/provision is revoked|manager access is revoked/i.test(message)) {
    return "This manager was deactivated. Use Reactivate to restore access."
  }
  if (/does not exist/i.test(message)) return "That manager could not be found."
  if (/not active/i.test(message)) return "That manager is not active."
  if (/already active/i.test(message)) return "That assignment is already active."
  return "The manager change could not be saved."
}
