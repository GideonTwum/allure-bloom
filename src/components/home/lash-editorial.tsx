import Image from "next/image"

import { BlurFade } from "@/components/ui/blur-fade"

export function LashEditorial() {
  return (
    <section
      aria-labelledby="campaign-heading"
      className="scroll-mt-28 bg-background py-16 sm:py-24"
    >
      <div className="mx-auto grid w-full max-w-6xl items-end gap-8 px-5 sm:px-8 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:gap-10">
        <BlurFade inView className="lg:pb-8">
          <p className="text-xs font-medium tracking-[0.28em] text-espresso uppercase">
            Campaign
          </p>
          <h2
            id="campaign-heading"
            className="mt-4 font-heading text-5xl leading-[0.92] text-espresso sm:text-6xl"
          >
            Lashes, front and center.
          </h2>
          <p className="mt-5 max-w-sm text-base leading-relaxed text-pretty text-muted-foreground">
            A second studio photograph, shown large. It is campaign imagery for
            this preview, not a confirmed client result or a named treatment.
            Nail care remains the quieter offer beside the lash work.
          </p>
        </BlurFade>

        <BlurFade inView delay={0.08} className="relative">
          <div
            aria-hidden
            className="absolute -top-5 right-6 bottom-10 -left-3 bg-espresso sm:right-10"
          />
          <figure className="relative aspect-[4/5] overflow-hidden sm:aspect-[5/6] lg:aspect-[4/5]">
            <Image
              src="/editorial/allurebabes3.png"
              alt="Three women posed closely together, with long lashes visible. Studio image for the Allure Bloom preview."
              fill
              sizes="(min-width: 1024px) 52vw, 100vw"
              quality={90}
              className="object-cover object-[center_22%] transition-transform duration-700 ease-out hover:scale-[1.03] motion-reduce:transition-none motion-reduce:hover:scale-100"
            />
            <figcaption className="absolute right-4 bottom-4 bg-espresso px-3 py-2 text-[0.7rem] tracking-[0.18em] text-ivory uppercase">
              Lash studio
            </figcaption>
          </figure>
        </BlurFade>
      </div>
    </section>
  )
}
