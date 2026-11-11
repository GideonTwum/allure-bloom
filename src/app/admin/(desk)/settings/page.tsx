import { Suspense } from "react"

import { signOut } from "@/app/admin/actions"
import { UnauthorizedBranch } from "@/components/admin/admin-shell"
import { ManagerAdmin } from "@/components/admin/manager-admin"
import { adminRoleDescription, adminRoleLabel, canAdministerManagers } from "@/lib/admin/access"
import { loadDesk, readyDesk } from "@/lib/admin/desk"
import { managerInviteConfigured } from "@/lib/admin/manager-auth"
import { readManagerDesk } from "@/lib/admin/managers"

export default function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string | string[] }>
}) {
  return (
    <Suspense fallback={<p className="text-sm text-cocoa">Loading settings…</p>}>
      <Settings searchParams={searchParams} />
    </Suspense>
  )
}

async function Settings({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string | string[] }>
}) {
  const access = readyDesk(await loadDesk("/admin/settings", searchParams))
  if (!access) return null
  if (access.scope.unauthorizedRequest) return <UnauthorizedBranch />

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header>
        <h1 className="font-heading text-5xl text-espresso">Settings</h1>
      </header>
      <section className="rounded-3xl border border-border bg-ivory px-5 py-5">
        <h2 className="font-heading text-3xl text-espresso">Account</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-cocoa">Email</dt>
            <dd className="text-espresso">{access.email ?? "No email is recorded on this session."}</dd>
          </div>
          <div>
            <dt className="text-cocoa">Role</dt>
            <dd className="text-espresso">{adminRoleLabel(access.scope.role)}</dd>
          </div>
          <div>
            <dt className="text-cocoa">Studios</dt>
            <dd className="text-espresso">
              {access.scope.branches.map((branch) => branch.name).join(", ")}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-sm leading-6 text-cocoa">{adminRoleDescription(access.scope.role)}</p>
        <form action={signOut} className="mt-6">
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center rounded-full bg-espresso px-5 text-sm text-ivory hover:bg-cocoa focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-espresso"
          >
            Sign out
          </button>
        </form>
      </section>
      {canAdministerManagers(access.scope.role) ? (
        <OwnerManagers studios={access.scope.branches} />
      ) : (
        <section className="rounded-3xl border border-border bg-ivory px-5 py-5">
          <h2 className="font-heading text-3xl text-espresso">Branch managers</h2>
          <p className="mt-2 text-sm leading-6 text-cocoa">An owner manages who can open each studio.</p>
        </section>
      )}
    </div>
  )
}

async function OwnerManagers({ studios }: { studios: { id: string; name: string }[] }) {
  const desk = await readManagerDesk()
  if (!desk.ok) {
    return (
      <section className="rounded-3xl border border-border bg-ivory px-5 py-5">
        <h2 className="font-heading text-3xl text-espresso">Branch managers</h2>
        <p className="mt-2 text-sm leading-6 text-cocoa">{desk.message}</p>
      </section>
    )
  }

  return (
    <ManagerAdmin
      studios={studios}
      managers={desk.managers}
      provisions={desk.provisions}
      invitesConfigured={managerInviteConfigured()}
    />
  )
}
