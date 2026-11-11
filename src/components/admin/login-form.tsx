"use client"

import { useActionState } from "react"

import { signIn, type SignInState } from "@/app/admin/actions"
import { Button } from "@/components/ui/button"

const initialState: SignInState = {}

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [state, action, pending] = useActionState(signIn, initialState)
  const emailError = state.fieldErrors?.email
  const passwordError = state.fieldErrors?.password

  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      <input type="hidden" name="next" value={nextPath} />
      {state.error ? (
        <p role="alert" className="rounded-2xl bg-beige px-4 py-3 text-sm leading-6 text-espresso">
          {state.error}
        </p>
      ) : null}
      <div className="space-y-2">
        <label htmlFor="admin-email" className="text-sm text-espresso">
          Email
        </label>
        <input
          id="admin-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          maxLength={254}
          spellCheck={false}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? "admin-email-error" : undefined}
          className="h-11 w-full rounded-2xl border border-border bg-ivory px-4 text-sm text-espresso outline-none focus-visible:border-cocoa focus-visible:ring-3 focus-visible:ring-cocoa/30"
        />
        {emailError ? (
          <p id="admin-email-error" className="text-sm text-cocoa">
            {emailError}
          </p>
        ) : null}
      </div>
      <div className="space-y-2">
        <label htmlFor="admin-password" className="text-sm text-espresso">
          Password
        </label>
        <input
          id="admin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={256}
          aria-invalid={passwordError ? true : undefined}
          aria-describedby={passwordError ? "admin-password-error" : undefined}
          className="h-11 w-full rounded-2xl border border-border bg-ivory px-4 text-sm text-espresso outline-none focus-visible:border-cocoa focus-visible:ring-3 focus-visible:ring-cocoa/30"
        />
        {passwordError ? (
          <p id="admin-password-error" className="text-sm text-cocoa">
            {passwordError}
          </p>
        ) : null}
      </div>
      <Button type="submit" size="lg" className="h-11 w-full rounded-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  )
}
