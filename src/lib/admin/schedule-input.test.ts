import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  describeDay,
  validateScheduleException,
  validateWeeklySchedule,
  weekdays,
  type ScheduleInterval,
  type StoredException,
  type WeeklySchedule,
} from "./schedule-input.ts"

const ama = "11111111-1111-4111-8111-111111111111"
const kojo = "22222222-2222-4222-8222-222222222222"

function shifts(offDay: number): ScheduleInterval[] {
  return weekdays
    .filter((weekday) => weekday.id !== offDay)
    .map((weekday) => ({ weekday: weekday.id, kind: "shift" as const, starts: "09:00", ends: "17:00" }))
}

function schedule(
  id: string,
  offDay: number,
  status: "draft" | "complete",
  exceptions: StoredException[] = [],
  intervals = shifts(offDay),
): WeeklySchedule {
  return {
    professionalId: id,
    offWeekday: offDay as WeeklySchedule["offWeekday"],
    status,
    revision: 1,
    intervals,
    exceptions,
  }
}

describe("weekly off-day", () => {
  it("requires one explicit off-day and does not choose Sunday", () => {
    const missing = validateWeeklySchedule({ offDay: null, status: "complete", intervals: shifts(7) })
    assert.equal(missing.ok, false)
    if (!missing.ok) assert.equal(missing.fieldErrors.offDay, "Choose one regular off-day.")

    const sunday = validateWeeklySchedule({ offDay: 7, status: "complete", intervals: shifts(7) })
    const wednesday = validateWeeklySchedule({ offDay: 3, status: "complete", intervals: shifts(3) })
    assert.equal(sunday.ok, true)
    assert.equal(wednesday.ok, true)
    if (sunday.ok && wednesday.ok) {
      assert.equal(sunday.value.offDay, 7)
      assert.equal(wednesday.value.offDay, 3)
      assert.notEqual(wednesday.value.offDay, 7)
    }
  })

  it("keeps a draft incomplete and withholds working intervals", () => {
    const draft = validateWeeklySchedule({
      offDay: 3,
      status: "draft",
      intervals: [{ weekday: 1, kind: "shift", starts: "09:00", ends: "17:00" }],
    })
    assert.equal(draft.ok, true)
    const plan = describeDay(
      schedule(ama, 3, "draft", [], [{ weekday: 1, kind: "shift", starts: "09:00", ends: "17:00" }]),
      "2026-11-09",
    )
    assert.deepEqual(plan, { status: "incomplete" })
  })

  it("accepts a completed week only when the other six days have hours", () => {
    const incomplete = validateWeeklySchedule({
      offDay: 3,
      status: "complete",
      intervals: [{ weekday: 1, kind: "shift", starts: "09:00", ends: "17:00" }],
    })
    assert.equal(incomplete.ok, false)
    const complete = validateWeeklySchedule({ offDay: 3, status: "complete", intervals: shifts(3) })
    assert.equal(complete.ok, true)
    if (complete.ok) {
      const days = new Set(complete.value.intervals.filter((interval) => interval.kind === "shift").map((interval) => interval.weekday))
      assert.equal(days.size, 6)
      assert.equal(days.has(3), false)
    }
  })

  it("lets two professionals keep different off-days", () => {
    const accra = describeDay(schedule(ama, 3, "complete"), "2026-11-11")
    const kumasi = describeDay(schedule(kojo, 1, "complete"), "2026-11-11")
    assert.equal(accra.status, "regular_off")
    assert.equal(kumasi.status, "working")
    const accraMonday = describeDay(schedule(ama, 3, "complete"), "2026-11-09")
    const kumasiMonday = describeDay(schedule(kojo, 1, "complete"), "2026-11-09")
    assert.equal(accraMonday.status, "working")
    assert.equal(kumasiMonday.status, "regular_off")
  })

  it("changes the regular off-day without treating the old day as off", () => {
    const changed = schedule(kojo, 5, "complete")
    assert.equal(describeDay(changed, "2026-11-09").status, "working")
    assert.equal(describeDay(changed, "2026-11-13").status, "regular_off")
  })
})

describe("schedule exceptions", () => {
  const week = schedule(ama, 3, "complete")

  it("moves one week’s off-day without changing the recurring day", () => {
    const swap: StoredException = {
      id: "swap",
      kind: "off_day_swap",
      date: null,
      originalOffDate: "2026-11-11",
      replacementOffDate: "2026-11-09",
      starts: null,
      ends: null,
    }
    assert.equal(validateScheduleException(swap, week.offWeekday).ok, true)
    const hours = shifts(3).map((interval) =>
      interval.weekday === 1 ? interval : interval,
    )
    hours.push({ weekday: 1, kind: "break", starts: "13:00", ends: "14:00" })
    const swapped = schedule(ama, 3, "complete", [swap], hours)
    assert.equal(swapped.offWeekday, 3)
    assert.deepEqual(describeDay(swapped, "2026-11-11"), {
      status: "working",
      intervals: [
        { starts: "09:00", ends: "13:00" },
        { starts: "14:00", ends: "17:00" },
      ],
    })
    assert.equal(describeDay(swapped, "2026-11-09").status, "swap_off")
    const bothWorking: StoredException = {
      id: "work",
      kind: "off_day_work",
      date: "2026-11-09",
      originalOffDate: null,
      replacementOffDate: null,
      starts: "10:00",
      ends: "14:00",
    }
    const conflict = validateScheduleException(bothWorking, week.offWeekday, [swap])
    assert.equal(conflict.ok, false)
    if (!conflict.ok) assert.match(conflict.fieldErrors.date, /both off-days/)
  })

  it("keeps additional leave distinct from the regular off-day", () => {
    const leave: StoredException = {
      id: "leave",
      kind: "additional_leave",
      date: "2026-11-12",
      originalOffDate: null,
      replacementOffDate: null,
      starts: null,
      ends: null,
    }
    assert.equal(validateScheduleException(leave, 3).ok, true)
    assert.equal(describeDay(schedule(ama, 3, "complete", [leave]), "2026-11-12").status, "additional_leave")
    assert.equal(describeDay(schedule(ama, 3, "complete", [leave]), "2026-11-11").status, "regular_off")
    const onOffDay = validateScheduleException({ ...leave, date: "2026-11-11" }, 3)
    assert.equal(onOffDay.ok, false)
  })

  it("works a regular off-day only through an explicit exception", () => {
    assert.equal(describeDay(week, "2026-11-18").status, "regular_off")
    const approved: StoredException = {
      id: "work",
      kind: "off_day_work",
      date: "2026-11-18",
      originalOffDate: null,
      replacementOffDate: null,
      starts: "10:00",
      ends: "14:00",
    }
    assert.equal(validateScheduleException(approved, 3).ok, true)
    assert.deepEqual(describeDay(schedule(ama, 3, "complete", [approved]), "2026-11-18"), {
      status: "off_day_work",
      intervals: [{ starts: "10:00", ends: "14:00" }],
    })
    assert.equal(describeDay(schedule(ama, 3, "complete", [approved]), "2026-11-25").status, "regular_off")
  })

  it("rejects contradictory exceptions and keeps a partial absence inside special hours", () => {
    const special: StoredException = {
      id: "special",
      kind: "special_hours",
      date: "2026-11-10",
      originalOffDate: null,
      replacementOffDate: null,
      starts: "11:00",
      ends: "15:00",
    }
    const leave: StoredException = {
      id: "leave",
      kind: "additional_leave",
      date: "2026-11-10",
      originalOffDate: null,
      replacementOffDate: null,
      starts: null,
      ends: null,
    }
    const partial: StoredException = {
      id: "partial",
      kind: "partial_absence",
      date: "2026-11-10",
      originalOffDate: null,
      replacementOffDate: null,
      starts: "12:00",
      ends: "13:00",
    }
    const withSpecial = validateScheduleException(leave, 5, [special])
    assert.equal(withSpecial.ok, false)
    const alongside = validateScheduleException(partial, 5, [special])
    assert.equal(alongside.ok, true)
    assert.deepEqual(describeDay(schedule(kojo, 5, "complete", [special, partial]), "2026-11-10"), {
      status: "partial_absence",
      intervals: [
        { starts: "11:00", ends: "12:00" },
        { starts: "13:00", ends: "15:00" },
      ],
    })
    const swap: StoredException = {
      id: "swap",
      kind: "off_day_swap",
      date: null,
      originalOffDate: "2026-11-13",
      replacementOffDate: "2026-11-10",
      starts: null,
      ends: null,
    }
    const blocked = validateScheduleException(swap, 5, [special])
    assert.equal(blocked.ok, false)
    if (!blocked.ok) assert.match(blocked.fieldErrors.swap, /conflicts with an exception/)
  })
})
