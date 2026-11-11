import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"

import { Container } from "@/components/layout/container"
import { BlurFade } from "@/components/ui/blur-fade"
import { buttonVariants } from "@/components/ui/button"
import { galleryImages } from "@/lib/content"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Gallery",
  description:
    "Studio photographs supplied for the Allure Bloom preview. These images are not labeled as client results.",
}

const cta =
  "h-12 rounded-full px-6 text-base transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0"

export default function GalleryPage() {
  return (
    <main id="main" tabIndex={-1} className="flex-1 outline-none">
      <section className="py-16 sm:py-20" aria-labelledby="gallery-page-heading">
        <Container>
          <BlurFade>
            <p className="font-heading italic text-3xl text-cocoa">the gallery</p>
          </BlurFade>
          <h1
            id="gallery-page-heading"
            className="mt-3 max-w-2xl font-heading text-5xl leading-[0.95] text-espresso sm:text-6xl"
          >
            Supplied studio photographs
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-pretty text-muted-foreground">
            These are the photographs currently approved for the preview.
            More looks will be added when the studio shares them. None of
            these frames are presented as a completed client appointment.
          </p>

          <ul className="mt-12 grid gap-6 sm:grid-cols-2">
            {galleryImages.map((image, index) => (
              <li key={image.src}>
                <BlurFade inView delay={index * 0.06}>
                  <figure className="overflow-hidden rounded-[1.75rem] bg-ivory">
                    <div className="relative aspect-[4/5] sm:aspect-[3/4]">
                      <Image
                        src={image.src}
                        alt={image.alt}
                        fill
                        sizes="(min-width: 640px) 36rem, 100vw"
                        quality={90}
                        className="object-cover object-center transition-transform duration-700 ease-out hover:scale-[1.03] motion-reduce:transition-none motion-reduce:hover:scale-100"
                      />
                    </div>
                    <figcaption className="px-4 py-3 text-xs tracking-[0.14em] text-muted-foreground uppercase">
                      {image.caption}
                    </figcaption>
                  </figure>
                </BlurFade>
              </li>
            ))}
          </ul>

          <div className="mt-12">
            <Link href="/booking" className={cn(buttonVariants({ size: "lg" }), cta)}>
              Book an Appointment
            </Link>
          </div>
        </Container>
      </section>
    </main>
  )
}
