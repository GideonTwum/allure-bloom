import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"

import { Container } from "@/components/layout/container"
import { BlurFade } from "@/components/ui/blur-fade"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "About",
  description:
    "A placeholder About page for Allure Bloom. The brand story, mission, vision, and founder details are waiting for approved copy.",
}

const cta =
  "h-12 rounded-full px-6 text-base transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0"

const placeholders = [
  {
    title: "Brand story",
    body: "The studio’s history will be written here once Allure Bloom provides it. This paragraph is a placeholder.",
  },
  {
    title: "Mission",
    body: "A mission statement has not been supplied. This line will be replaced with the approved wording.",
  },
  {
    title: "Vision",
    body: "A vision statement has not been supplied. This line will be replaced with the approved wording.",
  },
]

export default function AboutPage() {
  return (
    <main id="main" tabIndex={-1} className="flex-1 outline-none">
      <section className="py-16 sm:py-20" aria-labelledby="about-heading">
        <Container>
          <BlurFade>
            <p className="font-heading italic text-3xl text-cocoa">our story</p>
          </BlurFade>
          <h1
            id="about-heading"
            className="mt-3 max-w-2xl font-heading text-5xl leading-[0.95] text-espresso sm:text-6xl"
          >
            About Allure Bloom
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-pretty text-muted-foreground">
            The story, mission, vision, and founder introduction below are
            marked as placeholders until the studio shares approved words.
          </p>

          <div className="mt-14 grid items-start gap-8 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-16">
            <BlurFade inView>
              <figure className="mx-auto w-full max-w-[17rem] lg:mx-0">
                <div className="relative aspect-[4/5] overflow-hidden rounded-[1.75rem]">
                  <Image
                    src="/editorial/allurebabes3.png"
                    alt="Three women posed closely together, with long lashes visible. Studio photograph for the About page, not a portrait of the founder."
                    fill
                    sizes="17rem"
                    quality={90}
                    className="object-cover object-center transition-transform duration-700 ease-out hover:scale-[1.03] motion-reduce:transition-none motion-reduce:hover:scale-100"
                  />
                </div>
                <figcaption className="mt-3 text-xs leading-relaxed tracking-wide text-muted-foreground uppercase">
                  Studio photograph · not a founder portrait
                </figcaption>
              </figure>
            </BlurFade>

            <div className="max-w-xl space-y-10 lg:pt-2">
              <BlurFade inView>
                <h2 className="font-heading text-3xl text-espresso sm:text-4xl">
                  Founder &amp; CEO
                </h2>
                <p className="mt-3 text-xs tracking-[0.18em] text-espresso uppercase">
                  Placeholder
                </p>
                <p className="mt-4 text-base leading-relaxed text-pretty text-muted-foreground">
                  The founder’s name and biography have not been published.
                  The photograph beside this note is studio imagery supplied
                  for the preview. It does not identify the founder.
                </p>
              </BlurFade>

              {placeholders.map((item) => (
                <BlurFade inView key={item.title}>
                  <h2 className="font-heading text-3xl text-espresso sm:text-4xl">
                    {item.title}
                  </h2>
                  <p className="mt-3 text-xs tracking-[0.18em] text-espresso uppercase">
                    Placeholder
                  </p>
                  <p className="mt-4 text-base leading-relaxed text-pretty text-muted-foreground">
                    {item.body}
                  </p>
                </BlurFade>
              ))}

              <BlurFade inView>
                <Link href="/booking" className={cn(buttonVariants({ size: "lg" }), cta)}>
                  Book an Appointment
                </Link>
              </BlurFade>
            </div>
          </div>
        </Container>
      </section>
    </main>
  )
}
