import type { BranchId } from "@/lib/content"

import type {
  AccountGate,
  AvailabilitySnapshot,
  BookingDraft,
  BookingSubmission,
  CoverageSnapshot,
  ProfessionalChoice,
  ProfessionalRecord,
  TimeSlot,
} from "@/lib/booking/types"

/**
 * Staff, times, coverage, and payment stay disconnected.
 * Bookable treatments come from the Supabase catalogue passed into the flow.
 */
const professionalRoster: ProfessionalRecord[] = []

export function listEligibleProfessionals(
  branchId: BranchId,
  serviceId: string,
): ProfessionalRecord[] {
  return professionalRoster.filter(
    (person) =>
      person.branchIds.includes(branchId) && person.serviceIds.includes(serviceId),
  )
}

export function availabilityFor(
  draft: Pick<BookingDraft, "branchId" | "serviceId" | "professionalId">,
): AvailabilitySnapshot {
  const canQuery = Boolean(draft.branchId && draft.serviceId && draft.professionalId)
  return { status: "not_connected", slots: canQuery ? [] : [] }
}

export function slotsBeyondLeadTime(
  slots: TimeSlot[],
  now = new Date(),
): TimeSlot[] {
  const earliest = now.getTime() + 24 * 60 * 60 * 1000
  return slots.filter((slot) => Date.parse(slot.startIso) >= earliest)
}

export function visitMoment(iso: string) {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return null
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Accra",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(parsed)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value
  const year = value("year")
  const month = value("month")
  const day = value("day")
  const hour = value("hour")
  const minute = value("minute")
  if (!year || !month || !day || !hour || !minute) return null
  return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` }
}

export function offeredSlots(draft: BookingDraft, now = new Date()): TimeSlot[] {
  const snapshot = availabilityFor(draft)
  if (snapshot.status === "not_connected") return []
  return slotsBeyondLeadTime(snapshot.slots, now)
}

export function homeCoverage(
  branchId: BranchId | null,
  address: string,
): CoverageSnapshot {
  if (branchId !== "accra" && branchId !== "kumasi") {
    return {
      confirmed: false,
      reason: "Choose a studio before home-service coverage can be checked.",
    }
  }
  if (!address.trim()) {
    return {
      confirmed: false,
      reason: "Enter an address before home-service coverage can be checked.",
    }
  }
  return {
    confirmed: false,
    reason:
      "Home-service coverage is not confirmed for either studio. This address cannot be accepted yet.",
  }
}

export function accountGate(): AccountGate {
  return {
    status: "not_connected",
    reason:
      "Sign-in is not connected. An account is required before a request can be sent, and this page cannot sign you in.",
  }
}

export function isKnownProfessional(
  branchId: BranchId,
  serviceId: string,
  professionalId: ProfessionalChoice,
): boolean {
  if (professionalId === "anyone") return true
  return listEligibleProfessionals(branchId, serviceId).some(
    (person) => person.id === professionalId,
  )
}

export function submitBookingDraft(draft: BookingDraft): BookingSubmission {
  const studio = draft.branchId === "kumasi" ? "Kumasi" : "Accra"
  return {
    ok: false,
    reason: `The booking service is not connected. No appointment was created, held, or confirmed${draft.branchId ? ` for ${studio}` : ""}.`,
  }
}
