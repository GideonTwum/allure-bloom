"use server"

import { redirect } from "next/navigation"

import { safeAdminReturnPath } from "@/lib/admin/access"
import { readAdminAccess } from "@/lib/admin/session"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export type SignInState = {
  error?: string
  fieldErrors?: {
    email?: string
    password?: string
  }
}

export async function signIn(_state: SignInState, formData: FormData): Promise<SignInState> {
  const nextPath = safeAdminReturnPath(formData.get("next"))
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const fieldErrors = validateSignIn(email, password)
  if (fieldErrors.email || fieldErrors.password) return { fieldErrors }

  let supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
  try {
    supabase = await createServerSupabaseClient()
  } catch {
    return { error: "Studio sign-in is not available right now." }
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: "The email or password is incorrect." }

  const access = await readAdminAccess(null)
  if (access.status !== "ready") {
    await supabase.auth.signOut({ scope: "global" })
    if (access.status === "denied") {
      return { error: "This account does not have studio access." }
    }
    return { error: "Studio access could not be confirmed." }
  }

  redirect(nextPath)
}

export async function signOut() {
  try {
    const supabase = await createServerSupabaseClient()
    await supabase.auth.signOut({ scope: "global" })
  } catch {
    // The login page is still the safe destination when the session cannot be cleared.
  }
  redirect("/admin/login")
}

function validateSignIn(email: string, password: string) {
  const fieldErrors: SignInState["fieldErrors"] = {}
  if (!email) fieldErrors.email = "Enter your email address."
  else if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fieldErrors.email = "Enter a valid email address."
  }
  if (!password) fieldErrors.password = "Enter your password."
  else if (password.length > 256) fieldErrors.password = "Enter your password."
  return fieldErrors
}
