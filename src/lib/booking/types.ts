import type { BranchId } from "@/lib/content"

export const walkInSteps = [
  "type",
  "branch",
  "service",
  "professional",
  "schedule",
  "account",
  "review",
] as const

export const homeSteps = [
  "type",
  "branch",
  "location",
  "service",
  "professional",
  "schedule",
  "account",
  "review",
] as const

export type BookingStepId = (typeof homeSteps)[number]

export type VisitType = "walk-in" | "home"

export type ProfessionalChoice = "anyone" | (string & {})

export type HomeLocation = {
  address: string
  landmark: string
  ghanaPostGps: string
  notes: string
}

export type BookingDraft = {
  visitType: VisitType | null
  branchId: BranchId | null
  location: HomeLocation
  serviceId: string | null
  professionalId: ProfessionalChoice | null
  date: string | null
  time: string | null
}

export type ProfessionalRecord = {
  id: string
  name: string
  branchIds: BranchId[]
  serviceIds: string[]
}

export type TimeSlot = {
  id: string
  startIso: string
  label: string
  professionalId: ProfessionalChoice
}

export type AvailabilitySnapshot =
  | { status: "not_connected"; slots: [] }
  | { status: "ready"; slots: TimeSlot[] }

export type CoverageSnapshot = {
  confirmed: false
  reason: string
}

export type AccountGate = {
  status: "not_connected"
  reason: string
}

export type BookingSubmission = {
  ok: false
  reason: string
}

export type BookingQuery = {
  step?: string
  type?: string
  branch?: string
  service?: string
}
