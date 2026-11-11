import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export const containerClass = "mx-auto w-full max-w-6xl px-5 sm:px-8"

export function Container({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return <div className={cn(containerClass, className)}>{children}</div>
}
