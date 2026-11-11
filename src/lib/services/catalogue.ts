/**
 * Historical listing kept for reference. Runtime pages must not import it.
 * Published treatments and studios are read from Supabase.
 */
import type { BranchService, ServiceRecord } from "@/lib/services/types"

export const serviceListingUrl =
  "https://www.beautynailhairsalons.com/GH/Accra/100126419564562/Allure_Bloom_"

const verifiedOn = "2026-11-03"

function advertised(
  service: Omit<
    ServiceRecord,
    | "priceGhs"
    | "durationMinutes"
    | "imageUrl"
    | "branchIds"
    | "isActive"
    | "isBookable"
    | "verificationStatus"
    | "sourceUrl"
    | "lastVerifiedAt"
  >,
): ServiceRecord {
  return {
    ...service,
    priceGhs: null,
    durationMinutes: null,
    imageUrl: null,
    branchIds: [],
    isActive: true,
    isBookable: false,
    verificationStatus: "publicly_advertised",
    sourceUrl: serviceListingUrl,
    lastVerifiedAt: verifiedOn,
  }
}

export const serviceCatalogue: ServiceRecord[] = [
  advertised({
    id: "svc_mink_lash_extensions",
    slug: "mink-lash-extensions",
    name: "Mink lash extensions",
    description:
      "Publicly advertised lash extensions. Price, duration, and studio availability are not confirmed.",
    category: "lashes",
    serviceType: "treatment",
  }),
  advertised({
    id: "svc_cat_eye_volume",
    slug: "cat-eye-volume",
    name: "Cat-eye volume",
    description:
      "Publicly advertised volume lash style. Price, duration, and studio availability are not confirmed.",
    category: "lashes",
    serviceType: "treatment",
  }),
  advertised({
    id: "svc_wispy_volume",
    slug: "wispy-volume",
    name: "Wispy volume",
    description:
      "Publicly advertised volume lash style. Price, duration, and studio availability are not confirmed.",
    category: "lashes",
    serviceType: "treatment",
  }),
  advertised({
    id: "svc_cat_eye_wispy_volume",
    slug: "cat-eye-wispy-volume",
    name: "Cat-eye wispy volume",
    description:
      "Publicly advertised volume lash style. Price, duration, and studio availability are not confirmed.",
    category: "lashes",
    serviceType: "treatment",
  }),
  advertised({
    id: "svc_bottom_lashes",
    slug: "bottom-lashes",
    name: "Bottom lashes",
    description:
      "Publicly advertised as an enhancement or add-on to a lash set. Price, duration, and studio availability are not confirmed.",
    category: "lashes",
    serviceType: "addon",
  }),
  advertised({
    id: "svc_microblading",
    slug: "microblading",
    name: "Microblading",
    description:
      "Publicly advertised brow treatment. Price, duration, and studio availability are not confirmed.",
    category: "brows",
    serviceType: "treatment",
  }),
  advertised({
    id: "svc_pedicures",
    slug: "pedicures",
    name: "Pedicures",
    description:
      "Publicly advertised nail treatment. Price, duration, and studio availability are not confirmed.",
    category: "nails",
    serviceType: "treatment",
  }),
  advertised({
    id: "svc_facials",
    slug: "facials",
    name: "Facials",
    description:
      "Publicly advertised spa treatment. Price, duration, and studio availability are not confirmed.",
    category: "spa",
    serviceType: "treatment",
  }),
  advertised({
    id: "svc_waxing",
    slug: "waxing",
    name: "Waxing",
    description:
      "Publicly advertised spa treatment. Price, duration, and studio availability are not confirmed.",
    category: "spa",
    serviceType: "treatment",
  }),
  advertised({
    id: "svc_piercings",
    slug: "piercings",
    name: "Piercings",
    description:
      "Publicly advertised salon treatment. Price, duration, and studio availability are not confirmed.",
    category: "salon",
    serviceType: "treatment",
  }),
]

/**
 * Separate from the service rows. Left empty because public posts do not
 * confirm which treatment is offered at Accra, Kumasi, or both.
 */
export const branchServices: BranchService[] = []
