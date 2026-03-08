// ── Pure merge engine ─────────────────────────────────────────────────────────
// No external API calls. No DB writes. Takes pre-loaded data, returns Changeset.

import { resolveArrId, getLastConditionsHash } from './format-id-resolver'
import type {
  NormalizedCustomFormat, NormalizedQualityProfile, ArrSnapshot,
  TrashUserOverride, Changeset,
  ChangeAdd, ChangeUpdateConditions, ChangeUpdateScore,
  ChangeProfileUpdate, ChangeDeprecate, ChangeRepair,
} from './types'

// ── Score resolution (priority: user override → TRaSH default → 0) ───────────

function resolveScore(
  slug: string,
  defaultScore: number,
  overrides: Map<string, TrashUserOverride>,
): number {
  const o = overrides.get(slug)
  if (o && o.score !== null) return o.score
  return defaultScore
}

function isEnabled(slug: string, overrides: Map<string, TrashUserOverride>): boolean {
  const o = overrides.get(slug)
  return o ? o.enabled === 1 : true
}

// ── Profile score diff helper ─────────────────────────────────────────────────

function buildProfileChanges(
  profile: NormalizedQualityProfile,
  instanceId: string,
  snapshot: ArrSnapshot,
  overrides: Map<string, TrashUserOverride>,
): ChangeProfileUpdate | null {
  const liveProfiles = snapshot.profiles.filter(p => p.name === profile.name)
  if (liveProfiles.length === 0) return null
  const liveProfile = liveProfiles[0]

  // Build O(1) lookup for live profile scores
  const liveScoreById = new Map<number, number>()
  for (const item of liveProfile.formatItems) {
    liveScoreById.set(item.format, item.score)
  }

  const changes: ChangeProfileUpdate['changes'] = []

  for (const fs of profile.formatScores) {
    if (!isEnabled(fs.formatSlug, overrides)) continue

    const arrId = resolveArrId(instanceId, fs.formatSlug)
    if (arrId === null) continue   // Format not yet created in arr

    const finalScore = resolveScore(fs.formatSlug, fs.score, overrides)
    const liveScore = liveScoreById.get(arrId)

    if (liveScore === undefined || liveScore !== finalScore) {
      changes.push({ arrFormatId: arrId, slug: fs.formatSlug, score: finalScore })
    }
  }

  if (changes.length === 0) return null
  return { profileId: liveProfile.id, profileName: liveProfile.name, changes }
}

// ── Main compute function ─────────────────────────────────────────────────────

export function computeChangeset(
  instanceId: string,
  upstream: NormalizedCustomFormat[],
  selectedProfile: NormalizedQualityProfile | null,
  snapshot: ArrSnapshot,
  overrides: TrashUserOverride[],
  deprecatedSlugs: Set<string>,
): Changeset {
  const now = new Date().toISOString()
  const githubSha = upstream[0]?.githubSha ?? ''

  // Build override map for O(1) access
  const overrideMap = new Map<string, TrashUserOverride>(overrides.map(o => [o.slug, o]))

  // Build live snapshot by name-derived slug for recovery only
  // (Primary resolution is always via FormatIdResolver)
  const upstreamSlugs = new Set(upstream.map(f => f.slug))

  const add: ChangeAdd[] = []
  const updateConditions: ChangeUpdateConditions[] = []
  const updateScores: ChangeUpdateScore[] = []
  const updateProfiles: ChangeProfileUpdate[] = []
  const deprecate: ChangeDeprecate[] = []
  const repair: ChangeRepair[] = []

  // ── Step 1: process upstream formats ────────────────────────────────────────
  for (const format of upstream) {
    if (!isEnabled(format.slug, overrideMap)) continue

    const finalScore = resolveScore(format.slug, format.recommendedScore, overrideMap)
    const arrId = resolveArrId(instanceId, format.slug)

    if (arrId === null) {
      // Format not in arr and not in mapping → add it
      const liveByName = snapshot.formats.find(f => f.name === format.name)
      if (liveByName) {
        // Exists in arr but no mapping — treat as repair (will re-register mapping)
        repair.push({
          slug: format.slug,
          arrFormatId: liveByName.id,
          reason: 'missing_in_arr',
          score: finalScore,
          conditions: format.conditions,
          conditionsHash: format.conditionsHash,
        })
      } else {
        add.push({ format, score: finalScore })
      }
      continue
    }

    // Format is mapped — check conditions and score
    const lastHash = getLastConditionsHash(instanceId, format.slug)
    if (lastHash !== format.conditionsHash) {
      // Conditions changed upstream — always update (user cannot override conditions)
      updateConditions.push({
        slug: format.slug,
        arrFormatId: arrId,
        newConditions: format.conditions,
        newConditionsHash: format.conditionsHash,
      })
    }

    // Score drift check (against live profile, handled in profile diff below)
    // Direct format-level score is only tracked if not part of a profile
    if (!selectedProfile) {
      const liveFormat = snapshot.byId.get(arrId)
      // (score is on the profile, not the format itself in arr — nothing to do here without a profile)
      void liveFormat
    }
  }

  // ── Step 2: deprecate formats removed from upstream ──────────────────────────
  for (const liveFormat of snapshot.formats) {
    // Derive slug from name (best-effort for new deprecation detection)
    const candidateSlug = upstream.find(f => f.name === liveFormat.name)?.slug
    if (candidateSlug) continue  // Still in upstream
    if (!candidateSlug) {
      // Check if we have a mapping for this format (could be TRaSH-managed)
      // Only deprecate if we have a record of this being a TRaSH format
      // (user formats are never in our upstream list, skip them)
    }
  }

  // Deprecate by checking which slugs we have mapped but are no longer in upstream
  const { getAllMappings } = require('./format-id-resolver') as typeof import('./format-id-resolver')
  const allMappings = getAllMappings(instanceId)
  for (const mapping of allMappings) {
    if (upstreamSlugs.has(mapping.slug)) continue          // Still in upstream
    if (deprecatedSlugs.has(mapping.slug)) continue        // Already deprecated
    const liveFormat = snapshot.byId.get(mapping.arr_format_id)
    if (!liveFormat) continue  // Already gone from arr — nothing to deprecate
    deprecate.push({
      slug: mapping.slug,
      arrFormatId: mapping.arr_format_id,
      name: liveFormat.name,
    })
  }

  // ── Step 3: profile score diff ────────────────────────────────────────────────
  if (selectedProfile) {
    const profileUpdate = buildProfileChanges(selectedProfile, instanceId, snapshot, overrideMap)
    if (profileUpdate) updateProfiles.push(profileUpdate)
  }

  const isNoOp = (
    add.length === 0 &&
    updateConditions.length === 0 &&
    updateScores.length === 0 &&
    updateProfiles.length === 0 &&
    deprecate.length === 0 &&
    repair.length === 0
  )

  return {
    instanceId,
    generatedAt: now,
    githubSha,
    add,
    updateConditions,
    updateScores,
    updateProfiles,
    deprecate,
    repair,
    isNoOp,
  }
}
