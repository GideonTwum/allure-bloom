/**
 * Scheduling uses Africa/Accra for both studios.
 *
 * Weekly shifts and exception windows are wall-clock times. Exception dates are
 * Ghana calendar dates. Neither value follows the browser's time zone.
 *
 * A future appointment is that calendar date plus the wall-clock time. Convert
 * it to UTC in PostgreSQL with:
 *
 *   (work_date + starts_at) AT TIME ZONE 'Africa/Accra'
 *
 * ghanaLocalToUtc resolves the same instant from the IANA zone. It does not
 * assume the offset stays at zero.
 */

export const SCHEDULING_TIME_ZONE = "Africa/Accra"

const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/
const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/

export type CivilDate = { year: number; month: number; day: number }

export function parseCivilDate(value: string): CivilDate | null {
  const match = isoDatePattern.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null
  return { year, month, day }
}

export function formatCivilDate(date: CivilDate) {
  return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`
}

export function civilWeekday(value: string) {
  const date = parseCivilDate(value)
  if (!date) return null
  const offsets = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4]
  let year = date.year
  if (date.month < 3) year -= 1
  const sundayBased =
    (year + Math.floor(year / 4) - Math.floor(year / 100) + Math.floor(year / 400) + offsets[date.month - 1] + date.day) %
    7
  return sundayBased === 0 ? 7 : sundayBased
}

export function civilWeekKey(value: string) {
  const date = parseCivilDate(value)
  const weekday = civilWeekday(value)
  if (!date || weekday == null) return null
  return formatCivilDate(addCivilDays(date, 1 - weekday))
}

export function calendarDate(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant)
  const year = parts.find((part) => part.type === "year")?.value
  const month = parts.find((part) => part.type === "month")?.value
  const day = parts.find((part) => part.type === "day")?.value
  if (!year || !month || !day) return null
  return `${year}-${month}-${day}`
}

export function ghanaDate(instant: Date) {
  return calendarDate(instant, SCHEDULING_TIME_ZONE)
}

export function ghanaLocalToUtc(isoDate: string, time: string) {
  const date = parseCivilDate(isoDate)
  const match = timePattern.exec(time)
  if (!date || !match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  const wallClock = Date.UTC(date.year, date.month - 1, date.day, hour, minute)
  const corrected = wallClock - zoneOffsetMinutes(new Date(wallClock), SCHEDULING_TIME_ZONE) * 60_000
  return new Date(wallClock - zoneOffsetMinutes(new Date(corrected), SCHEDULING_TIME_ZONE) * 60_000)
}

function zoneOffsetMinutes(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant)
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value)
  let hour = read("hour")
  if (hour === 24) hour = 0
  const zonedAsUtc = Date.UTC(read("year"), read("month") - 1, read("day"), hour, read("minute"), read("second"))
  return Math.round((zonedAsUtc - instant.getTime()) / 60_000)
}

function addCivilDays(date: CivilDate, days: number) {
  return julianToCivil(civilToJulian(date) + days)
}

function daysInMonth(year: number, month: number) {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
}

function civilToJulian(date: CivilDate) {
  const a = Math.floor((14 - date.month) / 12)
  const year = date.year + 4800 - a
  const month = date.month + 12 * a - 3
  return date.day + Math.floor((153 * month + 2) / 5) + 365 * year + Math.floor(year / 4) - Math.floor(year / 100) + Math.floor(year / 400) - 32045
}

function julianToCivil(julian: number): CivilDate {
  let remaining = julian + 32044
  const century = Math.floor((4 * remaining + 3) / 146097)
  remaining -= Math.floor((146097 * century) / 4)
  const yearOfCentury = Math.floor((4 * remaining + 3) / 1461)
  remaining -= Math.floor((1461 * yearOfCentury) / 4)
  const monthIndex = Math.floor((5 * remaining + 2) / 153)
  const day = remaining - Math.floor((153 * monthIndex + 2) / 5) + 1
  const month = monthIndex + 3 - 12 * Math.floor(monthIndex / 10)
  const year = 100 * century + yearOfCentury - 4800 + Math.floor(monthIndex / 10)
  return { year, month, day }
}
