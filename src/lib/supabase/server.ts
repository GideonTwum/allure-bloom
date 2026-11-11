import "server-only"

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

import { requirePublicSupabaseConfig } from "@/lib/supabase/config"

export async function createServerSupabaseClient() {
  const { url, publishableKey } = requirePublicSupabaseConfig()
  const cookieStore = await cookies()

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // A Server Component cannot always write cookies. The admin proxy
          // refreshes the session, and Server Actions can write cookies here.
        }
      },
    },
  })
}
