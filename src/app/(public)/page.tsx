import { Suspense } from "react"

import { CatalogueNotice } from "@/components/catalogue/catalogue-notice"
import { Contacts } from "@/components/home/contacts"
import { FeaturedServices } from "@/components/home/featured-services"
import { Hero } from "@/components/home/hero"
import { HomeGallery } from "@/components/home/home-gallery"
import { Testimonials } from "@/components/home/testimonials"
import { Container } from "@/components/layout/container"
import { catalogueMessages } from "@/lib/catalogue/types"
import { serviceRepository } from "@/lib/services/repository"

export default function Home() {
  return (
    <main id="main" tabIndex={-1} className="flex-1 outline-none">
      <Hero />
      <HomeGallery />
      <Testimonials />
      <Suspense fallback={<HomeCatalogueFallback />}>
        <HomeCatalogue />
      </Suspense>
    </main>
  )
}

async function HomeCatalogue() {
  const catalogue = await serviceRepository.readCatalogue()
  if (!catalogue.ok) {
    return (
      <>
        <CatalogueNotice heading="h2" title="Lashes, first" message={catalogue.message} />
        <CatalogueNotice
          heading="h2"
          title="Come visit us, gorgeous!"
          message={catalogue.message}
        />
      </>
    )
  }

  return (
    <>
      {catalogue.data.services.length === 0 ? (
        <CatalogueNotice
          heading="h2"
          title="Lashes, first"
          message={catalogueMessages.emptyServices}
        />
      ) : (
        <FeaturedServices services={catalogue.data.services} />
      )}
      {catalogue.data.studios.length === 0 ? (
        <CatalogueNotice
          heading="h2"
          title="Come visit us, gorgeous!"
          message={catalogueMessages.emptyStudios}
        />
      ) : (
        <Contacts studios={catalogue.data.studios} />
      )}
    </>
  )
}

function HomeCatalogueFallback() {
  return (
    <section className="py-16 sm:py-20">
      <Container>
        <p className="text-base text-muted-foreground">Loading the published catalogue.</p>
      </Container>
    </section>
  )
}
