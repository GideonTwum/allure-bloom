"use client"

import { useEffect, useState, type KeyboardEvent } from "react"
import Link from "next/link"

import { Container } from "@/components/layout/container"
import { BlurFade } from "@/components/ui/blur-fade"
import { buttonVariants } from "@/components/ui/button"
import { serviceIsBookable, branchOfferingIsBookable } from "@/lib/services/bookable"
import { serviceCategories, type ServiceRecord } from "@/lib/services/types"
import type { BranchServiceConfiguration, Studio } from "@/lib/supabase/rows"
import { focusById, nextIndex } from "@/lib/tabs"
import { cn } from "@/lib/utils"

const filters = [
  { id: "all", name: "All" },
  ...serviceCategories.map((category) => ({ id: category.id, name: category.name })),
] as const

type FilterId = (typeof filters)[number]["id"]

const cta =
  "h-11 rounded-full px-5 text-sm transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0"

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs tracking-[0.14em] text-espresso uppercase">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function offeringFacts(
  offering: BranchServiceConfiguration,
  ready: boolean,
) {
  const price = offering.priceGhs === null ? "price not published" : `GHS ${offering.priceGhs}`
  const duration =
    offering.durationMinutes === null
      ? "duration not published"
      : `${offering.durationMinutes} minutes`
  return `${price}. ${duration}. ${ready ? "Ready to book" : "Enquiry only"}.`
}

export function ServiceCatalogue({
  services,
  offerings,
  studios,
}: {
  services: ServiceRecord[]
  offerings: BranchServiceConfiguration[]
  studios: Studio[]
}) {
  const [filter, setFilter] = useState<FilterId>("all")

  useEffect(() => {
    const apply = () => {
      const hash = window.location.hash.replace("#", "")
      if (filters.some((item) => item.id === hash)) setFilter(hash as FilterId)
    }
    apply()
    window.addEventListener("hashchange", apply)
    return () => window.removeEventListener("hashchange", apply)
  }, [])

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = filters.findIndex((item) => item.id === filter)
    const next = nextIndex(currentIndex, filters.length, event.key)
    if (next === null) return
    event.preventDefault()
    const id = filters[next].id
    setFilter(id)
    focusById(`service-filter-${id}`)
  }

  const visible =
    filter === "all"
      ? services
      : services.filter((service) => service.category === filter)
  const activeCategory =
    filter === "all"
      ? null
      : serviceCategories.find((category) => category.id === filter)

  return (
    <section className="py-16 sm:py-20" aria-labelledby="services-page-heading">
      <Container>
        <BlurFade>
          <p className="font-heading italic text-3xl text-cocoa">the menu</p>
        </BlurFade>
        <h1
          id="services-page-heading"
          className="mt-3 max-w-2xl font-heading text-5xl leading-[0.95] text-espresso sm:text-6xl"
        >
          Services
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-pretty text-muted-foreground">
          These treatments are listed from the studio catalogue. A treatment
          can be booked only when a studio has confirmed it and published a
          price, duration, and offering. A name without an offering stays
          visible for enquiry.
        </p>

        <div
          role="radiogroup"
          aria-label="Filter services by category"
          onKeyDown={onKeyDown}
          className="mt-10 flex flex-wrap gap-2"
        >
          {filters.map((item) => {
            const selected = item.id === filter
            return (
              <button
                key={item.id}
                id={`service-filter-${item.id}`}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => setFilter(item.id)}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-espresso",
                  selected
                    ? "border-espresso bg-beige text-espresso"
                    : "border-border bg-background text-espresso/75 hover:text-espresso",
                )}
              >
                {item.name}
              </button>
            )
          })}
        </div>

        <p className="mt-6 text-sm text-muted-foreground" aria-live="polite">
          {visible.length === 0
            ? "No published treatments in this category."
            : `Showing ${visible.length} ${visible.length === 1 ? "treatment" : "treatments"}.`}
        </p>

        {visible.length === 0 && activeCategory ? (
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
            {activeCategory.description}
          </p>
        ) : null}

        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((service) => {
            const ownOfferings = offerings.filter(
              (offering) => offering.serviceId === service.id && offering.isActive,
            )
            const bookable = serviceIsBookable(service, ownOfferings)
            const category = serviceCategories.find(
              (item) => item.id === service.category,
            )
            return (
              <li key={service.id} id={service.slug}>
                <article className="flex h-full flex-col rounded-[1.75rem] border border-border bg-ivory px-6 py-7">
                  <p className="text-xs tracking-[0.18em] text-espresso uppercase">
                    {category?.name}
                    {service.serviceType === "addon" ? " · Add-on" : ""}
                  </p>
                  <h2 className="mt-3 font-heading text-3xl text-espresso">{service.name}</h2>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {service.description}
                  </p>
                  <dl className="mt-5 space-y-2 text-sm text-espresso/80">
                    {ownOfferings.length === 0 ? (
                      <>
                        <Fact label="Price" value="Not published" />
                        <Fact label="Duration" value="Not published" />
                        <Fact label="Studios" value="Not assigned" />
                      </>
                    ) : (
                      ownOfferings.map((offering) => {
                        const studio = studios.find((item) => item.id === offering.branchId)
                        const ready = branchOfferingIsBookable(service, offering)
                        return (
                          <div key={offering.branchId}>
                            <Fact
                              label={studio?.name ?? "Studio"}
                              value={offeringFacts(offering, ready)}
                            />
                          </div>
                        )
                      })
                    )}
                    <Fact label="Booking" value={bookable ? "Ready to book" : "Enquiry only"} />
                  </dl>
                  <div className="mt-6">
                    {bookable ? (
                      <Link
                        href={`/booking?service=${service.slug}`}
                        className={cn(buttonVariants({ size: "lg" }), cta)}
                      >
                        Book this treatment
                      </Link>
                    ) : (
                      <Link
                        href="/#contacts"
                        className={cn(
                          buttonVariants({ variant: "outline", size: "lg" }),
                          cta,
                          "border-espresso/15 bg-background",
                        )}
                      >
                        Enquire
                      </Link>
                    )}
                  </div>
                </article>
              </li>
            )
          })}
        </ul>
      </Container>
    </section>
  )
}
