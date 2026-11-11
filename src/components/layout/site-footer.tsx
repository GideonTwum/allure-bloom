import { Suspense } from "react"
import Link from "next/link"

import { Logo } from "@/components/brand/logo"
import { Container } from "@/components/layout/container"
import { footerNav, instagramUrl } from "@/lib/content"
import { branchRepository } from "@/lib/branches/repository"
import { studioPhoneHref } from "@/lib/supabase/rows"

export function SiteFooter() {
  return (
    <footer className="mt-auto isolate border-t border-border bg-background">
      <Container className="grid gap-10 py-14 sm:grid-cols-2 sm:py-16 lg:grid-cols-4">
        <div>
          <Link
            href="/"
            className="inline-flex rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-espresso"
            aria-label="Allure Bloom, home"
          >
            <Logo className="h-10 max-w-[16rem]" sizes="256px" />
          </Link>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
            Allure Bloom is a lash studio with publicly advertised studios in
            Accra and Kumasi. Nail care remains the smaller offering.
          </p>
        </div>
        <div>
          <p className="text-sm font-medium text-espresso">Visit</p>
          <ul className="mt-4 space-y-2">
            {footerNav.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="text-sm text-muted-foreground underline-offset-4 hover:text-espresso hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-espresso"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-sm font-medium text-espresso">Studios</p>
          <Suspense fallback={<p className="mt-4 text-sm text-muted-foreground">Loading studios.</p>}>
            <FooterStudios />
          </Suspense>
          <p className="mt-4 text-sm text-muted-foreground">
            Email and opening hours are not published.
          </p>
        </div>
        <div>
          <p className="text-sm font-medium text-espresso">Social</p>
          <ul className="mt-4 space-y-2">
            <li>
              <a
                href={instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground underline-offset-4 hover:text-espresso hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-espresso"
              >
                Instagram
              </a>
            </li>
          </ul>
        </div>
      </Container>
      <div className="border-t border-border">
        <Container className="flex flex-col gap-2 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">© 2026 Allure Bloom</p>
          <p className="text-xs text-muted-foreground">
            Privacy and booking policies are not published yet.
          </p>
        </Container>
      </div>
    </footer>
  )
}

async function FooterStudios() {
  const studios = await branchRepository.listStudios()
  if (!studios.ok) {
    return (
      <p role="alert" className="mt-4 text-sm text-muted-foreground">
        {studios.message}
      </p>
    )
  }
  if (studios.data.length === 0) {
    return <p className="mt-4 text-sm text-muted-foreground">No studios were returned.</p>
  }

  return (
    <ul className="mt-4 space-y-4">
      {studios.data.map((branch) => {
        const phoneHref = studioPhoneHref(branch)
        return (
          <li key={branch.id}>
            <p className="text-sm font-medium text-espresso">{branch.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">{branch.area}</p>
            {branch.phoneDisplay && phoneHref ? (
              <a
                href={phoneHref}
                className="mt-1 inline-flex text-sm text-espresso underline decoration-cocoa/40 underline-offset-4 hover:decoration-espresso focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-espresso"
              >
                {branch.phoneDisplay}
              </a>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                {branch.phoneDisplay ?? "Phone is not published."}
              </p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
