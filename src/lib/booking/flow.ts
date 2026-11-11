import type { BranchId } from "@/lib/content"
import type { CatalogueSnapshot } from "@/lib/catalogue/types"
import { bookableServicesAt } from "@/lib/services/bookable"
import {
  accountGate,
  homeCoverage,
  isKnownProfessional,
  offeredSlots,
  visitMoment,
} from "@/lib/booking/dependencies"
import {
  homeSteps,
  walkInSteps,
  type BookingDraft,
  type BookingQuery,
  type BookingStepId,
  type HomeLocation,
  type VisitType,
} from "@/lib/booking/types"

export const bookingPolicy = {
  leadTimeHours: 24,
  walkIn: {
    payment: "Payment is taken at the studio.",
    cancellationHours: 12,
    confirmation:
      "A walk-in is confirmed only after the server checks that the time is free.",
  },
  home: {
    payment: "Online payment is requested only after a manager approves the visit.",
    cancellationHours: 24,
    confirmation: "A home visit is confirmed only after that payment is verified.",
    lifecycle: ["Pending approval", "Awaiting payment", "Confirmed"] as const,
    refunds: "A refund waits for a manager to review it.",
  },
} as const

const stepLabels: Record<BookingStepId, string> = {
  type: "Type",
  branch: "Studio",
  location: "Address",
  service: "Service",
  professional: "Professional",
  schedule: "Time",
  account: "Account",
  review: "Review",
}

export function stepLabel(step: BookingStepId) {
  return stepLabels[step]
}

export function emptyLocation(): HomeLocation {
  return { address: "", landmark: "", ghanaPostGps: "", notes: "" }
}

export function emptyDraft(): BookingDraft {
  return {
    visitType: null,
    branchId: null,
    location: emptyLocation(),
    serviceId: null,
    professionalId: null,
    date: null,
    time: null,
  }
}

export function stepsFor(visitType: VisitType | null): readonly BookingStepId[] {
  return visitType === "home" ? homeSteps : walkInSteps
}

export function selectVisitType(draft: BookingDraft, visitType: VisitType): BookingDraft {
  if (draft.visitType === visitType) return draft
  return {
    ...draft,
    visitType,
    location: visitType === "home" ? draft.location : emptyLocation(),
    serviceId: null,
    professionalId: null,
    date: null,
    time: null,
  }
}

export function selectBranch(draft: BookingDraft, branchId: BranchId): BookingDraft {
  if (draft.branchId === branchId) return draft
  return {
    ...draft,
    branchId,
    serviceId: null,
    professionalId: null,
    date: null,
    time: null,
  }
}

export function selectService(draft: BookingDraft, serviceId: string): BookingDraft {
  if (draft.serviceId === serviceId) return draft
  return {
    ...draft,
    serviceId,
    professionalId: null,
    date: null,
    time: null,
  }
}

export function selectProfessional(
  draft: BookingDraft,
  professionalId: BookingDraft["professionalId"],
): BookingDraft {
  if (draft.professionalId === professionalId) return draft
  return { ...draft, professionalId, date: null, time: null }
}

export function blockerFor(
  step: BookingStepId,
  draft: BookingDraft,
  menu: CatalogueSnapshot,
): string | null {
  if (step === "type") {
    return draft.visitType ? null : "Choose a walk-in visit or a home service."
  }
  if (!draft.visitType) return "Choose a booking type first."

  if (step === "branch") {
    if (menu.studios.length === 0) {
      return "No studios were returned, so a visit cannot be chosen."
    }
    if (!draft.branchId || !menu.studios.some((studio) => studio.id === draft.branchId)) {
      return "Choose a studio before a treatment."
    }
    return null
  }
  if (!draft.branchId || !menu.studios.some((studio) => studio.id === draft.branchId)) {
    return "Choose a studio first."
  }

  if (step === "location") {
    if (!draft.location.address.trim() || !draft.location.landmark.trim()) {
      return "Enter the address and a nearby landmark."
    }
    return homeCoverage(draft.branchId, draft.location.address).reason
  }

  if (draft.visitType === "home" && blockerFor("location", draft, menu)) {
    return blockerFor("location", draft, menu)
  }

  if (step === "service") {
    const offered = bookableServicesAt(menu, draft.branchId)
    if (offered.length === 0) {
      return "No treatment at this studio has a confirmed price, duration, and booking setup."
    }
    if (!draft.serviceId || !offered.some((service) => service.id === draft.serviceId)) {
      return "Choose a treatment offered at this studio."
    }
    return null
  }

  if (!draft.serviceId || blockerFor("service", draft, menu)) {
    return blockerFor("service", draft, menu)
  }

  if (step === "professional") {
    if (
      draft.professionalId &&
      isKnownProfessional(draft.branchId, draft.serviceId, draft.professionalId)
    ) {
      return null
    }
    return "Choose Anyone Available, or a professional published for this treatment."
  }

  if (!draft.professionalId || blockerFor("professional", draft, menu)) {
    return blockerFor("professional", draft, menu)
  }

  if (step === "schedule") {
    const slots = offeredSlots(draft)
    if (slots.length === 0) {
      return "No appointment times are available. The studio calendar is not connected, so nothing can be held."
    }
    if (!draft.date || !draft.time) return "Choose a date and time."
    const selected = slots.some((slot) => {
      const moment = visitMoment(slot.startIso)
      return moment?.date === draft.date && moment.time === draft.time
    })
    return selected ? null : "That time is not available."
  }

  if (step === "account" || step === "review") {
    const schedule = blockerFor("schedule", draft, menu)
    if (schedule) return schedule
    return accountGate().reason
  }

  return null
}

export function furthestStepIndex(draft: BookingDraft, menu: CatalogueSnapshot) {
  const steps = stepsFor(draft.visitType)
  for (let index = 0; index < steps.length; index += 1) {
    if (blockerFor(steps[index], draft, menu)) return index
  }
  return steps.length - 1
}

export function clampStep(
  step: BookingStepId,
  draft: BookingDraft,
  menu: CatalogueSnapshot,
): BookingStepId {
  const steps = stepsFor(draft.visitType)
  const requested = steps.indexOf(step)
  const furthest = furthestStepIndex(draft, menu)
  const index = requested < 0 ? 0 : Math.min(requested, furthest)
  return steps[index]
}

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export function draftFromQuery(
  query: BookingQuery,
  menu: CatalogueSnapshot,
): {
  draft: BookingDraft
  step: BookingStepId
} {
  const type = one(query.type)
  const branch = one(query.branch)
  const visitType = type === "walk-in" || type === "home" ? type : null
  const studio = menu.studios.find((item) => item.id === branch)
  const branchId = studio?.id ?? null
  const offered = branchId ? bookableServicesAt(menu, branchId) : []
  const requestedSlug = one(query.service)
  const service = offered.find((item) => item.slug === requestedSlug) ?? null
  const draft: BookingDraft = {
    ...emptyDraft(),
    visitType,
    branchId,
    serviceId: service?.id ?? null,
  }
  const requested = one(query.step)
  const step = stepsFor(visitType).find((item) => item === requested) ?? "type"
  return { draft, step: clampStep(step, draft, menu) }
}

export function publicQuery(
  draft: BookingDraft,
  step: BookingStepId,
  menu: CatalogueSnapshot,
) {
  const params = new URLSearchParams()
  params.set("step", step)
  if (draft.visitType) params.set("type", draft.visitType)
  if (draft.branchId) params.set("branch", draft.branchId)
  const service = draft.branchId
    ? bookableServicesAt(menu, draft.branchId).find((item) => item.id === draft.serviceId)
    : null
  if (service) params.set("service", service.slug)
  return params
}

export function branchName(branchId: BranchId | null, menu: CatalogueSnapshot) {
  return menu.studios.find((studio) => studio.id === branchId)?.name ?? "Not chosen"
}

export function advance(
  draft: BookingDraft,
  step: BookingStepId,
  menu: CatalogueSnapshot,
) {
  const steps = stepsFor(draft.visitType)
  const index = steps.indexOf(clampStep(step, draft, menu))
  return steps[Math.min(index + 1, steps.length - 1)]
}

export function retreat(
  draft: BookingDraft,
  step: BookingStepId,
  menu: CatalogueSnapshot,
) {
  const steps = stepsFor(draft.visitType)
  const index = Math.max(0, steps.indexOf(clampStep(step, draft, menu)))
  return steps[Math.max(0, index - 1)]
}
