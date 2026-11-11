const publicUrlName = "NEXT_PUBLIC_SUPABASE_URL"
const publicKeyName = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"

export type PublicSupabaseConfig = {
  url: string
  publishableKey: string
}

export function publicSupabaseConfig(): PublicSupabaseConfig | null {
  const url = process.env[publicUrlName]?.trim()
  const publishableKey = process.env[publicKeyName]?.trim()
  if (!url || !publishableKey) return null
  if (!isHttpsProjectUrl(url)) {
    throw new Error("The public Supabase URL must be the project HTTPS address.")
  }
  if (!isPublishableKey(publishableKey)) {
    throw new Error("The public Supabase key is not a publishable key.")
  }
  return { url, publishableKey }
}

export function requirePublicSupabaseConfig(): PublicSupabaseConfig {
  const config = publicSupabaseConfig()
  if (!config) {
    throw new Error("Supabase public environment variables are not set.")
  }
  return config
}

function isHttpsProjectUrl(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.protocol === "https:" && parsed.hostname.endsWith(".supabase.co")
  } catch {
    return false
  }
}

export function isPublishableKey(key: string) {
  if (key.startsWith("sb_secret_") || key.startsWith("sb_service_role")) return false
  return jwtRole(key) !== "service_role"
}

export function isServiceCredential(key: string) {
  if (key.startsWith("sb_secret_") || key.startsWith("sb_service_role")) return true
  return jwtRole(key) === "service_role"
}

export function inviteSecretKind(value: string | null | undefined) {
  const trimmed = value?.trim() ?? ""
  if (!trimmed) return "missing"
  return isServiceCredential(trimmed) ? "accepted" : "rejected"
}

function jwtRole(key: string) {
  const payload = key.split(".")[1]
  if (!payload) return null
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    const parsed = JSON.parse(json) as { role?: unknown }
    return typeof parsed.role === "string" ? parsed.role : null
  } catch {
    return null
  }
}
