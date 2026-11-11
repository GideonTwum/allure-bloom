import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  canAdministerManagers,
  loginPath,
  resolveAdminScope,
  safeAdminReturnPath,
  visibleBranchIds,
  type AdminBranch,
} from "./access.ts"

const studios: AdminBranch[] = [
  { id: "kumasi", name: "Kumasi Studio" },
  { id: "accra", name: "Accra Studio" },
]

const ownerRows = [
  { role: "owner", branchId: "accra" },
  { role: "owner", branchId: "kumasi" },
]

describe("canAdministerManagers", () => {
  it("allows an owner and denies a manager", () => {
    assert.equal(canAdministerManagers("owner"), true)
    assert.equal(canAdministerManagers("manager"), false)
  })
})

describe("safeAdminReturnPath", () => {
  it("keeps studio desk paths", () => {
    assert.equal(safeAdminReturnPath("/admin"), "/admin")
    assert.equal(safeAdminReturnPath("/admin/services"), "/admin/services")
    assert.equal(
      safeAdminReturnPath("/admin/services?branch=accra"),
      "/admin/services?branch=accra",
    )
  })

  it("rejects external and login targets", () => {
    assert.equal(safeAdminReturnPath("https://evil.example/admin"), "/admin")
    assert.equal(safeAdminReturnPath("//evil.example"), "/admin")
    assert.equal(safeAdminReturnPath("/\\evil.example"), "/admin")
    assert.equal(safeAdminReturnPath("/admin/login"), "/admin")
    assert.equal(safeAdminReturnPath("/admin/login?next=/admin"), "/admin")
    assert.equal(safeAdminReturnPath("javascript:alert(1)"), "/admin")
    assert.equal(safeAdminReturnPath("/services"), "/admin")
    assert.equal(safeAdminReturnPath("/%2f%2fevil.example"), "/admin")
    assert.equal(safeAdminReturnPath("/admin/%5c../secret"), "/admin")
    assert.equal(safeAdminReturnPath(null), "/admin")
  })
})

describe("loginPath", () => {
  it("marks an ended session without opening the return path", () => {
    assert.equal(
      loginPath("https://evil.example", true),
      "/admin/login?next=%2Fadmin&reason=session",
    )
  })
})

describe("resolveAdminScope", () => {
  it("gives an owner both studios and the all-studios view", () => {
    const resolved = resolveAdminScope(ownerRows, studios, null)
    assert.equal(resolved.ok, true)
    if (!resolved.ok) return
    assert.equal(resolved.scope.role, "owner")
    assert.deepEqual(
      resolved.scope.branches.map((branch) => branch.id),
      ["accra", "kumasi"],
    )
    assert.equal(resolved.scope.selectedBranchId, "all")
    assert.deepEqual(visibleBranchIds(resolved.scope), ["accra", "kumasi"])
  })

  it("lets an owner open either studio", () => {
    const accra = resolveAdminScope(ownerRows, studios, "accra")
    const kumasi = resolveAdminScope(ownerRows, studios, "kumasi")
    assert.equal(accra.ok && accra.scope.selectedBranchId, "accra")
    assert.equal(kumasi.ok && kumasi.scope.selectedBranchId, "kumasi")
  })

  it("limits an Accra manager to Accra", () => {
    const resolved = resolveAdminScope(
      [{ role: "manager", branchId: "accra" }],
      studios,
      null,
    )
    assert.equal(resolved.ok, true)
    if (!resolved.ok) return
    assert.deepEqual(
      resolved.scope.branches.map((branch) => branch.id),
      ["accra"],
    )
    assert.equal(resolved.scope.selectedBranchId, "accra")

    const denied = resolveAdminScope(
      [{ role: "manager", branchId: "accra" }],
      studios,
      "kumasi",
    )
    assert.equal(denied.ok && denied.scope.unauthorizedRequest, true)
    assert.equal(denied.ok && denied.scope.selectedBranchId, null)
    assert.deepEqual(denied.ok ? visibleBranchIds(denied.scope) : ["leaked"], [])
  })

  it("limits a Kumasi manager to Kumasi", () => {
    const resolved = resolveAdminScope(
      [{ role: "manager", branchId: "kumasi" }],
      studios,
      "kumasi",
    )
    assert.equal(resolved.ok && resolved.scope.selectedBranchId, "kumasi")
    const denied = resolveAdminScope(
      [{ role: "manager", branchId: "kumasi" }],
      studios,
      "accra",
    )
    assert.equal(denied.ok && denied.scope.unauthorizedRequest, true)
  })

  it("rejects a manager all-studios request and a revoked assignment", () => {
    const allStudios = resolveAdminScope(
      [{ role: "manager", branchId: "accra" }],
      studios,
      "all",
    )
    assert.equal(allStudios.ok && allStudios.scope.unauthorizedRequest, true)
    assert.equal(resolveAdminScope([], studios, null).ok, false)
    assert.equal(
      resolveAdminScope([{ role: "customer", branchId: "accra" }], studios, null).ok,
      false,
    )
  })

  it("does not grant access from mixed or metadata-like roles", () => {
    const mixed = resolveAdminScope(
      [
        { role: "owner", branchId: "accra" },
        { role: "manager", branchId: "kumasi" },
      ],
      studios,
      null,
    )
    assert.equal(mixed.ok, false)
  })

  it("uses studio names from the database and denies an unknown selection", () => {
    const resolved = resolveAdminScope(ownerRows, studios, "not-a-studio")
    assert.equal(resolved.ok, true)
    if (!resolved.ok) return
    assert.equal(resolved.scope.branches[0]?.name, "Accra Studio")
    assert.equal(resolved.scope.unauthorizedRequest, true)
    assert.equal(resolved.scope.branches.some((branch) => branch.id === "not-a-studio"), false)
  })
})
