import Image from "next/image"

import { cn } from "@/lib/utils"

const marks = {
  wordmark: {
    src: "/brand/allure-bloom-wordmark.png",
    width: 768,
    height: 132,
    alt: "Allure Bloom",
  },
  symbol: {
    src: "/brand/allure-bloom-symbol.png",
    width: 157,
    height: 232,
    alt: "Allure Bloom",
  },
  full: {
    src: "/brand/allure-bloom-full-logo.png",
    width: 991,
    height: 190,
    alt: "Allure Bloom",
  },
} as const

type LogoProps = {
  variant?: keyof typeof marks
  className?: string
  preload?: boolean
  sizes?: string
  decorative?: boolean
}

export function Logo({
  variant = "wordmark",
  className,
  preload = false,
  sizes,
  decorative = false,
}: LogoProps) {
  const mark = marks[variant]
  return (
    <span className={cn("inline-flex shrink-0", className)}>
      <Image
        src={mark.src}
        alt={decorative ? "" : mark.alt}
        width={mark.width}
        height={mark.height}
        preload={preload}
        quality={90}
        sizes={sizes ?? `${mark.width}px`}
        className="h-full w-auto max-w-full object-contain"
      />
    </span>
  )
}
