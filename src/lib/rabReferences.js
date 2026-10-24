function normalizePrkReference(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function normalizeActivityName(value) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function activityMatchesRecord(group, record) {
  const activity = normalizeActivityName(group.workPackage)
  const description = normalizeActivityName(record.description)
  if (!activity || !description) return false
  return activity === description || activity.includes(description) || description.includes(activity)
}

function recordMatchesTargetPrk(record, targetPrks) {
  const recordPrks = [record.prk, record.prkFix, record.prkSkki]
    .map(normalizePrkReference)
    .filter(Boolean)
  return recordPrks.length === 0
    || recordPrks.some((reference) => targetPrks.has(reference))
}

export function findProgramRecordForRabGroup(records, group) {
  const sourcePrk = normalizePrkReference(group.sourcePrk)
  const targetPrks = new Set([sourcePrk || normalizePrkReference(group.prk)].filter(Boolean))
  const linkedRecordIds = new Set((group.records || []).map((record) => String(record.programRecordId || '')).filter(Boolean))
  const linkedRecord = records.find((record) => linkedRecordIds.has(String(record.id || '')))
  if (linkedRecord && (!targetPrks.size
    || [linkedRecord.prk, linkedRecord.prkFix, linkedRecord.prkSkki].some((reference) => targetPrks.has(normalizePrkReference(reference))))) {
    return linkedRecord
  }

  if (!targetPrks.size) return linkedRecord || null

  const groupRecord = group.records?.[0]
  const exactActivityMatches = records.filter((record) =>
    normalizeActivityName(record.description) === normalizeActivityName(group.workPackage)
      && recordMatchesTargetPrk(record, targetPrks))
  if (exactActivityMatches.length === 1) return exactActivityMatches[0]
  const contextualActivityMatches = exactActivityMatches.filter((record) =>
    (!groupRecord?.program || !record.program || record.program === groupRecord.program)
      && (!groupRecord?.year || !record.year || String(record.year) === String(groupRecord.year)))
  if (contextualActivityMatches.length === 1) return contextualActivityMatches[0]

  const candidates = records.filter((record) =>
    [record.prk, record.prkFix, record.prkSkki].some((reference) => targetPrks.has(normalizePrkReference(reference))))
  if (candidates.length === 1) return candidates[0]

  const activityMatches = candidates.filter((record) => activityMatchesRecord(group, record))
  if (activityMatches.length === 1) return activityMatches[0]

  if (sourcePrk && candidates.length === 0) {
    const legacyPrk = normalizePrkReference(group.prk)
    const legacyCandidates = records.filter((record) =>
      [record.prk, record.prkFix, record.prkSkki].some((reference) => normalizePrkReference(reference) === legacyPrk)
        && activityMatchesRecord(group, record))
    if (legacyCandidates.length === 1) return legacyCandidates[0]
  }

  const contextualCandidates = candidates.filter((record) =>
    (!groupRecord?.program || record.program === groupRecord.program)
      && (!groupRecord?.year || String(record.year || '') === String(groupRecord.year)))
  if (contextualCandidates.length === 1) return contextualCandidates[0]

  return null
}
