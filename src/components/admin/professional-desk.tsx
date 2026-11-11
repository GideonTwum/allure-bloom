"use client"

import { useRouter } from "next/navigation"
import { useState, type ReactNode } from "react"

import {
  addProfessionalQualification,
  createProfessional,
  removeProfessionalQualification,
  saveProfessional,
  setProfessionalActive,
  setProfessionalListed,
  type ProfessionalActionState,
} from "@/app/admin/professional-actions"
import { ProfessionalSchedule } from "@/components/admin/professional-schedule"
import { ProfessionalTransfer } from "@/components/admin/professional-transfer"
import type { AdminRole } from "@/lib/admin/access"
import { filterProfessionals, type StudioProfessional } from "@/lib/admin/professional-input"
import type { WeeklySchedule } from "@/lib/admin/schedule-input"
import type { ProfessionalTransfer as StudioTransfer } from "@/lib/admin/transfer-input"

type StudioOption = { id: string; name: string }
type ServiceOption = { id: string; name: string }

export function ProfessionalDesk({
  role,
  studios,
  professionals,
  services,
  qualificationsReady,
  schedules,
  schedulesReady,
  transfers,
  transfersReady,
  catalog,
  accraDate,
}: {
  role: AdminRole
  studios: StudioOption[]
  professionals: StudioProfessional[]
  services: ServiceOption[]
  qualificationsReady: boolean
  schedules: WeeklySchedule[]
  schedulesReady: boolean
  transfers: StudioTransfer[]
  transfersReady: boolean
  catalog: StudioOption[]
  accraDate: string
}) {
  const [search, setSearch] = useState("")
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const visible = filterProfessionals(professionals, search)
  const owner = role === "owner"
  const names = new Map(services.map((service) => [service.id, service.name]))

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-4xl text-espresso">Professionals</h1>
          <p className="mt-2 text-sm text-cocoa">
            {professionals.length} {professionals.length === 1 ? "professional" : "professionals"}
            {owner ? "" : " at your studio"}
          </p>
        </div>
        {owner ? (
          <button
            type="button"
            onClick={() => {
              setCreating((open) => !open)
              setEditing(null)
            }}
            className="inline-flex h-10 items-center rounded-full bg-espresso px-4 text-sm text-ivory hover:bg-cocoa focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-espresso"
          >
            {creating ? "Close" : "Add professional"}
          </button>
        ) : (
          <p className="max-w-xs text-sm leading-5 text-cocoa">
            You can update professionals at your studio. Studio assignment is chosen when a professional is added.
          </p>
        )}
      </header>

      {creating && owner ? (
        <section className="rounded-3xl border border-border bg-ivory p-4 sm:p-5">
          <h2 className="font-heading text-2xl text-espresso">New professional</h2>
          <ProfessionalForm
            action={createProfessional}
            studios={studios}
            submitLabel="Add professional"
            onDone={() => setCreating(false)}
          />
        </section>
      ) : null}

      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search professionals"
        aria-label="Search professionals"
        className={fieldClass}
      />

      {visible.length === 0 ? (
        <p className="rounded-3xl bg-ivory px-5 py-5 text-sm text-cocoa">
          {search.trim() ? "No professionals match that search." : "No professionals at this studio yet."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((person) => (
            <li key={person.id} className="rounded-3xl border border-border bg-ivory p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-heading text-2xl text-espresso">{person.displayName || person.fullName}</h2>
                  <p className="mt-1 text-sm text-cocoa">
                    {person.branchName} · {person.isActive ? "Active" : "Inactive"} ·{" "}
                    {person.isListed ? "Listed" : "Hidden"}
                  </p>
                  {person.displayName ? <p className="mt-1 text-sm text-espresso">{person.fullName}</p> : null}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditing((current) => (current === person.id ? null : person.id))
                    setCreating(false)
                  }}
                  className="inline-flex h-9 items-center rounded-full border border-border px-3 text-sm text-espresso hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-espresso"
                >
                  {editing === person.id ? "Close" : "Edit"}
                </button>
              </div>
              {person.biography ? <p className="mt-3 text-sm leading-6 text-cocoa">{person.biography}</p> : null}
              <p className="mt-3 text-sm text-cocoa">
                {person.serviceIds.length === 0
                  ? "No qualifications yet."
                  : person.serviceIds.map((id) => names.get(id) ?? id).join(" · ")}
              </p>
              {editing === person.id ? (
                <div className="mt-4 border-t border-border pt-4">
                  <ProfessionalForm
                    action={saveProfessional}
                    person={person}
                    submitLabel="Save profile"
                    onDone={() => setEditing(null)}
                  />
                  <LifecycleControls person={person} />
                  <QualificationEditor
                    person={person}
                    services={services}
                    ready={qualificationsReady}
                  />
                  <ProfessionalSchedule
                    professionalId={person.id}
                    schedule={schedules.find((schedule) => schedule.professionalId === person.id)}
                    ready={schedulesReady}
                    accraDate={accraDate}
                  />
                  <ProfessionalTransfer
                    role={role}
                    person={person}
                    studios={catalog}
                    managedStudioIds={studios.map((studio) => studio.id)}
                    transfers={transfers.filter((transfer) => transfer.professionalId === person.id)}
                    ready={transfersReady}
                    accraDate={accraDate}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ProfessionalForm({
  action,
  person,
  studios,
  submitLabel,
  onDone,
}: {
  action: (state: ProfessionalActionState, formData: FormData) => Promise<ProfessionalActionState>
  person?: StudioProfessional
  studios?: StudioOption[]
  submitLabel: string
  onDone: () => void
}) {
  return (
    <ActionForm action={action} onDone={onDone} submitLabel={submitLabel}>
      {(state) => (
        <>
          {person ? <input type="hidden" name="professionalId" value={person.id} /> : null}
          <label className="block text-sm text-espresso">
            Full name
            <input
              name="fullName"
              defaultValue={person?.fullName ?? ""}
              required
              className={`${fieldClass} mt-1`}
            />
            <FieldError message={state.fieldErrors?.fullName} />
          </label>
          <label className="block text-sm text-espresso">
            Display name
            <input name="displayName" defaultValue={person?.displayName ?? ""} className={`${fieldClass} mt-1`} />
            <FieldError message={state.fieldErrors?.displayName} />
          </label>
          <label className="block text-sm text-espresso">
            Biography
            <textarea
              name="biography"
              defaultValue={person?.biography ?? ""}
              rows={3}
              className="mt-1 w-full rounded-xl border border-border bg-ivory px-3 py-2 text-sm text-espresso outline-none focus-visible:border-cocoa focus-visible:ring-3 focus-visible:ring-cocoa/30"
            />
            <FieldError message={state.fieldErrors?.biography} />
          </label>
          <label className="block text-sm text-espresso">
            Profile image
            <input
              name="imageUrl"
              defaultValue={person?.imageUrl ?? ""}
              placeholder="/brand/symbol.svg"
              className={`${fieldClass} mt-1`}
            />
            <FieldError message={state.fieldErrors?.imageUrl} />
          </label>
          {studios ? (
            <>
              <label className="block text-sm text-espresso">
                Studio
                <select name="branchId" defaultValue={studios[0]?.id ?? ""} className={`${fieldClass} mt-1`}>
                  {studios.map((studio) => (
                    <option key={studio.id} value={studio.id}>
                      {studio.name}
                    </option>
                  ))}
                </select>
                <FieldError message={state.fieldErrors?.branchId} />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm text-espresso">
                  Initial status
                  <select name="active" defaultValue="true" className={`${fieldClass} mt-1`}>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </label>
                <label className="block text-sm text-espresso">
                  Initial listing
                  <select name="listed" defaultValue="false" className={`${fieldClass} mt-1`}>
                    <option value="false">Hidden</option>
                    <option value="true">Listed</option>
                  </select>
                  <FieldError message={state.fieldErrors?.listed} />
                </label>
              </div>
            </>
          ) : null}
        </>
      )}
    </ActionForm>
  )
}

function LifecycleControls({ person }: { person: StudioProfessional }) {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <ActionForm
        action={setProfessionalActive}
        onDone={() => undefined}
        submitLabel={person.isActive ? "Deactivate" : "Activate"}
      >
        {() => (
          <>
            <input type="hidden" name="professionalId" value={person.id} />
            <input type="hidden" name="active" value={person.isActive ? "false" : "true"} />
            <p className="text-sm text-cocoa">{person.isActive ? "Active at this studio." : "Inactive. The studio stays the same."}</p>
          </>
        )}
      </ActionForm>
      <ActionForm
        action={setProfessionalListed}
        onDone={() => undefined}
        submitLabel={person.isListed ? "Hide publicly" : "List publicly"}
      >
        {() => (
          <>
            <input type="hidden" name="professionalId" value={person.id} />
            <input type="hidden" name="listed" value={person.isListed ? "false" : "true"} />
            <p className="text-sm text-cocoa">
              {person.isListed ? "Visible on the public list." : "Hidden from the public list."}
            </p>
          </>
        )}
      </ActionForm>
    </div>
  )
}

function QualificationEditor({
  person,
  services,
  ready,
}: {
  person: StudioProfessional
  services: ServiceOption[]
  ready: boolean
}) {
  const available = services.filter((service) => !person.serviceIds.includes(service.id))
  if (!ready) {
    return <p className="mt-4 text-sm text-cocoa">Service qualifications cannot be loaded yet.</p>
  }

  return (
    <div className="mt-4">
      <h3 className="text-sm text-espresso">Qualifications</h3>
      {person.serviceIds.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-2">
          {person.serviceIds.map((serviceId) => (
            <li key={serviceId}>
              <ActionForm
                action={removeProfessionalQualification}
                onDone={() => undefined}
                submitLabel="Remove"
              >
                {() => (
                  <>
                    <input type="hidden" name="professionalId" value={person.id} />
                    <input type="hidden" name="serviceId" value={serviceId} />
                    <p className="text-sm text-cocoa">
                      {services.find((service) => service.id === serviceId)?.name ?? serviceId}
                    </p>
                  </>
                )}
              </ActionForm>
            </li>
          ))}
        </ul>
      ) : null}
      {available.length > 0 ? (
        <ActionForm action={addProfessionalQualification} onDone={() => undefined} submitLabel="Add qualification">
          {() => (
            <>
              <input type="hidden" name="professionalId" value={person.id} />
              <label className="block text-sm text-espresso">
                Service
                <select name="serviceId" defaultValue={available[0]?.id ?? ""} className={`${fieldClass} mt-1`}>
                  {available.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </ActionForm>
      ) : null}
    </div>
  )
}

function ActionForm({
  action,
  onDone,
  submitLabel,
  children,
}: {
  action: (state: ProfessionalActionState, formData: FormData) => Promise<ProfessionalActionState>
  onDone: () => void
  submitLabel: string
  children: (state: ProfessionalActionState) => ReactNode
}) {
  const router = useRouter()
  const [state, setState] = useState<ProfessionalActionState>({})
  const [pending, setPending] = useState(false)

  return (
    <form
      className="mt-3 space-y-3"
      onSubmit={async (event) => {
        event.preventDefault()
        const form = event.currentTarget
        setPending(true)
        const result = await action(state, new FormData(form))
        setPending(false)
        setState(result)
        if (result.saved) {
          router.refresh()
          onDone()
        }
      }}
    >
      {state.error ? (
        <p role="alert" className="rounded-xl bg-beige px-3 py-2 text-sm text-espresso">
          {state.error}
        </p>
      ) : null}
      {children(state)}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-9 items-center rounded-full bg-espresso px-4 text-sm text-ivory hover:bg-cocoa disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-espresso"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <span className="mt-1 block text-sm text-cocoa">{message}</span>
}

const fieldClass =
  "h-10 w-full rounded-xl border border-border bg-ivory px-3 text-sm text-espresso outline-none focus-visible:border-cocoa focus-visible:ring-3 focus-visible:ring-cocoa/30"
