import Image from "next/image"
import Link from "next/link"

import { Container } from "@/components/layout/container"
import { SectionHeading } from "@/components/home/section-heading"
import { BlurFade } from "@/components/ui/blur-fade"
import { buttonVariants } from "@/components/ui/button"
import { galleryImages } from "@/lib/content"
import { cn } from "@/lib/utils"

const cta =
  "h-12 rounded-full px-6 text-base transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0"

export function HomeGallery() {
  return (
    <section
      id="gallery"
      aria-labelledby="gallery-heading"
      className="scroll-mt-28 py-16 sm:py-20"
    >
      <Container>
        <SectionHeading
          id="gallery-heading"
          index="01"
          script="lash looks"
          title="From the studio"
        >
          A small selection of the photographs supplied for this preview.
          They are studio images, not records of finished client appointments.
        </SectionHeading>

        <ul className="mx-auto mt-10 grid max-w-3xl gap-5 sm:grid-cols-2">
          {galleryImages.map((image, index) => (
            <li key={image.src}>
              <BlurFade inView delay={index * 0.06}>
                <figure className="overflow-hidden rounded-[1.75rem] bg-ivory">
                  <div className="relative aspect-[4/5]">
                    <Image
                      src={image.src}
                      alt={image.alt}
                      fill
                      sizes="(min-width: 640px) 22rem, 100vw"
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

        <BlurFade inView className="mx-auto mt-12 max-w-xl text-center">
          <p className="font-heading text-3xl leading-snug text-espresso sm:text-4xl">
            Love this look? Let&apos;s make it yours.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/gallery"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                cta,
                "border-espresso/15 bg-background",
              )}
            >
              Explore More
            </Link>
            <Link href="/booking" className={cn(buttonVariants({ size: "lg" }), cta)}>
              Book an Appointment
            </Link>
          </div>
        </BlurFade>
      </Container>
    </section>
  )
}
