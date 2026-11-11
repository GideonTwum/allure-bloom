import "server-only"

import { redirect } from "next/navigation"

import { loginPath, requestedBranchParam } from "@/lib/admin/access"
import { readAdminAccess, type AdminAccess } from "@/lib/admin/session"

export async function loadDesk(
  path: string,
  searchParams: Promise<{ branch?: string | string[] }>,
) {
  const params = await searchParams
  const requested = requestedBranchParam(params.branch)
  const access = await readAdminAccess(requested)
  if (access.status === "signed_out") {
    const branch =
      requested && requested !== " " ? `?branch=${encodeURIComponent(requested)}` : ""
    redirect(loginPath(`${path}${branch}`, access.sessionEnded))
  }
  return access
}

export function readyDesk(access: AdminAccess) {
  return access.status === "ready" ? access : null
}
