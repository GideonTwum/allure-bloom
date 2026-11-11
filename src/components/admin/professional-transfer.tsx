"use client"

import { useRouter } from "next/navigation"
import { useId, useRef, useState, type ReactNode } from "react"

import {
  activateProfessionalTransfer,
  approveProfessionalTransfer,
  cancelProfessionalTransfer,
  createProfessionalTransfer,
  saveTransferSchedule,
  submitProfessionalTransfer,
  updateProfessionalTransfer,
  type TransferActionState,
} from "@/app/admin/transfer-actions"
import type { AdminRole } from "@/lib/admin/access"
import type { StudioProfessional } from "@/lib/admin/professional-input"
import { weekdays } from "@/lib/admin/schedule-input"
import {
  activationAvailable,
  archivedOffDayLabel,
  canPrepareDestination,
  destinationScheduleWarning,
  isOpenTransfer,
  transferStatusLabel,
  type ProfessionalTransfer,
} from "@/lib/admin/transfer-input"

const fieldClass =
  "h-10 w-full rounded-xl border border-border bg-ivory px-3 text-sm text-espresso outline-none focus-visible:border-cocoa focus-visible:ring-3 focus-visible:ring-cocoa/30"

type StudioOption = { id: string; name: string }

export function ProfessionalTransfer({
  role,
  person,
  studios,
  managedStudioIds,
  transfers,
  ready,
  accraDate,
}: {
  role: AdminRole
  person: StudioProfessional
  studios: StudioOption[]
  managedStudioIds: string[]
  transfers: ProfessionalTransfer[]
  ready: boolean
  accraDate: string
}) {
  if (!ready) {
    return (
      <section className="mt-4 border-t border-border pt-4">
        <h3 className="font-heading text-xl text-espresso">Studio transfer</h3>
        <p className="mt-2 text-sm text-cocoa">Studio transfers are not available yet.</p>
      </section>
    )
  }

  const owner = role === "owner"
  const names = new Map(studios.map((studio) => [studio.id, studio.name]))
  const open = transfers.find((transfer) => isOpenTransfer(transfer.status))
  const history = transfers.filter((transfer) => !isOpenTransfer(transfer.status))
  const studioName = (id: string) => names.get(id) ?? id

  return (
    <section className="mt-4 border-t border-border pt-4">
      <h3 className="font-heading text-xl text-espresso">Studio transfer</h3>
      <p className="mt-2 text-sm leading-6 text-cocoa">
        A transfer stays at the current studio until the owner activates it. Dates follow the Accra calendar
        {accraDate ? `, and today in Accra is ${accraDate}` : ""}.
      </p>
      {open ? (
        <TransferCard
          transfer={open}
          professionalName={person.displayName?.trim() || person.fullName}
          owner={owner}
          managedStudioIds={managedStudioIds}
          studios={studios}
          studioName={studioName}
          accraDate={accraDate}
        />
      ) : owner && person.isActive ? (
        <ActionForm action={createProfessionalTransfer} submitLabel="Create draft">
          {(state) => (
            <>
              <input type="hidden" name="professionalId" value={person.id} />
              <input type="hidden" name="sourceBranchId" value={person.branchId} />
              <p className="text-sm text-espresso">From {studioName(person.branchId)}</p>
              <label className="block text-sm text-espresso">
                Destination studio
                <select name="destinationBranchId" defaultValue="" className={`${fieldClass} mt-1`}>
                  <option value="">Choose a studio</option>
                  {studios
                    .filter((studio) => studio.id !== person.branchId)
                    .map((studio) => (
                      <option key={studio.id} value={studio.id}>
                        {studio.name}
                      </option>
                    ))}
                </select>
                <FieldError message={state.fieldErrors?.destination} />
              </label>
              <label className="block text-sm text-espresso">
                Effective date
                <input type="date" name="effectiveOn" defaultValue={accraDate} className={`${fieldClass} mt-1`} />
                <FieldError message={state.fieldErrors?.effectiveOn} />
              </label>
            </>
          )}
        </ActionForm>
      ) : (
        <p className="mt-2 text-sm text-cocoa">No studio transfer is scheduled.</p>
      )}
      {history.length > 0 ? (
        <div className="mt-4">
          <h4 className="text-sm font-medium text-espresso">Transfer history</h4>
          <ul className="mt-2 space-y-2">
            {history.map((transfer) => (
              <li key={transfer.id} className="rounded-2xl bg-cream px-3 py-2 text-sm text-cocoa">
                <span className="text-espresso">{transferStatusLabel(transfer.status)}</span>
                {" · "}
                {studioName(transfer.sourceBranchId)} to {studioName(transfer.destinationBranchId)}
                {" · "}
                {transfer.effectiveOn}
                {transfer.cancellationReason ? ` · ${transfer.cancellationReason}` : ""}
                {transfer.status === "completed" ? (
                  <span className="mt-1 block">{archivedOffDayLabel(transfer.archivedOffWeekday)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

function TransferCard({
  transfer,
  professionalName,
  owner,
  managedStudioIds,
  studios,
  studioName,
  accraDate,
}: {
  transfer: ProfessionalTransfer
  professionalName: string
  owner: boolean
  managedStudioIds: string[]
  studios: StudioOption[]
  studioName: (id: string) => string
  accraDate: string
}) {
  const warning = destinationScheduleWarning(transfer)
  const prepare = canPrepareDestination({
    owner,
    managedStudioIds,
    destinationBranchId: transfer.destinationBranchId,
    status: transfer.status,
  })
  const canActivate = activationAvailable(transfer.status, transfer.effectiveOn, accraDate)

  return (
    <div className="mt-3 rounded-2xl border border-border bg-cream/50 p-3">
      <p className="text-sm text-espresso">
        {transferStatusLabel(transfer.status)} · {studioName(transfer.sourceBranchId)} to{" "}
        {studioName(transfer.destinationBranchId)} · effective {transfer.effectiveOn}
      </p>
      {warning ? <p className="mt-2 rounded-xl bg-beige px-3 py-2 text-sm leading-6 text-espresso">{warning}</p> : null}
      {transfer.status === "ready" && !canActivate ? (
        <p className="mt-2 text-sm text-cocoa">Activation opens on {transfer.effectiveOn} in Accra.</p>
      ) : null}
      {owner && transfer.status === "draft" ? (
        <ActionForm action={updateProfessionalTransfer} submitLabel="Save draft">
          {(state) => (
            <>
              <input type="hidden" name="transferId" value={transfer.id} />
              <input type="hidden" name="revision" value={String(transfer.revision)} />
              <input type="hidden" name="sourceBranchId" value={transfer.sourceBranchId} />
              <label className="block text-sm text-espresso">
                Destination studio
                <select name="destinationBranchId" defaultValue={transfer.destinationBranchId} className={`${fieldClass} mt-1`}>
                  {studios
                    .filter((studio) => studio.id !== transfer.sourceBranchId)
                    .map((studio) => (
                      <option key={studio.id} value={studio.id}>
                        {studio.name}
                      </option>
                    ))}
                </select>
                <FieldError message={state.fieldErrors?.destination} />
              </label>
              <label className="block text-sm text-espresso">
                Effective date
                <input type="date" name="effectiveOn" defaultValue={transfer.effectiveOn} className={`${fieldClass} mt-1`} />
                <FieldError message={state.fieldErrors?.effectiveOn} />
              </label>
            </>
          )}
        </ActionForm>
      ) : null}
      {prepare ? <DestinationHours transfer={transfer} /> : null}
      {owner ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {transfer.status === "draft" ? (
            <InlineAction action={submitProfessionalTransfer} transfer={transfer} label="Send for preparation" />
          ) : null}
          {transfer.status === "pending_preparation" && transfer.scheduleStatus === "complete" ? (
            <InlineAction action={approveProfessionalTransfer} transfer={transfer} label="Approve" />
          ) : null}
          {transfer.status === "ready" ? (
            <ActivateTransfer
              transfer={transfer}
              professionalName={professionalName}
              sourceStudio={studioName(transfer.sourceBranchId)}
              destinationStudio={studioName(transfer.destinationBranchId)}
              disabled={!canActivate}
            />
          ) : null}
          <CancelTransfer transfer={transfer} />
        </div>
      ) : null}
    </div>
  )
}

function DestinationHours({ transfer }: { transfer: ProfessionalTransfer }) {
  const [offDay, setOffDay] = useState(transfer.scheduleOffWeekday ? String(transfer.scheduleOffWeekday) : "")
  const chosen = Number(offDay)
  return (
    <ActionForm action={saveTransferSchedule} submitLabel="Save destination draft" alternateLabel="Mark destination complete">
      {(state) => (
        <>
          <input type="hidden" name="transferId" value={transfer.id} />
          <input type="hidden" name="scheduleRevision" value={String(transfer.scheduleRevision)} />
          <p className="text-sm leading-6 text-cocoa">
            Choose the destination off-day. These hours are not used until the owner activates the transfer.
            {transfer.status === "ready" ? " Saving again withdraws approval." : ""}
          </p>
          <label className="block text-sm text-espresso">
            Destination off-day
            <select name="offDay" value={offDay} onChange={(event) => setOffDay(event.target.value)} className={`${fieldClass} mt-1`}>
              <option value="">Choose an off-day</option>
              {weekdays.map((weekday) => (
                <option key={weekday.id} value={weekday.id}>
                  {weekday.name}
                </option>
              ))}
            </select>
            <FieldError message={state.fieldErrors?.offDay} />
          </label>
          <div className="grid gap-3">
            {weekdays.map((weekday) => {
              const shift = transfer.intervals.find((interval) => interval.weekday === weekday.id && interval.kind === "shift")
              const pause = transfer.intervals.find((interval) => interval.weekday === weekday.id && interval.kind === "break")
              const off = chosen === weekday.id
              return (
                <div key={weekday.id} className="grid gap-2 sm:grid-cols-[7rem_1fr_1fr]">
                  <p className="self-center text-sm text-espresso">{weekday.name}</p>
                  {off ? (
                    <p className="text-sm text-cocoa sm:col-span-2">Regular off-day</p>
                  ) : (
                    <>
                      <TimePair startName={`shift-${weekday.id}-start`} endName={`shift-${weekday.id}-end`} start={shift?.starts ?? ""} end={shift?.ends ?? ""} label="Shift" />
                      <TimePair startName={`break-${weekday.id}-start`} endName={`break-${weekday.id}-end`} start={pause?.starts ?? ""} end={pause?.ends ?? ""} label="Break" />
                    </>
                  )}
                  <FieldError message={state.fieldErrors?.[`day-${weekday.id}`]} />
                </div>
              )
            })}
          </div>
        </>
      )}
    </ActionForm>
  )
}

function ActivateTransfer({
  transfer,
  professionalName,
  sourceStudio,
  destinationStudio,
  disabled,
}: {
  transfer: ProfessionalTransfer
  professionalName: string
  sourceStudio: string
  destinationStudio: string
  disabled: boolean
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        onClick={() => dialogRef.current?.showModal()}
        className="inline-flex h-9 items-center rounded-full border border-border bg-ivory px-4 text-sm text-espresso hover:bg-cream disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-espresso"
      >
        Activate
      </button>
      {disabled ? null : (
        <dialog
          ref={dialogRef}
          aria-labelledby={titleId}
          className="w-[min(32rem,calc(100%-2rem))] rounded-3xl border border-border bg-ivory p-5 text-espresso backdrop:bg-espresso/40 [&:not([open])]:hidden"
        >
          <h4 id={titleId} className="font-heading text-2xl text-espresso">
            Confirm activation
          </h4>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-cocoa">Professional</dt>
              <dd className="text-right text-espresso">{professionalName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-cocoa">Current studio</dt>
              <dd className="text-right text-espresso">{sourceStudio}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-cocoa">Destination studio</dt>
              <dd className="text-right text-espresso">{destinationStudio}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-cocoa">Effective date</dt>
              <dd className="text-right text-espresso">{transfer.effectiveOn}</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm leading-6 text-espresso">
            Activation changes the active studio and replaces the operational schedule.
          </p>
          <ActionForm action={activateProfessionalTransfer} submitLabel="Confirm activation">
            {() => (
              <>
                <input type="hidden" name="transferId" value={transfer.id} />
                <input type="hidden" name="revision" value={String(transfer.revision)} />
              </>
            )}
          </ActionForm>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="mt-2 inline-flex h-9 items-center rounded-full border border-border bg-ivory px-4 text-sm text-espresso hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-espresso"
          >
            Keep the current studio
          </button>
        </dialog>
      )}
    </>
  )
}

function InlineAction({
  action,
  transfer,
  label,
  disabled,
}: {
  action: (state: TransferActionState, formData: FormData) => Promise<TransferActionState>
  transfer: ProfessionalTransfer
  label: string
  disabled?: boolean
}) {
  return (
    <ActionForm action={action} submitLabel={label} disabled={disabled}>
      {() => (
        <>
          <input type="hidden" name="transferId" value={transfer.id} />
          <input type="hidden" name="revision" value={String(transfer.revision)} />
        </>
      )}
    </ActionForm>
  )
}

function CancelTransfer({ transfer }: { transfer: ProfessionalTransfer }) {
  return (
    <ActionForm action={cancelProfessionalTransfer} submitLabel="Cancel transfer">
      {() => (
        <>
          <input type="hidden" name="transferId" value={transfer.id} />
          <input type="hidden" name="revision" value={String(transfer.revision)} />
          <label className="block text-sm text-espresso">
            Cancellation note
            <input name="cancellationReason" maxLength={200} className={`${fieldClass} mt-1`} />
          </label>
        </>
      )}
    </ActionForm>
  )
}

function ActionForm({
  action,
  submitLabel,
  alternateLabel,
  disabled,
  children,
}: {
  action: (state: TransferActionState, formData: FormData) => Promise<TransferActionState>
  submitLabel: string
  alternateLabel?: string
  disabled?: boolean
  children: (state: TransferActionState) => ReactNode
}) {
  const router = useRouter()
  const [state, setState] = useState<TransferActionState>({})
  const [pending, setPending] = useState(false)

  return (
    <form
      className="mt-3 space-y-3"
      onSubmit={async (event) => {
        event.preventDefault()
        const form = event.currentTarget
        setPending(true)
        const result = await action(state, new FormData(form, (event.nativeEvent as SubmitEvent).submitter))
        setPending(false)
        setState(result)
        if (result.saved) router.refresh()
      }}
    >
      {state.error ? (
        <p role="alert" className="rounded-xl bg-beige px-3 py-2 text-sm text-espresso">
          {state.error}
        </p>
      ) : null}
      {children(state)}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="status"
          value="draft"
          disabled={pending || disabled}
          className="inline-flex h-9 items-center rounded-full border border-border bg-ivory px-4 text-sm text-espresso hover:bg-cream disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-espresso"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        {alternateLabel ? (
          <button
            type="submit"
            name="status"
            value="complete"
            disabled={pending}
            className="inline-flex h-9 items-center rounded-full bg-espresso px-4 text-sm text-ivory hover:bg-cocoa disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-espresso"
          >
            {alternateLabel}
          </button>
        ) : null}
      </div>
    </form>
  )
}

function TimePair({
  startName,
  endName,
  start,
  end,
  label,
}: {
  startName: string
  endName: string
  start: string
  end: string
  label: string
}) {
  return (
    <label className="block text-sm text-cocoa">
      {label}
      <span className="mt-1 grid grid-cols-2 gap-2">
        <input name={startName} type="time" defaultValue={start} className={fieldClass} />
        <input name={endName} type="time" defaultValue={end} className={fieldClass} />
      </span>
    </label>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <span className="mt-1 block text-sm text-cocoa">{message}</span>
}
