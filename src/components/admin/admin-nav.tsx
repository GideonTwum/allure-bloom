"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"

import { cn } from "@/lib/utils"

export const adminNav = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/services", label: "Services" },
  { href: "/admin/branches", label: "Branches" },
  { href: "/admin/professionals", label: "Professionals" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/settings", label: "Settings" },
] as const

export function AdminNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const params = useSearchParams()
  const branch = params.get("branch")
  const query = branch ? `?branch=${encodeURIComponent(branch)}` : ""

  return (
    <nav aria-label="Studio desk" className="flex flex-col gap-1 px-3 py-2">
      {adminNav.map((item) => {
        const current = "exact" in item ? pathname === item.href : pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={`${item.href}${query}`}
            aria-current={current ? "page" : undefined}
            onClick={onNavigate}
            className={cn(
              "rounded-2xl px-3 py-2.5 text-sm text-espresso/75 hover:bg-cream hover:text-espresso focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-espresso",
              current && "bg-cream text-espresso",
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
