import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  activationAvailable,
  canPrepareDestination,
  transferActionAllowed,
  destinationScheduleWarning,
  transferStatusLabel,
  validateDestinationSchedule,
  validateTransferRequest,
  weekdays,
} from "./transfer-input.ts"
import { weekdays as days } from "./schedule-input.ts"

describe("professional transfers", () => {
  it("keeps a future ready transfer uncompleted", () => {
    assert.equal(transferStatusLabel("ready"), "Ready")
    assert.equal(transferStatusLabel("completed"), "Completed")
    assert.equal(activationAvailable("ready", "2026-11-12", "2026-11-11"), false)
    assert.equal(activationAvailable("ready", "2026-11-11", "2026-11-11"), true)
    assert.equal(activationAvailable("pending_preparation", "2026-11-11", "2026-11-11"), false)
    assert.equal(activationAvailable("completed", "2026-11-12", "2026-11-11"), false)
  })

  it("keeps owner actions away from a manager at the application layer", () => {
    assert.equal(transferActionAllowed("owner", "owner"), true)
    assert.equal(transferActionAllowed("owner", "prepare"), true)
    assert.equal(transferActionAllowed("manager", "prepare"), true)
    assert.equal(transferActionAllowed("manager", "owner"), false)
  })

  it("lets only the owner and receiving manager prepare the destination week", () => {
    assert.equal(
      canPrepareDestination({
        owner: false,
        managedStudioIds: ["kumasi"],
        destinationBranchId: "kumasi",
        status: "pending_preparation",
      }),
      true,
    )
    assert.equal(
      canPrepareDestination({
        owner: false,
        managedStudioIds: ["accra"],
        destinationBranchId: "kumasi",
        status: "pending_preparation",
      }),
      false,
    )
    assert.equal(
      canPrepareDestination({
        owner: true,
        managedStudioIds: ["accra"],
        destinationBranchId: "kumasi",
        status: "ready",
      }),
      true,
    )
    assert.equal(
      canPrepareDestination({
        owner: true,
        managedStudioIds: ["accra", "kumasi"],
        destinationBranchId: "kumasi",
        status: "draft",
      }),
      false,
    )
  })

  it("warns while the destination week is unfinished", () => {
    assert.match(destinationScheduleWarning({ status: "pending_preparation", scheduleStatus: null }) ?? "", /not been started/)
    assert.match(destinationScheduleWarning({ status: "pending_preparation", scheduleStatus: "draft" }) ?? "", /draft/)
    assert.match(destinationScheduleWarning({ status: "ready", scheduleStatus: "complete" }) ?? "", /does not happen/)
    assert.equal(destinationScheduleWarning({ status: "completed", scheduleStatus: "complete" }), null)
  })

  it("requires a different studio and an Accra calendar date", () => {
    assert.equal(validateTransferRequest({ sourceBranchId: "accra", destinationBranchId: "accra", effectiveOn: "2026-11-11" }).ok, false)
    assert.equal(validateTransferRequest({ sourceBranchId: "accra", destinationBranchId: "kumasi", effectiveOn: "2026-02-31" }).ok, false)
    const accepted = validateTransferRequest({
      sourceBranchId: "accra",
      destinationBranchId: "kumasi",
      effectiveOn: "2026-11-11",
    })
    assert.equal(accepted.ok, true)
  })

  it("reuses the weekly off-day rules for the destination draft", () => {
    const missing = validateDestinationSchedule({ offDay: null, status: "draft", intervals: [] })
    assert.equal(missing.ok, false)
    const draft = validateDestinationSchedule({ offDay: 2, status: "draft", intervals: [] })
    assert.equal(draft.ok, true)
    const complete = validateDestinationSchedule({
      offDay: 2,
      status: "complete",
      intervals: days.filter((day) => day.id !== 2).map((day) => ({
        weekday: day.id,
        kind: "shift" as const,
        starts: "10:00",
        ends: "16:00",
      })),
    })
    assert.equal(complete.ok, true)
    assert.equal(weekdays, days)
  })
})
