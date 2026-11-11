import { redirect } from "next/navigation"
import { Suspense, type ReactNode } from "react"

import {
  AccessDenied,
  AccessUnavailable,
  AdminShell,
  DeskFallback,
} from "@/components/admin/admin-shell"
import { loginPath } from "@/lib/admin/access"
import { readAdminAccess } from "@/lib/admin/session"

export default function DeskLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<DeskFallback />}>
      <DeskFrame>{children}</DeskFrame>
    </Suspense>
  )
}

async function DeskFrame({ children }: { children: ReactNode }) {
  const access = await readAdminAccess(null)
  if (access.status === "signed_out") redirect(loginPath("/admin", access.sessionEnded))
  if (access.status === "denied") return <AccessDenied email={access.email} />
  if (access.status === "unavailable") return <AccessUnavailable />

  return (
    <AdminShell email={access.email} role={access.scope.role} branches={access.scope.branches}>
      {children}
    </AdminShell>
  )
}
