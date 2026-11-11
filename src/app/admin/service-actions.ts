"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { loginPath } from "@/lib/admin/access"
import { readAdminAccess } from "@/lib/admin/session"
import {
  canEditCatalogue,
  canEditOffering,
  validateOffering,
  validateServiceDraft,
  type FieldErrors,
} from "@/lib/admin/service-input"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export type ServiceActionState = {
  error?: string
  fieldErrors?: FieldErrors
  saved?: boolean
}

export async function saveService(
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const access = await readAdminAccess(null)
  if (access.status === "signed_out") redirect(loginPath("/admin/services", access.sessionEnded))
  if (access.status !== "ready" || !canEditCatalogue(access.scope.role)) {
    return { error: "You cannot change the service catalogue." }
  }

  const validated = validateServiceDraft({
    name: text(formData, "name"),
    description: text(formData, "description"),
    category: text(formData, "category"),
    serviceType: text(formData, "serviceType"),
    imageUrl: text(formData, "imageUrl"),
    listed: formData.get("listed") === "true",
  })
  if (!validated.ok) return { fieldErrors: validated.fieldErrors }

  const serviceId = text(formData, "serviceId")
  const supabase = await createServerSupabaseClient()
  const payload = {
    service_name: validated.value.name,
    service_description: validated.value.description,
    service_category: validated.value.category,
    service_kind: validated.value.serviceType,
    image_ref: validated.value.imageUrl,
    listed: validated.value.listed,
  }
  const result = serviceId
    ? await supabase.rpc("admin_update_service", { target_service: serviceId, ...payload })
    : await supabase.rpc("admin_create_service", payload)

  if (result.error) return { error: friendlyError(result.error) }
  refreshCatalogue()
  return { saved: true }
}

export async function saveOffering(
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const branchId = text(formData, "branchId")
  const serviceId = text(formData, "serviceId")
  const access = await readAdminAccess(branchId)
  if (access.status === "signed_out") redirect(loginPath("/admin/services", access.sessionEnded))
  if (
    access.status !== "ready" ||
    access.scope.unauthorizedRequest ||
    !canEditOffering(
      access.scope.branches.map((branch) => branch.id),
      branchId,
    )
  ) {
    return { error: "You cannot change that studio." }
  }

  const supabase = await createServerSupabaseClient()
  const services = await supabase.rpc("admin_list_services")
  if (services.error) return { error: friendlyError(services.error) }
  const service = serviceFacts(services.data, serviceId)
  if (!service) return { error: "That service could not be found." }

  const validated = validateOffering({
    price: text(formData, "price"),
    duration: text(formData, "duration"),
    buffer: text(formData, "buffer"),
    active: formData.get("active") === "true",
    bookable: formData.get("bookable") === "true",
    verificationStatus: service.verificationStatus,
    listed: service.isListed,
  })
  if (!validated.ok) return { fieldErrors: validated.fieldErrors }

  const saved = await supabase.rpc("admin_save_offering", {
    target_service: serviceId,
    target_branch: branchId,
    offering_price: validated.value.priceGhs,
    offering_duration: validated.value.durationMinutes,
    offering_buffer: validated.value.bufferMinutes,
    offering_active: validated.value.isActive,
    offering_bookable: validated.value.isBookable,
  })
  if (saved.error) return { error: friendlyError(saved.error) }
  refreshCatalogue()
  return { saved: true }
}

function text(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === "string" ? value : ""
}

function serviceFacts(
  value: unknown,
  serviceId: string,
): { verificationStatus: "publicly_advertised" | "studio_confirmed"; isListed: boolean } | null {
  if (!Array.isArray(value)) return null
  for (const item of value) {
    if (!item || typeof item !== "object") continue
    const record = item as { id?: unknown; verification_status?: unknown; is_listed?: unknown }
    if (record.id !== serviceId) continue
    const verificationStatus = record.verification_status
    if (verificationStatus !== "publicly_advertised" && verificationStatus !== "studio_confirmed") {
      return null
    }
    if (typeof record.is_listed !== "boolean") return null
    return { verificationStatus, isListed: record.is_listed }
  }
  return null
}

function friendlyError(error: { code?: string; message?: string }) {
  const message = error.message ?? ""
  if (error.code === "PGRST202" || error.code === "42883" || /could not find the function/i.test(message)) {
    return "Service changes are not available yet. The service management migration has not been applied."
  }
  if (/not authorized/i.test(message)) return "You do not have permission to make that change."
  if (/already exists/i.test(message)) return "A service with this name already exists."
  if (/service does not exist/i.test(message)) return "That service could not be found."
  if (/studio confirms/i.test(message)) return "A treatment cannot be bookable until the studio confirms it."
  if (/while it is unlisted/i.test(message)) return "A treatment cannot be bookable while it is unlisted."
  if (/before it can be active/i.test(message)) {
    return "An offering needs a price and duration before it can be active."
  }
  if (/before it can be bookable/i.test(message)) {
    return "An offering needs a price and duration before it can be bookable."
  }
  if (/enter a service name/i.test(message)) return "Enter a service name."
  if (/image path/i.test(message)) return "Enter a site image path or https address."
  return "The service could not be saved."
}

function refreshCatalogue() {
  revalidatePath("/admin/services")
  revalidatePath("/admin")
  revalidatePath("/services")
  revalidatePath("/")
}
