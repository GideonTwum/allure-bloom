"use client"

import { useRouter } from "next/navigation"
import { useState, type ReactNode } from "react"

import { saveOffering, saveService, type ServiceActionState } from "@/app/admin/service-actions"
import type { AdminRole } from "@/lib/admin/access"
import { filterAdminServices } from "@/lib/admin/service-input"
import type { ManagedOffering, ManagedService } from "@/lib/admin/service-catalogue"
import { serviceCategories, type ServiceCategoryId } from "@/lib/services/types"

type StudioOption = { id: string; name: string }

export function ServiceDesk({
  role,
  studios,
  services,
  offerings,
}: {
  role: AdminRole
  studios: StudioOption[]
  services: ManagedService[]
  offerings: ManagedOffering[]
}) {
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("all")
  const [listing, setListing] = useState<"all" | "listed" | "unlisted">("all")
  const [editing, setEditing] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const visible = filterAdminServices(services, { search, category, listing })
  const listed = services.filter((service) => service.isListed).length
  const active = offerings.filter((offering) => offering.isActive).length
  const bookable = offerings.filter((offering) => offering.isBookable).length
  const owner = role === "owner"

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-4xl text-espresso">Services</h1>
          <p className="mt-2 text-sm text-cocoa">
            {services.length} services · {listed} listed · {active} active offerings · {bookable}{" "}
            bookable
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
            {creating ? "Close" : "Create service"}
          </button>
        ) : (
          <p className="max-w-xs text-sm leading-5 text-cocoa">
            Catalogue details are managed by an owner. You can save offerings for your studios.
          </p>
        )}
      </header>

      <div className="grid gap-2 sm:grid-cols-[1fr_10rem_10rem]">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search services"
          aria-label="Search services"
          className={fieldClass}
        />
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          aria-label="Category"
          className={fieldClass}
        >
          <option value="all">All categories</option>
          {serviceCategories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          value={listing}
          onChange={(event) => setListing(event.target.value as "all" | "listed" | "unlisted")}
          aria-label="Listing status"
          className={fieldClass}
        >
          <option value="all">Listed and unlisted</option>
          <option value="listed">Listed</option>
          <option value="unlisted">Unlisted</option>
        </select>
      </div>

      {creating && owner ? (
        <section className="rounded-2xl border border-border bg-ivory px-4 py-4">
          <h2 className="font-heading text-2xl text-espresso">New service</h2>
          <p className="mt-1 text-sm text-cocoa">
            A new service stays publicly advertised and not studio confirmed. No studio offering is
            created until you save one.
          </p>
          <ServiceForm onDone={() => setCreating(false)} />
        </section>
      ) : null}

      {visible.length === 0 ? (
        <p className="rounded-2xl bg-ivory px-4 py-4 text-sm text-cocoa">No services match this search.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((service) => {
            const own = offerings.filter((offering) => offering.serviceId === service.id)
            const open = editing === service.id
            return (
              <li key={service.id} className="rounded-2xl border border-border bg-ivory px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base text-espresso">{service.name}</h2>
                    <p className="mt-1 text-sm text-cocoa">
                      {categoryName(service.category)} · {service.serviceType === "addon" ? "Add-on" : "Treatment"} ·{" "}
                      {service.isListed ? "Listed" : "Unlisted"} ·{" "}
                      {service.verificationStatus === "studio_confirmed"
                        ? "Studio confirmed"
                        : "Publicly advertised"}
                    </p>
                    <p className="mt-2 max-w-3xl text-sm leading-5 text-espresso">{service.description}</p>
                    <p className="mt-1 text-sm text-cocoa">{studioSummary(studios, own)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(open ? null : service.id)
                      setCreating(false)
                    }}
                    className="inline-flex h-9 items-center rounded-full border border-border px-3 text-sm text-espresso hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-espresso"
                  >
                    {open ? "Close" : "Edit"}
                  </button>
                </div>
                {open ? (
                  <div className="mt-4 border-t border-border pt-4">
                    {owner ? <ServiceForm service={service} onDone={() => setEditing(null)} /> : null}
                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      {studios.map((studio) => (
                        <OfferingForm
                          key={studio.id}
                          service={service}
                          studio={studio}
                          offering={own.find((item) => item.branchId === studio.id) ?? null}
                          onDone={() => setEditing(null)}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function ServiceForm({ service, onDone }: { service?: ManagedService; onDone: () => void }) {
  return (
    <ActionForm action={saveService} onDone={onDone} submitLabel={service ? "Save service" : "Create service"}>
      {(state) => (
        <>
          {service ? <input type="hidden" name="serviceId" value={service.id} /> : null}
          {service ? (
            <p className="text-sm text-cocoa">
              {service.slug} stays attached to this service. Verification is not changed here.
            </p>
          ) : null}
          <TextField label="Name" name="name" defaultValue={service?.name ?? ""} error={state.fieldErrors?.name} />
          <label className="block text-sm text-espresso">
            Description
            <textarea
              name="description"
              defaultValue={service?.description ?? ""}
              rows={3}
              aria-invalid={state.fieldErrors?.description ? true : undefined}
              className={`${fieldClass} h-auto py-2`}
            />
            <FieldError message={state.fieldErrors?.description} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-espresso">
              Category
              <select
                name="category"
                defaultValue={service?.category ?? "lashes"}
                className={`${fieldClass} mt-1`}
              >
                {serviceCategories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <FieldError message={state.fieldErrors?.category} />
            </label>
            <label className="block text-sm text-espresso">
              Type
              <select
                name="serviceType"
                defaultValue={service?.serviceType ?? "treatment"}
                className={`${fieldClass} mt-1`}
              >
                <option value="treatment">Treatment</option>
                <option value="addon">Add-on</option>
              </select>
              <FieldError message={state.fieldErrors?.serviceType} />
            </label>
          </div>
          <TextField
            label="Image reference"
            name="imageUrl"
            defaultValue={service?.imageUrl ?? ""}
            error={state.fieldErrors?.imageUrl}
          />
          <label className="flex items-center gap-2 text-sm text-espresso">
            <input name="listed" type="checkbox" value="true" defaultChecked={service?.isListed ?? false} />
            Listed in the public catalogue
          </label>
          <p className="text-sm text-cocoa">
            Unlisting removes booking eligibility. The price, duration, and active status stay. Listing it
            again does not make it bookable.
          </p>
        </>
      )}
    </ActionForm>
  )
}

function OfferingForm({
  service,
  studio,
  offering,
  onDone,
}: {
  service: ManagedService
  studio: StudioOption
  offering: ManagedOffering | null
  onDone: () => void
}) {
  return (
    <section className="rounded-xl bg-cream px-3 py-3">
      <h3 className="text-sm text-espresso">{studio.name}</h3>
      <p className="mt-1 text-xs text-cocoa">
        {offering ? offeringLabel(offering) : "No offering yet. Saving this form creates one."}
      </p>
      <ActionForm action={saveOffering} onDone={onDone} submitLabel="Save offering">
        {(state) => (
          <>
            <input type="hidden" name="serviceId" value={service.id} />
            <input type="hidden" name="branchId" value={studio.id} />
            <div className="grid grid-cols-3 gap-2">
              <TextField label="Price" name="price" defaultValue={offering?.priceGhs?.toString() ?? ""} error={state.fieldErrors?.price} />
              <TextField label="Minutes" name="duration" defaultValue={offering?.durationMinutes?.toString() ?? ""} error={state.fieldErrors?.duration} />
              <TextField label="Buffer" name="buffer" defaultValue={offering?.bufferMinutes?.toString() ?? "0"} error={state.fieldErrors?.buffer} />
            </div>
            <label className="flex items-center gap-2 text-sm text-espresso">
              <input name="active" type="checkbox" value="true" defaultChecked={offering?.isActive ?? false} />
              Active
            </label>
            <FieldError message={state.fieldErrors?.active} />
            <label className="flex items-center gap-2 text-sm text-espresso">
              <input name="bookable" type="checkbox" value="true" defaultChecked={offering?.isBookable ?? false} />
              Bookable
            </label>
            <FieldError message={state.fieldErrors?.bookable} />
          </>
        )}
      </ActionForm>
    </section>
  )
}

function ActionForm({
  action,
  onDone,
  submitLabel,
  children,
}: {
  action: (state: ServiceActionState, formData: FormData) => Promise<ServiceActionState>
  onDone: () => void
  submitLabel: string
  children: (state: ServiceActionState) => ReactNode
}) {
  const router = useRouter()
  const [state, setState] = useState<ServiceActionState>({})
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
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center rounded-full bg-espresso px-4 text-sm text-ivory hover:bg-cocoa disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-espresso"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="inline-flex h-9 items-center rounded-full px-3 text-sm text-cocoa hover:text-espresso focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-espresso"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

function TextField({
  label,
  name,
  defaultValue,
  error,
}: {
  label: string
  name: string
  defaultValue: string
  error?: string
}) {
  return (
    <label className="block text-sm text-espresso">
      {label}
      <input
        name={name}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        className={`${fieldClass} mt-1`}
      />
      <FieldError message={error} />
    </label>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <span role="alert" className="mt-1 block text-sm text-cocoa">
      {message}
    </span>
  )
}

function studioSummary(studios: StudioOption[], offerings: ManagedOffering[]) {
  if (studios.length === 0) return "No studio is selected."
  return studios
    .map((studio) => {
      const offering = offerings.find((item) => item.branchId === studio.id)
      return `${studio.name}: ${offering ? offeringLabel(offering) : "No offering"}`
    })
    .join(" · ")
}

function offeringLabel(offering: ManagedOffering) {
  if (offering.isBookable) return "Bookable"
  if (offering.isActive) return "Active"
  const missing = offering.priceGhs === null || offering.durationMinutes === null
  return missing ? "Inactive, price or duration unset" : "Inactive"
}

function categoryName(id: ServiceCategoryId) {
  return serviceCategories.find((category) => category.id === id)?.name ?? id
}

const fieldClass =
  "h-10 w-full rounded-xl border border-border bg-ivory px-3 text-sm text-espresso outline-none focus-visible:border-cocoa focus-visible:ring-3 focus-visible:ring-cocoa/30"
