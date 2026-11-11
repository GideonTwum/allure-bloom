import type { ReactNode } from "react"

import { BlurFade } from "@/components/ui/blur-fade"

export function SectionHeading({
  id,
  index,
  script,
  title,
  children,
  level = 2,
}: {
  id: string
  index: string
  script: string
  title: string
  children: ReactNode
  level?: 1 | 2
}) {
  const Title = level === 1 ? "h1" : "h2"
  return (
    <BlurFade inView className="max-w-2xl">
      <p className="text-xs tracking-[0.2em] text-espresso uppercase">
        {index}
      </p>
      <p className="mt-3 font-heading italic text-3xl text-cocoa">{script}</p>
      <Title
        id={id}
        className="mt-1 font-heading text-4xl leading-[0.95] text-espresso sm:text-5xl"
      >
        {title}
      </Title>
      <div className="mt-4 text-base leading-relaxed text-pretty text-muted-foreground">
        {children}
      </div>
    </BlurFade>
  )
}
