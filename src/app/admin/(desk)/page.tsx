import { Suspense } from "react"

import { ModulePlaceholder, UnauthorizedBranch } from "@/components/admin/admin-shell"
import { adminRoleDescription, adminRoleLabel, visibleBranchIds } from "@/lib/admin/access"
import { readScopedCatalogue } from "@/lib/admin/catalogue"
import { loadDesk, readyDesk } from "@/lib/admin/desk"

export default function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string | string[] }>
}) {
  return (
    <Suspense fallback={<p className="text-sm text-cocoa">Loading overview…</p>}>
      <Overview searchParams={searchParams} />
    </Suspense>
  )
}

async function Overview({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string | string[] }>
}) {
  const access = readyDesk(await loadDesk("/admin", searchParams))
  if (!access) return null
  if (access.scope.unauthorizedRequest) return <UnauthorizedBranch />

  const catalogue = await readScopedCatalogue(access.scope)
  const ids = new Set(visibleBranchIds(access.scope))
  const studios = access.studios.filter((studio) => ids.has(studio.id))

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header>
        <p className="text-sm text-cocoa">{adminRoleLabel(access.scope.role)}</p>
        <h1 className="font-heading text-5xl text-espresso">Overview</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-cocoa">
          {adminRoleDescription(access.scope.role)}
        </p>
      </header>
      <section className="grid gap-4 sm:grid-cols-2">
        {studios.map((studio) => (
          <article key={studio.id} className="rounded-3xl border border-border bg-ivory px-5 py-5">
            <h2 className="font-heading text-3xl text-espresso">{studio.name}</h2>
            <p className="mt-2 text-sm text-cocoa">{studio.area}</p>
          </article>
        ))}
      </section>
      {catalogue.ok ? (
        <section className="rounded-3xl border border-border bg-ivory px-5 py-5">
          <h2 className="font-heading text-3xl text-espresso">Published catalogue</h2>
          <p className="mt-3 text-sm leading-6 text-cocoa">
            {catalogue.data.services.length} published treatments. {catalogue.data.offerings.length}{" "}
            active studio offerings in this view.
          </p>
        </section>
      ) : (
        <p className="rounded-3xl bg-ivory px-5 py-5 text-sm leading-6 text-cocoa">{catalogue.message}</p>
      )}
      <ModulePlaceholder
        title="Bookings"
        body="No bookings, revenue, or customer statistics are shown here. Professional records are managed on the Professionals page."
      />
    </div>
  )
}
