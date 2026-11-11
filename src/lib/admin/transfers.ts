import "server-only"

import type { ScheduleInterval, Weekday } from "@/lib/admin/schedule-input"
import { isTransferStatus, type ProfessionalTransfer, type TransferStatus } from "@/lib/admin/transfer-input"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export type TransferDesk = { ready: true; transfers: ProfessionalTransfer[] } | { ready: false }

export async function readProfessionalTransfers(branchId: string | null): Promise<TransferDesk> {
  try {
    const supabase = await createServerSupabaseClient()
    const listed = await supabase.rpc("admin_list_professional_transfers", { target_branch: branchId })
    if (listed.error) return { ready: false }
    const transfers = parseTransfers(listed.data)
    return transfers ? { ready: true, transfers } : { ready: false }
  } catch {
    return { ready: false }
  }
}

function parseTransfers(value: unknown): ProfessionalTransfer[] | null {
  if (!Array.isArray(value)) return null
  const transfers: ProfessionalTransfer[] = []
  for (const row of value) {
    if (!row || typeof row !== "object") return null
    const record = row as Record<string, unknown>
    if (
      typeof record.id !== "string" ||
      typeof record.professional_id !== "string" ||
      typeof record.source_branch_id !== "string" ||
      typeof record.destination_branch_id !== "string" ||
      typeof record.effective_on !== "string" ||
      typeof record.status !== "string" ||
      !isTransferStatus(record.status)
    ) {
      return null
    }
    const revision = parseRevision(record.revision)
    const intervals = parseIntervals(record.intervals)
    const schedule = parseSchedule(record)
    if (revision == null || !intervals || !schedule) return null
    transfers.push({
      id: record.id,
      professionalId: record.professional_id,
      sourceBranchId: record.source_branch_id,
      destinationBranchId: record.destination_branch_id,
      effectiveOn: record.effective_on.slice(0, 10),
      status: record.status as TransferStatus,
      revision,
      cancellationReason: typeof record.cancellation_reason === "string" ? record.cancellation_reason : null,
      scheduleOffWeekday: schedule.offWeekday,
      scheduleStatus: schedule.status,
      scheduleRevision: schedule.revision,
      intervals,
      archivedOffWeekday: archiveOffDay(record.archived_schedule),
    })
  }
  return transfers
}

function parseSchedule(record: Record<string, unknown>): {
  offWeekday: Weekday | null
  status: "draft" | "complete" | null
  revision: number
} | null {
  if (record.schedule_off_weekday == null && record.schedule_status == null) {
    return { offWeekday: null, status: null, revision: 0 }
  }
  const offWeekday = record.schedule_off_weekday
  const status = record.schedule_status
  const revision = parseRevision(record.schedule_revision)
  if (typeof offWeekday !== "number" || offWeekday < 1 || offWeekday > 7) return null
  if (status !== "draft" && status !== "complete") return null
  if (revision == null) return null
  return { offWeekday: offWeekday as Weekday, status, revision }
}

function parseIntervals(value: unknown): ScheduleInterval[] | null {
  if (!Array.isArray(value)) return null
  const intervals: ScheduleInterval[] = []
  for (const row of value) {
    if (!row || typeof row !== "object") return null
    const record = row as Record<string, unknown>
    if (typeof record.weekday !== "number" || record.weekday < 1 || record.weekday > 7) return null
    if (record.kind !== "shift" && record.kind !== "break") return null
    if (typeof record.starts !== "string" || typeof record.ends !== "string") return null
    intervals.push({
      weekday: record.weekday as Weekday,
      kind: record.kind,
      starts: record.starts.slice(0, 5),
      ends: record.ends.slice(0, 5),
    })
  }
  return intervals
}

function archiveOffDay(value: unknown): Weekday | null {
  if (!value || typeof value !== "object") return null
  const week = (value as { week?: { off_weekday?: unknown } }).week
  const day = week?.off_weekday
  if (typeof day !== "number" || day < 1 || day > 7) return null
  return day as Weekday
}

function parseRevision(value: unknown) {
  const revision = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : null
  if (revision == null || !Number.isSafeInteger(revision) || revision < 0) return null
  return revision
}
