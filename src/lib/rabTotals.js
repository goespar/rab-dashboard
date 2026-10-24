import { findProgramRecordForRabGroup } from './rabReferences.js'

function normalize(value) {
  return String(value ?? '').trim().toLocaleLowerCase()
}

export function calculateRabBudgetTotal(subtotal) {
  return Math.round((Number(subtotal) || 0) * 1.11)
}

function activitySourcePrk(catalog, activity) {
  const componentName = normalize(activity.componentName || activity.name)
  const matching = catalog.filter((item) =>
    normalize(item.name) === componentName
      && normalize(item.workPackage) === normalize(activity.workPackage)
      && String(item.prk || '').trim())
  const prks = [...new Set(matching.map((item) => String(item.prk).trim()))]
  return prks.length === 1 ? prks[0] : ''
}

function sourceFor(records, catalog, activity) {
  return findProgramRecordForRabGroup(records, {
    prk: activity.prk,
    sourcePrk: activitySourcePrk(catalog, activity),
    workPackage: activity.workPackage,
    records: [{
      programRecordId: activity.programRecordId,
      program: activity.program,
      year: activity.year,
    }],
  })
}

function componentAsActivity(component) {
  const name = component.activity || component.name
  return { ...component, name, componentName: name }
}

function lineTotal(activity, isActivity) {
  if (isActivity && activity.total !== undefined) return Number(activity.total) || 0
  if (activity.totalPart !== undefined) return Number(activity.totalPart) || 0
  if (activity.materialPart !== undefined || activity.servicePart !== undefined) {
    return (Number(activity.materialPart) || 0) + (Number(activity.servicePart) || 0)
  }
  return (Number(activity.materialPrice) + Number(activity.servicePrice))
    * Number(activity.quantityPerUnit ?? 1)
    * (isActivity ? Number(activity.volume || 0) : 1)
}

function rabGroupKey(sourceId, activity) {
  return JSON.stringify([
    String(sourceId),
    normalize(activity.workPackage),
    normalize(activity.rabTitle),
    normalize(activity.rabNumber),
  ])
}

function finalizationMarker(catalog, activity) {
  const sourcePrk = activitySourcePrk(catalog, activity) || activity.prk || ''
  const packageName = normalize(activity.workPackage)
  const title = normalize(activity.rabTitle)
  const rabNumber = normalize(activity.rabNumber)
  const currentKey = [sourcePrk, packageName, title, rabNumber].join('::')
  const legacyKey = [activity.prk || '', packageName, title, rabNumber].join('::')
  return new Set([
    `FINALIZED_RAB_GROUP::${currentKey}`,
    `FINALIZED_RAB_GROUP::${legacyKey}`,
  ])
}

export function calculateRabTotalsByProgramRecord(
  records,
  activities,
  components,
  catalog,
  transfers,
  previousActivities = [],
  previousComponents = [],
) {
  const componentGroups = new Map()
  const affectedIds = new Set()

  const collectAffectedIds = (items) => items.forEach((item) => {
    const source = sourceFor(records, catalog, item)
    if (source) affectedIds.add(String(source.id))
  })
  collectAffectedIds([...activities, ...previousActivities])
  collectAffectedIds([...components, ...previousComponents].map(componentAsActivity))

  components.forEach((component) => {
    const source = sourceFor(records, catalog, componentAsActivity(component))
    if (!source) return
    const key = rabGroupKey(source.id, component)
    const group = componentGroups.get(key) || { source, activity: component, total: 0 }
    group.total += lineTotal(component, false)
    componentGroups.set(key, group)
  })

  const totals = new Map()
  affectedIds.forEach((id) => totals.set(id, 0))
  componentGroups.forEach((group) => {
    const finalizedMarkers = finalizationMarker(catalog, group.activity)
    const transferred = transfers
      .filter((transfer) => String(transfer.recordId) === String(group.source.id)
        && finalizedMarkers.has(String(transfer.notes || '')))
      .reduce((sum, transfer) => sum + (Number(transfer.amount) || 0), 0)
    const remaining = Math.max(0, calculateRabBudgetTotal(group.total) - transferred)
    const id = String(group.source.id)
    totals.set(id, (totals.get(id) || 0) + remaining)
  })

  return totals
}
