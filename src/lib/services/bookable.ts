import { branchIds, type BranchId } from "@/lib/content"
import type { CatalogueSnapshot } from "@/lib/catalogue/types"
import type { BranchServiceConfiguration } from "@/lib/supabase/rows"
import type { ServiceRecord } from "@/lib/services/types"

const listedOrder = [
  "svc_mink_lash_extensions",
  "svc_cat_eye_volume",
  "svc_wispy_volume",
  "svc_cat_eye_wispy_volume",
  "svc_bottom_lashes",
  "svc_microblading",
  "svc_pedicures",
  "svc_facials",
  "svc_waxing",
  "svc_piercings",
]

export function sortListedServices(services: ServiceRecord[]) {
  return [...services].sort((left, right) => {
    const leftRank = rank(left.id)
    const rightRank = rank(right.id)
    if (leftRank !== rightRank) return leftRank - rightRank
    return left.name.localeCompare(right.name)
  })
}

export function sortStudios<T extends { id: BranchId }>(studios: T[]) {
  return [...studios].sort(
    (left, right) => branchIds.indexOf(left.id) - branchIds.indexOf(right.id),
  )
}

/**
 * A branch offering can be booked only when the listed treatment is
 * studio-confirmed and that offering is active, bookable, priced, and timed.
 */
export function branchOfferingIsBookable(
  service: ServiceRecord,
  offering: BranchServiceConfiguration,
) {
  return (
    offering.serviceId === service.id &&
    service.isActive &&
    service.verificationStatus === "studio_confirmed" &&
    offering.isActive &&
    offering.isBookable &&
    offering.priceGhs !== null &&
    offering.priceGhs >= 0 &&
    offering.durationMinutes !== null &&
    offering.durationMinutes > 0
  )
}

export function serviceIsBookable(
  service: ServiceRecord,
  offerings: BranchServiceConfiguration[],
) {
  return offerings.some((offering) => branchOfferingIsBookable(service, offering))
}

export function withOfferings(
  service: ServiceRecord,
  offerings: BranchServiceConfiguration[],
): ServiceRecord {
  const own = offerings.filter(
    (offering) => offering.serviceId === service.id && offering.isActive,
  )
  return {
    ...service,
    priceGhs: null,
    durationMinutes: null,
    branchIds: own.map((offering) => offering.branchId),
    isBookable: own.some((offering) => branchOfferingIsBookable(service, offering)),
  }
}

/** Branch-scoped record. Price and duration come only from that studio's offering. */
export function bookableServicesAt(menu: CatalogueSnapshot, branchId: BranchId) {
  return menu.services.flatMap((service) => {
    const offering = menu.offerings.find(
      (item) => item.serviceId === service.id && item.branchId === branchId,
    )
    if (!offering || !branchOfferingIsBookable(service, offering)) return []
    return [
      {
        ...service,
        priceGhs: offering.priceGhs,
        durationMinutes: offering.durationMinutes,
        branchIds: [branchId],
        isBookable: true,
      },
    ]
  })
}

function rank(id: string) {
  const index = listedOrder.indexOf(id)
  return index === -1 ? listedOrder.length : index
}
