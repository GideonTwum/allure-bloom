import { signOut } from "@/app/admin/actions"
import { adminRoleLabel, type AdminRole } from "@/lib/admin/access"

export function AccountMenu({ email, role }: { email: string | null; role: AdminRole }) {
  const label = email ?? "Account"
  return (
    <details className="relative">
      <summary className="flex h-10 max-w-36 cursor-pointer list-none items-center rounded-full border border-border bg-ivory px-3 text-sm text-espresso focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-espresso sm:max-w-56 [&::-webkit-details-marker]:hidden">
        <span className="truncate">{label}</span>
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-64 rounded-2xl border border-border bg-ivory p-4 shadow-sm">
        <p className="truncate text-sm text-espresso">{label}</p>
        <p className="mt-1 text-xs text-cocoa">{adminRoleLabel(role)}</p>
        <form action={signOut} className="mt-4">
          <button
            type="submit"
            className="inline-flex h-9 items-center justify-center rounded-full bg-espresso px-4 text-sm text-ivory hover:bg-cocoa focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-espresso"
          >
            Sign out
          </button>
        </form>
      </div>
    </details>
  )
}
