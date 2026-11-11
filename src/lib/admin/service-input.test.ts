import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  canEditCatalogue,
  canEditOffering,
  filterAdminServices,
  serviceIdForName,
  validateOffering,
  validateServiceDraft,
} from "./service-input.ts"

const services = [
  { id: "svc_mink_lash_extensions", slug: "mink-lash-extensions", name: "Mink lash extensions", category: "lashes", isListed: true },
  { id: "svc_pedicures", slug: "pedicures", name: "Pedicures", category: "nails", isListed: false },
]

describe("service identity", () => {
  it("keeps the existing id and slug shape", () => {
    assert.deepEqual(serviceIdForName("Mink lash extensions"), {
      id: "svc_mink_lash_extensions",
      slug: "mink-lash-extensions",
    })
  })
})

describe("validateServiceDraft", () => {
  it("accepts a new catalogue draft without a price", () => {
    const result = validateServiceDraft({
      name: "Brow lamination",
      description: "A studio treatment.",
      category: "brows",
      serviceType: "treatment",
      imageUrl: "",
      listed: false,
    })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.value.imageUrl, null)
    assert.equal(result.value.listed, false)
  })

  it("rejects a duplicate-prone blank name and a bad image", () => {
    const result = validateServiceDraft({
      name: " ",
      description: "",
      category: "unknown",
      serviceType: "package",
      imageUrl: "javascript:alert(1)",
      listed: true,
    })
    assert.equal(result.ok, false)
    if (result.ok) return
    assert.equal(result.fieldErrors.name, "Enter a service name.")
    assert.equal(result.fieldErrors.imageUrl, "Enter a site image path or https address.")
  })
})

describe("validateOffering", () => {
  it("keeps unknown prices and durations unset", () => {
    const result = validateOffering({
      price: "",
      duration: " ",
      buffer: "",
      active: false,
      bookable: false,
      verificationStatus: "publicly_advertised",
      listed: false,
    })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.value.priceGhs, null)
    assert.equal(result.value.durationMinutes, null)
    assert.equal(result.value.bufferMinutes, 0)
  })

  it("rejects zero and incomplete bookable offerings", () => {
    const zero = validateOffering({
      price: "0",
      duration: "45",
      buffer: "0",
      active: true,
      bookable: false,
      verificationStatus: "studio_confirmed",
      listed: true,
    })
    assert.equal(zero.ok, false)

    const incomplete = validateOffering({
      price: "",
      duration: "45",
      buffer: "10",
      active: true,
      bookable: true,
      verificationStatus: "studio_confirmed",
      listed: true,
    })
    assert.equal(incomplete.ok, false)
    if (incomplete.ok) return
    assert.match(incomplete.fieldErrors.active ?? "", /price and duration/)

    const unconfirmed = validateOffering({
      price: "180",
      duration: "90",
      buffer: "0",
      active: true,
      bookable: true,
      verificationStatus: "publicly_advertised",
      listed: true,
    })
    assert.equal(unconfirmed.ok, false)
    if (unconfirmed.ok) return
    assert.match(unconfirmed.fieldErrors.bookable ?? "", /studio confirms/)

    const unlisted = validateOffering({
      price: "180",
      duration: "90",
      buffer: "0",
      active: true,
      bookable: true,
      verificationStatus: "studio_confirmed",
      listed: false,
    })
    assert.equal(unlisted.ok, false)
    if (unlisted.ok) return
    assert.match(unlisted.fieldErrors.bookable ?? "", /unlisted/)
  })

  it("accepts an active priced offering that is not bookable", () => {
    const result = validateOffering({
      price: "180",
      duration: "90",
      buffer: "15",
      active: true,
      bookable: false,
      verificationStatus: "publicly_advertised",
      listed: true,
    })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.value.priceGhs, 180)
    assert.equal(result.value.isBookable, false)
  })
})

describe("authorization helpers", () => {
  it("lets only an owner edit the catalogue", () => {
    assert.equal(canEditCatalogue("owner"), true)
    assert.equal(canEditCatalogue("manager"), false)
  })

  it("limits a manager to an assigned studio", () => {
    assert.equal(canEditOffering(["accra"], "accra"), true)
    assert.equal(canEditOffering(["accra"], "kumasi"), false)
    assert.equal(canEditOffering(["kumasi"], "kumasi"), true)
  })
})

describe("filterAdminServices", () => {
  it("filters by search, category, and listing", () => {
    assert.equal(filterAdminServices(services, { search: "mink", category: "all", listing: "all" }).length, 1)
    assert.equal(filterAdminServices(services, { search: "", category: "nails", listing: "unlisted" }).length, 1)
    assert.equal(filterAdminServices(services, { search: "", category: "lashes", listing: "unlisted" }).length, 0)
  })
})
