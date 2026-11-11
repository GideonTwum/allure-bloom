import "server-only"

import { createClient } from "@supabase/supabase-js"

import type { InviteResult } from "@/lib/admin/manager-provision"
import { inviteSecretKind, publicSupabaseConfig } from "@/lib/supabase/config"

const secretName = "SUPABASE_SECRET_KEY"

export function managerInviteConfigured() {
  return inviteSecretKind(process.env[secretName]) === "accepted" && publicSupabaseConfig() !== null
}

export async function inviteManager(email: string): Promise<InviteResult> {
  const config = publicSupabaseConfig()
  const secret = process.env[secretName]
  if (!config || inviteSecretKind(secret) !== "accepted" || !secret) return "not_configured"

  try {
    const auth = createClient(config.url, secret.trim(), {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
    const { error } = await auth.auth.admin.inviteUserByEmail(email)
    if (!error) return "invited"
    if (isExistingAccount(error.message)) return "invited"
    return "failed"
  } catch {
    return "failed"
  }
}

function isExistingAccount(message: string) {
  return /already been registered|already registered/i.test(message)
}
