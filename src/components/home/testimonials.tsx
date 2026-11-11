import { Container } from "@/components/layout/container"
import { SectionHeading } from "@/components/home/section-heading"

export function Testimonials() {
  return (
    <section
      aria-labelledby="testimonials-heading"
      className="scroll-mt-28 bg-cream py-16 sm:py-20"
    >
      <Container>
        <SectionHeading
          id="testimonials-heading"
          index="02"
          script="kind words"
          title="Guest notes"
        >
          Allure Bloom has not published guest reviews yet. Names, quotes, and
          ratings will appear here only after the studio shares them.
        </SectionHeading>
        <p className="mt-8 max-w-xl rounded-[1.75rem] border border-border bg-ivory px-6 py-7 text-base leading-relaxed text-cocoa">
          No reviews are on display.
        </p>
      </Container>
    </section>
  )
}
