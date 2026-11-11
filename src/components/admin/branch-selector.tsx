"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import type { AdminBranch, AdminRole } from "@/lib/admin/access"
import { cn } from "@/lib/utils"

export function BranchSelector({
  role,
  branches,
}: {
  role: AdminRole
  branches: AdminBranch[]
}) {
  const pathname = usePathname()
  const params = useSearchParams()
  const router = useRouter()
  const requested = params.get("branch")
  const active = requested ?? (role === "owner" ? "all" : branches[0]?.id)

  return (
    <nav aria-label="Studio" className="flex items-center gap-1">
      <label htmlFor="studio-selector" className="sr-only">
        Studio
      </label>
      <select
        id="studio-selector"
        className="h-10 max-w-40 rounded-full border border-border bg-ivory px-3 text-sm text-espresso outline-none focus-visible:border-cocoa focus-visible:ring-3 focus-visible:ring-cocoa/30 sm:max-w-none"
        value={
          active === "all" || branches.some((branch) => branch.id === active) ? active : ""
        }
        onChange={(event) => {
          const next = new URLSearchParams(params.toString())
          const value = event.target.value
          if (!value) return
          next.set("branch", value)
          const query = next.toString()
          router.push(query ? `${pathname}?${query}` : pathname)
        }}
      >
        {active !== "all" && !branches.some((branch) => branch.id === active) ? (
          <option value="">Choose a studio</option>
        ) : null}
        {role === "owner" ? <option value="all">All studios</option> : null}
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </select>
      <noscript>
        <ul className="flex gap-2">
          {role === "owner" ? (
            <li>
              <Link
                href={pathname}
                className={cn("text-sm underline", active === "all" && "text-espresso")}
                aria-current={active === "all" ? "true" : undefined}
              >
                All studios
              </Link>
            </li>
          ) : null}
          {branches.map((branch) => (
            <li key={branch.id}>
              <Link href={`${pathname}?branch=${encodeURIComponent(branch.id)}`} className="text-sm underline">
                {branch.name}
              </Link>
            </li>
          ))}
        </ul>
      </noscript>
    </nav>
  )
}
