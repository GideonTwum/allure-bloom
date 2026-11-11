import type { AdminRole } from "@/lib/admin/access"
import { parseCivilDate } from "@/lib/admin/ghana-time"
import {
  validateWeeklySchedule,
  weekdayName,
  weekdays,
  type ScheduleInterval,
  type Weekday,
  type WeeklyScheduleInput,
} from "@/lib/admin/schedule-input"

export { weekdays }

export const transferStatuses = [
  "draft",
  "pending_preparation",
  "ready",
  "completed",
  "cancelled",
] as const

export type TransferStatus = (typeof transferStatuses)[number]

export type ProfessionalTransfer = {
  id: string
  professionalId: string
  sourceBranchId: string
  destinationBranchId: string
  effectiveOn: string
  status: TransferStatus
  revision: number
  cancellationReason: string | null
  scheduleOffWeekday: Weekday | null
  scheduleStatus: "draft" | "complete" | null
  scheduleRevision: number
  intervals: ScheduleInterval[]
  archivedOffWeekday: Weekday | null
}

export function isTransferStatus(value: string): value is TransferStatus {
  return transferStatuses.some((status) => status === value)
}

export function isOpenTransfer(status: TransferStatus) {
  return status === "draft" || status === "pending_preparation" || status === "ready"
}

export function transferStatusLabel(status: TransferStatus) {
  if (status === "draft") return "Draft"
  if (status === "pending_preparation") return "Pending preparation"
  if (status === "ready") return "Ready"
  if (status === "completed") return "Completed"
  return "Cancelled"
}

export function activationAvailable(status: TransferStatus, effectiveOn: string, accraDate: string) {
  return status === "ready" && /^\d{4}-\d{2}-\d{2}$/.test(accraDate) && effectiveOn <= accraDate
}

export function destinationScheduleWarning(transfer: Pick<ProfessionalTransfer, "status" | "scheduleStatus">) {
  if (!isOpenTransfer(transfer.status)) return null
  if (transfer.scheduleStatus == null) {
    return "The destination schedule has not been started. Nothing is copied from the current studio, and a draft provides no availability."
  }
  if (transfer.scheduleStatus === "draft") {
    return "The destination schedule is still a draft. Current studio hours stay in place until activation."
  }
  if (transfer.status === "pending_preparation") {
    return "The destination schedule is complete. Approval does not move the professional."
  }
  return "This transfer is ready. Activation is a separate step and does not happen when the page is opened."
}

export function transferActionAllowed(role: AdminRole, action: "owner" | "prepare") {
  if (role === "owner") return true
  return action === "prepare" && role === "manager"
}

export function canPrepareDestination(input: {
  owner: boolean
  managedStudioIds: string[]
  destinationBranchId: string
  status: TransferStatus
}) {
  if (input.status !== "pending_preparation" && input.status !== "ready") return false
  if (input.owner) return true
  return input.managedStudioIds.includes(input.destinationBranchId)
}

export function validateTransferRequest(input: { sourceBranchId: string; destinationBranchId: string; effectiveOn: string }) {
  const fieldErrors: Record<string, string> = {}
  if (!input.destinationBranchId || input.destinationBranchId === input.sourceBranchId) {
    fieldErrors.destination = "Choose a different studio."
  }
  if (!parseCivilDate(input.effectiveOn)) fieldErrors.effectiveOn = "Choose an effective date."
  if (Object.keys(fieldErrors).length > 0) return { ok: false as const, fieldErrors }
  return {
    ok: true as const,
    value: {
      destinationBranchId: input.destinationBranchId,
      effectiveOn: input.effectiveOn,
    },
  }
}

export function validateDestinationSchedule(input: WeeklyScheduleInput) {
  return validateWeeklySchedule(input)
}

export function archivedOffDayLabel(day: Weekday | null) {
  return day == null ? "The previous studio had no weekly schedule on file." : `Archived source off-day: ${weekdayName(day)}.`
}
