import { Suspense } from "react"
import type { Metadata } from "next"

import { CatalogueNotice } from "@/components/catalogue/catalogue-notice"
import { ServiceCatalogue } from "@/components/services/service-catalogue"
import { Container } from "@/components/layout/container"
import { catalogueMessages } from "@/lib/catalogue/types"
import { serviceRepository } from "@/lib/services/repository"

export const metadata: Metadata = {
  title: "Services",
  description:
    "Published Allure Bloom treatments. A treatment can be booked only when a studio confirms it and publishes a price, duration, and offering.",
}

export default function ServicesPage() {
  return (
    <main id="main" tabIndex={-1} className="flex-1 outline-none">
      <Suspense fallback={<ServicesFallback />}>
        <ServicesCatalogue />
      </Suspense>
    </main>
  )
}

async function ServicesCatalogue() {
  const catalogue = await serviceRepository.readCatalogue()
  if (!catalogue.ok) {
    return <CatalogueNotice title="Services" message={catalogue.message} />
  }
  if (catalogue.data.services.length === 0) {
    return <CatalogueNotice title="Services" message={catalogueMessages.emptyServices} />
  }

  return (
    <ServiceCatalogue
      services={catalogue.data.services}
      offerings={catalogue.data.offerings}
      studios={catalogue.data.studios}
    />
  )
}

function ServicesFallback() {
  return (
    <section className="py-16 sm:py-20">
      <Container>
        <p className="font-heading italic text-3xl text-cocoa">the menu</p>
        <h1 className="mt-3 font-heading text-5xl leading-[0.95] text-espresso sm:text-6xl">
          Services
        </h1>
        <p className="mt-5 text-base text-muted-foreground">Loading the published catalogue.</p>
      </Container>
    </section>
  )
}
