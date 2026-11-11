import type { BranchId } from "@/lib/content"
import type { HomeLocation, ProfessionalRecord, VisitType } from "@/lib/booking/types"
import {
  serviceCategories,
  type BranchService,
  type ServiceCategoryId,
  type ServiceRecord,
  type ServiceType,
  type VerificationStatus,
} from "@/lib/services/types"

/**
 * Column names after the booking security migrations.
 * Catalogue listing stays on services. Price, duration, buffer, activation,
 * and bookability stay on branch_services. A held home visit stores
 * hold_expires_at. A payment reference is not a column on a home-service
 * request. These mappers do not query Supabase.
 */
export const serviceColumns = {
  id: "id",
  slug: "slug",
  name: "name",
  description: "description",
  category: "category",
  serviceType: "service_type",
  imageUrl: "image_url",
  isListed: "is_listed",
  verificationStatus: "verification_status",
  sourceUrl: "source_url",
  lastVerifiedAt: "last_verified_at",
} as const

export const branchColumns = {
  id: "id",
  name: "name",
  area: "area",
  phoneDisplay: "phone_display",
  phoneE164: "phone_e164",
  mapQuery: "map_query",
} as const

export const branchServiceColumns = {
  branchId: "branch_id",
  serviceId: "service_id",
  priceGhs: "price_ghs",
  durationMinutes: "duration_minutes",
  bufferMinutes: "buffer_minutes",
  isActive: "is_active",
  isBookable: "is_bookable",
} as const

export const professionalColumns = {
  id: "id",
  name: "display_name",
  isActive: "is_active",
  isListed: "is_listed",
} as const

export const professionalServiceColumns = {
  professionalId: "professional_id",
  branchId: "branch_id",
  serviceId: "service_id",
} as const

export const appointmentColumns = {
  id: "id",
  customerId: "customer_id",
  visitType: "visit_type",
  branchId: "branch_id",
  serviceId: "service_id",
  professionalId: "professional_id",
  preferredProfessionalId: "preferred_professional_id",
  startsAt: "starts_at",
  endsAt: "ends_at",
  priceGhs: "price_ghs",
  durationMinutes: "duration_minutes",
  bufferMinutes: "buffer_minutes",
  holdExpiresAt: "hold_expires_at",
  status: "status",
  confirmedAt: "confirmed_at",
} as const

export const homeServiceRequestColumns = {
  id: "id",
  customerId: "customer_id",
  branchId: "branch_id",
  serviceId: "service_id",
  preferredProfessionalId: "preferred_professional_id",
  address: "address",
  landmark: "landmark",
  ghanaPostGps: "ghana_post_gps",
  notes: "notes",
  startsAt: "starts_at",
  endsAt: "ends_at",
  coverageConfirmed: "coverage_confirmed",
  status: "status",
  paymentState: "payment_state",
  appointmentId: "appointment_id",
  approvedAt: "approved_at",
  paymentVerifiedAt: "payment_verified_at",
} as const

export const bookingPolicyColumns = {
  visitType: "visit_type",
  leadTimeHours: "lead_time_hours",
  cancellationCutoffHours: "cancellation_cutoff_hours",
  confirmationMode: "confirmation_mode",
  paymentTiming: "payment_timing",
} as const

export type ServiceRow = {
  id: string
  slug: string
  name: string
  description: string
  category: string
  service_type: string
  image_url: string | null
  is_listed: boolean
  verification_status: string
  source_url: string | null
  last_verified_at: string | null
}

export type BranchRow = {
  id: string
  name: string
  area: string
  phone_display: string | null
  phone_e164: string | null
  map_query: string | null
}

export type BranchServiceRow = {
  branch_id: string
  service_id: string
  price_ghs: number | null
  duration_minutes: number | null
  buffer_minutes: number
  is_active: boolean
  is_bookable: boolean
}

export type ProfessionalRow = {
  id: string
  display_name: string
  is_active: boolean
  is_listed: boolean
}

export type ProfessionalServiceRow = {
  professional_id: string
  branch_id: string
  service_id: string
}

export type AppointmentStatus = "requested" | "held" | "confirmed" | "cancelled"

export type AppointmentRow = {
  id: string
  customer_id: string
  visit_type: string
  branch_id: string
  service_id: string
  professional_id: string | null
  preferred_professional_id: string | null
  starts_at: string
  ends_at: string
  price_ghs: number | null
  duration_minutes: number | null
  buffer_minutes: number | null
  hold_expires_at: string | null
  status: string
  confirmed_at: string | null
}

export type HomeRequestStatus =
  | "pending_approval"
  | "awaiting_payment"
  | "confirmed"
  | "declined"
  | "cancelled"
  | "refund_review"

export type HomeServiceRequestRow = {
  id: string
  customer_id: string
  branch_id: string
  service_id: string
  preferred_professional_id: string | null
  address: string
  landmark: string
  ghana_post_gps: string | null
  notes: string | null
  starts_at: string
  ends_at: string
  coverage_confirmed: boolean
  status: string
  payment_state: string
  appointment_id: string | null
  approved_at: string | null
  payment_verified_at: string | null
}

export type BookingPolicyRow = {
  visit_type: string
  lead_time_hours: number
  cancellation_cutoff_hours: number
  confirmation_mode: string
  payment_timing: string
}

export type BranchServiceConfiguration = BranchService & {
  priceGhs: number | null
  durationMinutes: number | null
  bufferMinutes: number
  isActive: boolean
  isBookable: boolean
}

export type ProfessionalEligibility = {
  professionalId: string
  branchId: BranchId
  serviceId: string
}

const homeStatusLabels: Record<HomeRequestStatus, string> = {
  pending_approval: "Pending approval",
  awaiting_payment: "Awaiting payment",
  confirmed: "Confirmed",
  declined: "Declined",
  cancelled: "Cancelled",
  refund_review: "Refund review",
}

export type Studio = {
  id: BranchId
  name: string
  area: string
  phoneDisplay: string | null
  phoneE164: string | null
  mapQuery: string | null
}

export function toBranchId(value: string): BranchId | null {
  if (value === "accra" || value === "kumasi") return value
  return null
}

export function toStudio(row: BranchRow): Studio | null {
  const id = toBranchId(row.id)
  const name = publishedText(row.name)
  const area = publishedText(row.area)
  if (!id || !name || !area) return null
  return {
    id,
    name,
    area,
    phoneDisplay: publishedText(row.phone_display),
    phoneE164: publishedText(row.phone_e164),
    mapQuery: publishedText(row.map_query),
  }
}

export function studioPhoneHref(studio: Studio) {
  return studio.phoneE164 ? `tel:${studio.phoneE164}` : null
}

function publishedText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? ""
  return trimmed.length > 0 ? trimmed : null
}

export function parseServiceRows(value: unknown): ServiceRow[] | null {
  if (!Array.isArray(value)) return null
  const rows: ServiceRow[] = []
  for (const item of value) {
    const row = parseServiceRow(item)
    if (!row) return null
    rows.push(row)
  }
  return rows
}

export function parseBranchRows(value: unknown): BranchRow[] | null {
  if (!Array.isArray(value)) return null
  const rows: BranchRow[] = []
  for (const item of value) {
    const row = parseBranchRow(item)
    if (!row) return null
    rows.push(row)
  }
  return rows
}

export function parseBranchServiceRows(value: unknown): BranchServiceRow[] | null {
  if (!Array.isArray(value)) return null
  const rows: BranchServiceRow[] = []
  for (const item of value) {
    const row = parseBranchServiceRow(item)
    if (!row) return null
    rows.push(row)
  }
  return rows
}

function parseServiceRow(value: unknown): ServiceRow | null {
  if (!isRecord(value)) return null
  if (
    typeof value.id !== "string" ||
    typeof value.slug !== "string" ||
    typeof value.name !== "string" ||
    typeof value.description !== "string" ||
    typeof value.category !== "string" ||
    typeof value.service_type !== "string" ||
    typeof value.is_listed !== "boolean" ||
    typeof value.verification_status !== "string" ||
    !nullableString(value.image_url) ||
    !nullableString(value.source_url) ||
    !nullableString(value.last_verified_at)
  ) {
    return null
  }
  return {
    id: value.id,
    slug: value.slug,
    name: value.name,
    description: value.description,
    category: value.category,
    service_type: value.service_type,
    image_url: value.image_url,
    is_listed: value.is_listed,
    verification_status: value.verification_status,
    source_url: value.source_url,
    last_verified_at: value.last_verified_at,
  }
}

function parseBranchRow(value: unknown): BranchRow | null {
  if (!isRecord(value)) return null
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.area !== "string" ||
    !nullableString(value.phone_display) ||
    !nullableString(value.phone_e164) ||
    !nullableString(value.map_query)
  ) {
    return null
  }
  return {
    id: value.id,
    name: value.name,
    area: value.area,
    phone_display: value.phone_display,
    phone_e164: value.phone_e164,
    map_query: value.map_query,
  }
}

function parseBranchServiceRow(value: unknown): BranchServiceRow | null {
  if (!isRecord(value)) return null
  if (
    typeof value.branch_id !== "string" ||
    typeof value.service_id !== "string" ||
    !nullableNumber(value.price_ghs) ||
    !nullableNumber(value.duration_minutes) ||
    typeof value.buffer_minutes !== "number" ||
    !Number.isFinite(value.buffer_minutes) ||
    typeof value.is_active !== "boolean" ||
    typeof value.is_bookable !== "boolean"
  ) {
    return null
  }
  return {
    branch_id: value.branch_id,
    service_id: value.service_id,
    price_ghs: value.price_ghs,
    duration_minutes: value.duration_minutes,
    buffer_minutes: value.buffer_minutes,
    is_active: value.is_active,
    is_bookable: value.is_bookable,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string"
}

function nullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value))
}

export function toCatalogueService(row: ServiceRow): ServiceRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    category: categoryId(row.category),
    serviceType: serviceType(row.service_type),
    priceGhs: null,
    durationMinutes: null,
    imageUrl: row.image_url,
    branchIds: [],
    isActive: row.is_listed,
    isBookable: false,
    verificationStatus: verificationStatus(row.verification_status),
    sourceUrl: row.source_url ?? "",
    lastVerifiedAt: row.last_verified_at ?? "",
  }
}

export function toBranchService(row: BranchServiceRow): BranchServiceConfiguration | null {
  const branchId = toBranchId(row.branch_id)
  if (!branchId) return null
  return {
    branchId,
    serviceId: row.service_id,
    priceGhs: row.price_ghs,
    durationMinutes: row.duration_minutes,
    bufferMinutes: row.buffer_minutes,
    isActive: row.is_active,
    isBookable: row.is_bookable,
  }
}

export function offeringIsBookable(service: ServiceRow, offering: BranchServiceRow) {
  return (
    service.is_listed &&
    service.verification_status === "studio_confirmed" &&
    offering.service_id === service.id &&
    offering.is_active &&
    offering.is_bookable &&
    offering.price_ghs !== null &&
    offering.duration_minutes !== null
  )
}

/** Branch-scoped view of the existing service model. Price is never copied from another studio. */
export function toServiceRecordAtBranch(
  service: ServiceRow,
  offering: BranchServiceRow | null,
): ServiceRecord {
  const catalogue = toCatalogueService(service)
  const branchId = offering ? toBranchId(offering.branch_id) : null
  if (!offering || !branchId || offering.service_id !== service.id) return catalogue
  return {
    ...catalogue,
    priceGhs: offering.price_ghs,
    durationMinutes: offering.duration_minutes,
    branchIds: offering.is_active ? [branchId] : [],
    isBookable: offeringIsBookable(service, offering),
  }
}

export function toProfessionalEligibility(
  row: ProfessionalServiceRow,
): ProfessionalEligibility | null {
  const branchId = toBranchId(row.branch_id)
  if (!branchId) return null
  return {
    professionalId: row.professional_id,
    branchId,
    serviceId: row.service_id,
  }
}

export function isEligibleFor(
  links: ProfessionalEligibility[],
  branchId: BranchId,
  serviceId: string,
  professionalId: string,
) {
  return links.some(
    (link) =>
      link.professionalId === professionalId &&
      link.branchId === branchId &&
      link.serviceId === serviceId,
  )
}

/**
 * Existing staff model. branchIds and serviceIds are separate lists, so the
 * precise pairing stays in ProfessionalEligibility.
 */
export function toProfessionalRecord(
  row: ProfessionalRow,
  links: ProfessionalEligibility[],
): ProfessionalRecord {
  const ownLinks = links.filter((link) => link.professionalId === row.id)
  return {
    id: row.id,
    name: row.display_name,
    branchIds: [...new Set(ownLinks.map((link) => link.branchId))],
    serviceIds: [...new Set(ownLinks.map((link) => link.serviceId))],
  }
}

export function toHomeLocation(row: HomeServiceRequestRow): HomeLocation {
  return {
    address: row.address,
    landmark: row.landmark,
    ghanaPostGps: row.ghana_post_gps ?? "",
    notes: row.notes ?? "",
  }
}

export function toHomeStatusLabel(status: HomeRequestStatus) {
  return homeStatusLabels[status]
}

export function toVisitType(value: string): VisitType | null {
  if (value === "walk-in" || value === "home") return value
  return null
}

export function toAppointmentStatus(value: string): AppointmentStatus | null {
  if (
    value === "requested" ||
    value === "held" ||
    value === "confirmed" ||
    value === "cancelled"
  ) {
    return value
  }
  return null
}

export function toHomeRequestStatus(value: string): HomeRequestStatus | null {
  if (
    value === "pending_approval" ||
    value === "awaiting_payment" ||
    value === "confirmed" ||
    value === "declined" ||
    value === "cancelled" ||
    value === "refund_review"
  ) {
    return value
  }
  return null
}

export function toBookingPolicy(row: BookingPolicyRow) {
  const visitType = toVisitType(row.visit_type)
  if (!visitType) return null
  return {
    visitType,
    leadTimeHours: row.lead_time_hours,
    cancellationCutoffHours: row.cancellation_cutoff_hours,
    confirmationMode: row.confirmation_mode,
    paymentTiming: row.payment_timing,
  }
}

function categoryId(value: string): ServiceCategoryId {
  const found = serviceCategories.find((category) => category.id === value)
  if (!found) throw new Error("Unknown service category")
  return found.id
}

function serviceType(value: string): ServiceType {
  if (value === "treatment" || value === "addon") return value
  throw new Error("Unknown service type")
}

function verificationStatus(value: string): VerificationStatus {
  if (value === "publicly_advertised" || value === "studio_confirmed") return value
  throw new Error("Unknown verification status")
}
