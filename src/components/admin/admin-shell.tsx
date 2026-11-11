import Link from "next/link"
import { Suspense, type ReactNode } from "react"

import { signOut } from "@/app/admin/actions"
import { adminRoleLabel, type AdminBranch, type AdminRole } from "@/lib/admin/access"
import { AccountMenu } from "@/components/admin/account-menu"
import { AdminNav } from "@/components/admin/admin-nav"
import { BranchSelector } from "@/components/admin/branch-selector"
import { MobileNav } from "@/components/admin/mobile-nav"
import { Logo } from "@/components/brand/logo"

export function AdminShell({
  email,
  role,
  branches,
  children,
}: {
  email: string | null
  role: AdminRole
  branches: AdminBranch[]
  children: ReactNode
}) {
  return (
    <div className="flex flex-1 bg-cream">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-ivory md:flex">
        <Link
          href="/admin"
          className="flex items-center gap-3 px-5 py-5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-espresso"
        >
          <Logo variant="symbol" decorative className="h-10" sizes="28px" />
          <span className="font-heading text-2xl text-espresso">Studio desk</span>
        </Link>
        <Suspense fallback={null}>
          <AdminNav />
        </Suspense>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border/80 bg-cream/95 backdrop-blur-sm">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <Suspense fallback={null}>
              <MobileNav />
            </Suspense>
            <Link href="/admin" className="font-heading text-2xl text-espresso md:hidden">
              Studio desk
            </Link>
            <p className="hidden text-sm text-cocoa md:block">{adminRoleLabel(role)}</p>
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <Suspense fallback={null}>
                <BranchSelector role={role} branches={branches} />
              </Suspense>
              <AccountMenu email={email} role={role} />
            </div>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="flex-1 px-4 py-6 outline-none sm:px-6 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}

export function AccessDenied({ email }: { email: string | null }) {
  return (
    <AdminMessage
      title="This account does not have studio access"
      body="Sign in with an active owner or studio manager account. A customer account cannot open the studio desk."
    >
      {email ? <p className="text-sm text-cocoa">{email}</p> : null}
      <SignOutButton />
    </AdminMessage>
  )
}

export function AccessUnavailable() {
  return (
    <AdminMessage
      title="Studio access could not be confirmed"
      body="The studio desk did not receive an authorization response. Nothing on this page was loaded from a saved copy."
    >
      <SignOutButton />
    </AdminMessage>
  )
}

export function UnauthorizedBranch() {
  return (
    <section
      role="alert"
      className="rounded-3xl border border-border bg-ivory px-6 py-8"
    >
      <h1 className="font-heading text-4xl text-espresso">You cannot view that studio</h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-cocoa">
        Choose one of the studios assigned to this account. The requested studio was not opened.
      </p>
    </section>
  )
}

export function ModulePlaceholder({ title, body }: { title: string; body: string }) {
  return (
    <section className="rounded-3xl border border-dashed border-cocoa/40 bg-ivory px-6 py-8">
      <p className="text-xs tracking-[0.16em] text-cocoa uppercase">Not available yet</p>
      <h2 className="mt-3 font-heading text-3xl text-espresso">{title}</h2>
      <p className="mt-3 max-w-xl text-sm leading-6 text-cocoa">{body}</p>
    </section>
  )
}

export function DeskFallback() {
  return (
    <div className="flex flex-1 flex-col gap-4 px-4 py-6 sm:px-6" aria-hidden>
      <div className="h-12 rounded-full bg-beige/80" />
      <div className="h-40 rounded-3xl bg-ivory" />
      <p className="sr-only">Loading the studio desk</p>
    </div>
  )
}

function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="inline-flex h-11 items-center justify-center rounded-full bg-espresso px-5 text-sm text-ivory hover:bg-cocoa focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-espresso"
      >
        Sign out
      </button>
    </form>
  )
}

function AdminMessage({
  title,
  body,
  children,
}: {
  title: string
  body: string
  children?: ReactNode
}) {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-5 py-16 outline-none"
    >
      <div className="rounded-3xl border border-border bg-ivory px-6 py-8 sm:px-8">
        <h1 className="font-heading text-4xl text-espresso">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-cocoa">{body}</p>
        <div className="mt-6 flex flex-col items-start gap-4">{children}</div>
      </div>
    </main>
  )
}
