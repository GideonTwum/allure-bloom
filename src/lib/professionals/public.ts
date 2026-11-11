export type PublicProfessional = {
  id: string
  name: string
  biography: string | null
  imageUrl: string | null
  branchId: string
  branchName: string
  serviceIds: string[]
}

const publicFields = ["id", "name", "biography", "image_url", "branch_id", "branch_name", "service_ids"] as const

export function parsePublicProfessionals(value: unknown): PublicProfessional[] | null {
  if (!Array.isArray(value)) return null
  const people: PublicProfessional[] = []
  for (const item of value) {
    if (!isRecord(item)) return null
    if (Object.keys(item).some((key) => !publicFields.includes(key as (typeof publicFields)[number]))) {
      return null
    }
    const serviceIds = stringList(item.service_ids)
    if (
      typeof item.id !== "string"
      || typeof item.name !== "string"
      || !optionalText(item.biography)
      || !optionalText(item.image_url)
      || typeof item.branch_id !== "string"
      || typeof item.branch_name !== "string"
      || !serviceIds
    ) {
      return null
    }
    people.push({
      id: item.id,
      name: item.name,
      biography: item.biography,
      imageUrl: item.image_url,
      branchId: item.branch_id,
      branchName: item.branch_name,
      serviceIds,
    })
  }
  return people
}

function optionalText(value: unknown): value is string | null {
  return value === null || typeof value === "string"
}

function stringList(value: unknown) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return null
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
