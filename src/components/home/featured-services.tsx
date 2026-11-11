"use client"

import { useState, type KeyboardEvent } from "react"
import { ArrowRight } from "lucide-react"
import Link from "next/link"

import { Container } from "@/components/layout/container"
import { SectionHeading } from "@/components/home/section-heading"
import { MagicCard } from "@/components/ui/magic-card"
import { serviceCategories, type ServiceCategoryId, type ServiceRecord } from "@/lib/services/types"
import { focusById, nextIndex } from "@/lib/tabs"
import { cn } from "@/lib/utils"

export function FeaturedServices({ services }: { services: ServiceRecord[] }) {
  const [active, setActive] = useState<ServiceCategoryId>(serviceCategories[0].id)
  const current =
    serviceCategories.find((category) => category.id === active) ??
    serviceCategories[0]
  const treatments = services.filter((service) => service.category === current.id)

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = serviceCategories.findIndex(
      (category) => category.id === active,
    )
    const next = nextIndex(currentIndex, serviceCategories.length, event.key)
    if (next === null) return
    event.preventDefault()
    const id = serviceCategories[next].id
    setActive(id)
    focusById(id)
  }

  return (
    <section
      id="services"
      aria-labelledby="services-heading"
      className="scroll-mt-28 py-16 sm:py-20"
    >
      <Container>
        <SectionHeading
          id="services-heading"
          index="03"
          script="lash studio"
          title="Lashes, first"
        >
          The published treatments are read from the studio catalogue. Lashes
          remain the focus. A treatment stays closed until its studio offering
          is confirmed.
        </SectionHeading>

        <div
          role="tablist"
          aria-label="Service categories"
          onKeyDown={onKeyDown}
          className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {serviceCategories.map((category) => {
            const selected = category.id === active
            const count = services.filter(
              (service) => service.category === category.id,
            ).length
            return (
              <button
                key={category.id}
                id={category.id}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="service-notes"
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(category.id)}
                className={cn(
                  "scroll-mt-28 rounded-3xl text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-espresso",
                  category.id === "lashes" && "sm:col-span-2",
                  selected && "ring-2 ring-espresso/70 ring-offset-2 ring-offset-cream",
                )}
              >
                <MagicCard
                  className="h-full rounded-3xl"
                  gradientSize={220}
                  gradientFrom={selected ? "#38231E" : "#745244"}
                  gradientTo={selected ? "#E1CDBB" : "#FCF9F4"}
                  gradientColor="#FCF9F4"
                  gradientOpacity={0.35}
                >
                  <span
                    className={cn(
                      "flex flex-col p-6 sm:p-7",
                      category.id === "lashes" ? "min-h-60" : "min-h-40",
                    )}
                  >
                    <span className="text-xs tracking-[0.18em] text-espresso uppercase">
                      {count === 0 ? "Category" : `${count} published`}
                    </span>
                    <span
                      className={cn(
                        "mt-6 font-heading text-espresso",
                        category.id === "lashes" ? "text-4xl sm:text-5xl" : "text-3xl",
                      )}
                    >
                      {category.name}
                    </span>
                    <span className="mt-4 text-sm leading-relaxed text-muted-foreground">
                      {category.description}
                    </span>
                  </span>
                </MagicCard>
              </button>
            )
          })}
        </div>

        <div
          role="tabpanel"
          id="service-notes"
          aria-labelledby={current.id}
          className="mt-8 border-l-2 border-espresso bg-ivory px-6 py-8 sm:px-10"
        >
          <p className="text-xs tracking-[0.18em] text-espresso uppercase">
            Published treatments
          </p>
          <h3 className="mt-3 font-heading text-4xl text-espresso">{current.name}</h3>
          {treatments.length === 0 ? (
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-pretty text-espresso/85">
              No individual treatment is published in this category yet.
            </p>
          ) : (
            <ul className="mt-4 max-w-2xl space-y-2 text-base text-espresso/85">
              {treatments.map((service) => (
                <li key={service.id}>{service.name}</li>
              ))}
            </ul>
          )}
          <Link
            href={`/services#${current.id}`}
            className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-espresso underline decoration-cocoa/40 underline-offset-4 hover:decoration-espresso focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-espresso"
          >
            Open this category
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </Container>
    </section>
  )
}
