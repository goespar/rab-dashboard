import { normalizeMonitoringHeader } from './monitoringWorkbook.js'

function columnIndex(headers, names) {
  const candidates = (Array.isArray(names) ? names : [names]).map(normalizeMonitoringHeader)
  return headers.findIndex((header) => candidates.includes(normalizeMonitoringHeader(header)))
}

function valueAt(row, index) {
  return index < 0 ? '' : row[index] ?? ''
}

function textAt(row, index) {
  return String(valueAt(row, index)).trim()
}

function numberValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const text = String(value ?? '').trim()
  if (!text || text === '-') return 0
  let normalized = text.replace(/[^\d,.-]/g, '')
  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.lastIndexOf(',') > normalized.lastIndexOf('.')
      ? normalized.replace(/\./g, '').replace(',', '.')
      : normalized.replace(/,/g, '')
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.')
  }
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function isValidPackage(value) {
  return Boolean(value) && !/^(?:BLM\s*PK|BELUM\s*PK|BELUM\s*ADA)$/i.test(value)
}

export const TIBET_PROGRAMS = ['SAR', 'SUT', 'JAR']
export const TIBET_SIZES = ['9', '13']
export const TIBET_DETAIL_METRICS = [
  { id: 'volumeKr', label: 'VOLUME KR' },
  { id: 'volumePk', label: 'VOLUME PK' },
  { id: 'installed', label: 'VOLUME PASANG' },
  { id: 'notInstalled', label: 'VOLUME BELUM PASANG' },
  { id: 'remainingKr', label: 'SISA KR' },
]

export function normalizeTibetRows(headers, rows) {
  const groupedFields = ['POS', 'PROG', 'TAHUN', 'UKURAN', 'PABRIKAN', 'VENDOR']
  const contractFields = ['NO KR', 'NOMOR KR', 'TGL KR', 'VOL KR', 'SISA KR']
  const groupedIndexes = groupedFields.map((field) => columnIndex(headers, field)).filter((index) => index >= 0)
  const contractIndexes = contractFields.map((field) => columnIndex(headers, field)).filter((index) => index >= 0)
  const carryIndexes = [...new Set([...groupedIndexes, ...contractIndexes])]
  const previous = Array(headers.length).fill('')
  let previousGroup = null

  return rows.map((row) => {
    const normalized = Array.from({ length: headers.length }, (_, index) => row[index] ?? '')
    const hasGroupValue = groupedIndexes.some((index) => String(normalized[index]).trim())
    const currentGroup = groupedIndexes.map((index) => {
      const currentValue = String(normalized[index]).trim()
      return currentValue || String(previous[index] ?? '').trim()
    })
    const groupChanged = hasGroupValue && previousGroup
      && currentGroup.some((value, index) => value && value !== previousGroup[index])
    if (groupChanged) contractIndexes.forEach((index) => { previous[index] = '' })

    carryIndexes.forEach((index) => {
      const value = String(normalized[index] ?? '').trim()
      if (value) previous[index] = normalized[index]
      else if (previous[index] !== '') normalized[index] = previous[index]
    })
    if (hasGroupValue) {
      previousGroup = groupedIndexes.map((index) => String(normalized[index] ?? '').trim())
    }
    return normalized
  })
}

function createTibetDetail(headers, row, rowIndex) {
  const vendor = textAt(row, columnIndex(headers, ['PABRIKAN', 'VENDOR']))
  const kr = textAt(row, columnIndex(headers, ['NO KR', 'NOMOR KR']))
  return {
    key: kr ? `${kr.toLocaleUpperCase('id')}|${vendor.toLocaleUpperCase('id')}` : `ROW:${rowIndex}`,
    kr: kr || '-',
    vendor: vendor || '-',
    volumeKr: Object.fromEntries(TIBET_PROGRAMS.map((program) => [program, { 9: 0, 13: 0 }])),
    volumePk: Object.fromEntries(TIBET_PROGRAMS.map((program) => [program, { 9: 0, 13: 0 }])),
    installed: Object.fromEntries(TIBET_PROGRAMS.map((program) => [program, { 9: 0, 13: 0 }])),
    notInstalled: Object.fromEntries(TIBET_PROGRAMS.map((program) => [program, { 9: 0, 13: 0 }])),
    remainingKr: Object.fromEntries(TIBET_PROGRAMS.map((program) => [program, { 9: 0, 13: 0 }])),
    sourceNotes: [],
    _seenContracts: new Set(),
    _seenPackages: new Set(),
    _hasPackage: false,
  }
}

function addTibetMetric(detail, metric, program, size, value) {
  if (TIBET_PROGRAMS.includes(program) && TIBET_SIZES.includes(size)) detail[metric][program][size] += value
}

function tibetMetricTotal(detail, metric) {
  return TIBET_PROGRAMS.reduce((total, program) => (
    total + TIBET_SIZES.reduce((sizeTotal, size) => sizeTotal + detail[metric][program][size], 0)
  ), 0)
}

export function getTibetMetricValue(detail, metric, program, size) {
  return detail[metric]?.[program]?.[size] ?? 0
}

export function getTibetMetricTotal(detail, metric) {
  return tibetMetricTotal(detail, metric)
}

export function buildTibetDetailRows(headers, rows) {
  const krIndex = columnIndex(headers, ['NO KR', 'NOMOR KR'])
  const programIndex = columnIndex(headers, ['PROG', 'PROGRAM'])
  const sizeIndex = columnIndex(headers, ['UKURAN', 'JENIS TIBET'])
  const volKrIndex = columnIndex(headers, 'VOL KR')
  const volPkIndex = columnIndex(headers, 'VOL PK')
  const remainingKrIndex = columnIndex(headers, 'SISA KR')
  const installedIndex = columnIndex(headers, ['SDH PSG', 'VOL PASANG', 'TERPASANG'])
  const notInstalledIndex = columnIndex(headers, ['BLM PSG', 'BELUM TERPASANG'])
  const packageIndex = columnIndex(headers, ['NO PK', 'NOMOR PK'])
  const notesIndex = columnIndex(headers, 'KETERANGAN')
  const details = new Map()

  rows.forEach((row, rowIndex) => {
    const seed = createTibetDetail(headers, row, rowIndex)
    const program = textAt(row, programIndex).toUpperCase()
    const size = textAt(row, sizeIndex)
    const contractNumber = textAt(row, krIndex)
    const contractKey = `${contractNumber.toLocaleUpperCase('id')}|${seed.vendor.toLocaleUpperCase('id')}`
    const detailKey = contractNumber ? contractKey : seed.key
    let detail = details.get(detailKey)
    if (!detail) {
      detail = seed
      detail.key = detailKey
      details.set(detailKey, detail)
    }

    const contractDimension = `${detailKey}|${program}|${size}`
    if (!detail._seenContracts.has(contractDimension)) {
      detail._seenContracts.add(contractDimension)
      addTibetMetric(detail, 'volumeKr', program, size, numberValue(valueAt(row, volKrIndex)))
      addTibetMetric(detail, 'remainingKr', program, size, numberValue(valueAt(row, remainingKrIndex)))
    }

    const packageNumber = textAt(row, packageIndex)
    if (isValidPackage(packageNumber)) {
      detail._hasPackage = true
      const packageKey = `${contractDimension}|${packageNumber.toLocaleUpperCase('id')}`
      if (!detail._seenPackages.has(packageKey)) {
        detail._seenPackages.add(packageKey)
        addTibetMetric(detail, 'volumePk', program, size, numberValue(valueAt(row, volPkIndex)))
        addTibetMetric(detail, 'installed', program, size, numberValue(valueAt(row, installedIndex)))
        addTibetMetric(detail, 'notInstalled', program, size, numberValue(valueAt(row, notInstalledIndex)))
      }
    }
    const sourceNote = textAt(row, notesIndex)
    if (sourceNote && !detail.sourceNotes.includes(sourceNote)) detail.sourceNotes.push(sourceNote)
  })

  return [...details.values()]
    .map((detail) => {
      const displayDetail = { ...detail }
      delete displayDetail._seenContracts
      delete displayDetail._seenPackages
      delete displayDetail._hasPackage
      delete displayDetail.sourceNotes
      displayDetail.notes = detail.sourceNotes.join(', ') || (detail._hasPackage
        ? tibetMetricTotal(detail, 'notInstalled') > 0 ? 'PROSES PEMASANGAN' : 'TERPASANG'
        : 'BELUM PK')
      return displayDetail
    })
    .sort((left, right) => left.kr.localeCompare(right.kr, 'id', { numeric: true }) || left.vendor.localeCompare(right.vendor, 'id'))
}

export function createTibetDetailTotals() {
  return createTibetDetail([], [], -1)
}

export function sumTibetDetailRows(rows) {
  const total = createTibetDetailTotals()
  TIBET_DETAIL_METRICS.forEach(({ id }) => {
    TIBET_PROGRAMS.forEach((program) => {
      TIBET_SIZES.forEach((size) => {
        total[id][program][size] = rows.reduce((sum, row) => sum + getTibetMetricValue(row, id, program, size), 0)
      })
    })
  })
  return total
}

function tibetContractIdentity(kr, vendor, program, size) {
  return [kr, vendor, program, size].map((value) => String(value ?? '').trim().toLocaleUpperCase('id')).join('|')
}

function getContractRows(headers, rows) {
  const krIndex = columnIndex(headers, ['NO KR', 'NOMOR KR'])
  const vendorIndex = columnIndex(headers, ['PABRIKAN', 'VENDOR'])
  const programIndex = columnIndex(headers, ['PROG', 'PROGRAM'])
  const sizeIndex = columnIndex(headers, ['UKURAN', 'JENIS TIBET'])
  const contractRows = []
  const seen = new Set()
  let activeKr = ''
  let activeGroup = ''
  let activeVendor = ''
  let activeProgram = ''
  let activeSize = ''

  rows.forEach((row, rowIndex) => {
    const vendor = textAt(row, vendorIndex)
    const program = textAt(row, programIndex)
    const size = textAt(row, sizeIndex)
    if (vendor) activeVendor = vendor
    if (program) activeProgram = program
    if (size) activeSize = size
    const group = [vendor, program, size].join('|').toLocaleUpperCase('id')
    if (group.replace(/\|/g, '') && activeGroup && group !== activeGroup) activeKr = ''
    if (group.replace(/\|/g, '')) activeGroup = group

    const rowKr = textAt(row, krIndex)
    if (rowKr) activeKr = rowKr
    const identity = activeKr
      ? `KR:${tibetContractIdentity(activeKr, vendor || activeVendor, program || activeProgram, size || activeSize)}`
      : `ROW:${rowIndex}`
    if (seen.has(identity)) return
    seen.add(identity)
    contractRows.push({ row, rowIndex, kr: activeKr, identity })
  })

  return contractRows
}

function getPackageRows(headers, rows) {
  const pkIndex = columnIndex(headers, ['NO PK', 'NOMOR PK'])
  const krIndex = columnIndex(headers, ['NO KR', 'NOMOR KR'])
  const vendorIndex = columnIndex(headers, ['PABRIKAN', 'VENDOR'])
  const programIndex = columnIndex(headers, ['PROG', 'PROGRAM'])
  const sizeIndex = columnIndex(headers, ['UKURAN', 'JENIS TIBET'])
  const seenPackages = new Set()
  const packageRows = []
  let activeKr = ''
  let activeVendor = ''
  let activeProgram = ''
  let activeSize = ''

  rows.forEach((row, rowIndex) => {
    const packageNumber = textAt(row, pkIndex)
    if (!isValidPackage(packageNumber)) return
    const kr = textAt(row, krIndex)
    const vendor = textAt(row, vendorIndex)
    const program = textAt(row, programIndex)
    const size = textAt(row, sizeIndex)
    if (kr) activeKr = kr
    if (vendor) activeVendor = vendor
    if (program) activeProgram = program
    if (size) activeSize = size
    const contractIdentity = tibetContractIdentity(
      kr || activeKr,
      vendor || activeVendor,
      program || activeProgram,
      size || activeSize,
    )
    const packageIdentity = `${contractIdentity}|${packageNumber.toLocaleUpperCase('id')}`
    if (seenPackages.has(packageIdentity)) return
    seenPackages.add(packageIdentity)
    packageRows.push({
      row,
      rowIndex,
      kr: kr || activeKr,
      packageNumber,
      identity: `KR:${contractIdentity}`,
    })
  })

  return packageRows
}

export function buildTibetMetrics(headers, rows) {
  const volKrIndex = columnIndex(headers, 'VOL KR')
  const volPkIndex = columnIndex(headers, 'VOL PK')
  const remainingKrIndex = columnIndex(headers, 'SISA KR')
  const installedIndex = columnIndex(headers, ['SDH PSG', 'VOL PASANG', 'TERPASANG'])
  const notInstalledIndex = columnIndex(headers, ['BLM PSG', 'BELUM TERPASANG'])
  const contracts = getContractRows(headers, rows)
  const packages = getPackageRows(headers, rows)
  const packagesByKr = new Set(packages.map((item) => item.identity))
  const krCount = new Set(contracts.map((item) => item.kr).filter(Boolean)).size
  const pkCount = new Set(packages.map((item) => item.packageNumber.toLocaleUpperCase('id'))).size
  const remainingPackageCount = contracts.filter((item) => item.kr && !packagesByKr.has(item.identity)).length

  return {
    krCount,
    pkCount,
    volumeKr: contracts.reduce((total, item) => total + numberValue(valueAt(item.row, volKrIndex)), 0),
    volumePk: packages.reduce((total, item) => total + numberValue(valueAt(item.row, volPkIndex)), 0),
    installed: packages.reduce((total, item) => total + numberValue(valueAt(item.row, installedIndex)), 0),
    remainingKr: contracts.reduce((total, item) => total + numberValue(valueAt(item.row, remainingKrIndex)), 0),
    remainingPk: remainingPackageCount,
    notInstalled: packages.reduce((total, item) => total + numberValue(valueAt(item.row, notInstalledIndex)), 0),
  }
}

function volumeAt(row, index) {
  return numberValue(valueAt(row, index))
}

export function buildTibetProgramChart(headers, rows) {
  const programIndex = columnIndex(headers, ['PROG', 'PROGRAM'])
  const sizeIndex = columnIndex(headers, ['UKURAN', 'JENIS TIBET'])
  const volKrIndex = columnIndex(headers, 'VOL KR')
  const volPkIndex = columnIndex(headers, 'VOL PK')
  const contracts = getContractRows(headers, rows)
  const packages = getPackageRows(headers, rows)
  const groups = new Map()
  const getGroup = (program) => {
    const name = program || 'Tidak diketahui'
    if (!groups.has(name)) groups.set(name, { name, 'VOL KR 9': 0, 'VOL KR 13': 0, 'VOL PK 9': 0, 'VOL PK 13': 0 })
    return groups.get(name)
  }

  contracts.forEach(({ row }) => {
    const size = textAt(row, sizeIndex)
    if (!['9', '13'].includes(size)) return
    getGroup(textAt(row, programIndex))[`VOL KR ${size}`] += volumeAt(row, volKrIndex)
  })
  packages.forEach(({ row }) => {
    const size = textAt(row, sizeIndex)
    if (!['9', '13'].includes(size)) return
    getGroup(textAt(row, programIndex))[`VOL PK ${size}`] += volumeAt(row, volPkIndex)
  })

  const programOrder = ['SAR', 'SUT', 'JAR']
  const data = [...groups.values()].sort((left, right) => {
    const leftIndex = programOrder.indexOf(left.name.toUpperCase())
    const rightIndex = programOrder.indexOf(right.name.toUpperCase())
    if (leftIndex >= 0 || rightIndex >= 0) {
      return (leftIndex < 0 ? programOrder.length : leftIndex) - (rightIndex < 0 ? programOrder.length : rightIndex)
    }
    return left.name.localeCompare(right.name, 'id')
  })

  return {
    data,
    bars: [
      ['VOL KR 9', 'VOL KR ukuran 9', '#0878b9'],
      ['VOL KR 13', 'VOL KR ukuran 13', '#24bfd3'],
      ['VOL PK 9', 'VOL PK ukuran 9', '#79b86a'],
      ['VOL PK 13', 'VOL PK ukuran 13', '#edab54'],
    ],
    label: 'Volume KR dan PK ukuran 9 & 13 per program',
  }
}

export function buildTibetVendorChart(headers, rows) {
  const vendorIndex = columnIndex(headers, ['PABRIKAN', 'VENDOR'])
  const sizeIndex = columnIndex(headers, ['UKURAN', 'JENIS TIBET'])
  const volKrIndex = columnIndex(headers, 'VOL KR')
  const groups = new Map()

  getContractRows(headers, rows).forEach(({ row }) => {
    const size = textAt(row, sizeIndex)
    if (!['9', '13'].includes(size)) return
    const name = textAt(row, vendorIndex) || 'Tidak diketahui'
    const item = groups.get(name) || { name, 'VOL KR 9': 0, 'VOL KR 13': 0 }
    item[`VOL KR ${size}`] += volumeAt(row, volKrIndex)
    groups.set(name, item)
  })

  const data = [...groups.values()].sort((left, right) => (
    right['VOL KR 9'] + right['VOL KR 13'] - left['VOL KR 9'] - left['VOL KR 13']
  ))
  return {
    data,
    layout: 'vertical',
    categoryAxisWidth: 190,
    dynamicHeight: Math.max(280, data.length * 42),
    scrollable: data.length > 8,
    bars: [['VOL KR 9', 'VOL KR ukuran 9', '#0878b9'], ['VOL KR 13', 'VOL KR ukuran 13', '#24bfd3']],
    label: 'Volume KR ukuran 9 & 13 per vendor',
  }
}
