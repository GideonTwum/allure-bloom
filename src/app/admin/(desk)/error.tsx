"use client"

export default function DeskError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section role="alert" className="rounded-3xl border border-border bg-ivory px-6 py-8">
      <h1 className="font-heading text-4xl text-espresso">The studio desk could not be loaded</h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-cocoa">
        This page did not finish loading. No saved studio records were substituted.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-espresso px-5 text-sm text-ivory hover:bg-cocoa focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-espresso"
      >
        Try again
      </button>
    </section>
  )
}
