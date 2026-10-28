import { useEffect, useMemo, useRef, useState } from 'react'
import ExcelJS from 'exceljs'
import {
  Activity, ArrowDownToLine, ArrowUpFromLine, Boxes, Database, FileSpreadsheet, Filter, Gauge, Plus, Printer, RefreshCw,
  Search, ShieldCheck, Users, X, Zap,
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { importMonitoringWorkbook, MONITORING_MODULES, normalizeMonitoringHeader } from './lib/monitoringWorkbook.js'
import { readRabMaterialFile, summarizeRabMaterials } from './lib/rabDatabase.js'
import './monitoring.css'

const STORAGE_KEY = 'rab-monitor-modules-v1'
const PAGE_SIZE = 25
const EMPTY_HEADERS = []
const EMPTY_ROWS = []
const EMPTY_FILTER_FIELDS = []
const MONTHS = ['JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI', 'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER']
const NUMBER_FORMAT = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 })
const CURRENCY_FORMAT = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })

const MODULE_INFO = {
  spb: { eyebrow: 'PENGADAAN MATERIAL', description: 'Pantau penerbitan SPB, progres kedatangan, dan volume material berdasarkan POS.', icon: FileSpreadsheet },
  stock: { eyebrow: 'PERSEDIAAN MATERIAL', description: 'Bandingkan kebutuhan POS dengan stok gudang dan rata-rata pemakaian.', icon: Boxes },
  load: { eyebrow: 'KEANDALAN SISTEM', description: 'Tinjau beban penyulang dan gardu induk dari data bulanan.', icon: Gauge },
  rabDatabase: { eyebrow: 'REFERENSI MATERIAL RAB', description: 'Telusuri material, volume, dan harga satuan yang tersimpan per ID RAB.', icon: Database },
  tibet: { eyebrow: 'KONTRAK TIBET', description: 'Bandingkan volume kontrak, kebutuhan pelanggan, dan progres pemasangan.', icon: Activity },
  vendor: { eyebrow: 'PENGENDALIAN KONTRAK', description: 'Pantau nilai kontrak vendor, realisasi, sisa kontrak, dan lingkup pekerjaan.', icon: ShieldCheck },
  customers: { eyebrow: 'KEBUTUHAN PELANGGAN', description: 'Tinjau progres layanan pelanggan serta kebutuhan material per ULP.', icon: Users },
}

const MODULE_FIELDS = {
  spb: ['POS', 'PROGRAM', 'NORMALISASI', 'URAIAN MATERIAL', 'NAMA PABRIKAN', 'NO SPB', 'EFF DATE', 'END DATE', 'STATUS SPB', 'VOL SPB', 'PROGRES', 'VOL DTG', 'VOL BLM DTG', 'TGL DATANG'],
  stock: ['NORMALISASI', 'NAMA BARANG', 'NAMA MATERIAL', 'VOL 61', 'VOL 62', 'VOL GUDANG', 'RATA-RATA PER BULAN', 'RATA-RATA PER TAHUN', 'STATUS', 'KRITERIA MATERIAL'],
  load: ['UP3', 'PENYULANG', 'BEBAN SIANG', 'BEBAN MALAM', 'MAX', 'SET OC', '% PEMBEBANAN PENYULANG', 'GARDU INDUK', 'DAYA', 'I NOM', 'BEBAN (I)', '% BEBAN TRAFO GI', 'KETERANGAN'],
  rabDatabase: ['UPDATED_AT', 'ID RAB', 'PRK', 'NAMA FILE', 'REKAP AKTIF', 'SHEET DETAIL', 'BARIS', 'URAIAN MATERIAL', 'VOLUME', 'JENIS PEKERJAAN', 'HARGA SATUAN'],
  tibet: ['VENDOR', 'NOMOR KR', 'JENIS TIBET', 'NO PK', 'POS', 'VOL KR', 'VOL PK', 'VOL PASANG', 'SISA KR', 'SISA PK'],
  vendor: ['NOMOR KONTRAK', 'VENDOR', 'NILAI KONTRAK', 'NOMOR PK', 'NAMA PELANGGAN', 'NILAI PK', 'REALISASI (Rp)', 'SISA KONTRAK', 'PENGAWAS', 'MV Cell GI (buah)', 'MV Cell GD/GH (buah)', 'JTM (kms)', 'Tiang TM (buah)', 'Switching Motorized (buah)', 'Double Switching 20 kV (buah)', 'Switching Manual (buah)', 'GD/GH (buah)', 'Trafo Distribusi (buah)', 'Trafo Distribusi (KVA)', 'PHBTR (buah)', 'JTR (kms)', 'Tiang TR (buah)', 'LAIN-LAIN', 'Nomor WO', 'NO SAP MATERIAL', 'NAMA MATERIAL', 'JUMLAH MATERIAL', 'Nomor SUB ID', 'STATUS KONTRAK'],
  customers: ['NO', 'NAMA', 'TARIF', 'JENIS PLG', 'DAYA', 'PK', 'PROGRESS', 'NO PK', 'NO KONTRAK', 'ULP', 'KETERANGAN KENDALA', 'TIANG 13', 'TIANG 9', 'A3CS 150', 'MVTIC', 'KABEL TANAM', 'TRF 400', 'TRF 250', 'TRF 200', 'TRF 160', 'TRF 100', 'TRF 50', 'KONS A1', 'KONS A2', 'KONS A3', 'KONS B1', 'KONS B3', 'ISO TUMPU', 'ISO TARIK', 'SUSP', 'LA', 'DE', 'ADE', 'PHBTR 1 TIANG', 'PHBTR 2 TIANG', 'FCO', 'ARRESTER', 'CUBICLE', 'NYY 70', 'NYY 150', 'LVTC', 'KWH UKUR LANGSUNG', 'KWH UKUR TAK LANGSUNG', 'Pasca Bayar', 'Pra Bayar'],
}

const FILTER_FIELDS = {
  spb: ['PROGRES', 'STATUS SPB', 'POS'],
  stock: ['KRITERIA MATERIAL', 'STATUS', 'NAMA MATERIAL'],
  load: ['UP3', 'GARDU INDUK', 'PENYULANG', 'KARAKTERISTIK BEBAN'],
  rabDatabase: ['PRK', 'ID RAB'],
  tibet: ['NOMOR KR', 'VENDOR'],
  vendor: ['NOMOR KONTRAK', 'NOMOR PK', 'NOMOR WO', 'STATUS KONTRAK'],
  customers: ['PROGRESS', 'ULP', 'MATERIAL'],
}

const KPI_FIELDS = {
  spb: [['TOTAL DATA SPB', 'TOTAL DATA SPB'], ['VOL SPB', 'Data (Volume SPB)'], ['VOL DTG', 'Sudah datang'], ['VOL BLM DTG', 'Belum datang'], ['PROGRES PERSENTASE', 'Progres kedatangan']],
  stock: [['NORMALISASI', 'Material terdaftar'], ['VOL 61', 'Stok POS 61'], ['VOL 62', 'Stok POS 62'], ['VOL GUDANG', 'Stok gudang']],
  load: [['PENYULANG', 'Penyulang'], ['BEBAN SIANG', 'Beban siang'], ['BEBAN MALAM', 'Beban malam'], ['% PEMBEBANAN PENYULANG', 'Rata-rata beban']],
  rabDatabase: [['ID RAB', 'ID RAB'], ['PRK', 'PRK'], ['URAIAN MATERIAL', 'Baris material'], ['VOLUME', 'Total volume']],
  tibet: [['NOMOR KR', 'Jumlah KR'], ['NO PK', 'Jumlah PK'], ['SISA KR', 'Sisa KR'], ['SISA PK', 'Sisa PK'], ['VOL PASANG', 'Terpasang']],
  vendor: [['NOMOR KONTRAK', 'Kontrak vendor'], ['VENDOR', 'Nama Vendor'], ['NILAI KONTRAK', 'Nilai kontrak'], ['REALISASI (Rp)', 'Total realisasi'], ['SISA KONTRAK', 'Sisa kontrak']],
  customers: [['NAMA', 'Pelanggan terdata'], ['PK', 'PK sudah'], ['ULP', 'ULP'], ['DAYA', 'Total daya'], ['PROGRESS', 'Sudah nyala']],
}
const CHART_COLORS = ['#0878b9', '#24bfd3', '#79b86a', '#edab54', '#8172c5', '#e47768', '#4a9a91', '#9b7b5a']

function readStoredDatasets() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return {}
    const value = JSON.parse(stored)
    return value && typeof value === 'object' ? value : {}
  } catch (error) {
    console.warn('Data Monitoring tersimpan tidak dapat dibaca.', error)
    return {}
  }
}

function getColumnIndex(headers, names) {
  const candidates = (Array.isArray(names) ? names : [names]).map(normalizeMonitoringHeader)
  return headers.findIndex((header) => candidates.includes(normalizeMonitoringHeader(header)))
}

function cell(row, index) {
  return index >= 0 ? row[index] ?? '' : ''
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

function uniqueCount(rows, index) {
  return new Set(rows.map((row) => String(cell(row, index)).trim()).filter(Boolean)).size
}

function sumColumn(rows, index) {
  return rows.reduce((total, row) => total + numberValue(cell(row, index)), 0)
}

function averageColumn(rows, index) {
  return rows.length ? sumColumn(rows, index) / rows.length : 0
}

function isCurrencyHeader(header) {
  return /NILAI|KONTRAK|REALISASI|SISA KONTRAK|HARGA SATUAN/i.test(header)
}

function formatCell(value, header) {
  if (value === '' || value === null || value === undefined) return '-'
  if (typeof value === 'number' && isCurrencyHeader(header)) return CURRENCY_FORMAT.format(value)
  if (typeof value === 'number') return NUMBER_FORMAT.format(value)
  return String(value)
}

function formatMetric(value, header) {
  if (isCurrencyHeader(header)) return CURRENCY_FORMAT.format(value)
  return NUMBER_FORMAT.format(value)
}

function buildMetrics(moduleId, dataset, rows, selectedFilters = {}) {
  const headers = dataset?.headers || []
  return KPI_FIELDS[moduleId].map(([field, label]) => {
    const index = getColumnIndex(headers, field)
    let value = 0
    if (moduleId === 'spb') {
      value = field === 'TOTAL DATA SPB' ? rows.length
        : field === 'PROGRES PERSENTASE'
        ? (sumColumn(rows, getColumnIndex(headers, 'VOL SPB')) > 0
          ? (sumColumn(rows, getColumnIndex(headers, 'VOL DTG')) / sumColumn(rows, getColumnIndex(headers, 'VOL SPB'))) * 100
          : 0)
        : field === 'VOL BLM DTG'
          ? Math.max(0, sumColumn(rows, getColumnIndex(headers, 'VOL SPB')) - sumColumn(rows, getColumnIndex(headers, 'VOL DTG')))
          : sumColumn(rows, index)
    } else if (moduleId === 'stock') {
      value = field === 'NORMALISASI' ? uniqueCount(rows, index) : sumColumn(rows, index)
    } else if (moduleId === 'load') {
      value = field === 'PENYULANG' ? uniqueCount(rows, index) : averageColumn(rows, index)
    } else if (moduleId === 'rabDatabase') {
      value = field === 'ID RAB' || field === 'PRK' ? uniqueCount(rows, index)
        : field === 'URAIAN MATERIAL' ? rows.filter((row) => cell(row, index)).length
          : sumColumn(rows, index)
    } else if (moduleId === 'tibet') {
      if (field === 'NOMOR KR' || field === 'NO PK') value = uniqueCount(rows, index)
      else if (field === 'VOL PASANG') {
        const pkIndex = getColumnIndex(headers, 'NO PK')
        value = sumColumn(rows.filter((row) => !String(cell(row, pkIndex)).trim()), index)
      } else value = sumColumn(rows, index)
    } else if (moduleId === 'vendor') {
      if (field === 'NOMOR KONTRAK') value = uniqueCount(rows, index)
      else if (field === 'VENDOR') {
        const selectedContract = selectedFilters['NOMOR KONTRAK']
        if (!selectedContract) value = 'Semua Vendor'
        else {
          const contractRows = dataset.rows.filter((row) => String(cell(row, getColumnIndex(headers, 'NOMOR KONTRAK'))).trim() === selectedContract)
          const vendors = [...new Set(contractRows.map((row) => String(cell(row, index)).trim()).filter(Boolean))]
          value = vendors.join(', ') || 'Vendor tidak ditemukan'
        }
      } else value = sumColumn(rows, index)
    } else if (moduleId === 'customers') {
      value = field === 'NAMA' ? uniqueCount(rows, index)
        : field === 'PK' ? rows.filter((row) => String(cell(row, index)).trim().toLocaleUpperCase('id') === 'SUDAH').length
          : field === 'ULP' ? uniqueCount(rows, index)
            : field === 'DAYA' ? sumColumn(rows, index)
              : rows.filter((row) => String(cell(row, index)).trim().toLocaleUpperCase('id') === 'NYALA').length
    }
    const isText = moduleId === 'vendor' && field === 'VENDOR'
    const isContractCount = moduleId === 'vendor' && field === 'NOMOR KONTRAK'
    const formattedValue = isText ? value
      : isContractCount ? NUMBER_FORMAT.format(value)
      : moduleId === 'spb' && field === 'PROGRES PERSENTASE' ? `${NUMBER_FORMAT.format(value)}%`
        : formatMetric(value, field)
    return { label, value: formattedValue, rawValue: value, isText }
  })
}

function buildChartData(moduleId, dataset, rows, selectedFilters = {}) {
  const headers = dataset?.headers || []
  const groupBy = (groupField, measureFields, limit = 8) => {
    const groupIndex = getColumnIndex(headers, groupField)
    const measureIndexes = measureFields.map((field) => [field, getColumnIndex(headers, field)])
    const groups = new Map()
    rows.forEach((row) => {
      const name = String(cell(row, groupIndex)).trim() || 'Tidak diketahui'
      const item = groups.get(name) || { name, ...Object.fromEntries(measureFields.map((field) => [field, 0])) }
      measureIndexes.forEach(([field, index]) => { item[field] += numberValue(cell(row, index)) })
      groups.set(name, item)
    })
    return [...groups.values()].sort((left, right) => {
      const [field] = measureFields
      return right[field] - left[field]
    }).slice(0, limit)
  }

  if (moduleId === 'spb') {
    const posIndex = getColumnIndex(headers, 'POS')
    const spbIndex = getColumnIndex(headers, 'VOL SPB')
    const arrivedIndex = getColumnIndex(headers, 'VOL DTG')
    const notArrivedIndex = getColumnIndex(headers, 'VOL BLM DTG')
    const grouped = new Map()
    rows.forEach((row) => {
      const name = String(cell(row, posIndex)).trim() || 'Tidak diketahui'
      const item = grouped.get(name) || { name, 'VOL SPB': 0, 'VOL DTG': 0, 'VOL BLM DTG': 0 }
      const spbVolume = numberValue(cell(row, spbIndex))
      const arrivedVolume = numberValue(cell(row, arrivedIndex))
      item['VOL SPB'] += spbVolume
      item['VOL DTG'] += arrivedVolume
      item['VOL BLM DTG'] += notArrivedIndex >= 0 && cell(row, notArrivedIndex) !== ''
        ? numberValue(cell(row, notArrivedIndex))
        : Math.max(0, spbVolume - arrivedVolume)
      grouped.set(name, item)
    })
    const data = [...grouped.values()].map((item) => ({
      ...item,
      'PROGRES %': item['VOL SPB'] > 0 ? item['VOL DTG'] / item['VOL SPB'] * 100 : 0,
    })).sort((left, right) => left.name.localeCompare(right.name, 'id', { numeric: true }))
    return {
      data,
      layout: 'vertical',
      categoryAxisWidth: 85,
      dynamicHeight: Math.max(260, data.length * 46),
      percentLine: 'PROGRES %',
      bars: [['VOL SPB', 'Data (Vol SPB)', '#0782bd'], ['VOL DTG', 'Sudah datang', '#24bfd3'], ['VOL BLM DTG', 'Belum datang', '#edab54']],
      label: 'Data SPB, kedatangan, dan progres per POS',
    }
  }
  if (moduleId === 'stock') {
    const nameIndex = getColumnIndex(headers, ['NAMA MATERIAL', 'NAMA BARANG'])
    const indexes = ['VOL 61', 'VOL 62', 'VOL GUDANG'].map((field) => [field, getColumnIndex(headers, field)])
    const statusIndex = getColumnIndex(headers, 'STATUS')
    const emergencyRows = rows.filter((row) => /DARURAT/i.test(String(cell(row, statusIndex))))
    const selectedRows = emergencyRows.length ? emergencyRows : rows
    const data = selectedRows.map((row) => {
      const item = { name: String(cell(row, nameIndex)).trim() || 'Tanpa nama' }
      indexes.forEach(([field, index]) => { item[field] = numberValue(cell(row, index)) })
      return item
    }).sort((left, right) => (right['VOL 61'] + right['VOL 62'] + right['VOL GUDANG']) - (left['VOL 61'] + left['VOL 62'] + left['VOL GUDANG'])).slice(0, emergencyRows.length ? 5 : 8)
    return { data, layout: 'vertical', categoryAxisWidth: 190, bars: [['VOL 61', 'POS 61', '#0782bd'], ['VOL 62', 'POS 62', '#24bfd3'], ['VOL GUDANG', 'Gudang', '#79b86a']], label: emergencyRows.length ? '5 material darurat dengan volume stok terbesar' : 'Perbandingan stok pada 8 material teratas' }
  }
  if (moduleId === 'load') {
    const characteristic = selectedFilters['KARAKTERISTIK BEBAN']
    if (characteristic) {
      const field = characteristic === 'SIANG' ? 'BEBAN SIANG' : 'BEBAN MALAM'
      return {
        data: groupBy('PENYULANG', [field], 12),
        layout: 'vertical',
        categoryAxisWidth: 170,
        dynamicHeight: Math.max(280, Math.min(12, rows.length) * 40),
        bars: [[field, `Beban ${characteristic.toLocaleLowerCase('id')}`, '#0878b9']],
        label: `Karakteristik beban ${characteristic.toLocaleLowerCase('id')} per penyulang`,
      }
    }
    const data = MONTHS.map((month) => ({
      name: month.slice(0, 3),
      'BEBAN SIANG': averageColumn(rows, getColumnIndex(headers, month)),
    })).filter((item) => item['BEBAN SIANG'] > 0)
    return { data, bars: [['BEBAN SIANG', 'Rata-rata beban', '#0782bd']], label: 'Rata-rata beban bulanan seluruh penyulang' }
  }
  if (moduleId === 'rabDatabase') return {
    data: groupBy('URAIAN MATERIAL', ['VOLUME'], 8),
    bars: [['VOLUME', 'Total volume', '#0782bd']],
    label: '8 material dengan volume terbesar',
  }
  if (moduleId === 'tibet') return {
    data: groupBy('VENDOR', ['VOL KR', 'VOL PK', 'VOL PASANG'], 8),
    bars: [['VOL KR', 'Volume KR', '#0782bd'], ['VOL PK', 'Volume PK', '#24bfd3'], ['VOL PASANG', 'Terpasang', '#79b86a']],
    label: 'Volume kontrak dan pemasangan per vendor',
  }
  if (moduleId === 'vendor') {
    const materialIndex = getColumnIndex(headers, 'NAMA MATERIAL')
    const quantityIndex = getColumnIndex(headers, 'JUMLAH MATERIAL')
    const materialGroups = new Map()
    rows.forEach((row) => {
      const names = String(cell(row, materialIndex)).split(/\r?\n/)
      const quantities = String(cell(row, quantityIndex)).split(/\r?\n/)
      names.forEach((name, index) => {
        const material = name.trim()
        if (!material) return
        const item = materialGroups.get(material) || { name: material, 'Volume Material': 0 }
        item['Volume Material'] += numberValue(quantities[index])
        materialGroups.set(material, item)
      })
    })
    const data = [...materialGroups.values()].sort((left, right) => right['Volume Material'] - left['Volume Material'])
    return {
      data,
      layout: 'vertical',
      categoryAxisWidth: 200,
      dynamicHeight: Math.max(300, data.length * 36),
      scrollable: true,
      bars: [['Volume Material', 'Volume Material', '#0878b9']],
      label: 'Rekap Semua Material dan Volume',
    }
  }
  const materialColumns = headers.map((header, index) => ({ header, index }))
    .filter(({ index }) => index >= 11 && !['PASCA BAYAR', 'PRA BAYAR'].includes(normalizeMonitoringHeader(headers[index])))
  const groups = materialColumns.map(({ header, index }) => ({
    name: header,
    'Jumlah pelanggan': rows.reduce((total, row) => total + numberValue(cell(row, index)), 0),
  })).filter((item) => item['Jumlah pelanggan'] > 0)
    .sort((left, right) => right['Jumlah pelanggan'] - left['Jumlah pelanggan'])
    .slice(0, 8)
  if (groups.length) return {
    data: groups,
    bars: [['Jumlah pelanggan', 'Kebutuhan material', '#0782bd']],
    label: '8 kebutuhan material terbanyak',
  }
  const fallbackGroups = new Map()
  const progressIndex = getColumnIndex(headers, 'PROGRESS')
  rows.forEach((row) => {
    const progress = String(cell(row, progressIndex)).trim() || 'Belum diisi'
    fallbackGroups.set(progress, (fallbackGroups.get(progress) || 0) + 1)
  })
  return {
    data: [...fallbackGroups.entries()].map(([name, count]) => ({ name, 'Jumlah pelanggan': count })).sort((a, b) => b['Jumlah pelanggan'] - a['Jumlah pelanggan']).slice(0, 8),
    bars: [['Jumlah pelanggan', 'Jumlah pelanggan', '#0782bd']],
    label: 'Jumlah pelanggan berdasarkan progres',
  }
}

function buildVendorValueBreakdown(headers, rows, selectedContract) {
  const contractIndex = getColumnIndex(headers, 'NOMOR KONTRAK')
  const values = { contract: 0, pk: 0, realization: 0, remaining: 0 }
  let activeContract = ''
  rows.forEach((row) => {
    const rowContract = String(cell(row, contractIndex)).trim()
    if (rowContract) activeContract = rowContract
    if (selectedContract && activeContract !== selectedContract) return
    values.contract += numberValue(cell(row, getColumnIndex(headers, 'NILAI KONTRAK')))
    values.pk += numberValue(cell(row, getColumnIndex(headers, 'NILAI PK')))
    values.realization += numberValue(cell(row, getColumnIndex(headers, 'REALISASI (Rp)')))
    values.remaining += numberValue(cell(row, getColumnIndex(headers, 'SISA KONTRAK')))
  })
  return [
    { name: 'Nilai PK', value: values.pk, color: CHART_COLORS[0] },
    { name: 'Realisasi', value: values.realization, color: CHART_COLORS[1] },
    { name: 'Sisa Kontrak', value: values.remaining, color: CHART_COLORS[2] },
  ].map((item) => ({
    ...item,
    percentage: values.contract > 0 ? item.value / values.contract * 100 : 0,
    contractValue: values.contract,
  }))
}

function summarizeRabRowsById(rows) {
  const grouped = new Map()
  rows.forEach((row) => {
    const item = {
      id: String(cell(row, 1)).trim(),
      prk: String(cell(row, 2)).trim(),
      material: String(cell(row, 7)).trim(),
      type: String(cell(row, 9)).trim() || 'LAINNYA',
    }
    const key = JSON.stringify([item.id, item.prk, item.material, item.type])
    const summary = grouped.get(key) || { ...item, rowCount: 0, volume: 0 }
    summary.rowCount += 1
    summary.volume += numberValue(cell(row, 8))
    grouped.set(key, summary)
  })
  return [...grouped.values()].sort((left, right) => right.volume - left.volume)
}

function getFilterOptions(dataset, field) {
  if (!dataset) return []
  const index = getColumnIndex(dataset.headers, field)
  return [...new Set(dataset.rows.map((row) => String(cell(row, index)).trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'id', { numeric: true }))
}

function MonitoringChart({ chart }) {
  if (!chart.data.length) return <div className="monitoring-chart-empty">Belum ada data yang cocok untuk ditampilkan.</div>
  const horizontal = chart.layout === 'vertical'
  const renderCategoryTick = ({ x, y, payload }) => {
    const value = String(payload.value ?? '')
    const maxChars = 27
    const words = value.split(/\s+/)
    const lines = []
    let current = ''
    for (const word of words) {
      if (!current && word.length > maxChars) {
        for (let index = 0; index < word.length; index += maxChars) lines.push(word.slice(index, index + maxChars))
        continue
      }
      if (current && current.length + word.length + 1 > maxChars) {
        lines.push(current)
        current = word
      } else {
        current = current ? `${current} ${word}` : word
      }
    }
    if (current) lines.push(current)
    const visibleLines = lines.slice(0, 2)
    if (lines.length > 2) visibleLines[1] = `${visibleLines[1].slice(0, maxChars - 1)}…`
    const firstLineOffset = visibleLines.length > 1 ? -5 : 3
    return <g transform={`translate(${x},${y})`}><title>{value}</title><text textAnchor="end" fill="#718098" fontSize="9">
      {visibleLines.map((line, index) => <tspan key={`${index}-${line}`} x="-8" dy={index === 0 ? firstLineOffset : 11}>{line}</tspan>)}
    </text></g>
  }
  const Chart = chart.percentLine ? ComposedChart : BarChart
  return <ResponsiveContainer width="100%" height="100%">
    <Chart data={chart.data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: chart.percentLine ? 24 : 14, left: 0, bottom: 0 }}>
      <CartesianGrid stroke="#edf1f6" vertical={false} />
      {horizontal
        ? <><XAxis xAxisId="volume" type="number" axisLine={false} tickLine={false} tick={{ fill: '#8793a6', fontSize: 9 }} /><YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={renderCategoryTick} width={chart.categoryAxisWidth || 170} interval={0} />{chart.percentLine && <XAxis xAxisId="percent" orientation="top" type="number" domain={[0, 100]} tickFormatter={(value) => `${value}%`} axisLine={false} tickLine={false} tick={{ fill: '#b28335', fontSize: 9 }} />}</>
        : <><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#718098', fontSize: 10 }} interval={0} angle={chart.data.length > 6 ? -18 : 0} textAnchor={chart.data.length > 6 ? 'end' : 'middle'} height={chart.data.length > 6 ? 48 : 30} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#8793a6', fontSize: 9 }} width={48} /></>}
      <Tooltip formatter={(value, name) => [name === 'Progres kedatangan' ? `${NUMBER_FORMAT.format(value)}%` : NUMBER_FORMAT.format(value), name]} contentStyle={{ border: '1px solid #dce5ef', borderRadius: 6, fontSize: 11 }} />
      {chart.bars.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
      {chart.bars.map(([field, label, color]) => <Bar key={field} xAxisId={horizontal ? 'volume' : undefined} dataKey={field} name={label} fill={color} radius={[3, 3, 0, 0]} maxBarSize={30} />)}
      {chart.percentLine && <Line xAxisId={horizontal ? 'percent' : undefined} type="monotone" dataKey={chart.percentLine} name="Progres kedatangan" stroke="#edab54" strokeWidth={2.5} dot={{ r: 3 }} />}
    </Chart>
  </ResponsiveContainer>
}

export default function Monitoring({ moduleId, onNotice, onLoadMonitoring, onSaveMonitoring, readOnly = false }) {
  const fileInput = useRef(null)
  const rabFileInput = useRef(null)
  const [datasets, setDatasets] = useState(readStoredDatasets)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [importing, setImporting] = useState(false)
  const [importStage, setImportStage] = useState('')
  const [error, setError] = useState('')
  const [customerFormOpen, setCustomerFormOpen] = useState(false)
  const [customerDraft, setCustomerDraft] = useState({})
  const [customerSaving, setCustomerSaving] = useState(false)
  const [vendorFormOpen, setVendorFormOpen] = useState(false)
  const [vendorDraft, setVendorDraft] = useState({})
  const [vendorSaving, setVendorSaving] = useState(false)
  const [rabFile, setRabFile] = useState(null)
  const [rabId, setRabId] = useState('')
  const [rabPrk, setRabPrk] = useState('')
  const [rabPreview, setRabPreview] = useState(null)
  const [rabReading, setRabReading] = useState(false)
  const [rabSaving, setRabSaving] = useState(false)
  const [rabRekapVisible, setRabRekapVisible] = useState(false)
  const [rabRekapId, setRabRekapId] = useState('')
  const [rabRekapPrk, setRabRekapPrk] = useState('')
  const [rabSelectedId, setRabSelectedId] = useState('')
  const [rabIdSearch, setRabIdSearch] = useState('')
  const [rabRecapPrk, setRabRecapPrk] = useState('')
  const [rabMaterialFilter, setRabMaterialFilter] = useState('')
  const [rabTypeFilter, setRabTypeFilter] = useState('')
  const [cloudLoading, setCloudLoading] = useState(true)
  const [cloudSaving, setCloudSaving] = useState(false)
  const [needsCloudMigration, setNeedsCloudMigration] = useState(false)
  const module = MONITORING_MODULES.find((item) => item.id === moduleId) || MONITORING_MODULES[0]
  const info = MODULE_INFO[module.id]
  const dataset = datasets[module.id]
  const headers = dataset?.headers || (moduleId === 'vendor' ? MODULE_FIELDS.vendor : EMPTY_HEADERS)
  const columns = useMemo(() => {
    const preferred = MODULE_FIELDS[module.id] || []
    const selected = preferred.map((name) => getColumnIndex(headers, name)).filter((index) => index >= 0)
    const remaining = headers.map((_, index) => index).filter((index) => !selected.includes(index))
    return [...selected, ...remaining]
  }, [headers, module.id])
  const filterFields = FILTER_FIELDS[module.id] || EMPTY_FILTER_FIELDS
  const [selectedFilters, setSelectedFilters] = useState({})
  const filteredRows = useMemo(() => {
    if (!dataset) return []
    const term = search.trim().toLocaleLowerCase('id')
    let activeContract = ''
    return dataset.rows.filter((row) => {
      const rowContract = String(cell(row, getColumnIndex(headers, 'NOMOR KONTRAK'))).trim()
      if (rowContract) activeContract = rowContract
      for (const field of filterFields) {
        const selected = selectedFilters[field]
        if (!selected) continue
        if (field === 'MATERIAL') {
          const materialIndex = getColumnIndex(headers, selected)
          if (numberValue(cell(row, materialIndex)) === 0) return false
        } else if (field === 'NOMOR KONTRAK' && module.id === 'vendor') {
          if (activeContract !== selected) return false
        } else if (field === 'KARAKTERISTIK BEBAN') {
          const index = getColumnIndex(headers, selected === 'SIANG' ? 'BEBAN SIANG' : 'BEBAN MALAM')
          if (!String(cell(row, index)).trim() || numberValue(cell(row, index)) === 0) return false
        } else {
          const index = getColumnIndex(headers, field)
          if (String(cell(row, index)).trim() !== selected) return false
        }
      }
      return !term || row.some((value) => String(value ?? '').toLocaleLowerCase('id').includes(term))
    })
  }, [dataset, filterFields, headers, module.id, search, selectedFilters])
  const optionsByField = useMemo(() => Object.fromEntries(filterFields.map((field) => [field, field === 'MATERIAL'
    ? headers.slice(11, 44).filter((header) => header.trim())
    : field === 'KARAKTERISTIK BEBAN' ? ['SIANG', 'MALAM']
    : getFilterOptions(dataset, field)])), [dataset, filterFields, headers])
  const metrics = useMemo(() => buildMetrics(module.id, dataset, filteredRows, selectedFilters), [dataset, filteredRows, module.id, selectedFilters])
  const chart = useMemo(() => buildChartData(module.id, dataset, filteredRows, selectedFilters), [dataset, filteredRows, module.id, selectedFilters])
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const visibleRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const loadedCount = Object.values(datasets).reduce((total, item) => total + (item?.rows?.length || 0), 0)
  const Icon = info.icon
  const isCustomerModule = module.id === 'customers'
  const isVendorModule = module.id === 'vendor'
  const isRabModule = module.id === 'rabDatabase'
  const rabDatabaseRows = datasets.rabDatabase?.rows || EMPTY_ROWS
  const rabPrkOptions = useMemo(() => [...new Set(rabDatabaseRows.map((row) => String(cell(row, 2)).trim()).filter(Boolean))].sort(), [rabDatabaseRows])
  const rabIdOptions = useMemo(() => [...new Set(rabDatabaseRows.map((row) => String(cell(row, 1)).trim()).filter(Boolean))].sort(), [rabDatabaseRows])
  const rabIdSearchResults = useMemo(() => rabIdOptions.filter((id) => !rabIdSearch || id.toLocaleLowerCase('id').includes(rabIdSearch.trim().toLocaleLowerCase('id'))), [rabIdOptions, rabIdSearch])
  const rabSelectedRows = useMemo(() => rabSelectedId
    ? rabDatabaseRows.filter((row) => String(cell(row, 1)).trim() === rabSelectedId)
    : [], [rabDatabaseRows, rabSelectedId])
  const rabRekapRows = useMemo(() => rabDatabaseRows.filter((row) =>
    (!rabRekapPrk || String(cell(row, 2)).trim() === rabRekapPrk)
    && (!rabRekapId || String(cell(row, 1)).trim() === rabRekapId)), [rabDatabaseRows, rabRekapId, rabRekapPrk])
  const rabSummary = useMemo(() => summarizeRabMaterials(rabRekapRows), [rabRekapRows])
  const rabIdRecapRows = useMemo(() => rabRekapRows.filter((row) =>
    !rabIdSearch || String(cell(row, 1)).toLocaleLowerCase('id').includes(rabIdSearch.trim().toLocaleLowerCase('id'))), [rabIdSearch, rabRekapRows])
  const rabIdRecapSummary = useMemo(() => summarizeRabRowsById(rabIdRecapRows), [rabIdRecapRows])
  const rabPrkRows = useMemo(() => rabDatabaseRows.filter((row) =>
    (!rabRecapPrk || String(cell(row, 2)).trim() === rabRecapPrk)
    && (!rabMaterialFilter || String(cell(row, 7)).trim() === rabMaterialFilter)
    && (!rabTypeFilter || String(cell(row, 9)).trim() === rabTypeFilter)), [rabDatabaseRows, rabMaterialFilter, rabRecapPrk, rabTypeFilter])
  const rabPrkSummary = useMemo(() => summarizeRabMaterials(rabPrkRows), [rabPrkRows])
  const rabSelectedSummary = useMemo(() => summarizeRabMaterials(rabSelectedRows), [rabSelectedRows])
  const rabMaterialOptions = useMemo(() => [...new Set(rabDatabaseRows
    .filter((row) => !rabRecapPrk || String(cell(row, 2)).trim() === rabRecapPrk)
    .map((row) => String(cell(row, 7)).trim()).filter(Boolean))].sort(), [rabDatabaseRows, rabRecapPrk])
  const rabTypeOptions = useMemo(() => [...new Set(rabDatabaseRows
    .filter((row) => !rabRecapPrk || String(cell(row, 2)).trim() === rabRecapPrk)
    .map((row) => String(cell(row, 9)).trim()).filter(Boolean))].sort(), [rabDatabaseRows, rabRecapPrk])
  const vendorValueBreakdown = useMemo(() => buildVendorValueBreakdown(headers, dataset?.rows || EMPTY_ROWS, selectedFilters['NOMOR KONTRAK']), [dataset, headers, selectedFilters])

  useEffect(() => {
    let cancelled = false
    const localDatasets = readStoredDatasets()
    onLoadMonitoring().then((remoteDatasets) => {
      if (cancelled) return
      const hasRemoteDatasets = Object.keys(remoteDatasets).length > 0
      if (hasRemoteDatasets) {
        setDatasets(remoteDatasets)
        setNeedsCloudMigration(false)
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteDatasets))
        } catch (storageError) {
          console.warn('Cache Monitoring lokal tidak dapat diperbarui.', storageError)
        }
      } else {
        setNeedsCloudMigration(Object.keys(localDatasets).length > 0)
      }
    }).catch((loadError) => {
      if (cancelled) return
      console.error('Data Monitoring gagal dimuat dari Google Sheets.', loadError)
      setError(loadError instanceof Error ? loadError.message : 'Data Monitoring gagal dimuat dari Google Sheets.')
    }).finally(() => {
      if (!cancelled) setCloudLoading(false)
    })
    return () => { cancelled = true }
  }, [module.id, onLoadMonitoring])

  async function persistDatasets(nextDatasets, datasetsToSync, successMessage) {
    setCloudSaving(true)
    setError('')
    try {
      await onSaveMonitoring(datasetsToSync)
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextDatasets))
      } catch (storageError) {
        console.warn('Cache Monitoring lokal tidak dapat diperbarui setelah penyimpanan cloud.', storageError)
      }
      setDatasets(nextDatasets)
      const savedAllModules = MONITORING_MODULES.every(({ id }) => datasetsToSync[id])
      setNeedsCloudMigration((current) => current && !savedAllModules)
      onNotice(successMessage)
      return true
    } catch (saveError) {
      console.error('Data Monitoring gagal disimpan ke Google Sheets.', saveError)
      setError(saveError instanceof Error ? saveError.message : 'Data Monitoring gagal disimpan ke Google Sheets.')
      return false
    } finally {
      setCloudSaving(false)
    }
  }

  async function migrateLocalData() {
    if (readOnly || !Object.keys(datasets).length) return
    const saved = await persistDatasets(datasets, datasets, 'Data Monitoring dari browser berhasil disimpan ke Google Sheets.')
    if (saved) setNeedsCloudMigration(false)
  }

  async function refreshStoredData() {
    setError('')
    try {
      const refreshed = await onLoadMonitoring()
      if (!refreshed[module.id] || !Array.isArray(refreshed[module.id].rows)) {
        throw new Error('Data menu ini belum tersedia di Google Sheets. Silakan impor workbook atau simpan data browser ke Google Sheets.')
      }
      setDatasets(refreshed)
      setNeedsCloudMigration(false)
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(refreshed))
      setSearch('')
      setSelectedFilters({})
      setPage(1)
      onNotice('Data Monitoring berhasil dimuat ulang dari Google Sheets.')
    } catch (refreshError) {
      console.error('Data Monitoring gagal dimuat ulang.', refreshError)
      setError(refreshError instanceof Error ? refreshError.message : 'Data Monitoring gagal dimuat ulang.')
    }
  }

  function openCustomerForm() {
    setCustomerDraft({})
    setCustomerFormOpen(true)
  }

  function openVendorForm() {
    setVendorDraft({})
    setVendorFormOpen(true)
  }

  async function saveVendor(event) {
    event.preventDefault()
    if (readOnly) return
    const contractIndex = getColumnIndex(headers, 'NOMOR KONTRAK')
    const contractNumber = String(vendorDraft[headers[contractIndex]] ?? '').trim()
    if (!contractNumber) {
      setError('Nomor kontrak wajib diisi.')
      return
    }
    setVendorSaving(true)
    const row = headers.map((header) => normalizeMonitoringHeader(header) === 'STATUSKONTRAK' && !String(vendorDraft[header] ?? '').trim()
      ? 'OPEN'
      : String(vendorDraft[header] ?? '').trim())
    const updatedDataset = {
      ...(dataset || { sheetName: 'MON_KONTRAK_VENDOR', headers }),
      headers,
      rows: [...(dataset?.rows || []), row],
    }
    const updatedDatasets = { ...datasets, [module.id]: updatedDataset }
    const saved = await persistDatasets(updatedDatasets, { [module.id]: updatedDataset }, 'Data kontrak vendor berhasil disimpan ke Google Sheets.')
    if (saved) {
      setSearch('')
      setSelectedFilters({})
      setPage(Math.ceil(updatedDataset.rows.length / PAGE_SIZE))
      setVendorFormOpen(false)
      setVendorDraft({})
    }
    setVendorSaving(false)
  }

  async function readRabFile() {
    if (readOnly || !rabFile) return
    setRabReading(true)
    setError('')
    try {
      const preview = await readRabMaterialFile(rabFile, { idRAB: rabId, prk: rabPrk })
      setRabPreview(preview)
      onNotice(`${preview.rows.length.toLocaleString('id-ID')} material ditemukan pada sheet ${preview.metadata.detailSheet}.`)
    } catch (readError) {
      console.error('File RAB gagal dibaca.', readError)
      setError(readError instanceof Error ? readError.message : 'File RAB gagal dibaca. Periksa format file.')
    } finally {
      setRabReading(false)
    }
  }

  async function saveRabPreview() {
    if (readOnly || !rabPreview) return
    const existingRows = datasets.rabDatabase?.rows || []
    const previousRows = existingRows.filter((row) => String(cell(row, 1)).trim() === rabPreview.metadata.idRAB)
    if (previousRows.length && !window.confirm(`ID RAB "${rabPreview.metadata.idRAB}" sudah memiliki ${previousRows.length} baris. Ganti semua data lama untuk ID ini?`)) return
    setRabSaving(true)
    const rows = [...existingRows.filter((row) => String(cell(row, 1)).trim() !== rabPreview.metadata.idRAB), ...rabPreview.rows]
    const updatedDataset = {
      sheetName: datasets.rabDatabase?.sheetName || 'MON_DATABASE_RAB',
      headers: MODULE_FIELDS.rabDatabase,
      rows,
    }
    const updatedDatasets = { ...datasets, rabDatabase: updatedDataset }
    const saved = await persistDatasets(updatedDatasets, { rabDatabase: updatedDataset }, `ID RAB ${rabPreview.metadata.idRAB} disimpan ke Google Sheets.`)
    if (saved) {
      setRabRekapId(rabPreview.metadata.idRAB)
      setRabRekapPrk(rabPreview.metadata.prk)
      setRabRekapVisible(true)
      setRabPreview(null)
      setRabFile(null)
      if (rabFileInput.current) rabFileInput.current.value = ''
    }
    setRabSaving(false)
  }

  function clearRabPreview() {
    setRabPreview(null)
    setRabFile(null)
    setRabId('')
    setRabPrk('')
    setError('')
    if (rabFileInput.current) rabFileInput.current.value = ''
  }

  async function downloadVendorExcel() {
    if (!dataset?.rows?.length) {
      setError('Belum ada data kontrak vendor untuk diunduh.')
      return
    }
    try {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Mon Kontrak Vendor')
      worksheet.addRow(headers)
      dataset.rows.forEach((row) => worksheet.addRow(row))
      worksheet.views = [{ state: 'frozen', ySplit: 1 }]
      worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } }
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0878B9' } }
      worksheet.columns = headers.map((header) => ({ width: Math.min(36, Math.max(14, String(header).length + 3)) }))
      const buffer = await workbook.xlsx.writeBuffer()
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'Mon-Kontrak-Vendor.xlsx'
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (downloadError) {
      console.error('Ekspor data kontrak vendor gagal.', downloadError)
      setError(downloadError instanceof Error ? downloadError.message : 'File Excel kontrak vendor gagal dibuat.')
    }
  }

  function printVendorData() {
    if (!filteredRows.length) {
      setError('Tidak ada data kontrak vendor yang cocok untuk dicetak.')
      return
    }
    setError('')
    window.print()
  }

  async function saveCustomer(event) {
    event.preventDefault()
    if (readOnly || !dataset) return
    setCustomerSaving(true)
    try {
      const row = headers.map((header, index) => {
        if (index === 0 && !String(customerDraft[header] ?? '').trim()) return String(dataset.rows.length + 1)
        return String(customerDraft[header] ?? '').trim()
      })
      const updatedDatasets = {
        ...datasets,
        [module.id]: { ...dataset, rows: [...dataset.rows, row] },
      }
      const saved = await persistDatasets(updatedDatasets, { [module.id]: updatedDatasets[module.id] }, 'Data kebutuhan pelanggan berhasil disimpan ke Google Sheets.')
      if (saved) {
        setSearch('')
        setSelectedFilters({})
        setPage(Math.ceil(updatedDatasets[module.id].rows.length / PAGE_SIZE))
        setCustomerFormOpen(false)
        setCustomerDraft({})
      }
    } catch (saveError) {
      console.error('Data kebutuhan pelanggan gagal disimpan.', saveError)
      setError(saveError instanceof Error ? saveError.message : 'Data pelanggan gagal disimpan.')
    } finally {
      setCustomerSaving(false)
    }
  }

  async function handleImport(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (loadedCount && !window.confirm('Data Monitoring yang tersimpan akan diganti dengan isi workbook ini. Lanjutkan?')) return
    setImporting(true)
    setError('')
    try {
      const imported = await importMonitoringWorkbook(file, setImportStage)
      const saved = await persistDatasets(imported, imported, `Workbook berhasil diimpor dan disimpan ke Google Sheets: ${MONITORING_MODULES.length} menu.`)
      if (!saved) return
      setSearch('')
      setSelectedFilters({})
      setPage(1)
    } catch (importError) {
      console.error('Workbook Monitoring gagal diimpor.', importError)
      setError(importError instanceof Error ? importError.message : 'Workbook gagal diimpor. Periksa format file dan coba kembali.')
    } finally {
      setImporting(false)
      setImportStage('')
    }
  }

  return <section className="monitoring-page">
    <header className="monitoring-heading">
      <div className="monitoring-heading-icon"><Icon size={19} /></div>
      <div className="monitoring-heading-copy">
        <p className="eyebrow">{info.eyebrow}</p>
        <h1>{module.label}</h1>
        <p>{info.description}{cloudLoading ? ' · Memuat data Google Sheets...' : ''}</p>
      </div>
      <div className="monitoring-heading-actions">
        {dataset && <span className="monitoring-import-status"><span /> {dataset.rows.length.toLocaleString('id-ID')} baris · {dataset.sheetName}</span>}
        {cloudSaving && <span className="monitoring-import-status"><span className="monitoring-cloud-saving-dot" /> Menyimpan ke Google Sheets...</span>}
        {needsCloudMigration && !readOnly && <button className="button button-primary" type="button" onClick={migrateLocalData} disabled={cloudSaving || cloudLoading}><Database size={15} /><span>Simpan data browser ke Google Sheets</span></button>}
        <input ref={fileInput} className="monitoring-file-input" type="file" accept=".xlsx,.xlsm" onChange={handleImport} aria-label="Pilih workbook Monitoring" />
        {isVendorModule && <>
          <button className="button button-secondary" type="button" onClick={refreshStoredData} disabled={cloudLoading || cloudSaving}><RefreshCw size={14} /><span>Refresh Data</span></button>
          {!readOnly && <button className="button button-primary" type="button" onClick={openVendorForm} disabled={cloudLoading || cloudSaving}><Plus size={15} /><span>Tambah Kontrak</span></button>}
          <button className="button button-secondary" type="button" onClick={downloadVendorExcel} disabled={cloudLoading}><ArrowDownToLine size={15} /><span>Download Excel</span></button>
          <button className="button button-secondary" type="button" onClick={printVendorData} disabled={cloudLoading}><Printer size={15} /><span>Print</span></button>
        </>}
        {!readOnly && <button className="button button-primary" type="button" onClick={() => fileInput.current?.click()} disabled={importing || cloudLoading || cloudSaving}>
          {importing ? <span className="monitoring-spinner" /> : <ArrowUpFromLine size={16} />}
          <span>{importing ? 'Mengimpor...' : loadedCount ? 'Impor ulang Excel' : 'Impor Excel'}</span>
        </button>}
      </div>
    </header>

    <div className="monitoring-import-hint">
      <FileSpreadsheet size={15} />
      <span>Impor satu workbook <strong>MONITORING AI BARA.xlsx</strong> untuk memuat data ke seluruh 7 menu Monitoring. Data baru akan disimpan ke Google Sheets.</span>
    </div>
    {needsCloudMigration && <div className="monitoring-cloud-migration" role="status"><Database size={15} /><span>Data Monitoring lama ditemukan di browser ini, tetapi belum ada di Google Sheets. Pilih <strong>Simpan data browser ke Google Sheets</strong> untuk memindahkannya.</span></div>}
    {importing && <div className="monitoring-import-progress" role="status">{importStage}</div>}
    {error && <div className="monitoring-error" role="alert">{error}</div>}

    {isRabModule && <section className="panel monitoring-rab-workflow">
      <div className="monitoring-panel-heading">
        <div><p className="eyebrow">UNGGAH & OLAH RAB</p><h2>Impor file RAB ke Database Material</h2></div>
        <span className="monitoring-chart-note"><Database size={14} />Tersimpan di Google Sheets</span>
      </div>
      <div className="monitoring-rab-form">
        <label className="monitoring-customer-field"><span>ID RAB <b>*</b></span><input value={rabId} onChange={(event) => setRabId(event.target.value)} placeholder="Contoh: RAB-2025-001" disabled={readOnly || rabReading || cloudSaving} /></label>
        <label className="monitoring-customer-field"><span>PRK <b>*</b></span><input value={rabPrk} onChange={(event) => setRabPrk(event.target.value)} placeholder="Masukkan kode atau nama PRK" disabled={readOnly || rabReading || cloudSaving} /></label>
        <label className="monitoring-customer-field monitoring-rab-file-field"><span>File RAB (.xlsx / .xlsm) <b>*</b></span><input ref={rabFileInput} type="file" accept=".xlsx,.xlsm" disabled={readOnly || rabReading || cloudSaving} onChange={(event) => { setRabFile(event.target.files?.[0] || null); setRabPreview(null); setError('') }} /></label>
        {rabFile && <span className="monitoring-rab-selected-file"><FileSpreadsheet size={14} />{rabFile.name}</span>}
        <div className="monitoring-rab-actions">
          {!readOnly && <button className="button button-primary" type="button" onClick={readRabFile} disabled={!rabFile || rabReading || cloudLoading || cloudSaving}>{rabReading ? <span className="monitoring-spinner" /> : <FileSpreadsheet size={15} />}{rabReading ? 'Membaca file...' : 'Baca File RAB'}</button>}
          {rabPreview && !readOnly && <button className="button button-primary" type="button" onClick={saveRabPreview} disabled={rabSaving || cloudSaving}><Database size={15} />{rabSaving ? 'Menyimpan...' : 'Simpan Material ke Database'}</button>}
          {(rabPreview || rabFile || rabId || rabPrk) && <button className="button button-secondary" type="button" onClick={clearRabPreview}>Bersihkan Preview</button>}
          <button className="button button-secondary" type="button" onClick={() => setRabRekapVisible((visible) => !visible)}>{rabRekapVisible ? 'Sembunyikan Rekap' : 'Tampilkan Rekap'}</button>
        </div>
      </div>
      {rabPreview && <div className="monitoring-rab-preview">
        <div className="monitoring-rab-preview-summary">
          <strong>Preview siap disimpan</strong><span>ID RAB: {rabPreview.metadata.idRAB}</span><span>PRK: {rabPreview.metadata.prk}</span><span>Sheet aktif: {rabPreview.metadata.detailSheet}</span><span>{rabPreview.rows.length.toLocaleString('id-ID')} material</span>
        </div>
        <div className="monitoring-table-scroll"><table><thead><tr>{MODULE_FIELDS.rabDatabase.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>
          {rabPreview.rows.slice(0, 100).map((row, index) => <tr key={`${row[5]}-${row[6]}-${index}`}>{row.map((value, columnIndex) => <td key={columnIndex}>{formatCell(value, MODULE_FIELDS.rabDatabase[columnIndex])}</td>)}</tr>)}
        </tbody></table></div>
        {rabPreview.rows.length > 100 && <p className="monitoring-rab-preview-note">Preview menampilkan 100 baris pertama; seluruh {rabPreview.rows.length.toLocaleString('id-ID')} baris akan disimpan.</p>}
      </div>}
      {rabRekapVisible && <div className="monitoring-rab-recap">
        <div className="monitoring-rab-recap-heading"><div><p className="eyebrow">REKAP DATABASE RAB</p><h3>{rabRekapRows.length.toLocaleString('id-ID')} detail material</h3></div>
          <div className="monitoring-rab-recap-filters">
            <label><span>PRK</span><select value={rabRekapPrk} onChange={(event) => setRabRekapPrk(event.target.value)}><option value="">Semua PRK</option>{rabPrkOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
            <label><span>ID RAB</span><select value={rabRekapId} onChange={(event) => setRabRekapId(event.target.value)}><option value="">Semua ID RAB</option>{rabIdOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
          </div>
        </div>
        {rabSummary.length ? <div className="monitoring-table-scroll"><table><thead><tr><th>No.</th><th>Uraian Material</th><th>Jenis Pekerjaan</th><th>Jumlah Baris</th><th>Total Volume</th><th>Estimasi Harga</th></tr></thead><tbody>
          {rabSummary.map((item, index) => <tr key={`${item.material}-${item.type}`}><td>{index + 1}</td><td>{item.material}</td><td>{item.type}</td><td>{NUMBER_FORMAT.format(item.rowCount)}</td><td>{NUMBER_FORMAT.format(item.volume)}</td><td>{item.totalPrice ? CURRENCY_FORMAT.format(item.totalPrice) : '-'}</td></tr>)}
        </tbody></table></div> : <p className="monitoring-rab-empty">Belum ada material tersimpan untuk filter ini.</p>}
      </div>}
    </section>}

    {!dataset ? <section className="panel monitoring-empty-state">
      <div className="monitoring-empty-icon"><FileSpreadsheet size={24} /></div>
      <h2>Mulai dengan impor data Monitoring</h2>
      <p>Pilih workbook Excel. Sheet SPB, Stock Gudang, Beban, Database RAB, Tibet, Kontrak Vendor, dan Kebutuhan Pelanggan akan dibaca sekaligus.</p>
      <button className="button button-primary" type="button" onClick={() => fileInput.current?.click()} disabled={importing || cloudLoading || cloudSaving}><ArrowUpFromLine size={16} /> Pilih workbook</button>
    </section> : <>
      <section className="monitoring-kpi-grid" aria-label={`Ringkasan ${module.label}`}>
        {metrics.map((metric, index) => <article className={`panel monitoring-kpi-card monitoring-kpi-${index + 1}`} key={metric.label}>
          <div className="monitoring-kpi-label">{metric.label}</div>
          <strong className={metric.isText ? 'is-text' : ''} title={String(metric.value)}>{metric.value}</strong>
          <span className="monitoring-kpi-foot"><span /> Berdasarkan filter aktif</span>
        </article>)}
      </section>

      <section className="panel monitoring-chart-panel">
        <div className="monitoring-panel-heading">
          <div><p className="eyebrow">ANALISIS DATA</p><h2>{chart.label}</h2></div>
          <span className="monitoring-chart-note"><Zap size={13} /> Grafik mengikuti filter tabel</span>
        </div>
        <div className={`monitoring-chart-viewport${chart.scrollable ? ' is-scrollable' : ''}`}>
          <div className={`monitoring-chart${chart.layout === 'vertical' ? ' is-horizontal' : ''}`} style={chart.dynamicHeight ? { height: chart.dynamicHeight } : undefined}><MonitoringChart chart={chart} /></div>
        </div>
      </section>

      {isVendorModule && <section className="panel monitoring-chart-panel">
        <div className="monitoring-panel-heading">
          <div><p className="eyebrow">PROPORSI NILAI KONTRAK</p><h2>Persentase terhadap Nilai Kontrak</h2></div>
          <span className="monitoring-chart-note">{selectedFilters['NOMOR KONTRAK'] || 'Semua kontrak'}</span>
        </div>
        {vendorValueBreakdown[0]?.contractValue > 0 ? <div className="monitoring-vendor-donuts">
          {vendorValueBreakdown.map((item) => {
            const percentage = Math.max(0, Math.min(100, item.percentage))
            const donutData = [{ name: item.name, value: percentage }, { name: 'Sisa persentase', value: 100 - percentage }]
            return <article className="monitoring-vendor-donut" key={item.name}>
              <div className="monitoring-vendor-donut-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={35} outerRadius={49} paddingAngle={1} stroke="none">
                      <Cell fill={item.color} /><Cell fill="#e9eef4" />
                    </Pie>
                    <Tooltip formatter={(value, name) => [`${NUMBER_FORMAT.format(value)}%`, name]} contentStyle={{ border: '1px solid #dce5ef', borderRadius: 6, fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
                <strong>{NUMBER_FORMAT.format(item.percentage)}%</strong>
              </div>
              <div><span>{item.name}</span><strong>{CURRENCY_FORMAT.format(item.value)}</strong></div>
            </article>
          })}
        </div> : <div className="monitoring-chart-empty">Nilai kontrak belum tersedia untuk filter yang dipilih.</div>}
        <p className="monitoring-vendor-donut-note">Persentase dihitung terhadap total Nilai Kontrak sebesar {CURRENCY_FORMAT.format(vendorValueBreakdown[0]?.contractValue || 0)}.</p>
      </section>}

      {isRabModule && <section className="monitoring-rab-detail-grid">
        <article className="panel monitoring-rab-detail-panel">
          <div className="monitoring-panel-heading"><div><p className="eyebrow">TELUSURI DATABASE</p><h2>Daftar ID RAB</h2></div><span className="monitoring-row-count">{rabIdOptions.length.toLocaleString('id-ID')} ID</span></div>
          <div className="monitoring-rab-browser-toolbar">
            <label className="monitoring-search"><Search size={15} /><input value={rabIdSearch} onChange={(event) => setRabIdSearch(event.target.value)} placeholder="Cari ID RAB..." /></label>
            <label className="monitoring-filter"><Database size={14} /><select aria-label="Pilih ID RAB untuk melihat detail" value={rabSelectedId} onChange={(event) => setRabSelectedId(event.target.value)}><option value="">Pilih ID RAB untuk membuka rincian</option>{rabIdSearchResults.map((id) => <option key={id} value={id}>{id}</option>)}</select></label>
          </div>
          {rabSelectedRows.length > 0 ? <>
            <div className="monitoring-rab-id-summary">
              <strong>{rabSelectedId}</strong><span>{String(cell(rabSelectedRows[0], 2))}</span><span>{rabSelectedRows.length.toLocaleString('id-ID')} baris material</span><span>Total volume: {NUMBER_FORMAT.format(sumColumn(rabSelectedRows, 8))}</span>
            </div>
            <h3 className="monitoring-rab-subheading">Rekap Jenis Material dan Total Volume</h3>
            <div className="monitoring-table-scroll"><table><thead><tr><th>Jenis Pekerjaan</th><th>Uraian Material</th><th>Baris Material</th><th>Total Volume</th></tr></thead><tbody>
              {rabSelectedSummary.map((item) => <tr key={`${item.material}-${item.type}`}><td>{item.type}</td><td>{item.material}</td><td>{NUMBER_FORMAT.format(item.rowCount)}</td><td>{NUMBER_FORMAT.format(item.volume)}</td></tr>)}
            </tbody></table></div>
            <h3 className="monitoring-rab-subheading">Rincian RAB: No, Sheet, Baris</h3>
            <div className="monitoring-table-scroll"><table><thead><tr><th>No.</th><th>Sheet</th><th>Baris</th><th>Uraian Material</th><th>Jenis Pekerjaan</th><th>Volume</th></tr></thead><tbody>
              {rabSelectedRows.map((row, index) => <tr key={`${cell(row, 5)}-${cell(row, 6)}-${index}`}><td>{index + 1}</td><td>{cell(row, 5)}</td><td>{cell(row, 6)}</td><td>{cell(row, 7)}</td><td>{cell(row, 9)}</td><td>{formatCell(cell(row, 8), 'VOLUME')}</td></tr>)}
            </tbody></table></div>
          </> : <p className="monitoring-rab-empty">Pilih ID RAB untuk membuka ringkasan dan rincian materialnya.</p>}
        </article>

        <article className="panel monitoring-rab-detail-panel">
          <div className="monitoring-panel-heading"><div><p className="eyebrow">REKAP MATERIAL</p><h2>Rekap Material per ID RAB</h2></div></div>
          <div className="monitoring-rab-recap-filters monitoring-rab-recap-filters-inline">
            <label><span>Filter PRK</span><select value={rabRekapPrk} onChange={(event) => { setRabRekapPrk(event.target.value); setRabRekapId('') }}><option value="">Semua PRK</option>{rabPrkOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
            <label><span>Filter ID RAB</span><select value={rabRekapId} onChange={(event) => setRabRekapId(event.target.value)}><option value="">Semua ID RAB</option>{rabIdOptions.filter((id) => !rabRekapPrk || rabDatabaseRows.some((row) => String(cell(row, 1)).trim() === id && String(cell(row, 2)).trim() === rabRekapPrk)).map((id) => <option key={id}>{id}</option>)}</select></label>
            <label className="monitoring-rab-search-id"><span>Cari ID RAB</span><input value={rabIdSearch} onChange={(event) => setRabIdSearch(event.target.value)} placeholder="Ketik ID RAB" /></label>
          </div>
          {rabIdRecapSummary.length ? <div className="monitoring-table-scroll"><table><thead><tr><th>ID RAB</th><th>PRK</th><th>Jenis Pekerjaan</th><th>Uraian Material</th><th>Jumlah Baris</th><th>Total Volume</th></tr></thead><tbody>
            {rabIdRecapSummary.map((item) => <tr key={`${item.id}-${item.prk}-${item.type}-${item.material}`}><td>{item.id}</td><td>{item.prk}</td><td>{item.type}</td><td>{item.material}</td><td>{NUMBER_FORMAT.format(item.rowCount)}</td><td>{NUMBER_FORMAT.format(item.volume)}</td></tr>)}
          </tbody></table></div> : <p className="monitoring-rab-empty">Belum ada material untuk filter PRK dan ID RAB ini.</p>}
          {rabSummary.length > 0 && rabIdRecapSummary.length === 0 && <p className="monitoring-rab-empty">Tidak ada ID RAB yang cocok dengan pencarian.</p>}
        </article>

        <article className="panel monitoring-rab-detail-panel monitoring-rab-detail-wide">
          <div className="monitoring-panel-heading"><div><p className="eyebrow">ANALISIS PER PRK</p><h2>Rekap Material Berdasarkan PRK</h2></div><span className="monitoring-row-count">{rabPrkSummary.length.toLocaleString('id-ID')} kombinasi material</span></div>
          <div className="monitoring-rab-recap-filters monitoring-rab-recap-filters-inline">
            <label><span>Filter PRK</span><select value={rabRecapPrk} onChange={(event) => { setRabRecapPrk(event.target.value); setRabMaterialFilter(''); setRabTypeFilter('') }}><option value="">Semua PRK</option>{rabPrkOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
            <label><span>Filter Material</span><select value={rabMaterialFilter} onChange={(event) => setRabMaterialFilter(event.target.value)}><option value="">Semua material</option>{rabMaterialOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
            <label><span>Jenis Pekerjaan</span><select value={rabTypeFilter} onChange={(event) => setRabTypeFilter(event.target.value)}><option value="">Semua jenis</option>{rabTypeOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
          </div>
          {rabPrkSummary.length ? <div className="monitoring-table-scroll"><table><thead><tr><th>PRK</th><th>Uraian Material</th><th>Jenis Pekerjaan</th><th>Jumlah Baris</th><th>Total Volume</th><th>Estimasi Harga</th></tr></thead><tbody>
            {rabPrkSummary.map((item) => <tr key={`${item.material}-${item.type}`}><td>{rabRecapPrk || 'Semua PRK'}</td><td>{item.material}</td><td>{item.type}</td><td>{NUMBER_FORMAT.format(item.rowCount)}</td><td>{NUMBER_FORMAT.format(item.volume)}</td><td>{item.totalPrice ? CURRENCY_FORMAT.format(item.totalPrice) : '-'}</td></tr>)}
          </tbody></table></div> : <p className="monitoring-rab-empty">Belum ada material untuk filter yang dipilih.</p>}
        </article>
      </section>}

      <section className="panel monitoring-table-panel">
        <div className="monitoring-panel-heading monitoring-table-heading">
          <div><p className="eyebrow">DATA TERSIMPAN</p><h2>Rincian {module.label}</h2></div>
          <div className="monitoring-table-actions">
            <span className="monitoring-row-count">{filteredRows.length.toLocaleString('id-ID')} dari {dataset.rows.length.toLocaleString('id-ID')} baris</span>
            {isCustomerModule && <>
              <button className="button button-secondary monitoring-refresh-button" type="button" onClick={refreshStoredData} disabled={cloudLoading || cloudSaving}><RefreshCw size={14} /><span>Refresh Data</span></button>
              {!readOnly && <button className="button button-primary monitoring-add-button" type="button" onClick={openCustomerForm} disabled={cloudLoading || cloudSaving}><Plus size={15} /><span>Tambah Data</span></button>}
            </>}
          </div>
        </div>
        <div className="monitoring-toolbar">
          <label className="monitoring-search"><Search size={15} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder={`Cari di ${module.label}...`} /></label>
          {filterFields.map((field) => <label className="monitoring-filter" key={field}><Filter size={14} /><select aria-label={`Filter ${field}`} value={selectedFilters[field] || ''} onChange={(event) => { setSelectedFilters((current) => ({ ...current, [field]: event.target.value })); setPage(1) }}>
            <option value="">{`Semua ${field.toLowerCase()}`}</option>
            {(optionsByField[field] || []).map((option) => <option key={option} value={option}>{option}</option>)}
          </select></label>)}
        </div>
        <div className="monitoring-table-scroll">
          <table>
            <thead><tr><th className="monitoring-row-number">No.</th>{columns.map((index) => <th key={`${index}-${headers[index]}`}>{headers[index]}</th>)}</tr></thead>
            <tbody>{visibleRows.length ? visibleRows.map((row, rowIndex) => <tr key={`${currentPage}-${rowIndex}`}>
              <td className="monitoring-row-number">{((currentPage - 1) * PAGE_SIZE + rowIndex + 1).toLocaleString('id-ID')}</td>
              {columns.map((columnIndex) => <td key={columnIndex} title={String(cell(row, columnIndex))}>{formatCell(cell(row, columnIndex), headers[columnIndex])}</td>)}
            </tr>) : <tr><td className="monitoring-no-data" colSpan={columns.length + 1}><Search size={18} />Tidak ada data yang cocok dengan filter.</td></tr>}</tbody>
          </table>
        </div>
        <footer className="monitoring-table-footer">
          <span>Menampilkan {visibleRows.length ? ((currentPage - 1) * PAGE_SIZE + 1).toLocaleString('id-ID') : 0}–{Math.min(currentPage * PAGE_SIZE, filteredRows.length).toLocaleString('id-ID')} dari {filteredRows.length.toLocaleString('id-ID')} baris</span>
          <div className="monitoring-pagination">
            <button type="button" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Sebelumnya</button>
            <span>Halaman {currentPage} / {pageCount}</span>
            <button type="button" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Berikutnya</button>
          </div>
        </footer>
      </section>
    </>}
    {customerFormOpen && <div className="monitoring-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !customerSaving) setCustomerFormOpen(false) }}>
      <section className="panel monitoring-customer-modal" role="dialog" aria-modal="true" aria-labelledby="monitoring-customer-modal-title">
        <header className="monitoring-modal-heading">
          <div><p className="eyebrow">MON KEBUTUHAN PELANGGAN</p><h2 id="monitoring-customer-modal-title">Tambah data pelanggan</h2><p>Isi identitas pelanggan dan kebutuhan material. Kolom yang tidak diperlukan boleh dikosongkan.</p></div>
          <button className="icon-button" type="button" aria-label="Tutup form" disabled={customerSaving} onClick={() => setCustomerFormOpen(false)}><X size={18} /></button>
        </header>
        <form onSubmit={saveCustomer}>
          <div className="monitoring-customer-form-grid">
            {headers.map((header, index) => {
              const type = index === 0 || index === 4 || index >= 11 ? 'number' : 'text'
              const options = index === 3 ? ['TR Besar', 'TR Kecil', 'TM', 'Kolektif']
                : index === 5 ? ['Sudah', 'Belum']
                  : index === 6 ? ['Bayar', 'Belum Bayar']
                    : index === 9 ? ['ULP Negara', 'ULP Gilimanuk', 'ULP Seririt', 'ULP Singaraja', 'ULP Tejakula']
                      : null
              return <label className={index === 10 ? 'monitoring-customer-field is-wide' : 'monitoring-customer-field'} key={`${index}-${header}`}>
                <span>{header}</span>
                {options
                  ? <select value={customerDraft[header] || ''} onChange={(event) => setCustomerDraft((current) => ({ ...current, [header]: event.target.value }))}><option value="">Pilih atau kosongkan</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select>
                  : index === 10
                    ? <textarea rows="2" value={customerDraft[header] || ''} onChange={(event) => setCustomerDraft((current) => ({ ...current, [header]: event.target.value }))} />
                    : <input type={type} min={type === 'number' ? '0' : undefined} step={type === 'number' && index >= 11 ? 'any' : undefined} value={customerDraft[header] || ''} onChange={(event) => setCustomerDraft((current) => ({ ...current, [header]: event.target.value }))} />}
              </label>
            })}
          </div>
          <footer className="monitoring-modal-actions"><button className="button button-secondary" type="button" disabled={customerSaving} onClick={() => setCustomerFormOpen(false)}>Batal</button><button className="button button-primary" type="submit" disabled={customerSaving}><Plus size={15} />{customerSaving ? 'Menyimpan...' : 'Simpan Data'}</button></footer>
        </form>
      </section>
    </div>}
    {vendorFormOpen && <div className="monitoring-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !vendorSaving) setVendorFormOpen(false) }}>
      <section className="panel monitoring-customer-modal monitoring-vendor-modal" role="dialog" aria-modal="true" aria-labelledby="monitoring-vendor-modal-title">
        <header className="monitoring-modal-heading">
          <div><p className="eyebrow">MON KONTRAK VENDOR</p><h2 id="monitoring-vendor-modal-title">Tambah data kontrak</h2><p>Nomor kontrak wajib diisi. Data material, nilai pekerjaan, dan keterangan lainnya dapat dilengkapi atau dikosongkan.</p></div>
          <button className="icon-button" type="button" aria-label="Tutup form" disabled={vendorSaving} onClick={() => setVendorFormOpen(false)}><X size={18} /></button>
        </header>
        <form onSubmit={saveVendor}>
          <div className="monitoring-customer-form-grid">
            {headers.map((header, index) => {
              const isNumeric = [2, 5, 6, 7, ...Array.from({ length: 14 }, (_, position) => position + 9), 26].includes(index)
              const isWide = [3, 4, 8, 23, 25, 28].includes(index)
              return <label className={`monitoring-customer-field${isWide ? ' is-wide' : ''}`} key={`${index}-${header}`}>
                <span>{header}{index === 0 && <b> *</b>}</span>
                {isWide
                  ? <textarea rows="2" value={vendorDraft[header] || ''} onChange={(event) => setVendorDraft((current) => ({ ...current, [header]: event.target.value }))} />
                  : <input type={isNumeric ? 'number' : 'text'} min={isNumeric ? '0' : undefined} step={isNumeric ? 'any' : undefined} value={vendorDraft[header] || ''} onChange={(event) => setVendorDraft((current) => ({ ...current, [header]: event.target.value }))} />}
              </label>
            })}
          </div>
          <footer className="monitoring-modal-actions"><button className="button button-secondary" type="button" disabled={vendorSaving} onClick={() => setVendorFormOpen(false)}>Batal</button><button className="button button-primary" type="submit" disabled={vendorSaving}><Plus size={15} />{vendorSaving ? 'Menyimpan...' : 'Simpan Kontrak'}</button></footer>
        </form>
      </section>
    </div>}
    {isVendorModule && dataset?.rows?.length > 0 && <div className="monitoring-print-only">
      <h1>Mon Kontrak Vendor</h1>
      <p>{filteredRows.length.toLocaleString('id-ID')} kontrak · Dicetak {new Date().toLocaleString('id-ID')}</p>
      <table><thead><tr>{headers.map((header, index) => <th key={`${index}-${header}`}>{header}</th>)}</tr></thead><tbody>
        {filteredRows.map((row, rowIndex) => <tr key={`${rowIndex}-${String(cell(row, 0))}`}>{headers.map((header, columnIndex) => <td key={`${columnIndex}-${header}`}>{formatCell(cell(row, columnIndex), header)}</td>)}</tr>)}
      </tbody></table>
    </div>}
  </section>
}
