import { Suspense } from "react"

import { UnauthorizedBranch } from "@/components/admin/admin-shell"
import { ProfessionalDesk } from "@/components/admin/professional-desk"
import { visibleBranchIds } from "@/lib/admin/access"
import { loadDesk, readyDesk } from "@/lib/admin/desk"
import { readProfessionalDesk } from "@/lib/admin/professionals"
import { ghanaDate } from "@/lib/admin/ghana-time"
import { readWeeklySchedules } from "@/lib/admin/schedules"
import { readProfessionalTransfers } from "@/lib/admin/transfers"

export default function ProfessionalsPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string | string[] }>
}) {
  return (
    <Suspense fallback={<p className="text-sm text-cocoa">Loading professionals…</p>}>
      <Professionals searchParams={searchParams} />
    </Suspense>
  )
}

async function Professionals({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string | string[] }>
}) {
  const access = readyDesk(await loadDesk("/admin/professionals", searchParams))
  if (!access) return null
  if (access.scope.unauthorizedRequest) return <UnauthorizedBranch />

  const branchId = access.scope.selectedBranchId === "all" ? null : access.scope.selectedBranchId
  const desk = await readProfessionalDesk(branchId)
  const schedules = desk.ok ? await readWeeklySchedules(branchId) : { ready: false as const, schedules: [] }
  const transfers = desk.ok ? await readProfessionalTransfers(branchId) : { ready: false as const, transfers: [] }
  if (!desk.ok) {
    return (
      <section role="alert" className="mx-auto max-w-3xl rounded-2xl border border-border bg-ivory px-5 py-6">
        <h1 className="font-heading text-4xl text-espresso">Professionals</h1>
        <p className="mt-3 text-sm leading-6 text-cocoa">{desk.message}</p>
      </section>
    )
  }

  const ids = new Set(visibleBranchIds(access.scope))
  const studios = access.studios
    .filter((studio) => ids.has(studio.id))
    .map((studio) => ({ id: studio.id, name: studio.name }))

  return (
    <ProfessionalDesk
      role={access.scope.role}
      studios={studios}
      professionals={desk.professionals.filter((person) => ids.has(person.branchId))}
      services={desk.services}
      qualificationsReady={desk.qualificationsReady}
      schedules={schedules.ready ? schedules.schedules : []}
      schedulesReady={schedules.ready}
      transfers={transfers.ready ? transfers.transfers : []}
      transfersReady={transfers.ready}
      catalog={access.studios.map((studio) => ({ id: studio.id, name: studio.name }))}
      accraDate={ghanaDate(new Date()) ?? ""}
    />
  )
}
