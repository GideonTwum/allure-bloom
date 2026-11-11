import { connection } from "next/server"

import { checkSupabaseConnection } from "@/lib/supabase/health"

export async function GET() {
  await connection()
  const health = await checkSupabaseConnection()
  return Response.json(health, {
    headers: { "cache-control": "no-store" },
  })
}
