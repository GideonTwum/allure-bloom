import { serviceCategories, type ServiceCategoryId, type ServiceType, type VerificationStatus } from "@/lib/services/types"

export type ServiceDraft = {
  name: string
  description: string
  category: string
  serviceType: string
  imageUrl: string
  listed: boolean
}

export type NormalizedService = {
  name: string
  description: string
  category: ServiceCategoryId
  serviceType: ServiceType
  imageUrl: string | null
  listed: boolean
}

export type OfferingDraft = {
  price: string
  duration: string
  buffer: string
  active: boolean
  bookable: boolean
  verificationStatus: VerificationStatus
  listed: boolean
}

export type NormalizedOffering = {
  priceGhs: number | null
  durationMinutes: number | null
  bufferMinutes: number
  isActive: boolean
  isBookable: boolean
}

export type FieldErrors = Record<string, string>

function categoryOf(value: string): ServiceCategoryId | null {
  for (const category of serviceCategories) {
    if (category.id === value) return category.id
  }
  return null
}

export function serviceSlug(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug.length > 0 ? slug : null
}

export function serviceIdForName(name: string) {
  const slug = serviceSlug(name)
  if (!slug || slug.length > 60) return null
  const id = `svc_${slug.replaceAll("-", "_")}`
  return id.length <= 64 ? { id, slug } : null
}

export function validateServiceDraft(
  draft: ServiceDraft,
): { ok: true; value: NormalizedService } | { ok: false; fieldErrors: FieldErrors } {
  const fieldErrors: FieldErrors = {}
  const name = draft.name.trim()
  const description = draft.description.trim()
  const identity = serviceIdForName(name)

  if (name.length < 2 || name.length > 80 || !identity) {
    fieldErrors.name = name.length > 80 ? "Enter a shorter service name." : "Enter a service name."
  }
  if (description.length < 1 || description.length > 600) {
    fieldErrors.description = "Enter a service description."
  }
  const category = categoryOf(draft.category)
  if (!category) fieldErrors.category = "Choose a service category."
  if (draft.serviceType !== "treatment" && draft.serviceType !== "addon") {
    fieldErrors.serviceType = "Choose a service type."
  }

  const image = validateImage(draft.imageUrl)
  if (!image.ok) fieldErrors.imageUrl = image.error

  if (!category || Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors }

  return {
    ok: true,
    value: {
      name,
      description,
      category,
      serviceType: draft.serviceType === "addon" ? "addon" : "treatment",
      imageUrl: image.ok ? image.value : null,
      listed: draft.listed,
    },
  }
}

export function validateOffering(
  draft: OfferingDraft,
): { ok: true; value: NormalizedOffering } | { ok: false; fieldErrors: FieldErrors } {
  const fieldErrors: FieldErrors = {}
  const price = parseOptionalWhole(draft.price, "price")
  const duration = parseOptionalWhole(draft.duration, "duration")
  const buffer = parseBuffer(draft.buffer)

  if (!price.ok) fieldErrors.price = price.error
  if (!duration.ok) fieldErrors.duration = duration.error
  if (!buffer.ok) fieldErrors.buffer = buffer.error

  const priceGhs = price.ok ? price.value : null
  const durationMinutes = duration.ok ? duration.value : null
  const configured = price.ok && duration.ok && priceGhs !== null && durationMinutes !== null

  if (draft.active && price.ok && duration.ok && !configured) {
    fieldErrors.active = "An offering needs a price and duration before it can be active."
  }
  if (draft.bookable && !draft.active) {
    fieldErrors.bookable = "An offering must be active before it can be bookable."
  } else if (draft.bookable && price.ok && duration.ok && !configured) {
    fieldErrors.bookable = "An offering needs a price and duration before it can be bookable."
  } else if (draft.bookable && draft.verificationStatus !== "studio_confirmed") {
    fieldErrors.bookable = "A treatment cannot be bookable until the studio confirms it."
  } else if (draft.bookable && !draft.listed) {
    fieldErrors.bookable = "A treatment cannot be bookable while it is unlisted."
  }

  if (Object.keys(fieldErrors).length > 0 || !price.ok || !duration.ok || !buffer.ok) {
    return { ok: false, fieldErrors }
  }

  return {
    ok: true,
    value: {
      priceGhs,
      durationMinutes,
      bufferMinutes: buffer.value,
      isActive: draft.active,
      isBookable: draft.bookable,
    },
  }
}

export function canEditCatalogue(role: string) {
  return role === "owner"
}

export function canEditOffering(branchIds: readonly string[], branchId: string) {
  return branchIds.includes(branchId)
}

export function filterAdminServices<T extends { id: string; name: string; slug: string; category: string; isListed: boolean }>(
  services: T[],
  query: { search: string; category: string; listing: "all" | "listed" | "unlisted" },
) {
  const search = query.search.trim().toLowerCase()
  return services.filter((service) => {
    if (query.category !== "all" && service.category !== query.category) return false
    if (query.listing === "listed" && !service.isListed) return false
    if (query.listing === "unlisted" && service.isListed) return false
    if (!search) return true
    return service.name.toLowerCase().includes(search) || service.slug.toLowerCase().includes(search)
  })
}

function validateImage(value: string): { ok: true; value: string | null } | { ok: false; error: string } {
  const stored = value.trim()
  if (!stored) return { ok: true, value: null }
  const path = /^\/[A-Za-z0-9._~/-]+$/.test(stored) && !stored.includes("//")
  const https = /^https:\/\/[A-Za-z0-9.-]+(\/\S*)?$/.test(stored)
  if (stored.length > 300 || /\s|\\/.test(stored) || !(path || https)) {
    return { ok: false, error: "Enter a site image path or https address." }
  }
  return { ok: true, value: stored }
}

function parseOptionalWhole(
  value: string,
  field: "price" | "duration",
): { ok: true; value: number | null } | { ok: false; error: string } {
  const trimmed = value.trim()
  if (!trimmed) return { ok: true, value: null }
  if (!/^[1-9]\d*$/.test(trimmed)) {
    return {
      ok: false,
      error:
        field === "price"
          ? "A price must be a whole number of cedis greater than zero, or left unset."
          : "Duration must be a positive number of minutes, or left unset.",
    }
  }
  const parsed = Number(trimmed)
  const maximum = field === "price" ? 100000 : 480
  if (parsed > maximum) {
    return {
      ok: false,
      error: field === "price" ? "Enter a smaller price." : "Enter a shorter duration.",
    }
  }
  return { ok: true, value: parsed }
}

function parseBuffer(value: string): { ok: true; value: number } | { ok: false; error: string } {
  const trimmed = value.trim()
  if (!trimmed) return { ok: true, value: 0 }
  if (!/^(0|[1-9]\d*)$/.test(trimmed)) {
    return { ok: false, error: "Buffer time must be zero or a positive number of minutes." }
  }
  const parsed = Number(trimmed)
  if (parsed > 180) return { ok: false, error: "Enter a shorter buffer time." }
  return { ok: true, value: parsed }
}
