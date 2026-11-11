"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Menu, X } from "lucide-react"

import { AdminNav } from "@/components/admin/admin-nav"
import { Logo } from "@/components/brand/logo"

export function MobileNav() {
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      if (!dialog.open) dialog.showModal()
    } else if (dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        className="inline-flex size-10 items-center justify-center rounded-full border border-border bg-ivory text-espresso focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-espresso md:hidden"
        aria-expanded={open}
        aria-controls="admin-menu"
        onClick={() => setOpen(true)}
      >
        <Menu className="size-5" aria-hidden />
        <span className="sr-only">Open studio desk menu</span>
      </button>
      <dialog
        ref={dialogRef}
        id="admin-menu"
        className="sheet"
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
      >
        <div className="flex h-full flex-col px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Logo variant="symbol" decorative className="h-10" sizes="28px" />
              <p id={titleId} className="font-heading text-3xl text-espresso">
                Studio desk
              </p>
            </div>
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-ivory px-3 text-sm text-espresso focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-espresso"
              onClick={() => dialogRef.current?.close()}
            >
              <X className="size-4" aria-hidden />
              Close
            </button>
          </div>
          <div className="mt-8">
            <AdminNav onNavigate={() => setOpen(false)} />
          </div>
        </div>
      </dialog>
    </>
  )
}
