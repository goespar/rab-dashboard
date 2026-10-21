const CATEGORY_METRICS = ['ai', 'rab', 'pa', 'contract', 'billed', 'paid', 'remainingPrk', 'projectedBilling']

function number(value) {
  const result = Number(value)
  return Number.isFinite(result) ? result : 0
}

function emptyMetrics() {
  return CATEGORY_METRICS.reduce((metrics, key) => ({ ...metrics, [key]: 0 }), { count: 0 })
}

function categoryOf(row) {
  const value = String(row.notes || row.program || '')
  if (/lanjutan|luncuran/i.test(value)) return 'lanjutan'
  if (/murni/i.test(value)) return 'murni'
  return ''
}

function percent(value, denominator) {
  return denominator > 0 ? value / denominator * 100 : 0
}

function normalizeReference(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toUpperCase()
}

export function applyFinalizedPaBalances(records, transfers) {
  const finalizedPaByRecord = new Map()
  const finalizedPaByRab = new Map()
  const finalizedPaByPrk = new Map()
  transfers.forEach((transfer) => {
    const recordId = String(transfer.recordId || '')
    const paAfter = Number(transfer.paAfter)
    if (!Number.isFinite(paAfter)) return
    if (recordId) finalizedPaByRecord.set(recordId, Math.max(finalizedPaByRecord.get(recordId) || 0, paAfter))
    const rabNumber = normalizeReference(transfer.rabNumber)
    const prk = normalizeReference(transfer.prk)
    if (rabNumber) finalizedPaByRab.set(rabNumber, Math.max(finalizedPaByRab.get(rabNumber) || 0, paAfter))
    if (prk) finalizedPaByPrk.set(prk, Math.max(finalizedPaByPrk.get(prk) || 0, paAfter))
  })
  return records.map((record) => {
    const finalizedPa = finalizedPaByRecord.get(String(record.id || ''))
      ?? finalizedPaByRecord.get(String(record.legacyId || ''))
      ?? finalizedPaByRab.get(normalizeReference(record.rabNumber))
      ?? finalizedPaByPrk.get(normalizeReference(record.prk))
    const currentPa = Number(record.paTotal) || 0
    const paTotal = finalizedPa === undefined ? currentPa : Math.max(currentPa, finalizedPa)
    const prkRemaining = String(record.prk || '').trim()
      ? (Number(record.totalFinal) || 0) - (Number(record.rabTotal) || 0) - paTotal
      : ''
    if (finalizedPa === undefined && record.prkRemaining === prkRemaining) return record
    return {
      ...record,
      ...(finalizedPa === undefined ? {} : { paTotal }),
      prkRemaining,
      ...(finalizedPa === undefined ? {} : { paFinalized: true }),
    }
  })
}

export function summarizePublicDashboard(rows) {
  const totals = emptyMetrics()
  const categories = { murni: emptyMetrics(), lanjutan: emptyMetrics() }

  rows.forEach((row) => {
    if (number(row.totalFinal) <= 0 && !(row.paFinalized && number(row.paTotal) > 0)) return
    const values = {
      ai: number(row.totalFinal),
      rab: number(row.rabTotal),
      pa: number(row.paTotal),
      contract: number(row.contractValue),
      billed: number(row.billed),
      paid: number(row.paid),
      remainingPrk: String(row.prk || '').trim() ? number(row.prkRemaining) : 0,
      projectedBilling: number(row.projectedBilling),
    }
    totals.count += 1
    Object.keys(values).forEach((key) => { totals[key] += values[key] })

    const category = categoryOf(row)
    if (!category) return
    categories[category].count += 1
    Object.keys(values).forEach((key) => { categories[category][key] += values[key] })
  })

  const percentages = {
    ai: {
      murni: percent(categories.murni.ai, totals.ai),
      lanjutan: percent(categories.lanjutan.ai, totals.ai),
    },
    totals: {
      rab: percent(totals.rab, totals.ai),
      pa: percent(totals.pa, totals.ai),
      contract: percent(totals.contract, totals.ai),
      billed: percent(totals.billed, totals.contract),
      paid: percent(totals.paid, totals.contract),
      remainingPrk: percent(totals.remainingPrk, totals.ai),
    },
    categories: {},
  }
  Object.keys(categories).forEach((category) => {
    const values = categories[category]
    percentages.categories[category] = {
      rab: percent(values.rab, values.ai),
      pa: percent(values.pa, values.ai),
      contract: percent(values.contract, values.ai),
      billed: percent(values.billed, values.contract),
      paid: percent(values.paid, values.contract),
      remainingPrk: percent(values.remainingPrk, values.ai),
      projectedBilling: percent(values.projectedBilling, values.ai),
    }
  })

  return { totals, categories, percentages }
}
