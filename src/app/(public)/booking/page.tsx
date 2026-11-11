import { Suspense } from "react"
import type { Metadata } from "next"

import { BookingExperience } from "@/components/booking/booking-experience"
import { CatalogueNotice } from "@/components/catalogue/catalogue-notice"
import { Container } from "@/components/layout/container"
import type { BookingQuery } from "@/lib/booking/types"
import { serviceRepository } from "@/lib/services/repository"

export const metadata: Metadata = {
  title: "Booking",
  description:
    "Choose a walk-in studio or home service at Allure Bloom. Nothing on this page reserves an appointment until the studio confirms it.",
}

export default function BookingPage({ searchParams }: PageProps<"/booking">) {
  return (
    <main id="main" tabIndex={-1} className="flex-1 outline-none">
      <Suspense fallback={<BookingFallback />}>
        <BookingSelection searchParams={searchParams} />
      </Suspense>
    </main>
  )
}

async function BookingSelection({
  searchParams,
}: {
  searchParams: PageProps<"/booking">["searchParams"]
}) {
  const params = await searchParams
  const query: BookingQuery = {
    step: text(params.step),
    type: text(params.type),
    branch: text(params.branch),
    service: text(params.service),
  }
  const catalogue = await serviceRepository.readCatalogue()
  if (!catalogue.ok) {
    return <CatalogueNotice title="Book an appointment" message={catalogue.message} />
  }

  return <BookingExperience query={query} menu={catalogue.data} />
}

function BookingFallback() {
  return (
    <section className="py-12 sm:py-16">
      <Container>
        <p className="text-xs tracking-[0.28em] text-cocoa uppercase">Appointment</p>
        <h1 className="mt-3 font-heading text-5xl leading-[0.95] text-espresso sm:text-6xl">
          Book an appointment
        </h1>
      </Container>
    </section>
  )
}

function text(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}
