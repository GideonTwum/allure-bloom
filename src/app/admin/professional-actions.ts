"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { loginPath } from "@/lib/admin/access"
import {
  canCreateProfessional,
  professionalProfilePayload,
  validateProfessionalDraft,
  type FieldErrors,
} from "@/lib/admin/professional-input"
import { readAdminAccess } from "@/lib/admin/session"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export type ProfessionalActionState = {
  error?: string
  fieldErrors?: FieldErrors
  saved?: boolean
}

export async function createProfessional(
  _state: ProfessionalActionState,
  formData: FormData,
): Promise<ProfessionalActionState> {
  const access = await readAdminAccess(null)
  if (access.status === "signed_out") redirect(loginPath("/admin/professionals", access.sessionEnded))
  if (access.status !== "ready" || !canCreateProfessional(access.scope.role)) {
    return { error: "You cannot add a professional." }
  }

  const branchId = text(formData, "branchId")
  const validated = validateProfessionalDraft(
    draftFrom(formData),
    branchId,
    access.scope.branches.map((branch) => branch.id),
  )
  if (!validated.ok) return { fieldErrors: validated.fieldErrors }
  if (!validated.value.branchId) return { fieldErrors: { branchId: "Choose a studio." } }

  const supabase = await createServerSupabaseClient()
  const created = await supabase.rpc("admin_create_professional", {
    professional_name: validated.value.fullName,
    professional_display: validated.value.displayName,
    professional_biography: validated.value.biography,
    image_ref: validated.value.imageUrl,
    target_branch: validated.value.branchId,
    active: validated.value.active,
    listed: validated.value.listed,
  })
  if (created.error) return { error: friendlyError(created.error) }
  refreshProfessionals()
  return { saved: true }
}

export async function saveProfessional(
  _state: ProfessionalActionState,
  formData: FormData,
): Promise<ProfessionalActionState> {
  const access = await editorAccess()
  if (!access.ok) return { error: access.error }

  const professionalId = text(formData, "professionalId")
  if (!isUuid(professionalId)) return { error: "That professional could not be found." }
  const profileInput = professionalProfilePayload({
    fullName: text(formData, "fullName"),
    displayName: text(formData, "displayName"),
    biography: text(formData, "biography"),
    imageUrl: text(formData, "imageUrl"),
    active: formData.get("active") === "true",
    listed: formData.get("listed") === "true",
  })
  const validated = validateProfessionalDraft(
    { ...profileInput, active: true, listed: false },
    null,
    access.branches,
  )
  if (!validated.ok) return { fieldErrors: validated.fieldErrors }

  const supabase = await createServerSupabaseClient()
  const profile = await supabase.rpc("admin_update_professional_profile", {
    target_professional: professionalId,
    professional_name: validated.value.fullName,
    professional_display: validated.value.displayName,
    professional_biography: validated.value.biography,
    image_ref: validated.value.imageUrl,
  })
  if (profile.error) return { error: friendlyError(profile.error) }
  refreshProfessionals()
  return { saved: true }
}

export async function setProfessionalActive(
  _state: ProfessionalActionState,
  formData: FormData,
): Promise<ProfessionalActionState> {
  const access = await editorAccess()
  if (!access.ok) return { error: access.error }
  const professionalId = text(formData, "professionalId")
  const active = text(formData, "active")
  if (!isUuid(professionalId) || (active !== "true" && active !== "false")) {
    return { error: "That professional could not be found." }
  }

  const supabase = await createServerSupabaseClient()
  const saved = await supabase.rpc("admin_set_professional_active", {
    target_professional: professionalId,
    active: active === "true",
  })
  if (saved.error) return { error: friendlyError(saved.error) }
  refreshProfessionals()
  return { saved: true }
}

export async function setProfessionalListed(
  _state: ProfessionalActionState,
  formData: FormData,
): Promise<ProfessionalActionState> {
  const access = await editorAccess()
  if (!access.ok) return { error: access.error }
  const professionalId = text(formData, "professionalId")
  const listed = text(formData, "listed")
  if (!isUuid(professionalId) || (listed !== "true" && listed !== "false")) {
    return { error: "That professional could not be found." }
  }

  const supabase = await createServerSupabaseClient()
  const saved = await supabase.rpc("admin_set_professional_listed", {
    target_professional: professionalId,
    listed: listed === "true",
  })
  if (saved.error) return { error: friendlyError(saved.error) }
  refreshProfessionals()
  return { saved: true }
}

export async function addProfessionalQualification(
  _state: ProfessionalActionState,
  formData: FormData,
): Promise<ProfessionalActionState> {
  const access = await editorAccess()
  if (!access.ok) return { error: access.error }
  const professionalId = text(formData, "professionalId")
  const serviceId = text(formData, "serviceId")
  if (!isUuid(professionalId) || !/^[a-z0-9_]{1,64}$/.test(serviceId)) {
    return { error: "Choose a service." }
  }

  const supabase = await createServerSupabaseClient()
  const added = await supabase.rpc("admin_add_professional_qualification", {
    target_professional: professionalId,
    target_service: serviceId,
  })
  if (added.error) return { error: friendlyError(added.error) }
  refreshProfessionals()
  return { saved: true }
}

export async function removeProfessionalQualification(
  _state: ProfessionalActionState,
  formData: FormData,
): Promise<ProfessionalActionState> {
  const access = await editorAccess()
  if (!access.ok) return { error: access.error }
  const professionalId = text(formData, "professionalId")
  const serviceId = text(formData, "serviceId")
  if (!isUuid(professionalId) || !/^[a-z0-9_]{1,64}$/.test(serviceId)) {
    return { error: "That qualification could not be found." }
  }

  const supabase = await createServerSupabaseClient()
  const removed = await supabase.rpc("admin_remove_professional_qualification", {
    target_professional: professionalId,
    target_service: serviceId,
  })
  if (removed.error) return { error: friendlyError(removed.error) }
  refreshProfessionals()
  return { saved: true }
}

async function editorAccess(): Promise<{ ok: true; branches: string[] } | { ok: false; error: string }> {
  const access = await readAdminAccess(null)
  if (access.status === "signed_out") redirect(loginPath("/admin/professionals", access.sessionEnded))
  if (access.status !== "ready") return { ok: false, error: "You cannot change that professional." }
  return { ok: true, branches: access.scope.branches.map((branch) => branch.id) }
}

function draftFrom(formData: FormData) {
  return {
    fullName: text(formData, "fullName"),
    displayName: text(formData, "displayName"),
    biography: text(formData, "biography"),
    imageUrl: text(formData, "imageUrl"),
    active: formData.get("active") === "true",
    listed: formData.get("listed") === "true",
  }
}

function text(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === "string" ? value : ""
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function friendlyError(error: { message?: string }) {
  const message = error.message ?? ""
  if (/not authorized/i.test(message)) return "You do not have permission to make that change."
  if (/unknown studio/i.test(message)) return "Choose a studio."
  if (/enter a professional name/i.test(message)) return "Enter a professional name."
  if (/enter a display name/i.test(message)) return "Enter a display name."
  if (/shorter biography/i.test(message)) return "Enter a shorter biography."
  if (/image path/i.test(message)) return "Enter a site image path or https address."
  if (/inactive professional cannot be publicly listed/i.test(message)) {
    return "An inactive professional cannot be publicly listed."
  }
  if (/without an active studio/i.test(message)) {
    return "A professional needs an active studio before they can be listed."
  }
  if (/service does not exist/i.test(message)) return "That service could not be found."
  if (/qualification is already active/i.test(message)) return "That qualification is already saved."
  if (/qualification is not active/i.test(message)) return "That qualification is not saved."
  if (/professional does not exist/i.test(message)) return "That professional could not be found."
  if (/could not find the function|professional management requires/i.test(message)) {
    return "Professional management is not available yet."
  }
  return "The professional could not be saved."
}

function refreshProfessionals() {
  revalidatePath("/admin/professionals")
  revalidatePath("/admin")
}
