import "server-only"

import { cache } from "react"

import type { ReadResult } from "@/lib/catalogue/types"
import { sortStudios } from "@/lib/services/bookable"
import { catalogueFailure, publicReadClient } from "@/lib/supabase/public-read"
import {
  branchColumns,
  parseBranchRows,
  toStudio,
  type Studio,
} from "@/lib/supabase/rows"

const branchSelect = [
  branchColumns.id,
  branchColumns.name,
  branchColumns.area,
  branchColumns.phoneDisplay,
  branchColumns.phoneE164,
  branchColumns.mapQuery,
].join(", ")

export const listStudios = cache(async (): Promise<ReadResult<Studio[]>> => {
  const client = await publicReadClient()
  if (!client.ok) return client.read

  const { data, error } = await client.supabase.from("branches").select(branchSelect)
  if (error) return catalogueFailure(error.code)
  const rows = parseBranchRows(data)
  if (!rows) return catalogueFailure(null)

  return {
    ok: true,
    data: sortStudios(
      rows.flatMap((row) => {
        const studio = toStudio(row)
        return studio ? [studio] : []
      }),
    ),
  }
})

export const branchRepository = {
  listStudios,
}
