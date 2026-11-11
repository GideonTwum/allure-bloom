"use client"

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react"
import Link from "next/link"
import { motion } from "motion/react"

import { Container } from "@/components/layout/container"
import { BlurFade } from "@/components/ui/blur-fade"
import { buttonVariants } from "@/components/ui/button"
import type { BranchId } from "@/lib/content"
import type { CatalogueSnapshot } from "@/lib/catalogue/types"
import { bookableServicesAt } from "@/lib/services/bookable"
import {
  accountGate,
  listEligibleProfessionals,
  offeredSlots,
  submitBookingDraft,
  visitMoment,
} from "@/lib/booking/dependencies"
import {
  advance,
  blockerFor,
  bookingPolicy,
  branchName,
  clampStep,
  draftFromQuery,
  furthestStepIndex,
  publicQuery,
  retreat,
  selectBranch,
  selectProfessional,
  selectService,
  selectVisitType,
  stepLabel,
  stepsFor,
} from "@/lib/booking/flow"
import type {
  BookingDraft,
  BookingQuery,
  BookingStepId,
  VisitType,
} from "@/lib/booking/types"
import { cn } from "@/lib/utils"

const choiceClass =
  "w-full rounded-2xl border px-4 py-3 text-left transition-[transform,box-shadow,border-color] duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-espresso motion-reduce:transition-none motion-reduce:hover:translate-y-0"

function emptySubscribe() {
  return () => {}
}

function clientClock() {
  const now = new Date()
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Accra",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value
  const year = value("year")
  const month = value("month")
  const monthIndex = month ? Number(month) - 1 : now.getMonth()
  return `${year ?? now.getFullYear()}-${monthIndex}|${now.toISOString()}`
}

function calendarCells(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number)
  const first = new Date(Date.UTC(year, month, 1, 12)).getUTCDay()
  const days = new Date(Date.UTC(year, month + 1, 0, 12)).getUTCDate()
  const cells: Array<number | null> = Array.from({ length: first }, () => null)
  for (let day = 1; day <= days; day += 1) cells.push(day)
  while (cells.length < 42) cells.push(null)
  return { year, month, cells: cells.slice(0, 42) }
}

export function BookingExperience({
  query,
  menu,
}: {
  query: BookingQuery
  menu: CatalogueSnapshot
}) {
  const restored = draftFromQuery(query, menu)
  const [draft, setDraft] = useState<BookingDraft>(restored.draft)
  const [step, setStep] = useState<BookingStepId>(restored.step)
  const [refusal, setRefusal] = useState<string | null>(null)
  const active = clampStep(step, draft, menu)
  const steps = stepsFor(draft.visitType)
  const activeIndex = steps.indexOf(active)
  const furthest = furthestStepIndex(draft, menu)
  const blocker = blockerFor(active, draft, menu)

  useEffect(() => {
    const params = publicQuery(draft, active, menu)
    const next = `/booking?${params.toString()}`
    if (`${window.location.pathname}${window.location.search}` !== next) {
      window.history.replaceState(null, "", next)
    }
  }, [draft, active, menu])

  function update(recipe: (current: BookingDraft) => BookingDraft) {
    setRefusal(null)
    setDraft((current) => recipe(current))
  }

  function go(next: BookingStepId) {
    setRefusal(null)
    setStep(clampStep(next, draft, menu))
  }

  function continueStep() {
    if (active === "review") {
      setRefusal(submitBookingDraft(draft).reason)
      return
    }
    if (blocker) return
    setStep(advance(draft, active, menu))
  }

  return (
    <section className="py-12 sm:py-16" aria-labelledby="booking-heading">
      <Container className="min-w-0">
        <BlurFade>
          <p className="text-xs tracking-[0.28em] text-cocoa uppercase">Appointment</p>
        </BlurFade>
        <h1
          id="booking-heading"
          className="mt-3 max-w-2xl font-heading text-5xl leading-[0.95] text-espresso sm:text-6xl"
        >
          Book an appointment
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-cocoa">
          Choose a studio visit or a home service. A time is held only after
          the server confirms it, and this page cannot confirm one today.
        </p>

        <ol
          aria-label="Booking progress"
          className="mt-8 flex max-w-full gap-2 overflow-x-auto pb-1"
        >
          {steps.map((item, index) => {
            const reachable = index <= furthest
            const current = item === active
            return (
              <li key={item} className="shrink-0">
                <button
                  type="button"
                  disabled={!reachable}
                  aria-current={current ? "step" : undefined}
                  onClick={() => go(item)}
                  className={cn(
                    "flex h-10 items-center gap-2 rounded-full border px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-espresso disabled:cursor-not-allowed disabled:opacity-45",
                    current
                      ? "border-espresso bg-beige text-espresso"
                      : "border-border bg-ivory text-cocoa",
                  )}
                >
                  <span className="font-heading text-base leading-none">{index + 1}</span>
                  {stepLabel(item)}
                </button>
              </li>
            )
          })}
        </ol>

        <motion.div
          key={active}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="mt-4 rounded-[1.5rem] border border-border bg-ivory px-4 py-5 sm:px-6"
        >
          <StepPanel
            step={active}
            draft={draft}
            onType={(visitType) => update((current) => selectVisitType(current, visitType))}
            onBranch={(branchId) => update((current) => selectBranch(current, branchId))}
            onLocation={(location) =>
              update((current) => ({ ...current, location }))
            }
            onService={(serviceId) => update((current) => selectService(current, serviceId))}
            onProfessional={(professionalId) =>
              update((current) => selectProfessional(current, professionalId))
            }
            onTime={(date, time) => update((current) => ({ ...current, date, time }))}
            onAccountRefuse={setRefusal}
            menu={menu}
          />

          {blocker ? (
            <p role="alert" className="mt-5 text-sm leading-relaxed text-espresso">
              {blocker}
            </p>
          ) : null}
          {refusal ? (
            <p role="alert" className="mt-5 text-sm leading-relaxed text-espresso">
              {refusal}
            </p>
          ) : null}

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => go(retreat(draft, active, menu))}
              disabled={activeIndex === 0}
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-11 rounded-full border-espresso/20 bg-ivory px-5 disabled:opacity-40",
              )}
            >
              Back
            </button>
            <button
              type="button"
              onClick={continueStep}
              disabled={Boolean(blocker)}
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-11 rounded-full px-5 disabled:opacity-40",
              )}
            >
              {active === "review" ? "Submit request" : "Continue"}
            </button>
          </div>
        </motion.div>
      </Container>
    </section>
  )
}

function StepPanel({
  step,
  draft,
  onType,
  onBranch,
  onLocation,
  onService,
  onProfessional,
  onTime,
  onAccountRefuse,
  menu,
}: {
  step: BookingStepId
  draft: BookingDraft
  onType: (visitType: VisitType) => void
  onBranch: (branchId: BranchId) => void
  onLocation: (location: BookingDraft["location"]) => void
  onService: (serviceId: string) => void
  onProfessional: (professionalId: NonNullable<BookingDraft["professionalId"]>) => void
  onTime: (date: string, time: string) => void
  onAccountRefuse: (reason: string) => void
  menu: CatalogueSnapshot
}) {
  if (step === "type") {
    return (
      <ChoiceGroup label="Choose a booking type">
        <Choice
          name="visit-type"
          selected={draft.visitType === "walk-in"}
          title="Walk-in"
          detail={`${bookingPolicy.walkIn.payment} Notice of ${bookingPolicy.leadTimeHours} hours. ${bookingPolicy.walkIn.confirmation}`}
          onSelect={() => onType("walk-in")}
        />
        <Choice
          name="visit-type"
          selected={draft.visitType === "home"}
          title="Home service"
          detail={`Coverage is still pending. ${bookingPolicy.home.payment} ${bookingPolicy.home.confirmation}`}
          onSelect={() => onType("home")}
        />
      </ChoiceGroup>
    )
  }

  if (step === "branch") {
    if (menu.studios.length === 0) {
      return (
        <EmptyState title="No studios">
          No studios were returned from the database, so a visit cannot be chosen.
        </EmptyState>
      )
    }
    return (
      <ChoiceGroup label="Choose a studio">
        {menu.studios.map((branch) => (
          <Choice
            key={branch.id}
            name="studio"
            selected={draft.branchId === branch.id}
            title={branch.name}
            detail={branch.area}
            onSelect={() => onBranch(branch.id)}
          />
        ))}
      </ChoiceGroup>
    )
  }

  if (step === "location") {
    return <LocationFields location={draft.location} onChange={onLocation} />
  }

  if (step === "service") {
    const offered = draft.branchId ? bookableServicesAt(menu, draft.branchId) : []
    if (offered.length === 0) {
      return (
        <EmptyState title="No bookable treatments">
          {branchName(draft.branchId, menu)} has no treatment with a confirmed price,
          duration, and studio assignment. Published names stay on the{" "}
          <Link
            href="/services"
            className="font-medium text-espresso underline decoration-cocoa/40 underline-offset-4"
          >
            service list
          </Link>{" "}
          for enquiry.
        </EmptyState>
      )
    }
    return (
      <ChoiceGroup label="Choose a treatment">
        {offered.map((service) => (
          <Choice
            key={service.id}
            name="service"
            selected={draft.serviceId === service.id}
            title={service.name}
            detail={serviceDetail(service.priceGhs, service.durationMinutes)}
            onSelect={() => onService(service.id)}
          />
        ))}
      </ChoiceGroup>
    )
  }

  if (step === "professional") {
    const people =
      draft.branchId && draft.serviceId
        ? listEligibleProfessionals(draft.branchId, draft.serviceId)
        : []
    return (
      <ChoiceGroup label="Choose a professional">
        <Choice
          name="professional"
          selected={draft.professionalId === "anyone"}
          title="Anyone available"
          detail="No named professional is published. This does not hold a time."
          onSelect={() => onProfessional("anyone")}
        />
        {people.map((person) => (
          <Choice
            key={person.id}
            name="professional"
            selected={draft.professionalId === person.id}
            title={person.name}
            detail="Published for this treatment and studio."
            onSelect={() => onProfessional(person.id)}
          />
        ))}
      </ChoiceGroup>
    )
  }

  if (step === "schedule") {
    return <ScheduleStep draft={draft} onTime={onTime} />
  }

  if (step === "account") {
    return <AccountStep onRefuse={onAccountRefuse} />
  }

  return <Review draft={draft} menu={menu} />
}

function LocationFields({
  location,
  onChange,
}: {
  location: BookingDraft["location"]
  onChange: (location: BookingDraft["location"]) => void
}) {
  function set(field: keyof BookingDraft["location"], value: string) {
    onChange({ ...location, [field]: value })
  }

  return (
    <div>
      <h2 className="font-heading text-3xl text-espresso">Where should we come?</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-cocoa">
        A home visit moves from pending approval, to awaiting payment, and only
        then to confirmed. Coverage for this address is not confirmed.
      </p>
      <div className="mt-5 grid gap-4">
        <Field label="Address" value={location.address} onChange={(value) => set("address", value)} />
        <Field label="Landmark" value={location.landmark} onChange={(value) => set("landmark", value)} />
        <Field
          label="GhanaPost GPS"
          optional
          value={location.ghanaPostGps}
          onChange={(value) => set("ghanaPostGps", value)}
        />
        <Field
          label="Notes"
          optional
          value={location.notes}
          onChange={(value) => set("notes", value)}
        />
      </div>
    </div>
  )
}

function ScheduleStep({
  draft,
  onTime,
}: {
  draft: BookingDraft
  onTime: (date: string, time: string) => void
}) {
  const clock = useSyncExternalStore(emptySubscribe, clientClock, () => "pending")
  const monthKey = clock === "pending" ? "pending" : clock.split("|")[0]
  const calendar = monthKey === "pending" ? null : calendarCells(monthKey)
  const slots = clock === "pending" ? [] : offeredSlots(draft, new Date(clock.split("|")[1]))
  const openDays = new Set(
    slots
      .map((slot) => visitMoment(slot.startIso)?.date)
      .filter((day): day is string => Boolean(day)),
  )

  return (
    <div>
      <h2 className="font-heading text-3xl text-espresso">Date and time</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-cocoa">
        Times need {bookingPolicy.leadTimeHours} hours&apos; notice. None are
        loaded, and selecting a day here does not hold a visit.
      </p>
      <div className="mt-5 grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)]">
        <div>
          <p className="text-sm text-espresso">
            {calendar
              ? new Date(Date.UTC(calendar.year, calendar.month, 1, 12)).toLocaleString("en-GB", {
                  month: "long",
                  year: "numeric",
                  timeZone: "Africa/Accra",
                })
              : "Calendar"}
          </p>
          <div className="mt-3 grid w-full max-w-xs grid-cols-7 gap-1" aria-hidden={calendar === null}>
            {(calendar?.cells ?? Array.from({ length: 42 }, () => null)).map((day, index) => {
              const dateKey =
                calendar && day
                  ? `${calendar.year}-${String(calendar.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                  : null
              const open = dateKey !== null && openDays.has(dateKey)
              return (
                <button
                  key={index}
                  type="button"
                  disabled={!open}
                  aria-pressed={open && draft.date === dateKey}
                  onClick={() => {
                    if (dateKey) onTime(dateKey, "")
                  }}
                  className="h-8 rounded-full text-xs text-cocoa disabled:cursor-not-allowed disabled:text-cocoa/40"
                >
                  {day ?? ""}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <h3 className="text-sm text-espresso">Available times</h3>
          {slots.length === 0 ? (
            <p className="mt-3 text-sm leading-relaxed text-cocoa">
              No times to show. The studio calendar is not connected.
            </p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2">
              {slots.map((slot) => {
                const moment = visitMoment(slot.startIso)
                const when = moment?.date
                const time = moment?.time
                const visible = !draft.date || draft.date === when
                if (!visible || !when || !time) return null
                return (
                  <li key={slot.id}>
                    <button
                      type="button"
                      aria-pressed={draft.date === when && draft.time === time}
                      onClick={() => onTime(when, time)}
                      className="rounded-full border border-border px-3 py-2 text-sm text-espresso"
                    >
                      {slot.label}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function Review({ draft, menu }: { draft: BookingDraft; menu: CatalogueSnapshot }) {
  const service = draft.branchId
    ? bookableServicesAt(menu, draft.branchId).find((item) => item.id === draft.serviceId)
    : null
  const home = draft.visitType === "home"
  return (
    <div>
      <h2 className="font-heading text-3xl text-espresso">Review</h2>
      <dl className="mt-4 space-y-3 text-sm text-espresso">
        <ReviewItem label="Booking type" value={home ? "Home service" : draft.visitType === "walk-in" ? "Walk-in" : "Not chosen"} />
        <ReviewItem label="Studio" value={branchName(draft.branchId, menu)} />
        {home ? (
          <ReviewItem
            label="Address"
            value={draft.location.address.trim() || "Not entered"}
          />
        ) : null}
        <ReviewItem label="Service" value={service?.name ?? "Not chosen"} />
        <ReviewItem
          label="Price"
          value={service?.priceGhs == null ? "Not published" : `GHS ${service.priceGhs}`}
        />
        {home ? <ReviewItem label="Landmark" value={draft.location.landmark.trim() || "Not entered"} /> : null}
        <ReviewItem
          label="Professional"
          value={professionalLabel(draft)}
        />
        <ReviewItem
          label="Time"
          value={draft.date && draft.time ? `${draft.date} ${draft.time}` : "Not held"}
        />
      </dl>
      <div className="mt-5 max-w-2xl space-y-2 text-sm leading-relaxed text-cocoa">
        {home ? (
          <>
            <p>{bookingPolicy.home.lifecycle.join(" → ")}</p>
            <p>{bookingPolicy.home.payment}</p>
            <p>{bookingPolicy.home.confirmation}</p>
            <p>Cancellation cutoff: {bookingPolicy.home.cancellationHours} hours. {bookingPolicy.home.refunds}</p>
          </>
        ) : (
          <>
            <p>{bookingPolicy.walkIn.payment}</p>
            <p>{bookingPolicy.walkIn.confirmation}</p>
            <p>Cancellation or rescheduling cutoff: {bookingPolicy.walkIn.cancellationHours} hours.</p>
          </>
        )}
        <p>A taken time is refused by the server. This page cannot place that hold.</p>
      </div>
    </div>
  )
}

function ChoiceGroup({ label, children }: { label: string; children: ReactNode }) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(event.key)) return
    const radios = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)'),
    )
    const current = radios.findIndex((radio) => radio === document.activeElement)
    if (current < 0 || radios.length === 0) return
    event.preventDefault()
    const delta = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1
    const next = radios[(current + delta + radios.length) % radios.length]
    next.focus()
    next.click()
  }

  return (
    <div>
      <h2 className="font-heading text-3xl text-espresso">{label}</h2>
      <div
        role="radiogroup"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="mt-4 grid gap-3 sm:grid-cols-2"
      >
        {children}
      </div>
    </div>
  )
}

function Choice({
  name,
  selected,
  title,
  detail,
  onSelect,
}: {
  name: string
  selected: boolean
  title: string
  detail: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      name={name}
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        choiceClass,
        selected
          ? "border-espresso bg-beige text-espresso"
          : "border-border bg-cream hover:-translate-y-[3px] hover:shadow-[0_8px_18px_rgb(56_35_30/0.08)]",
      )}
    >
      <span className="block font-heading text-2xl leading-tight">{title}</span>
      <span className="mt-1 block text-sm leading-relaxed text-cocoa">{detail}</span>
    </button>
  )
}

function Field({
  label,
  value,
  onChange,
  optional = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  optional?: boolean
}) {
  const id = `booking-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`
  return (
    <label htmlFor={id} className="block text-sm text-espresso">
      {label}
      {optional ? <span className="text-cocoa"> · optional</span> : null}
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        className="mt-2 block w-full rounded-2xl border border-border bg-cream px-4 py-3 text-espresso focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-espresso"
      />
    </label>
  )
}

function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="font-heading text-3xl text-espresso">{title}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-cocoa">{children}</p>
    </div>
  )
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs tracking-[0.16em] text-cocoa uppercase">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  )
}

function AccountStep({ onRefuse }: { onRefuse: (reason: string) => void }) {
  const [mode, setMode] = useState<"sign-in" | "create">("sign-in")

  function refuse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onRefuse(accountGate().reason)
  }

  return (
    <div>
      <h2 className="font-heading text-3xl text-espresso">Sign in to continue</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-cocoa">
        {accountGate().reason} Your studio, treatment, and time stay on this page.
      </p>
      <div className="mt-4 flex gap-2" role="tablist" aria-label="Account">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "sign-in"}
          onClick={() => setMode("sign-in")}
          className={cn(
            "h-10 rounded-full border px-4 text-sm",
            mode === "sign-in" ? "border-espresso bg-beige text-espresso" : "border-border bg-cream text-cocoa",
          )}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "create"}
          onClick={() => setMode("create")}
          className={cn(
            "h-10 rounded-full border px-4 text-sm",
            mode === "create" ? "border-espresso bg-beige text-espresso" : "border-border bg-cream text-cocoa",
          )}
        >
          Create account
        </button>
      </div>
      <form onSubmit={refuse} className="mt-4 grid max-w-md gap-4">
        {mode === "create" ? (
          <label htmlFor="booking-name" className="block text-sm text-espresso">
            Name
            <input
              id="booking-name"
              name="name"
              required
              autoComplete="name"
              className="mt-2 block w-full rounded-2xl border border-border bg-cream px-4 py-3 text-espresso focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-espresso"
            />
          </label>
        ) : null}
        <label htmlFor="booking-email" className="block text-sm text-espresso">
          Email
          <input
            id="booking-email"
            type="email"
            name="email"
            required
            autoComplete="username"
            className="mt-2 block w-full rounded-2xl border border-border bg-cream px-4 py-3 text-espresso focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-espresso"
          />
        </label>
        <label htmlFor="booking-password" className="block text-sm text-espresso">
          Password
          <input
            id="booking-password"
            type="password"
            name="password"
            required
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            className="mt-2 block w-full rounded-2xl border border-border bg-cream px-4 py-3 text-espresso focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-espresso"
          />
        </label>
        <button type="submit" className={cn(buttonVariants({ size: "lg" }), "h-11 w-fit rounded-full px-5")}>
          {mode === "sign-in" ? "Sign in" : "Create account"}
        </button>
      </form>
    </div>
  )
}

function professionalLabel(draft: BookingDraft) {
  if (draft.professionalId === "anyone") return "Anyone available"
  if (!draft.professionalId || !draft.branchId || !draft.serviceId) return "Not chosen"
  return (
    listEligibleProfessionals(draft.branchId, draft.serviceId).find(
      (person) => person.id === draft.professionalId,
    )?.name ?? "Not chosen"
  )
}

function serviceDetail(priceGhs: number | null, durationMinutes: number | null) {
  const price = priceGhs == null ? "Price not published" : `GHS ${priceGhs}`
  const duration =
    durationMinutes == null ? "duration not published" : `${durationMinutes} minutes`
  return `${price}. ${duration}.`
}
