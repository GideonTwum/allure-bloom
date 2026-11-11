import { Suspense } from "react"

import { UnauthorizedBranch } from "@/components/admin/admin-shell"
import { visibleBranchIds } from "@/lib/admin/access"
import { loadDesk, readyDesk } from "@/lib/admin/desk"

export default function BranchesPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string | string[] }>
}) {
  return (
    <Suspense fallback={<p className="text-sm text-cocoa">Loading branches…</p>}>
      <Branches searchParams={searchParams} />
    </Suspense>
  )
}

async function Branches({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string | string[] }>
}) {
  const access = readyDesk(await loadDesk("/admin/branches", searchParams))
  if (!access) return null
  if (access.scope.unauthorizedRequest) return <UnauthorizedBranch />

  const ids = new Set(visibleBranchIds(access.scope))
  const studios = access.studios.filter((studio) => ids.has(studio.id))

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header>
        <h1 className="font-heading text-5xl text-espresso">Branches</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-cocoa">
          Studios this account can open. Names, areas, and phone numbers come from the studio records.
        </p>
      </header>
      {studios.length === 0 ? (
        <p className="rounded-3xl bg-ivory px-5 py-5 text-sm text-cocoa">No studios were returned for this view.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {studios.map((studio) => (
            <li key={studio.id} className="rounded-3xl border border-border bg-ivory px-5 py-5">
              <h2 className="font-heading text-3xl text-espresso">{studio.name}</h2>
              <p className="mt-2 text-sm text-cocoa">{studio.area}</p>
              {studio.phoneDisplay && studio.phoneE164 ? (
                <a
                  href={`tel:${studio.phoneE164}`}
                  className="mt-4 inline-flex text-sm text-espresso underline decoration-beige underline-offset-4"
                >
                  {studio.phoneDisplay}
                </a>
              ) : (
                <p className="mt-4 text-sm text-cocoa">No phone is recorded.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
