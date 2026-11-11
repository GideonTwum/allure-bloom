import "server-only"

import { visibleBranchIds, type AdminScope } from "@/lib/admin/access"
import { serviceRepository } from "@/lib/services/repository"

export async function readScopedCatalogue(scope: AdminScope) {
  const catalogue = await serviceRepository.readCatalogue()
  if (!catalogue.ok) return catalogue
  const ids = new Set(visibleBranchIds(scope))
  return {
    ok: true as const,
    data: {
      services: catalogue.data.services,
      offerings: catalogue.data.offerings.filter((offering) => ids.has(offering.branchId)),
    },
  }
}
