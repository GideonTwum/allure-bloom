"use client"

import { useState, type KeyboardEvent } from "react"
import Link from "next/link"

import { Container } from "@/components/layout/container"
import { SectionHeading } from "@/components/home/section-heading"
import { buttonVariants } from "@/components/ui/button"
import { instagramUrl, mapDirectionsUrl, mapEmbedUrl, type BranchId } from "@/lib/content"
import { studioPhoneHref, type Studio } from "@/lib/supabase/rows"
import { focusById, nextIndex } from "@/lib/tabs"
import { cn } from "@/lib/utils"

const cta =
  "h-12 rounded-full px-6 text-base transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0"

export function Contacts({ studios }: { studios: Studio[] }) {
  const [branchId, setBranchId] = useState<BranchId | null>(studios[0]?.id ?? null)
  const branch = studios.find((item) => item.id === branchId) ?? studios[0] ?? null
  const phoneHref = branch ? studioPhoneHref(branch) : null

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!branch) return
    const currentIndex = studios.findIndex((item) => item.id === branch.id)
    const next = nextIndex(currentIndex, studios.length, event.key)
    if (next === null) return
    event.preventDefault()
    const id = studios[next].id
    setBranchId(id)
    focusById(`branch-${id}`)
  }

  return (
    <section
      id="contacts"
      aria-labelledby="contacts-heading"
      className="scroll-mt-28 bg-background py-16 sm:py-20"
    >
      <Container>
        <SectionHeading
          id="contacts-heading"
          index="04"
          script="say hello"
          title="Come visit us, gorgeous!"
        >
          Choose a studio to see the area, phone number, and map search stored
          for it. Hours and email are not shown.
        </SectionHeading>

        <div
          role="radiogroup"
          aria-label="Choose a studio"
          onKeyDown={onKeyDown}
          className="mt-10 flex flex-wrap gap-2"
        >
          {studios.map((item) => {
            const selected = item.id === branch?.id
            return (
              <button
                key={item.id}
                id={`branch-${item.id}`}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => setBranchId(item.id)}
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

        {branch ? (
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="rounded-[1.75rem] border border-border bg-ivory px-6 py-7">
            <p className="text-xs tracking-[0.18em] text-espresso uppercase">
              Selected studio
            </p>
            <h3 className="mt-3 font-heading text-4xl text-espresso">{branch.name}</h3>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              {branch.area}
            </p>
            {branch.phoneDisplay && phoneHref ? (
              <a
                href={phoneHref}
                className="mt-5 inline-flex text-lg font-medium text-espresso underline decoration-cocoa/40 underline-offset-4 hover:decoration-espresso focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-espresso"
              >
                {branch.phoneDisplay}
              </a>
            ) : (
              <p className="mt-5 text-base text-muted-foreground">
                {branch.phoneDisplay ?? "Phone is not published."}
              </p>
            )}
            <div className="mt-6 flex flex-col items-start gap-3">
              {branch.mapQuery ? (
                <a
                  href={mapDirectionsUrl(branch.mapQuery)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(buttonVariants({ size: "lg" }), cta)}
                >
                  Get Directions
                </a>
              ) : null}
              <a
                href={instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-espresso underline decoration-cocoa/40 underline-offset-4 hover:decoration-espresso focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-espresso"
              >
                Instagram
              </a>
              <Link
                href="/booking"
                className="text-sm font-medium text-espresso/70 underline decoration-cocoa/30 underline-offset-4 hover:text-espresso focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-espresso"
              >
                Book an Appointment
              </Link>
            </div>
          </div>

          <div>
            {branch.mapQuery ? (
              <div className="overflow-hidden rounded-[1.75rem] border border-border">
                <iframe
                  key={branch.id}
                  title={`Map search for ${branch.name}, ${branch.area}`}
                  src={mapEmbedUrl(branch.mapQuery)}
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                  className="h-80 w-full border-0 sm:h-96"
                />
              </div>
            ) : (
              <p className="rounded-[1.75rem] border border-border bg-ivory px-6 py-7 text-base text-muted-foreground">
                A map search is not published for this studio.
              </p>
            )}
            {branch.mapQuery ? (
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                This map is an area search for the advertised location. It is not
                a verified storefront pin.
              </p>
            ) : null}
          </div>
        </div>
        ) : (
          <p role="alert" className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground">
            No studios were returned.
          </p>
        )}
      </Container>
    </section>
  )
}
