"use client"

import { useRouter } from "next/navigation"
import { useState, type ReactNode } from "react"

import {
  addScheduleException,
  removeScheduleException,
  saveWeeklySchedule,
  type ScheduleActionState,
} from "@/app/admin/schedule-actions"
import {
  weekdayName,
  weekdays,
  type WeeklySchedule,
} from "@/lib/admin/schedule-input"

const fieldClass =
  "h-10 w-full rounded-xl border border-border bg-ivory px-3 text-sm text-espresso outline-none focus-visible:border-cocoa focus-visible:ring-3 focus-visible:ring-cocoa/30"

export function ProfessionalSchedule({
  professionalId,
  schedule,
  ready,
  accraDate,
}: {
  professionalId: string
  schedule?: WeeklySchedule
  ready: boolean
  accraDate: string
}) {
  const [offDay, setOffDay] = useState(schedule ? String(schedule.offWeekday) : "")
  if (!ready) {
    return (
      <section className="mt-4 border-t border-border pt-4">
        <h3 className="font-heading text-xl text-espresso">Weekly schedule</h3>
        <p className="mt-2 text-sm text-cocoa">Weekly schedules are not available yet.</p>
      </section>
    )
  }

  const chosen = Number(offDay)
  return (
    <section className="mt-4 border-t border-border pt-4">
      <h3 className="font-heading text-xl text-espresso">Weekly schedule</h3>
      <p className="mt-2 text-sm leading-6 text-cocoa">
        Choose one regular off-day. The other six days are working days. Nothing is chosen automatically, and a draft
        is not used for appointments.
      </p>
      {schedule ? (
        <p className="mt-2 text-sm text-espresso">
          {schedule.status === "complete" ? "Complete" : "Draft"} · regular off-day {weekdayName(schedule.offWeekday)}
        </p>
      ) : (
        <p className="mt-2 text-sm text-espresso">No regular off-day has been chosen.</p>
      )}
      <ScheduleForm
        action={saveWeeklySchedule}
        submitLabel="Save draft"
        alternateLabel="Mark complete"
      >
        {(state) => (
          <>
            <input type="hidden" name="professionalId" value={professionalId} />
            <input type="hidden" name="revision" value={schedule ? String(schedule.revision) : "0"} />
            <label className="block text-sm text-espresso">
              Regular off-day
              <select
                name="offDay"
                value={offDay}
                onChange={(event) => setOffDay(event.target.value)}
                className={`${fieldClass} mt-1`}
              >
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
                const shift = schedule?.intervals.find(
                  (interval) => interval.weekday === weekday.id && interval.kind === "shift",
                )
                const pause = schedule?.intervals.find(
                  (interval) => interval.weekday === weekday.id && interval.kind === "break",
                )
                const off = chosen === weekday.id
                return (
                  <div key={weekday.id} className="grid gap-2 sm:grid-cols-[7rem_1fr_1fr]">
                    <p className="self-center text-sm text-espresso">{weekday.name}</p>
                    {off ? (
                      <p className="text-sm text-cocoa sm:col-span-2">Regular off-day</p>
                    ) : (
                      <>
                        <TimePair
                          startName={`shift-${weekday.id}-start`}
                          endName={`shift-${weekday.id}-end`}
                          start={shift?.starts ?? ""}
                          end={shift?.ends ?? ""}
                          label="Shift"
                        />
                        <TimePair
                          startName={`break-${weekday.id}-start`}
                          endName={`break-${weekday.id}-end`}
                          start={pause?.starts ?? ""}
                          end={pause?.ends ?? ""}
                          label="Break"
                        />
                      </>
                    )}
                    <FieldError message={state.fieldErrors?.[`day-${weekday.id}`]} />
                  </div>
                )
              })}
            </div>
          </>
        )}
      </ScheduleForm>
      {schedule ? (
        <ExceptionEditor
          professionalId={professionalId}
          offDay={schedule.offWeekday}
          schedule={schedule}
          accraDate={accraDate}
        />
      ) : null}
    </section>
  )
}

function ExceptionEditor({
  professionalId,
  offDay,
  schedule,
  accraDate,
}: {
  professionalId: string
  offDay: number
  schedule: WeeklySchedule
  accraDate: string
}) {
  return (
    <div className="mt-4">
      <h4 className="text-sm text-espresso">Exceptions</h4>
      <p className="mt-1 text-sm leading-6 text-cocoa">
        Leave, swaps, special hours, and approved work on the off-day apply to a date. They do not change the regular
        off-day. Dates follow the Accra calendar. Today in Accra is {accraDate}.
      </p>
      {schedule.exceptions.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {schedule.exceptions.map((exception) => (
            <li key={exception.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-espresso">
              <span>{exceptionLabel(exception)}</span>
              <ScheduleForm action={removeScheduleException} submitLabel="Remove">
                {() => <input type="hidden" name="exceptionId" value={exception.id} />}
              </ScheduleForm>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-cocoa">No date exceptions.</p>
      )}
      <ScheduleForm action={addScheduleException} submitLabel="Add exception">
        {(state) => (
          <>
            <input type="hidden" name="professionalId" value={professionalId} />
            <input type="hidden" name="offDay" value={offDay} />
            <input type="hidden" name="existingExceptions" value={JSON.stringify(schedule.exceptions)} />
            <label className="block text-sm text-espresso">
              Type
              <select name="kind" defaultValue="additional_leave" className={`${fieldClass} mt-1`}>
                <option value="additional_leave">Additional leave</option>
                <option value="off_day_swap">Off-day swap</option>
                <option value="special_hours">Special hours</option>
                <option value="partial_absence">Partial-day absence</option>
                <option value="off_day_work">Work on the regular off-day</option>
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm text-espresso">
                Date
                <input name="date" type="date" defaultValue={accraDate} className={`${fieldClass} mt-1`} />
              </label>
              <label className="block text-sm text-espresso">
                Original off-day
                <input name="originalOffDate" type="date" defaultValue={accraDate} className={`${fieldClass} mt-1`} />
              </label>
              <label className="block text-sm text-espresso">
                Replacement off-day
                <input name="replacementOffDate" type="date" defaultValue={accraDate} className={`${fieldClass} mt-1`} />
              </label>
              <TimePair startName="starts" endName="ends" start="" end="" label="Hours" />
            </div>
            <FieldError message={state.fieldErrors?.date ?? state.fieldErrors?.swap ?? state.fieldErrors?.offDay} />
          </>
        )}
      </ScheduleForm>
    </div>
  )
}

function exceptionLabel(exception: WeeklySchedule["exceptions"][number]) {
  if (exception.kind === "off_day_swap") {
    return `Off-day swap ${exception.originalOffDate} to ${exception.replacementOffDate}`
  }
  if (exception.kind === "additional_leave") return `Additional leave ${exception.date}`
  if (exception.kind === "off_day_work") return `Work on off-day ${exception.date} ${exception.starts}–${exception.ends}`
  if (exception.kind === "partial_absence") return `Partial absence ${exception.date} ${exception.starts}–${exception.ends}`
  return `Special hours ${exception.date} ${exception.starts}–${exception.ends}`
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

function ScheduleForm({
  action,
  submitLabel,
  alternateLabel,
  children,
}: {
  action: (state: ScheduleActionState, formData: FormData) => Promise<ScheduleActionState>
  submitLabel: string
  alternateLabel?: string
  children: (state: ScheduleActionState) => ReactNode
}) {
  const router = useRouter()
  const [state, setState] = useState<ScheduleActionState>({})
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
          disabled={pending}
          className="inline-flex h-9 items-center rounded-full border border-border px-4 text-sm text-espresso hover:bg-cream disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-espresso"
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

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <span className="mt-1 block text-sm text-cocoa">{message}</span>
}
