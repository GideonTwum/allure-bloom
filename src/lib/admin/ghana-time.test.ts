import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  calendarDate,
  civilWeekday,
  civilWeekKey,
  ghanaDate,
  ghanaLocalToUtc,
  parseCivilDate,
} from "./ghana-time.ts"

describe("Ghana scheduling dates", () => {
  it("keeps Accra's date when a browser ahead of Ghana has already changed day", () => {
    const instant = new Date("2026-11-11T23:30:00.000Z")
    assert.equal(ghanaDate(instant), "2026-11-11")
    assert.equal(calendarDate(instant, "Asia/Tokyo"), "2026-11-12")
  })

  it("keeps Accra's date when a browser behind Ghana is still on the previous day", () => {
    const instant = new Date("2026-11-12T00:30:00.000Z")
    assert.equal(ghanaDate(instant), "2026-11-12")
    assert.equal(calendarDate(instant, "America/Los_Angeles"), "2026-11-11")
  })

  it("reads a calendar date without a UTC or local Date conversion", () => {
    assert.equal(civilWeekday("2026-11-11"), 3)
    assert.equal(civilWeekday("2026-11-15"), 7)
    assert.equal(civilWeekKey("2027-01-03"), "2026-12-28")
    assert.equal(civilWeekKey("2026-12-27"), "2026-12-21")
    assert.equal(parseCivilDate("2026-02-31"), null)
  })

  it("converts an Accra wall-clock appointment to UTC", () => {
    const instant = ghanaLocalToUtc("2026-11-12", "09:00")
    assert.ok(instant)
    assert.equal(instant?.toISOString(), "2026-11-12T09:00:00.000Z")
    assert.equal(ghanaDate(instant as Date), "2026-11-12")
  })
})
