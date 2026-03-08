// ── Shared arr client interface for trash sync ────────────────────────────────
// Both RadarrClient and SonarrClient implement this interface.
// The sync executor depends only on this interface — not on the concrete clients.

import type { ArrCustomFormat, ArrQualityProfile, FormatSpecification } from './types'

export interface CreateCustomFormatBody {
  name: string
  includeCustomFormatWhenRenaming: boolean
  specifications: FormatSpecification[]
}

export interface TrashArrClient {
  getCustomFormats(): Promise<ArrCustomFormat[]>
  getCustomFormat(id: number): Promise<ArrCustomFormat>
  postCustomFormat(body: CreateCustomFormatBody): Promise<ArrCustomFormat>
  putCustomFormat(id: number, body: ArrCustomFormat): Promise<ArrCustomFormat>
  deleteCustomFormat(id: number): Promise<void>
  getQualityProfiles(): Promise<ArrQualityProfile[]>
  getQualityProfile(id: number): Promise<ArrQualityProfile>
  putQualityProfile(id: number, body: ArrQualityProfile): Promise<ArrQualityProfile>
}
