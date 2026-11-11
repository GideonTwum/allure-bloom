"use client"

import { useEffect, useId, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, X } from "lucide-react"

import { Logo } from "@/components/brand/logo"
import { Container } from "@/components/layout/container"
import { buttonVariants } from "@/components/ui/button"
import { navItems } from "@/lib/content"
import { cn } from "@/lib/utils"

const bookClass = cn(
  buttonVariants({ size: "lg" }),
  "h-10 rounded-full px-3.5 text-[0.8rem] whitespace-nowrap transition-transform hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:h-11 sm:px-5 sm:text-sm",
)

export function SiteHeader() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const menuTitleId = useId()

  useEffect(() => {
    if (pathname !== "/") return

    const elements = ["contacts"]
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null)

    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        setActiveSection(visible?.target.id ?? null)
      },
      { rootMargin: "-30% 0px -55% 0px", threshold: [0.1, 0.3, 0.6] },
    )

    elements.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [pathname])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      if (!dialog.open) dialog.showModal()
    } else if (dialog.open) {
      dialog.close()
    }
  }, [open])

  function current(id: string) {
    if (id === "gallery") return pathname === "/gallery"
    if (id === "booking") return pathname === "/booking"
    if (id === "services") return pathname === "/services"
    if (pathname !== "/") return false
    if (activeSection === "contacts") {
      return activeSection === id
    }
    return id === "home"
  }

  return (
    <header
      id="top"
      className="sticky top-0 z-40 isolate border-b border-border/80 bg-cream"
    >
      <Container className="flex items-center gap-3 py-3 sm:gap-4">
        <Link
          href="/"
          className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-espresso"
          aria-label="Allure Bloom, home"
        >
          <Logo
            variant="symbol"
            preload
            decorative
            className="h-11 sm:hidden"
            sizes="36px"
          />
          <Logo
            variant="wordmark"
            preload
            decorative
            className="hidden h-9 sm:inline-flex md:h-10"
            sizes="240px"
          />
        </Link>

        <div className="ml-auto flex items-center gap-6 lg:gap-8">
          <nav aria-label="Primary" className="hidden items-center gap-5 md:flex">
            {navItems.map((item) => {
              const selected = current(item.id)
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-current={selected ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center gap-1.5 text-sm text-espresso/75 transition-colors hover:text-espresso focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-espresso",
                    selected && "text-espresso",
                  )}
                >
                  {item.label}
                  <span
                    className={cn(
                      "size-1 rounded-full bg-espresso",
                      selected ? "opacity-100" : "opacity-0",
                    )}
                    aria-hidden
                  />
                </Link>
              )
            })}
          </nav>

          <div className="flex items-center gap-2">
            <Link href="/booking" className={bookClass}>
              Book an Appointment
            </Link>
            <button
              type="button"
              className="inline-flex size-10 items-center justify-center rounded-full border border-border bg-background text-espresso md:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-espresso"
              aria-expanded={open}
              aria-controls="mobile-menu"
              onClick={() => setOpen(true)}
            >
              <Menu className="size-5" aria-hidden />
              <span className="sr-only">Open menu</span>
            </button>
          </div>
        </div>
      </Container>

      <dialog
        ref={dialogRef}
        id="mobile-menu"
        className="sheet"
        aria-labelledby={menuTitleId}
        onClose={() => setOpen(false)}
      >
        <div className="flex h-full flex-col px-6 py-5">
          <div className="flex items-center justify-between">
            <p id={menuTitleId} className="font-heading text-2xl text-espresso">
              Menu
            </p>
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background px-3 text-sm text-espresso focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-espresso"
              onClick={() => dialogRef.current?.close()}
            >
              <X className="size-4" aria-hidden />
              Close
            </button>
          </div>
          <nav aria-label="Mobile" className="mt-10 flex flex-col gap-1">
            {navItems.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={current(item.id) ? "page" : undefined}
                className="rounded-2xl px-1 py-2 font-heading text-3xl text-espresso focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-espresso"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/booking"
            onClick={() => setOpen(false)}
            className={cn(buttonVariants({ size: "lg" }), "mt-auto h-11 rounded-full")}
          >
            Book an Appointment
          </Link>
        </div>
      </dialog>
    </header>
  )
}
