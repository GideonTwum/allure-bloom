"use client"

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react"

import { Container } from "@/components/layout/container"
import { SectionHeading } from "@/components/home/section-heading"
import { StudyArt } from "@/components/home/study-art"
import { buttonVariants } from "@/components/ui/button"
import { studies, studyGroups, type StudyGroup } from "@/lib/content"
import { focusById, nextIndex } from "@/lib/tabs"
import { cn } from "@/lib/utils"

export function PortfolioPreview() {
  const [group, setGroup] = useState<StudyGroup>("All")
  const [studyId, setStudyId] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const visible =
    group === "All" ? studies : studies.filter((study) => study.group === group)
  const selected = studies.find((study) => study.id === studyId) ?? null

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (studyId) {
      if (!dialog.open) dialog.showModal()
    } else if (dialog.open) {
      dialog.close()
    }
  }, [studyId])

  function onFilterKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = studyGroups.indexOf(group)
    const next = nextIndex(currentIndex, studyGroups.length, event.key)
    if (next === null) return
    event.preventDefault()
    const nextGroup = studyGroups[next]
    setGroup(nextGroup)
    focusById(`filter-${nextGroup}`)
  }

  function closeStudy() {
    dialogRef.current?.close()
  }

  return (
    <section
      id="portfolio"
      aria-labelledby="portfolio-heading"
      className="scroll-mt-28 bg-background/65 py-20 sm:py-28"
    >
      <Container>
        <SectionHeading
          id="portfolio-heading"
          index="02"
          script="lash studies"
          title="Lashes, before the photographs"
        >
          Most of these frames are lash studies. One quieter frame holds a
          place for nail work. None of them are client photographs, and none
          name a confirmed appointment.
        </SectionHeading>

        <div
          role="radiogroup"
          aria-label="Filter portfolio studies"
          onKeyDown={onFilterKeyDown}
          className="mt-10 flex flex-wrap gap-2"
        >
          {studyGroups.map((item) => {
            const checked = item === group
            return (
              <button
                key={item}
                id={`filter-${item}`}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                onClick={() => setGroup(item)}
                className={cn(
                  buttonVariants({
                    variant: checked ? "default" : "outline",
                    size: "sm",
                  }),
                  "h-10 rounded-full px-4",
                  !checked && "border-espresso/40 bg-background",
                )}
              >
                {item}
              </button>
            )
          })}
        </div>

        <p className="sr-only" aria-live="polite">
          {`Showing ${visible.length} ${visible.length === 1 ? "study" : "studies"}${group === "All" ? "" : ` in ${group}`}.`}
        </p>

        {visible.length === 0 ? (
          <p className="mt-10 text-sm text-muted-foreground">
            Nothing in this group yet.
          </p>
        ) : (
          <ul className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((study) => (
              <li
                key={study.id}
                className={cn(study.wide && "sm:col-span-2")}
              >
                <button
                  type="button"
                  onClick={() => setStudyId(study.id)}
                  className="group w-full text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-espresso"
                >
                  <span className="block overflow-hidden rounded-[1.6rem] border border-border bg-background transition-transform duration-300 group-hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
                    <span className="block aspect-[4/5]">
                      <StudyArt id={study.id} />
                    </span>
                  </span>
                  <span className="mt-3 block text-xs tracking-[0.16em] text-espresso uppercase">
                    {study.group}
                  </span>
                  <span className="mt-1 block font-heading text-2xl text-espresso">
                    {study.title}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    Open study
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Container>

      <dialog
        ref={dialogRef}
        className="study"
        aria-labelledby={titleId}
        onClose={() => setStudyId(null)}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          const inside =
            event.clientX >= rect.left &&
            event.clientX <= rect.right &&
            event.clientY >= rect.top &&
            event.clientY <= rect.bottom
          if (!inside) event.currentTarget.close()
        }}
      >
        {selected ? (
          <div className="grid sm:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]">
            <div className="bg-ivory">
              <div className="mx-auto aspect-[4/5] max-h-[24rem] sm:max-h-none">
                <StudyArt id={selected.id} />
              </div>
            </div>
            <div className="flex flex-col p-6 sm:p-8">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={closeStudy}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "h-9 rounded-full border-espresso/40 bg-background px-3",
                  )}
                >
                  Close
                </button>
              </div>
              <p className="mt-4 text-xs tracking-[0.16em] text-espresso uppercase">
                {selected.group}
              </p>
              <h3
                id={titleId}
                className="mt-2 font-heading text-4xl text-espresso"
              >
                {selected.title}
              </h3>
              <p className="mt-4 text-base leading-relaxed text-pretty text-espresso/85">
                {selected.caption}
              </p>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                Design study for this preview. Not a photograph of a client or
                a finished appointment.
              </p>
            </div>
          </div>
        ) : null}
      </dialog>
    </section>
  )
}
