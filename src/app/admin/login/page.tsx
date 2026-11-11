import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"

import { LoginForm } from "@/components/admin/login-form"
import { AccessDenied, AccessUnavailable } from "@/components/admin/admin-shell"
import { Logo } from "@/components/brand/logo"
import { safeAdminReturnPath } from "@/lib/admin/access"
import { readAdminAccess } from "@/lib/admin/session"

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; reason?: string | string[] }>
}) {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginScreen searchParams={searchParams} />
    </Suspense>
  )
}

async function LoginScreen({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; reason?: string | string[] }>
}) {
  const params = await searchParams
  const nextPath = safeAdminReturnPath(firstParam(params.next))
  const sessionEnded = firstParam(params.reason) === "session"
  const access = await readAdminAccess(null)

  if (access.status === "ready") redirect(nextPath)
  if (access.status === "denied") return <AccessDenied email={access.email} />
  if (access.status === "unavailable") return <AccessUnavailable />

  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-8 outline-none"
    >
      <Link
        href="/"
        className="mb-6 inline-flex w-fit rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-espresso"
        aria-label="Allure Bloom, home"
      >
        <Logo variant="wordmark" className="h-9" sizes="220px" />
      </Link>
      <div className="rounded-3xl border border-border bg-ivory px-6 py-6 sm:px-8">
        <h1 className="font-heading text-4xl text-espresso">Studio desk</h1>
        <p className="mt-3 text-sm leading-6 text-cocoa">
          Sign in with the email and password for your studio account.
        </p>
        {sessionEnded ? (
          <p role="status" className="mt-4 rounded-2xl bg-beige px-4 py-3 text-sm leading-6 text-espresso">
            Your session has ended. Sign in again.
          </p>
        ) : null}
        <LoginForm nextPath={nextPath} />
      </div>
    </main>
  )
}

function LoginFallback() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-16">
      <p className="text-sm text-cocoa">Loading sign in…</p>
    </main>
  )
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}
