import Link from "next/link"

import { Logo } from "@/components/brand/logo"
import { buttonVariants } from "@/components/ui/button"
import { BlurFade } from "@/components/ui/blur-fade"
import { Container } from "@/components/layout/container"
import { cn } from "@/lib/utils"

const cta =
  "h-12 rounded-full px-6 text-base transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0"

export function Hero() {
  return (
    <section aria-labelledby="hero-heading" className="bg-cream">
      <Container className="flex min-h-[68svh] flex-col items-center justify-center py-20 text-center sm:py-28">
        <BlurFade>
          <p className="text-xs tracking-[0.28em] text-cocoa uppercase">
            A lash studio
          </p>
        </BlurFade>
        <h1
          id="hero-heading"
          className="mt-4 max-w-3xl font-heading text-5xl leading-[0.95] text-espresso sm:text-6xl"
        >
          A little lash luxury, just for you.
        </h1>
        <div className="mt-8 flex items-center gap-4" aria-hidden>
          <span className="h-px w-12 bg-beige" />
          <Logo variant="symbol" decorative className="h-14" sizes="40px" />
          <span className="h-px w-12 bg-beige" />
        </div>
        <BlurFade delay={0.08}>
          <p className="mt-8 max-w-xl text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">
            Lashes lead the menu, with brows, nails, and spa treatments listed
            beside them. Prices, durations, and studio availability are still
            being confirmed.
          </p>
        </BlurFade>
        <BlurFade delay={0.14} className="mt-8">
          <Link href="/booking" className={cn(buttonVariants({ size: "lg" }), cta)}>
            Book an Appointment
          </Link>
        </BlurFade>
      </Container>
    </section>
  )
}
