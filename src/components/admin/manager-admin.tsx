"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import {
  deactivateManager,
  provisionManager,
  reactivateManager,
  reassignManager,
  type ManagerActionState,
} from "@/app/admin/manager-actions"
import {
  provisionStatusLabel,
  type ManagerRecord,
  type ProvisionSnapshot,
  type ProvisionStatus,
} from "@/lib/admin/manager-provision"

type StudioOption = { id: string; name: string }

export function ManagerAdmin({
  studios,
  managers,
  provisions,
  invitesConfigured,
}: {
  studios: StudioOption[]
  managers: ManagerRecord[]
  provisions: ProvisionSnapshot[]
  invitesConfigured: boolean
}) {
  const openProvisions = provisions.filter((provision) => provision.status !== "ready")

  return (
    <section className="rounded-3xl border border-border bg-ivory px-5 py-5">
      <h2 className="font-heading text-3xl text-espresso">Branch managers</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-cocoa">
        {invitesConfigured
          ? "A new email is invited from the server. An existing account is attached without another invitation."
          : "New invitations are not configured on this server. An existing account can still be attached by email."}
      </p>
      <InviteForm studios={studios} />
      <div className="mt-8">
        <h3 className="text-sm text-cocoa">Current managers</h3>
        {managers.length === 0 ? (
          <p className="mt-3 text-sm text-espresso">No branch managers yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {managers.map((manager) => (
              <ManagerRow key={manager.userId} manager={manager} studios={studios} />
            ))}
          </ul>
        )}
      </div>
      <div className="mt-8">
        <h3 className="text-sm text-cocoa">Provisioning</h3>
        {openProvisions.length === 0 ? (
          <p className="mt-3 text-sm text-espresso">No invitations are waiting.</p>
        ) : (
          <ul className="mt-3 space-y-4">
            {openProvisions.map((provision) => (
              <ProvisionRow key={provision.id} provision={provision} studios={studios} />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function InviteForm({ studios }: { studios: StudioOption[] }) {
  const action = useManagerAction()
  return (
    <form
      className="mt-5 grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end"
      onSubmit={(event) => {
        event.preventDefault()
        void action.run(() => provisionManager(new FormData(event.currentTarget)))
      }}
    >
      <label className="block text-sm text-espresso">
        Email
        <input name="email" type="email" autoComplete="off" required className={`${fieldClass} mt-1`} />
      </label>
      <StudioSelect studios={studios} />
      <button type="submit" disabled={action.pending} className={primaryButton}>
        {action.pending ? "Saving…" : "Add manager"}
      </button>
      <ActionNotice error={action.error} message={action.message} />
    </form>
  )
}

function ManagerRow({ manager, studios }: { manager: ManagerRecord; studios: StudioOption[] }) {
  const action = useManagerAction()
  const studio = manager.branchName ?? "No studio"
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-espresso">{manager.email}</p>
        <p className="text-sm text-cocoa">
          {manager.isActive ? "Active" : "Inactive"} · {studio}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            void action.run(() =>
              manager.isActive ? reassignManager(form) : reactivateManager(form),
            )
          }}
        >
          <input type="hidden" name="userId" value={manager.userId} />
          <StudioSelect studios={studios} selected={manager.branchId ?? studios[0]?.id} />
          <button type="submit" disabled={action.pending} className={primaryButton}>
            {manager.isActive ? "Reassign" : "Reactivate"}
          </button>
        </form>
        {manager.isActive ? (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void action.run(() => deactivateManager(new FormData(event.currentTarget)))
            }}
          >
            <input type="hidden" name="userId" value={manager.userId} />
            <button type="submit" disabled={action.pending} className={quietButton}>
              Deactivate
            </button>
          </form>
        ) : null}
      </div>
      <ActionNotice error={action.error} message={action.message} />
    </li>
  )
}

function ProvisionRow({
  provision,
  studios,
}: {
  provision: ProvisionSnapshot
  studios: StudioOption[]
}) {
  const action = useManagerAction()
  const studio = studios.find((item) => item.id === provision.branchId)?.name ?? provision.branchId
  const retryable = provision.status !== "revoked"
  return (
    <li className="rounded-2xl border border-border px-4 py-3">
      <p className="text-sm text-espresso">{provision.email}</p>
      <p className="mt-1 text-sm text-cocoa">
        {provisionStatusLabel(provision.status)} · {studio}
      </p>
      {provision.lastError ? (
        <p role="alert" className="mt-2 text-sm text-espresso">
          {provision.lastError}
        </p>
      ) : null}
      {retryable ? (
        <form
          className="mt-3"
          onSubmit={(event) => {
            event.preventDefault()
            void action.run(() => provisionManager(new FormData(event.currentTarget)))
          }}
        >
          <input type="hidden" name="email" value={provision.email} />
          <input type="hidden" name="branchId" value={provision.branchId} />
          <button type="submit" disabled={action.pending} className={quietButton}>
            {action.pending ? "Saving…" : "Try again"}
          </button>
        </form>
      ) : null}
      <ActionNotice error={action.error} message={action.message} />
    </li>
  )
}

function StudioSelect({ studios, selected }: { studios: StudioOption[]; selected?: string }) {
  return (
    <label className="block text-sm text-espresso">
      Studio
      <select name="branchId" defaultValue={selected ?? studios[0]?.id} className={`${fieldClass} mt-1`}>
        {studios.map((studio) => (
          <option key={studio.id} value={studio.id}>
            {studio.name}
          </option>
        ))}
      </select>
    </label>
  )
}

function ActionNotice({
  error,
  message,
}: {
  error: string | null
  message: string | null
}) {
  if (error) {
    return (
      <p role="alert" className="text-sm text-espresso sm:col-span-3">
        {error}
      </p>
    )
  }
  if (!message) return null
  return <p className="text-sm text-cocoa sm:col-span-3">{message}</p>
}

function useManagerAction() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function run(action: () => Promise<ManagerActionState>) {
    setPending(true)
    setError(null)
    setMessage(null)
    const result = await action()
    setPending(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setMessage(result.status ? savedCopy(result.status) : "Saved.")
    router.refresh()
  }

  return { pending, error, message, run }
}

function savedCopy(status: string) {
  if (isProvisionStatus(status)) {
    if (status === "ready") return "Manager access is ready."
    return provisionStatusLabel(status)
  }
  return "Saved."
}

function isProvisionStatus(status: string): status is ProvisionStatus {
  return (
    status === "auth_pending" ||
    status === "role_pending" ||
    status === "branch_pending" ||
    status === "ready" ||
    status === "failed" ||
    status === "revoked"
  )
}

const fieldClass =
  "h-10 w-full rounded-xl border border-border bg-ivory px-3 text-sm text-espresso outline-none focus-visible:border-cocoa focus-visible:ring-3 focus-visible:ring-cocoa/30"

const primaryButton =
  "inline-flex h-10 items-center justify-center rounded-full bg-espresso px-4 text-sm text-ivory hover:bg-cocoa disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-espresso"

const quietButton =
  "inline-flex h-10 items-center justify-center rounded-full border border-border px-4 text-sm text-espresso hover:border-cocoa disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-espresso"
