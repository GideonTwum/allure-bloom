import { Suspense } from "react"

import { UnauthorizedBranch } from "@/components/admin/admin-shell"
import { ServiceDesk } from "@/components/admin/service-desk"
import { visibleBranchIds } from "@/lib/admin/access"
import { loadDesk, readyDesk } from "@/lib/admin/desk"
import { readManagedCatalogue } from "@/lib/admin/service-catalogue"

export default function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string | string[] }>
}) {
  return (
    <Suspense fallback={<p className="text-sm text-cocoa">Loading services…</p>}>
      <Services searchParams={searchParams} />
    </Suspense>
  )
}

async function Services({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string | string[] }>
}) {
  const access = readyDesk(await loadDesk("/admin/services", searchParams))
  if (!access) return null
  if (access.scope.unauthorizedRequest) return <UnauthorizedBranch />

  const catalogue = await readManagedCatalogue()
  if (!catalogue.ok) {
    return (
      <section role="alert" className="mx-auto max-w-3xl rounded-2xl border border-border bg-ivory px-5 py-6">
        <h1 className="font-heading text-4xl text-espresso">Services</h1>
        <p className="mt-3 text-sm leading-6 text-cocoa">{catalogue.message}</p>
      </section>
    )
  }

  const ids = new Set(visibleBranchIds(access.scope))
  const studios = access.studios
    .filter((studio) => ids.has(studio.id))
    .map((studio) => ({ id: studio.id, name: studio.name }))

  return (
    <ServiceDesk
      role={access.scope.role}
      studios={studios}
      services={catalogue.services}
      offerings={catalogue.offerings.filter((offering) => ids.has(offering.branchId))}
    />
  )
}
