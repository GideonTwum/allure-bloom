import type { BranchId } from "@/lib/content"

export const serviceCategories = [
  {
    id: "lashes",
    name: "Lashes",
    description: "Publicly advertised lash treatments.",
  },
  {
    id: "nails",
    name: "Nails",
    description: "Nail care is a confirmed category. Only named treatments are listed.",
  },
  {
    id: "brows",
    name: "Brows",
    description: "Brow treatments that have been publicly named.",
  },
  {
    id: "spa",
    name: "Spa",
    description: "Spa treatments that have been publicly named.",
  },
  {
    id: "salon",
    name: "Salon",
    description: "Salon treatments that have been publicly named.",
  },
  {
    id: "makeup",
    name: "Makeup",
    description:
      "Makeup is a confirmed category. No individual makeup treatment has been published.",
  },
] as const

export type ServiceCategoryId = (typeof serviceCategories)[number]["id"]

export type ServiceType = "treatment" | "addon"

export type VerificationStatus = "publicly_advertised" | "studio_confirmed"

export type ServiceRecord = {
  id: string
  slug: string
  name: string
  description: string
  category: ServiceCategoryId
  serviceType: ServiceType
  priceGhs: number | null
  durationMinutes: number | null
  imageUrl: string | null
  branchIds: BranchId[]
  isActive: boolean
  isBookable: boolean
  verificationStatus: VerificationStatus
  sourceUrl: string
  lastVerifiedAt: string
}

export type BranchService = {
  branchId: BranchId
  serviceId: string
}
