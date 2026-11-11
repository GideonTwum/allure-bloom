import { Marquee } from "@/components/ui/marquee"
import { samplePhrases } from "@/lib/content"

function Phrase({ children }: { children: string }) {
  return (
    <span className="flex items-center gap-5 pr-12 text-sm font-medium tracking-[0.22em] text-beige uppercase">
      <span className="size-1.5 shrink-0 rounded-full bg-espresso" aria-hidden />
      {children}
    </span>
  )
}

export function PhraseMarquee() {
  return (
    <section
      aria-label="Illustrative categories"
      className="bg-espresso"
    >
      <p className="sr-only">
        Illustrative categories for a lash studio, not a published menu: lash
        services first, with nail services as a smaller offering.
      </p>
      <p
        className="px-5 pt-3 text-center text-[0.68rem] tracking-[0.18em] text-beige/80 uppercase"
        aria-hidden
      >
        Not a published menu
      </p>
      <div aria-hidden className="motion-reduce:hidden">
        <Marquee pauseOnHover className="[--duration:55s]">
          {samplePhrases.map((phrase) => (
            <Phrase key={phrase}>{phrase}</Phrase>
          ))}
        </Marquee>
      </div>
      <ul
        aria-hidden
        className="mx-auto hidden max-w-6xl flex-wrap justify-center gap-x-6 gap-y-3 px-5 py-4 motion-reduce:flex"
      >
        {samplePhrases.map((phrase) => (
          <li key={phrase}>
            <Phrase>{phrase}</Phrase>
          </li>
        ))}
      </ul>
    </section>
  )
}
