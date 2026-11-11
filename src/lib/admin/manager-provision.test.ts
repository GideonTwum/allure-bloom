import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  provisionMessages,
  provisionStatusLabel,
  runProvisionAttempt,
  secretKind,
  type ProvisionSnapshot,
} from "./manager-provision.ts"

const ready: ProvisionSnapshot = {
  id: "provision-1",
  email: "manager@allure.test",
  branchId: "accra",
  status: "ready",
  lastError: null,
  authUserId: "user-1",
}

function pending(overrides: Partial<ProvisionSnapshot> = {}): ProvisionSnapshot {
  return {
    id: "provision-1",
    email: "manager@allure.test",
    branchId: "kumasi",
    status: "auth_pending",
    lastError: null,
    authUserId: null,
    ...overrides,
  }
}

describe("secretKind", () => {
  it("accepts a privileged credential and rejects a publishable key", () => {
    assert.equal(secretKind(""), "missing")
    assert.equal(secretKind("sb_secret_local_test"), "accepted")
    assert.equal(secretKind("sb_publishable_local_test"), "rejected")
    const payload = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")
    assert.equal(secretKind(`header.${payload}.sig`), "accepted")
  })
})

describe("provisionStatusLabel", () => {
  it("distinguishes pending, ready, failed, and revoked", () => {
    assert.equal(provisionStatusLabel("auth_pending"), "Waiting for an account")
    assert.equal(provisionStatusLabel("role_pending"), "Account found, access not finished")
    assert.equal(provisionStatusLabel("branch_pending"), "Manager role saved, studio not assigned")
    assert.equal(provisionStatusLabel("ready"), "Ready")
    assert.equal(provisionStatusLabel("failed"), "Failed")
    assert.equal(provisionStatusLabel("revoked"), "Revoked")
  })
})

describe("runProvisionAttempt", () => {
  it("attaches an existing account without an invitation", async () => {
    let invites = 0
    const snapshot = await runProvisionAttempt({ email: "manager@allure.test", branchId: "accra" }, {
      open: async () => pending(),
      lookup: async () => "user-1",
      invite: async () => {
        invites += 1
        return "invited"
      },
      attach: async () => undefined,
      finish: async () => ready,
      fail: async () => pending({ status: "failed" }),
    })
    assert.equal(invites, 0)
    assert.equal(snapshot.status, "ready")
  })

  it("does not invite again when the account is already attached", async () => {
    let invites = 0
    await runProvisionAttempt({ email: "manager@allure.test", branchId: "accra" }, {
      open: async () => pending({ status: "role_pending", authUserId: "user-1" }),
      lookup: async () => {
        throw new Error("lookup should not run")
      },
      invite: async () => {
        invites += 1
        return "invited"
      },
      attach: async () => {
        throw new Error("attach should not run")
      },
      finish: async () => ready,
      fail: async () => pending({ status: "failed" }),
    })
    assert.equal(invites, 0)
  })

  it("records a fixed error when invitations are not configured", async () => {
    let reason = ""
    const snapshot = await runProvisionAttempt({ email: "new@allure.test", branchId: "kumasi" }, {
      open: async () => pending({ email: "new@allure.test" }),
      lookup: async () => null,
      invite: async () => "not_configured",
      attach: async () => {
        throw new Error("attach should not run")
      },
      finish: async () => ready,
      fail: async (_id, message) => {
        reason = message
        return pending({ status: "failed", lastError: message })
      },
    })
    assert.equal(reason, provisionMessages.notConfigured)
    assert.equal(snapshot.status, "failed")
    assert.equal(reason.includes("sb_secret"), false)
  })

  it("invites once, then retries through lookup without a second invitation", async () => {
    let invites = 0
    let known: string | null = null
    const deps = {
      open: async () => pending({ authUserId: known }),
      lookup: async () => known,
      invite: async () => {
        invites += 1
        return "invited" as const
      },
      attach: async () => undefined,
      finish: async () => {
        if (!known) throw new Error("finish before the account exists")
        return ready
      },
      fail: async (_id: string, message: string) => pending({ status: "failed", lastError: message }),
    }

    const first = await runProvisionAttempt({ email: "new@allure.test", branchId: "accra" }, deps)
    assert.equal(invites, 1)
    assert.equal(first.status, "failed")
    assert.equal(first.lastError, provisionMessages.inviteMissing)

    known = "user-2"
    const second = await runProvisionAttempt({ email: "new@allure.test", branchId: "accra" }, deps)
    assert.equal(invites, 1)
    assert.equal(second.status, "ready")
  })

  it("does not invite or finish a revoked manager", async () => {
    let invites = 0
    const snapshot = await runProvisionAttempt({ email: "manager@allure.test", branchId: "kumasi" }, {
      open: async () => pending({ status: "revoked", authUserId: "user-1" }),
      lookup: async () => "user-1",
      invite: async () => {
        invites += 1
        return "invited"
      },
      attach: async () => undefined,
      finish: async () => {
        throw new Error("finish should not run")
      },
      fail: async () => pending({ status: "failed" }),
    })
    assert.equal(invites, 0)
    assert.equal(snapshot.status, "revoked")
  })

  it("does not invite or move a manager whose provisioning is already ready", async () => {
    let invites = 0
    const snapshot = await runProvisionAttempt({ email: "manager@allure.test", branchId: "kumasi" }, {
      open: async () => ready,
      lookup: async () => "user-1",
      invite: async () => {
        invites += 1
        return "invited"
      },
      attach: async () => undefined,
      finish: async () => {
        throw new Error("finish should not run")
      },
      fail: async () => pending({ status: "failed" }),
    })
    assert.equal(invites, 0)
    assert.equal(snapshot.branchId, "accra")
  })
})
