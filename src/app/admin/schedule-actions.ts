"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { loginPath } from "@/lib/admin/access"
import { readAdminAccess } from "@/lib/admin/session"
import {
  validateScheduleException,
  validateWeeklySchedule,
  weekdays,
  type ScheduleInterval,
  type StoredException,
  type Weekday,
} from "@/lib/admin/schedule-input"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export type ScheduleActionState = {
  error?: string
  fieldErrors?: Record<string, string>
  saved?: boolean
}

export async function saveWeeklySchedule(
  _state: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const access = await editorAccess()
  if (!access.ok) return { error: access.error }

  const professionalId = text(formData, "professionalId")
  if (!isUuid(professionalId)) return { error: "Choose a professional." }
  const offDay = Number(text(formData, "offDay"))
  const status = text(formData, "status")
  const revisionText = text(formData, "revision")
  if (!/^\d+$/.test(revisionText)) {
    return { error: "This schedule has changed since you opened it. Reload the latest version before saving." }
  }
  const validated = validateWeeklySchedule({
    offDay: Number.isInteger(offDay) ? offDay : null,
    status: status === "complete" ? "complete" : "draft",
    intervals: intervalsFrom(formData, Number.isInteger(offDay) ? offDay : null),
  })
  if (!validated.ok) return { fieldErrors: validated.fieldErrors }

  const supabase = await createServerSupabaseClient()
  const saved = await supabase.rpc("admin_save_weekly_schedule", {
    target_professional: professionalId,
    off_day: validated.value.offDay,
    schedule_status: validated.value.status,
    intervals: validated.value.intervals,
    expected_revision: Number(revisionText),
  })
  if (saved.error) return { error: friendlyError(saved.error.message) }
  revalidatePath("/admin/professionals")
  return { saved: true }
}

export async function addScheduleException(
  _state: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const access = await editorAccess()
  if (!access.ok) return { error: access.error }
  const professionalId = text(formData, "professionalId")
  if (!isUuid(professionalId)) return { error: "Choose a professional." }
  const offDay = Number(text(formData, "offDay"))
  const kind = text(formData, "kind")
  if (!isKind(kind)) return { fieldErrors: { kind: "Choose an exception." } }
  const exception: StoredException = {
    id: "new",
    kind,
    date: emptyToNull(text(formData, "date")),
    originalOffDate: emptyToNull(text(formData, "originalOffDate")),
    replacementOffDate: emptyToNull(text(formData, "replacementOffDate")),
    starts: emptyToNull(text(formData, "starts")),
    ends: emptyToNull(text(formData, "ends")),
  }
  const validated = validateScheduleException(
    exception,
    Number.isInteger(offDay) ? offDay : null,
    existingExceptions(formData),
  )
  if (!validated.ok) return { fieldErrors: validated.fieldErrors }

  const supabase = await createServerSupabaseClient()
  const saved = await supabase.rpc("admin_add_schedule_exception", {
    target_professional: professionalId,
    exception_kind: kind,
    work_date: exception.date,
    original_off: exception.originalOffDate,
    replacement_off: exception.replacementOffDate,
    window_start: exception.starts,
    window_end: exception.ends,
  })
  if (saved.error) return { error: friendlyError(saved.error.message) }
  revalidatePath("/admin/professionals")
  return { saved: true }
}

export async function removeScheduleException(
  _state: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const access = await editorAccess()
  if (!access.ok) return { error: access.error }
  const exceptionId = text(formData, "exceptionId")
  if (!isUuid(exceptionId)) return { error: "Choose an exception." }
  const supabase = await createServerSupabaseClient()
  const removed = await supabase.rpc("admin_remove_schedule_exception", { exception_id: exceptionId })
  if (removed.error) return { error: friendlyError(removed.error.message) }
  revalidatePath("/admin/professionals")
  return { saved: true }
}

function intervalsFrom(formData: FormData, offDay: number | null): ScheduleInterval[] {
  const intervals: ScheduleInterval[] = []
  for (const weekday of weekdays) {
    if (weekday.id === offDay) continue
    const shiftStart = text(formData, `shift-${weekday.id}-start`)
    const shiftEnd = text(formData, `shift-${weekday.id}-end`)
    if (shiftStart || shiftEnd) {
      intervals.push({ weekday: weekday.id as Weekday, kind: "shift", starts: shiftStart, ends: shiftEnd })
    }
    const breakStart = text(formData, `break-${weekday.id}-start`)
    const breakEnd = text(formData, `break-${weekday.id}-end`)
    if (breakStart || breakEnd) {
      intervals.push({ weekday: weekday.id as Weekday, kind: "break", starts: breakStart, ends: breakEnd })
    }
  }
  return intervals
}

async function editorAccess(): Promise<{ ok: true } | { ok: false; error: string }> {
  const access = await readAdminAccess(null)
  if (access.status === "signed_out") redirect(loginPath("/admin/professionals", access.sessionEnded))
  if (access.status !== "ready") return { ok: false, error: "You cannot change that schedule." }
  if (access.scope.role !== "owner" && access.scope.role !== "manager") {
    return { ok: false, error: "You cannot change that schedule." }
  }
  return { ok: true }
}

function text(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

function emptyToNull(value: string) {
  return value.length > 0 ? value : null
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function isKind(value: string): value is StoredException["kind"] {
  return (
    value === "additional_leave" ||
    value === "off_day_swap" ||
    value === "special_hours" ||
    value === "partial_absence" ||
    value === "off_day_work"
  )
}

function existingExceptions(formData: FormData): StoredException[] {
  const raw = text(formData, "existingExceptions")
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return []
      const record = item as Record<string, unknown>
      if (typeof record.id !== "string" || typeof record.kind !== "string" || !isKind(record.kind)) return []
      return [
        {
          id: record.id,
          kind: record.kind,
          date: typeof record.date === "string" ? record.date : null,
          originalOffDate: typeof record.originalOffDate === "string" ? record.originalOffDate : null,
          replacementOffDate: typeof record.replacementOffDate === "string" ? record.replacementOffDate : null,
          starts: typeof record.starts === "string" ? record.starts : null,
          ends: typeof record.ends === "string" ? record.ends : null,
        },
      ]
    })
  } catch {
    return []
  }
}

function friendlyError(message: string) {
  if (/changed since you opened it/i.test(message)) {
    return "This schedule has changed since you opened it. Reload the latest version before saving."
  }
  if (/special hours cannot share/i.test(message)) {
    return "Special hours cannot share that date with approved off-day work."
  }
  if (/cannot share that date/i.test(message)) {
    return "Additional leave cannot share that date with other exceptions."
  }
  if (/swap conflicts with an exception/i.test(message)) {
    return "An off-day swap conflicts with an exception on that date."
  }
  if (/partial absence before undoing/i.test(message)) {
    return "Remove the partial absence before undoing approved off-day work."
  }
  if (/other exception before undoing/i.test(message)) {
    return "Remove the other exception before undoing this swap."
  }
  if (/not authorized/i.test(message)) return "You do not have permission to make that change."
  if (/choose a regular off-day/i.test(message)) return "Choose one regular off-day."
  if (/every working day/i.test(message)) return "Enter working hours for every working day."
  if (/off-day has no working hours/i.test(message)) return "The regular off-day has no working hours."
  if (/both dates/i.test(message)) return "Choose both dates for an off-day swap."
  if (/same week/i.test(message)) return "A swap must stay in the same week."
  if (/move the regular off-day/i.test(message)) return "A swap must move the regular off-day."
  if (/already has an off-day swap/i.test(message)) return "That week already has an off-day swap."
  if (/both off-days/i.test(message)) return "An off-day swap cannot remove both off-days."
  if (/already off/i.test(message)) return "That day is already off."
  if (/already a working day/i.test(message)) return "That day is already a working day."
  if (/explicit exception/i.test(message)) return "Working the off-day needs an explicit exception."
  if (/remove off-day swaps/i.test(message)) return "Remove off-day swaps before changing the regular off-day."
  if (/additional leave before/i.test(message)) return "Remove the additional leave before undoing this swap."
  if (/valid working hours/i.test(message) || /inside a shift/i.test(message) || /overlap/i.test(message)) {
    return "Enter valid working hours."
  }
  return "The schedule could not be saved."
}
