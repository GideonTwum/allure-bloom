"use client"

import type { ReactNode } from "react"
import { MotionConfig } from "motion/react"
import { ThemeProvider } from "next-themes"

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      forcedTheme="light"
      enableSystem={false}
      defaultTheme="light"
      attribute="class"
      disableTransitionOnChange
    >
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </ThemeProvider>
  )
}
