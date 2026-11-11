import { Suspense } from "react"

import { ModulePlaceholder, UnauthorizedBranch } from "@/components/admin/admin-shell"
import { loadDesk, readyDesk } from "@/lib/admin/desk"

export default function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string | string[] }>
}) {
  return (
    <Suspense fallback={<p className="text-sm text-cocoa">Loading bookings…</p>}>
      <Bookings searchParams={searchParams} />
    </Suspense>
  )
}

async function Bookings({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string | string[] }>
}) {
  const access = readyDesk(await loadDesk("/admin/bookings", searchParams))
  if (!access) return null
  if (access.scope.unauthorizedRequest) return <UnauthorizedBranch />

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header>
        <h1 className="font-heading text-5xl text-espresso">Bookings</h1>
      </header>
      <ModulePlaceholder
        title="Bookings are not available yet"
        body="Appointments, home requests, and payments are not read by this desk. No booking counts are shown."
      />
    </div>
  )
}
