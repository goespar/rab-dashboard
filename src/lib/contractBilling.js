const MONTHLY_BILLING_KEYS = [
  'billingJanuary', 'billingFebruary', 'billingMarch', 'billingApril',
  'billingMay', 'billingJune', 'billingJuly', 'billingAugust',
  'billingSeptember', 'billingOctober', 'billingNovember', 'billingDecember',
]

export function accumulateProjectedBilling(previousAmount, monthlyAmount) {
  const previous = Number(previousAmount) || 0
  const monthly = monthlyAmount === '' || monthlyAmount === null || monthlyAmount === undefined
    ? 0
    : Number(monthlyAmount)
  return previous + (Number.isFinite(monthly) ? monthly : 0)
}

export function getBillingForDate(record, rawDate) {
  const date = rawDate instanceof Date
    ? Number.isFinite(rawDate.getTime())
      ? `${rawDate.getFullYear()}-${String(rawDate.getMonth() + 1).padStart(2, '0')}-${String(rawDate.getDate()).padStart(2, '0')}`
      : ''
    : String(rawDate ?? '').trim().match(/^\d{4}-\d{2}-\d{2}/)?.[0] || ''
  const month = Number(date.slice(5, 7)) - 1
  const key = MONTHLY_BILLING_KEYS[month]

  return {
    date,
    amount: key ? record?.[key] ?? '' : '',
  }
}

export function getPlannedBilling(record) {
  return getBillingForDate(record, record?.plannedBilling)
}
