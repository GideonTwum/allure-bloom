import "server-only"

import type { ScheduleInterval, StoredException, WeeklySchedule, Weekday } from "@/lib/admin/schedule-input"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export type ScheduleDesk = { ready: true; schedules: WeeklySchedule[] } | { ready: false }

export async function readWeeklySchedules(branchId: string | null): Promise<ScheduleDesk> {
  try {
    const supabase = await createServerSupabaseClient()
    const listed = await supabase.rpc("admin_list_weekly_schedules", { target_branch: branchId })
    if (listed.error) return { ready: false }
    const schedules = parseSchedules(listed.data)
    return schedules ? { ready: true, schedules } : { ready: false }
  } catch {
    return { ready: false }
  }
}

function parseSchedules(value: unknown): WeeklySchedule[] | null {
  if (!Array.isArray(value)) return null
  const schedules: WeeklySchedule[] = []
  for (const row of value) {
    if (!row || typeof row !== "object") return null
    const record = row as Record<string, unknown>
    const offWeekday = record.off_weekday
    const status = record.status
    if (typeof record.professional_id !== "string") return null
    if (typeof offWeekday !== "number" || offWeekday < 1 || offWeekday > 7) return null
    if (status !== "draft" && status !== "complete") return null
    const revision = parseRevision(record.revision)
    if (revision == null) return null
    const intervals = parseIntervals(record.intervals)
    const exceptions = parseExceptions(record.exceptions)
    if (!intervals || !exceptions) return null
    schedules.push({
      professionalId: record.professional_id,
      offWeekday: offWeekday as Weekday,
      status,
      revision,
      intervals,
      exceptions,
    })
  }
  return schedules
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
      starts: record.starts,
      ends: record.ends,
    })
  }
  return intervals
}

function parseExceptions(value: unknown): StoredException[] | null {
  if (!Array.isArray(value)) return null
  const exceptions: StoredException[] = []
  for (const row of value) {
    if (!row || typeof row !== "object") return null
    const record = row as Record<string, unknown>
    if (typeof record.id !== "string" || typeof record.kind !== "string") return null
    if (!isExceptionKind(record.kind)) return null
    exceptions.push({
      id: record.id,
      kind: record.kind,
      date: textOrNull(record.date),
      originalOffDate: textOrNull(record.originalOffDate),
      replacementOffDate: textOrNull(record.replacementOffDate),
      starts: textOrNull(record.starts),
      ends: textOrNull(record.ends),
    })
  }
  return exceptions
}

function isExceptionKind(value: string): value is StoredException["kind"] {
  return (
    value === "additional_leave" ||
    value === "off_day_swap" ||
    value === "special_hours" ||
    value === "partial_absence" ||
    value === "off_day_work"
  )
}

function textOrNull(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null
}

function parseRevision(value: unknown) {
  const revision = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : null
  if (revision == null || !Number.isSafeInteger(revision) || revision < 0) return null
  return revision
}
