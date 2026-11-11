import "server-only"

import { publicSupabaseConfig } from "@/lib/supabase/config"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export type SupabaseHealth = {
  configured: boolean
  reachable: boolean
  catalogue: "not_checked" | "missing" | "readable"
}

const missingCatalogueCodes = new Set(["42P01", "PGRST204", "PGRST205"])

/**
 * Confirms the public Supabase credentials can reach the project.
 * The result names no rows, keys, SQL, or project identifiers.
 */
export async function checkSupabaseConnection(): Promise<SupabaseHealth> {
  try {
    if (!publicSupabaseConfig()) {
      return { configured: false, reachable: false, catalogue: "not_checked" }
    }
  } catch {
    return { configured: false, reachable: false, catalogue: "not_checked" }
  }

  try {
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.from("services").select("id", { head: true })
    if (!error) {
      return { configured: true, reachable: true, catalogue: "readable" }
    }
    if (error.code && missingCatalogueCodes.has(error.code)) {
      return { configured: true, reachable: true, catalogue: "missing" }
    }
    return { configured: true, reachable: false, catalogue: "not_checked" }
  } catch {
    return { configured: true, reachable: false, catalogue: "not_checked" }
  }
}
