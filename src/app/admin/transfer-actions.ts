"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { loginPath } from "@/lib/admin/access"
import { readAdminAccess } from "@/lib/admin/session"
import { weekdays, type ScheduleInterval } from "@/lib/admin/schedule-input"
import { transferActionAllowed, validateDestinationSchedule, validateTransferRequest } from "@/lib/admin/transfer-input"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export type TransferActionState = {
  error?: string
  fieldErrors?: Record<string, string>
  saved?: boolean
}

export async function createProfessionalTransfer(
  _state: TransferActionState,
  formData: FormData,
): Promise<TransferActionState> {
  const access = await ownerAccess()
  if (!access.ok) return { error: access.error }
  const professionalId = text(formData, "professionalId")
  if (!isUuid(professionalId)) return { error: "Choose a professional." }
  const validated = validateTransferRequest({
    sourceBranchId: text(formData, "sourceBranchId"),
    destinationBranchId: text(formData, "destinationBranchId"),
    effectiveOn: text(formData, "effectiveOn"),
  })
  if (!validated.ok) return { fieldErrors: validated.fieldErrors }

  const supabase = await createServerSupabaseClient()
  const created = await supabase.rpc("admin_create_professional_transfer", {
    target_professional: professionalId,
    destination_branch: validated.value.destinationBranchId,
    effective_on: validated.value.effectiveOn,
  })
  if (created.error) return { error: friendlyError(created.error.message) }
  revalidatePath("/admin/professionals")
  return { saved: true }
}

export async function updateProfessionalTransfer(
  _state: TransferActionState,
  formData: FormData,
): Promise<TransferActionState> {
  return changeTransfer(formData, "admin_update_professional_transfer", {
    destination_branch: text(formData, "destinationBranchId"),
    effective_on: text(formData, "effectiveOn"),
  })
}

export async function submitProfessionalTransfer(
  _state: TransferActionState,
  formData: FormData,
): Promise<TransferActionState> {
  return changeTransfer(formData, "admin_submit_professional_transfer")
}

export async function approveProfessionalTransfer(
  _state: TransferActionState,
  formData: FormData,
): Promise<TransferActionState> {
  return changeTransfer(formData, "admin_approve_professional_transfer")
}

export async function activateProfessionalTransfer(
  _state: TransferActionState,
  formData: FormData,
): Promise<TransferActionState> {
  return changeTransfer(formData, "admin_activate_professional_transfer")
}

export async function cancelProfessionalTransfer(
  _state: TransferActionState,
  formData: FormData,
): Promise<TransferActionState> {
  const access = await ownerAccess()
  if (!access.ok) return { error: access.error }
  const transferId = text(formData, "transferId")
  const revision = revisionFrom(formData, "revision")
  if (!isUuid(transferId) || revision == null) {
    return { error: "This transfer has changed since you opened it. Reload the latest version before saving." }
  }
  const supabase = await createServerSupabaseClient()
  const cancelled = await supabase.rpc("admin_cancel_professional_transfer", {
    target_transfer: transferId,
    cancellation_reason: text(formData, "cancellationReason"),
    expected_revision: revision,
  })
  if (cancelled.error) return { error: friendlyError(cancelled.error.message) }
  revalidatePath("/admin/professionals")
  return { saved: true }
}

export async function saveTransferSchedule(
  _state: TransferActionState,
  formData: FormData,
): Promise<TransferActionState> {
  const access = await prepareAccess()
  if (!access.ok) return { error: access.error }
  const transferId = text(formData, "transferId")
  const revision = revisionFrom(formData, "scheduleRevision")
  if (!isUuid(transferId) || revision == null) {
    return { error: "This schedule has changed since you opened it. Reload the latest version before saving." }
  }
  const offDay = Number(text(formData, "offDay"))
  const status = text(formData, "status") === "complete" ? "complete" : "draft"
  const validated = validateDestinationSchedule({
    offDay: Number.isInteger(offDay) ? offDay : null,
    status,
    intervals: intervalsFrom(formData, Number.isInteger(offDay) ? offDay : null),
  })
  if (!validated.ok) return { fieldErrors: validated.fieldErrors }

  const supabase = await createServerSupabaseClient()
  const saved = await supabase.rpc("admin_save_transfer_schedule", {
    target_transfer: transferId,
    off_day: validated.value.offDay,
    schedule_status: validated.value.status,
    intervals: validated.value.intervals,
    expected_revision: revision,
  })
  if (saved.error) return { error: friendlyError(saved.error.message) }
  revalidatePath("/admin/professionals")
  return { saved: true }
}

async function changeTransfer(
  formData: FormData,
  rpc: "admin_update_professional_transfer" | "admin_submit_professional_transfer" | "admin_approve_professional_transfer" | "admin_activate_professional_transfer",
  extra?: { destination_branch: string; effective_on: string },
): Promise<TransferActionState> {
  const access = await ownerAccess()
  if (!access.ok) return { error: access.error }
  const transferId = text(formData, "transferId")
  const revision = revisionFrom(formData, "revision")
  if (!isUuid(transferId) || revision == null) {
    return { error: "This transfer has changed since you opened it. Reload the latest version before saving." }
  }
  if (extra) {
    const validated = validateTransferRequest({
      sourceBranchId: text(formData, "sourceBranchId"),
      destinationBranchId: extra.destination_branch,
      effectiveOn: extra.effective_on,
    })
    if (!validated.ok) return { fieldErrors: validated.fieldErrors }
  }
  const supabase = await createServerSupabaseClient()
  const saved = extra
    ? await supabase.rpc(rpc, {
        target_transfer: transferId,
        destination_branch: extra.destination_branch,
        effective_on: extra.effective_on,
        expected_revision: revision,
      })
    : await supabase.rpc(rpc, { target_transfer: transferId, expected_revision: revision })
  if (saved.error) return { error: friendlyError(saved.error.message) }
  revalidatePath("/admin/professionals")
  return { saved: true }
}

async function ownerAccess() {
  return actionAccess("owner")
}

async function prepareAccess() {
  return actionAccess("prepare")
}

async function actionAccess(action: "owner" | "prepare"): Promise<{ ok: true } | { ok: false; error: string }> {
  const access = await readAdminAccess(null)
  if (access.status === "signed_out") redirect(loginPath("/admin/professionals", access.sessionEnded))
  if (access.status !== "ready" || !transferActionAllowed(access.scope.role, action)) {
    return { ok: false, error: "You do not have permission to make that change." }
  }
  return { ok: true }
}

function intervalsFrom(formData: FormData, offDay: number | null): ScheduleInterval[] {
  const intervals: ScheduleInterval[] = []
  for (const weekday of weekdays) {
    if (weekday.id === offDay) continue
    const shiftStart = text(formData, `shift-${weekday.id}-start`)
    const shiftEnd = text(formData, `shift-${weekday.id}-end`)
    const breakStart = text(formData, `break-${weekday.id}-start`)
    const breakEnd = text(formData, `break-${weekday.id}-end`)
    if (shiftStart || shiftEnd) {
      intervals.push({ weekday: weekday.id, kind: "shift", starts: shiftStart, ends: shiftEnd })
    }
    if (breakStart || breakEnd) {
      intervals.push({ weekday: weekday.id, kind: "break", starts: breakStart, ends: breakEnd })
    }
  }
  return intervals
}

function friendlyError(message: string) {
  if (/schedule has changed/i.test(message)) {
    return "This schedule has changed since you opened it. Reload the latest version before saving."
  }
  if (/transfer has changed/i.test(message)) {
    return "This transfer has changed since you opened it. Reload the latest version before saving."
  }
  if (/before its effective date/i.test(message)) return "A transfer cannot be activated before its effective date."
  if (/complete the destination schedule/i.test(message)) return "Complete the destination schedule before approval."
  if (/approve the transfer/i.test(message)) return "Approve the transfer before activation."
  if (/already has an open transfer/i.test(message)) return "That professional already has an open transfer."
  if (/different studio/i.test(message)) return "Choose a different studio."
  if (/inactive professional/i.test(message)) return "An inactive professional cannot be transferred."
  if (/no longer assigned/i.test(message)) return "The professional is no longer assigned to the source studio."
  if (/not open for preparation/i.test(message)) return "The destination schedule is not open for preparation."
  if (/finished transfer/i.test(message)) return "A finished transfer cannot be changed."
  if (/cannot move to the requested status/i.test(message)) return "That transfer cannot move to the requested status."
  if (/booking conflicts can be checked/i.test(message)) return "Transfer activation is blocked until booking conflicts can be checked."
  if (/conflicts with an existing appointment/i.test(message)) return "The transfer conflicts with an existing appointment."
  if (/not authorized/i.test(message)) return "You do not have permission to make that change."
  if (/choose a regular off-day/i.test(message)) return "Choose one regular off-day."
  if (/every working day/i.test(message)) return "Enter working hours for every working day."
  if (/off-day has no working hours/i.test(message)) return "The regular off-day has no working hours."
  if (/valid working hours|inside a shift|overlap/i.test(message)) return "Enter valid working hours."
  return "The transfer could not be saved."
}

function text(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

function revisionFrom(formData: FormData, key: string) {
  const value = text(formData, key)
  if (!/^\d+$/.test(value)) return null
  const revision = Number(value)
  return Number.isSafeInteger(revision) ? revision : null
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
