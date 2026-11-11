import type { AdminRole } from "@/lib/admin/access"

export type ProfessionalProfileInput = {
  fullName: string
  displayName: string
  biography: string
  imageUrl: string
}

export type ProfessionalDraft = ProfessionalProfileInput & {
  active: boolean
  listed: boolean
}

export type NormalizedProfessional = {
  fullName: string
  displayName: string | null
  biography: string | null
  imageUrl: string | null
  active: boolean
  listed: boolean
}

export type FieldErrors = Record<string, string>

export type StudioProfessional = {
  id: string
  fullName: string
  displayName: string | null
  biography: string | null
  imageUrl: string | null
  isActive: boolean
  isListed: boolean
  branchId: string
  branchName: string
  serviceIds: string[]
}

const control = /[\u0000-\u001F\u007F]/

export function canCreateProfessional(role: AdminRole) {
  return role === "owner"
}

export function professionalProfilePayload(
  input: ProfessionalProfileInput & { active?: boolean; listed?: boolean },
): ProfessionalProfileInput {
  return {
    fullName: input.fullName,
    displayName: input.displayName,
    biography: input.biography,
    imageUrl: input.imageUrl,
  }
}

export function validateProfessionalDraft(
  draft: ProfessionalDraft,
  branchId: string | null,
  allowedBranchIds: readonly string[],
): { ok: true; value: NormalizedProfessional & { branchId: string | null } } | { ok: false; fieldErrors: FieldErrors } {
  const fieldErrors: FieldErrors = {}
  const fullName = cleanName(draft.fullName)
  const displayName = cleanOptionalName(draft.displayName)
  const biography = cleanBiography(draft.biography)
  const imageUrl = cleanImage(draft.imageUrl)

  if (!fullName) fieldErrors.fullName = "Enter a professional name."
  if (displayName === false) fieldErrors.displayName = "Enter a display name."
  if (biography === false) fieldErrors.biography = "Enter a shorter biography."
  if (imageUrl === false) fieldErrors.imageUrl = "Enter a site image path or https address."
  if (draft.listed && !draft.active) {
    fieldErrors.listed = "An inactive professional cannot be publicly listed."
  }
  if (branchId !== null && !allowedBranchIds.includes(branchId)) {
    fieldErrors.branchId = "Choose a studio."
  }

  if (Object.keys(fieldErrors).length > 0 || !fullName || displayName === false || biography === false || imageUrl === false) {
    return { ok: false, fieldErrors }
  }

  return {
    ok: true,
    value: {
      fullName,
      displayName,
      biography,
      imageUrl,
      active: draft.active,
      listed: draft.listed,
      branchId,
    },
  }
}

export function filterProfessionals(professionals: StudioProfessional[], search: string) {
  const query = search.trim().toLowerCase()
  if (!query) return professionals
  return professionals.filter((person) =>
    [person.fullName, person.displayName ?? "", person.branchName].join(" ").toLowerCase().includes(query),
  )
}

function cleanName(value: string) {
  const cleaned = value.trim()
  if (cleaned.length < 2 || cleaned.length > 80 || control.test(cleaned)) return null
  return cleaned
}

function cleanOptionalName(value: string) {
  const cleaned = value.trim()
  if (!cleaned) return null
  if (cleaned.length < 2 || cleaned.length > 80 || control.test(cleaned)) return false as const
  return cleaned
}

function cleanBiography(value: string) {
  const cleaned = value.trim()
  if (!cleaned) return null
  if (cleaned.length > 600 || control.test(cleaned)) return false as const
  return cleaned
}

function cleanImage(value: string) {
  const stored = value.trim()
  if (!stored) return null
  if (
    stored.length > 300
    || /\s/.test(stored)
    || stored.includes("\\")
    || !(
      /^https:\/\/[A-Za-z0-9.-]+(\/\S*)?$/.test(stored)
      || (stored.startsWith("/") && /^\/[A-Za-z0-9._~/-]+$/.test(stored) && !stored.includes("//"))
    )
  ) {
    return false as const
  }
  return stored
}
