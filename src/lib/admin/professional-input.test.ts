import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  canCreateProfessional,
  filterProfessionals,
  professionalProfilePayload,
  validateProfessionalDraft,
} from "./professional-input.ts"
import { parsePublicProfessionals } from "../professionals/public.ts"

const person = {
  id: "11111111-1111-4111-8111-111111111111",
  fullName: "Ama Mensah",
  displayName: "Ama",
  biography: null,
  imageUrl: null,
  isActive: true,
  isListed: false,
  branchId: "accra",
  branchName: "Accra Studio",
  serviceIds: ["svc_cat_eye_volume"],
}

describe("canCreateProfessional", () => {
  it("allows an owner and denies a manager", () => {
    assert.equal(canCreateProfessional("owner"), true)
    assert.equal(canCreateProfessional("manager"), false)
  })
})

describe("validateProfessionalDraft", () => {
  it("accepts a profile and rejects a listed inactive professional", () => {
    const saved = validateProfessionalDraft(
      {
        fullName: " Ama Mensah ",
        displayName: "",
        biography: "",
        imageUrl: "/brand/symbol.svg",
        active: true,
        listed: false,
      },
      "accra",
      ["accra", "kumasi"],
    )
    assert.equal(saved.ok, true)
    if (!saved.ok) return
    assert.equal(saved.value.fullName, "Ama Mensah")
    assert.equal(saved.value.displayName, null)
    assert.equal(saved.value.imageUrl, "/brand/symbol.svg")

    const listed = validateProfessionalDraft(
      {
        fullName: "Ama Mensah",
        displayName: "A",
        biography: "x".repeat(601),
        imageUrl: "http://example.com/a.jpg",
        active: false,
        listed: true,
      },
      "tema",
      ["accra"],
    )
    assert.equal(listed.ok, false)
    if (listed.ok) return
    assert.equal(listed.fieldErrors.displayName, "Enter a display name.")
    assert.equal(listed.fieldErrors.biography, "Enter a shorter biography.")
    assert.equal(listed.fieldErrors.imageUrl, "Enter a site image path or https address.")
    assert.equal(listed.fieldErrors.listed, "An inactive professional cannot be publicly listed.")
    assert.equal(listed.fieldErrors.branchId, "Choose a studio.")
  })
})

describe("professionalProfilePayload", () => {
  it("drops a stale active or listed value from a profile save", () => {
    const payload = professionalProfilePayload({
      fullName: "Ama Mensah",
      displayName: "Ama",
      biography: "Lash artist",
      imageUrl: "",
      active: true,
      listed: true,
    })
    assert.deepEqual(payload, {
      fullName: "Ama Mensah",
      displayName: "Ama",
      biography: "Lash artist",
      imageUrl: "",
    })
    assert.equal("active" in payload, false)
    assert.equal("listed" in payload, false)
  })
})

describe("filterProfessionals", () => {
  it("matches a name without moving the studio", () => {
    assert.deepEqual(filterProfessionals([person], "ama"), [person])
    assert.deepEqual(filterProfessionals([person], "kumasi"), [])
  })
})

describe("parsePublicProfessionals", () => {
  it("keeps public fields and rejects audit metadata", () => {
    const parsed = parsePublicProfessionals([
      {
        id: person.id,
        name: "Ama",
        biography: null,
        image_url: null,
        branch_id: "accra",
        branch_name: "Accra Studio",
        service_ids: ["svc_cat_eye_volume"],
      },
    ])
    assert.equal(parsed?.[0]?.name, "Ama")
    assert.equal(parsed?.[0]?.branchId, "accra")
    assert.equal(
      parsePublicProfessionals([
        {
          id: person.id,
          name: "Ama",
          biography: null,
          image_url: null,
          branch_id: "accra",
          branch_name: "Accra Studio",
          service_ids: [],
          granted_by: person.id,
        },
      ]),
      null,
    )
  })
})
