import { civilWeekday, civilWeekKey } from "@/lib/admin/ghana-time"

export const weekdays = [
  { id: 1, name: "Monday" },
  { id: 2, name: "Tuesday" },
  { id: 3, name: "Wednesday" },
  { id: 4, name: "Thursday" },
  { id: 5, name: "Friday" },
  { id: 6, name: "Saturday" },
  { id: 7, name: "Sunday" },
] as const

export type Weekday = (typeof weekdays)[number]["id"]

export type ScheduleInterval = {
  weekday: Weekday
  kind: "shift" | "break"
  starts: string
  ends: string
}

export type WeeklyScheduleInput = {
  offDay: number | null
  status: "draft" | "complete"
  intervals: ScheduleInterval[]
}

export type StoredException = {
  id: string
  kind: "additional_leave" | "off_day_swap" | "special_hours" | "partial_absence" | "off_day_work"
  date: string | null
  originalOffDate: string | null
  replacementOffDate: string | null
  starts: string | null
  ends: string | null
}

export type WeeklySchedule = {
  professionalId: string
  offWeekday: Weekday
  status: "draft" | "complete"
  revision: number
  intervals: ScheduleInterval[]
  exceptions: StoredException[]
}

export type DayPlan =
  | { status: "incomplete" | "regular_off" | "swap_off" | "additional_leave" }
  | { status: "working" | "off_day_work" | "partial_absence"; intervals: { starts: string; ends: string }[] }

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/

export function weekdayName(day: number) {
  return weekdays.find((weekday) => weekday.id === day)?.name ?? "Off-day"
}

export function validateWeeklySchedule(
  input: WeeklyScheduleInput,
): { ok: true; value: WeeklyScheduleInput } | { ok: false; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {}
  if (input.offDay == null || !weekdays.some((weekday) => weekday.id === input.offDay)) {
    fieldErrors.offDay = "Choose one regular off-day."
  }
  if (input.status !== "draft" && input.status !== "complete") {
    fieldErrors.status = "Choose draft or complete."
  }

  const offDay = fieldErrors.offDay ? null : input.offDay
  const intervals: ScheduleInterval[] = []
  for (const interval of input.intervals) {
    if (!weekdays.some((weekday) => weekday.id === interval.weekday)) {
      fieldErrors.intervals = "Enter valid working hours."
      continue
    }
    if (offDay != null && interval.weekday === offDay) {
      fieldErrors.offDay = "The regular off-day has no working hours."
      continue
    }
    if (!timePattern.test(interval.starts) || !timePattern.test(interval.ends) || interval.starts >= interval.ends) {
      fieldErrors[`day-${interval.weekday}`] = "Enter valid working hours."
      continue
    }
    if (interval.kind !== "shift" && interval.kind !== "break") {
      fieldErrors.intervals = "Enter valid working hours."
      continue
    }
    intervals.push(interval)
  }

  if (offDay != null && input.status === "complete") {
    for (const weekday of weekdays) {
      if (weekday.id === offDay) continue
      const shifts = intervals.filter((interval) => interval.weekday === weekday.id && interval.kind === "shift")
      if (shifts.length === 0) {
        fieldErrors[`day-${weekday.id}`] = "Enter working hours for every working day."
      }
    }
  }

  for (const weekday of weekdays) {
    const shifts = intervals.filter((interval) => interval.weekday === weekday.id && interval.kind === "shift")
    const breaks = intervals.filter((interval) => interval.weekday === weekday.id && interval.kind === "break")
    if (overlaps(shifts) || overlaps(breaks)) fieldErrors[`day-${weekday.id}`] = "Working hours overlap."
    if (breaks.some((pause) => !shifts.some((shift) => pause.starts >= shift.starts && pause.ends <= shift.ends))) {
      fieldErrors[`day-${weekday.id}`] = "A break must sit inside a shift."
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors }
  return {
    ok: true,
    value: { offDay: input.offDay, status: input.status, intervals },
  }
}

export function validateScheduleException(
  input: StoredException,
  offDay: number | null,
  existing: StoredException[] = [],
): { ok: true } | { ok: false; fieldErrors: Record<string, string> } {
  if (offDay == null) return { ok: false, fieldErrors: { offDay: "Choose one regular off-day." } }
  if (input.kind === "off_day_swap") {
    if (!input.originalOffDate || !input.replacementOffDate) {
      return { ok: false, fieldErrors: { swap: "Choose both dates for an off-day swap." } }
    }
    if (isoWeekKey(input.originalOffDate) !== isoWeekKey(input.replacementOffDate)) {
      return { ok: false, fieldErrors: { swap: "A swap must stay in the same week." } }
    }
    if (isoWeekday(input.originalOffDate) !== offDay || isoWeekday(input.replacementOffDate) === offDay) {
      return { ok: false, fieldErrors: { swap: "A swap must move the regular off-day." } }
    }
    if (
      existing.some(
        (exception) =>
          exception.kind === "off_day_swap" &&
          exception.originalOffDate != null &&
          isoWeekKey(exception.originalOffDate) === isoWeekKey(input.originalOffDate as string),
      )
    ) {
      return { ok: false, fieldErrors: { swap: "That week already has an off-day swap." } }
    }
    const touched = new Set([input.originalOffDate, input.replacementOffDate])
    if (
      existing.some(
        (exception) =>
          (exception.date != null && touched.has(exception.date)) ||
          (exception.originalOffDate != null && touched.has(exception.originalOffDate)) ||
          (exception.replacementOffDate != null && touched.has(exception.replacementOffDate)),
      )
    ) {
      return { ok: false, fieldErrors: { swap: "An off-day swap conflicts with an exception on that date." } }
    }
    return { ok: true }
  }

  if (!input.date) return { ok: false, fieldErrors: { date: "Choose a date." } }
  const day = isoWeekday(input.date)
  const swappedOff = existing.some(
    (exception) => exception.kind === "off_day_swap" && exception.replacementOffDate === input.date,
  )
  const swappedWork = existing.some(
    (exception) => exception.kind === "off_day_swap" && exception.originalOffDate === input.date,
  )
  if (input.kind === "additional_leave" && (swappedOff || (day === offDay && !swappedWork))) {
    return { ok: false, fieldErrors: { date: "That day is already off." } }
  }
  if (input.kind === "off_day_work") {
    if (swappedOff) {
      return { ok: false, fieldErrors: { date: "An off-day swap cannot remove both off-days." } }
    }
    if (day !== offDay || swappedWork) {
      return { ok: false, fieldErrors: { date: "That day is already a working day." } }
    }
    if (!validWindow(input.starts, input.ends)) {
      return { ok: false, fieldErrors: { date: "Enter valid working hours." } }
    }
  }
  if ((input.kind === "special_hours" || input.kind === "partial_absence") && swappedOff) {
    return { ok: false, fieldErrors: { date: "That day is already off." } }
  }
  const approvedOffDay = existing.some(
    (exception) => exception.kind === "off_day_work" && exception.date === input.date,
  )
  if (
    (input.kind === "special_hours" || input.kind === "partial_absence") &&
    day === offDay &&
    !swappedWork &&
    !(input.kind === "partial_absence" && approvedOffDay) &&
    !(input.kind === "special_hours" && approvedOffDay)
  ) {
    return { ok: false, fieldErrors: { date: "Working the off-day needs an explicit exception." } }
  }
  if ((input.kind === "special_hours" || input.kind === "partial_absence") && !validWindow(input.starts, input.ends)) {
    return { ok: false, fieldErrors: { date: "Enter valid working hours." } }
  }
  const sameDate = existing.filter((exception) => exception.date === input.date)
  if (sameDate.some((exception) => exception.kind === input.kind)) {
    return { ok: false, fieldErrors: { date: "That date already has this exception." } }
  }
  const sharesLeave =
    (input.kind === "additional_leave" &&
      sameDate.some((exception) => exception.kind === "special_hours" || exception.kind === "partial_absence" || exception.kind === "off_day_work")) ||
    (input.kind !== "additional_leave" && sameDate.some((exception) => exception.kind === "additional_leave"))
  if (sharesLeave) {
    return { ok: false, fieldErrors: { date: "Additional leave cannot share that date with other exceptions." } }
  }
  const mixesHours =
    (input.kind === "special_hours" && sameDate.some((exception) => exception.kind === "off_day_work")) ||
    (input.kind === "off_day_work" && sameDate.some((exception) => exception.kind === "special_hours"))
  if (mixesHours) {
    return { ok: false, fieldErrors: { date: "Special hours cannot share that date with approved off-day work." } }
  }
  return { ok: true }
}

export function describeDay(
  schedule: WeeklySchedule | null,
  workDate: string,
): DayPlan {
  if (!schedule || schedule.status !== "complete" || schedule.offWeekday == null) return { status: "incomplete" }
  const day = isoWeekday(workDate)
  const swap = schedule.exceptions.find(
    (exception) =>
      exception.kind === "off_day_swap" &&
      exception.originalOffDate != null &&
      isoWeekday(exception.originalOffDate) === schedule.offWeekday &&
      (exception.originalOffDate === workDate || exception.replacementOffDate === workDate),
  )
  const swappedToWork = swap?.originalOffDate === workDate
  const swappedToOff = swap?.replacementOffDate === workDate
  const leave = schedule.exceptions.some(
    (exception) => exception.kind === "additional_leave" && exception.date === workDate,
  )
  if (leave && !swappedToOff && (day !== schedule.offWeekday || swappedToWork)) return { status: "additional_leave" }

  if (swappedToOff || (day === schedule.offWeekday && !swappedToWork)) {
    const approved = schedule.exceptions.find(
      (exception) => exception.kind === "off_day_work" && exception.date === workDate,
    )
    if (!approved || !approved.starts || !approved.ends || swappedToWork || swappedToOff) {
      return { status: swappedToOff ? "swap_off" : "regular_off" }
    }
    return cutAbsence(schedule, workDate, [{ starts: approved.starts, ends: approved.ends }], "off_day_work")
  }

  const special = schedule.exceptions.find(
    (exception) => exception.kind === "special_hours" && exception.date === workDate && exception.starts && exception.ends,
  )
  const sourceDay = swappedToWork && swap?.replacementOffDate ? isoWeekday(swap.replacementOffDate) : day
  const base = special
    ? [{ starts: special.starts as string, ends: special.ends as string }]
    : workingIntervals(schedule.intervals, sourceDay)
  return cutAbsence(schedule, workDate, base, "working")
}

export function isoWeekday(isoDate: string) {
  return civilWeekday(isoDate) ?? 0
}

export function isoWeekKey(isoDate: string) {
  return civilWeekKey(isoDate) ?? ""
}

function validWindow(starts: string | null, ends: string | null) {
  return starts != null && ends != null && timePattern.test(starts) && timePattern.test(ends) && starts < ends
}

function overlaps(intervals: ScheduleInterval[]) {
  const ordered = [...intervals].sort((left, right) => left.starts.localeCompare(right.starts))
  return ordered.some((interval, index) => index > 0 && ordered[index - 1].ends > interval.starts)
}

function workingIntervals(intervals: ScheduleInterval[], weekday: number) {
  const shifts = intervals
    .filter((interval) => interval.weekday === weekday && interval.kind === "shift")
    .map((interval) => ({ starts: interval.starts, ends: interval.ends }))
  const breaks = intervals.filter((interval) => interval.weekday === weekday && interval.kind === "break")
  return breaks.reduce((remaining, pause) => subtract(remaining, pause.starts, pause.ends), shifts)
}

function cutAbsence(
  schedule: WeeklySchedule,
  workDate: string,
  intervals: { starts: string; ends: string }[],
  status: "working" | "off_day_work",
): DayPlan {
  const absence = schedule.exceptions.find(
    (exception) => exception.kind === "partial_absence" && exception.date === workDate && exception.starts && exception.ends,
  )
  const remaining = absence ? subtract(intervals, absence.starts as string, absence.ends as string) : intervals
  if (absence) return { status: "partial_absence", intervals: remaining }
  if (remaining.length === 0) return { status, intervals: [] }
  return { status, intervals: remaining }
}

function subtract(intervals: { starts: string; ends: string }[], cutStart: string, cutEnd: string) {
  const next: { starts: string; ends: string }[] = []
  for (const interval of intervals) {
    if (interval.ends <= cutStart || interval.starts >= cutEnd) {
      next.push(interval)
      continue
    }
    if (interval.starts < cutStart) next.push({ starts: interval.starts, ends: cutStart })
    if (interval.ends > cutEnd) next.push({ starts: cutEnd, ends: interval.ends })
  }
  return next
}
