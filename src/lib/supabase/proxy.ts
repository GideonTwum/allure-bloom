import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { loginPath, safeAdminReturnPath } from "@/lib/admin/access"
import { publicSupabaseConfig } from "@/lib/supabase/config"

export async function updateAdminSession(request: NextRequest) {
  const config = readConfig()
  if (!config) return NextResponse.next({ request })

  let response = NextResponse.next({ request })
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  const { data } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname
  const isLogin = path === "/admin/login" || path.startsWith("/admin/login/")
  if (data.user || !path.startsWith("/admin") || isLogin) return response

  const hadAuthCookie = request.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-"))
  const next = safeAdminReturnPath(`${path}${request.nextUrl.search}`)
  const redirect = NextResponse.redirect(new URL(loginPath(next, hadAuthCookie), request.url))
  response.cookies.getAll().forEach((cookie) => {
    redirect.cookies.set(cookie)
  })
  return redirect
}

function readConfig() {
  try {
    return publicSupabaseConfig()
  } catch {
    return null
  }
}
