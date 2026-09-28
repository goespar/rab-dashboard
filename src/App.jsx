import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, ArrowDownToLine, ArrowUpFromLine, BarChart3, Boxes, Check, ChevronDown,
  CircleAlert, ClipboardList, Cloud, FileSpreadsheet, FolderKanban, LayoutDashboard,
  FileText, LogIn, LogOut, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Search, Settings2, ShieldCheck, Upload, Users, Wrench, X, Zap,
} from 'lucide-react'
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { exportWorkbook, formatCurrency, importWorkbook, parseRupiahPrice, sampleRecords } from './lib/workbook.js'
import RabWorkflow from './RabWorkflow.jsx'
import './App.css'
import './pln-theme.css'

const STORAGE_KEY = 'rab-monitor-records-v1'
const WORKFLOW_STORAGE_KEY = 'rab-monitor-workflow-v1'
const SESSION_KEY = 'rab-monitor-session-v1'
const EMPTY_COLLECTIONS = { materials: [], activityCatalog: [], components: [], activities: [], paTransfers: [], materialRecap: [], realizations: [] }
const WORKFLOW_NAV = [
  { id: 'materials', label: 'Input Material', icon: Boxes, section: 'PERENCANAAN RAB' },
  { id: 'activityCatalog', label: 'Master Kegiatan', icon: ClipboardList },
  { id: 'components', label: 'RAB Komponen', icon: Wrench },
  { id: 'activities', label: 'RAB Kegiatan', icon: ClipboardList },
  { id: 'paFinalization', label: 'Finalisasi ke PA', icon: ArrowDownToLine },
  { id: 'contracts', label: 'Data Kontrak', icon: FileText },
  { id: 'realizations', label: 'Realisasi', icon: Activity },
]

const hasContractNumber = (record) => String(record.contractNumber ?? '').trim().length > 0
function readSession() {
  try {
    return JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || 'null')
  } catch {
    return null
  }
}

function apiGet(action, token = readSession()?.token) {
  const query = new URLSearchParams({ action })
  if (token) query.set('token', token)
  return fetch(`/api/apps-script?${query}`)
}

function apiPost(payload) {
  const token = payload.token || readSession()?.token
  return fetch('/api/apps-script', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...payload, ...(token && !payload.token ? { token } : {}) }),
  })
}

function normalizeImportedMaterials(materials) {
  let changed = false
  const records = materials.map((material) => {
    if (!String(material.importedFrom || '').toUpperCase().includes('FORM MATERIAL & HARGA')) return material
    const materialPrice = parseRupiahPrice(material.materialPrice)
    const servicePrice = parseRupiahPrice(material.servicePrice)
    if (materialPrice === material.materialPrice && servicePrice === material.servicePrice) return material
    changed = true
    return { ...material, materialPrice, servicePrice }
  })
  return { records, changed }
}

const REKAP_COLUMNS = [
  ['NO.PRK', 'prk'], ['NO.PRK SKKI', 'prkSkki'], ['NO.PRK FIX', 'prkFix'], ['NO.WBS', 'wbs'],
  ['POS ANGGARAN', 'position'], ['NO.RAB', 'rabNumber'], ['NO.PA', 'paNumber'], ['URAIAN', 'description'],
  ['TOTAL PRK', 'totalPrk'], ['RELOKASI', 'relocation'], ['REVISI SKKI', 'skkiRevision'], ['TOTAL AKHIR', 'totalFinal'],
  ['TOTAL RAB', 'rabTotal'], ['TOTAL PA', 'paTotal'], ['NOKONTRAK', 'contractNumber'], ['VENDOR', 'vendor'],
  ['NILAI KONTRAK', 'contractValue'], ['PENGEMBALIAN PA', 'paReturn'], ['PENGGANTIAN BIAYA', 'costReplacement'], ['TAGIHAN', 'billed'],
  ['TOTAL BAYAR', 'paid'], ['SISA PRK', 'prkRemaining'], ['PROGRAM', 'program'], ['TAHUN ANGGARAN', 'year'],
  ['KETERANGAN', 'notes'], ['POS ANGGARAN', 'position'],
]
const DASHBOARD_COLUMNS = [
  REKAP_COLUMNS[0], REKAP_COLUMNS[7], REKAP_COLUMNS[11], REKAP_COLUMNS[12], REKAP_COLUMNS[13], REKAP_COLUMNS[16],
  REKAP_COLUMNS[19], REKAP_COLUMNS[20], REKAP_COLUMNS[21], REKAP_COLUMNS[22], REKAP_COLUMNS[23], REKAP_COLUMNS[24],
]
const MONEY_COLUMNS = new Set(['totalPrk', 'relocation', 'skkiRevision', 'totalFinal', 'rabTotal', 'paTotal', 'contractValue', 'paReturn', 'costReplacement', 'billed', 'paid', 'prkRemaining'])

function App() {
  const [auth, setAuth] = useState(null)
  const [authStatus, setAuthStatus] = useState(null)
  const [authDialog, setAuthDialog] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [records, setRecords] = useState(sampleRecords)
  const [publicRows, setPublicRows] = useState([])
  const [workflowCollections, setWorkflowCollections] = useState(EMPTY_COLLECTIONS)
  const [activeView, setActiveView] = useState('overview')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedYear, setSelectedYear] = useState('all')
  const [selectedProgram, setSelectedProgram] = useState('all')
  const [importModal, setImportModal] = useState(false)
  const [pendingImport, setPendingImport] = useState(null)
  const [importError, setImportError] = useState('')
  const [editingRecord, setEditingRecord] = useState(null)
  const [connection, setConnection] = useState('local')
  const [notice, setNotice] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(() => Boolean(readSession()?.token))
  const [publicUpdatedAt, setPublicUpdatedAt] = useState(null)
  const fileInput = useRef(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([apiGet('publicDashboard'), apiGet('authStatus')])
      .then(async ([publicResponse, statusResponse]) => {
        const publicResult = await publicResponse.json()
        const statusResult = await statusResponse.json()
        if (cancelled) return
        if (publicResult.ok) {
          setPublicRows((publicResult.summary?.rows || []).map((row, index) => ({ ...row, id: `public-row-${index}` })))
          const publicRecords = (publicResult.summary?.groups || []).map((group, index) => ({
            id: `public-${index}`, program: group.program, year: group.year, publicCount: group.count,
            totalFinal: group.pagu, totalPrk: group.pagu, rabTotal: group.rab, paTotal: group.pa,
            contractValue: group.contract, billed: group.billed, paid: group.paid,
            prkRemaining: group.remainingPrk, contractCount: group.contractCount,
            contractNumber: group.contract ? 'Ringkasan' : '',
          }))
          setRecords(publicRecords)
          setPublicUpdatedAt(publicResult.summary?.updatedAt || new Date().toISOString())
        }
        if (statusResult.ok) setAuthStatus(statusResult)
        setConnection(publicResult.ok ? 'cloud' : 'local')
        const savedSession = readSession()
        if (!savedSession?.token) return
        const [dataResponse, workflowResponse] = await Promise.all([
          apiGet('load', savedSession.token), apiGet('loadWorkflow', savedSession.token),
        ])
        const [dataResult, workflowResult] = await Promise.all([dataResponse.json(), workflowResponse.json()])
        if (cancelled) return
        if (!dataResult.ok || !workflowResult.ok) {
          window.sessionStorage.removeItem(SESSION_KEY)
          setAuth(null)
          return
        }
        setAuth({ ...savedSession, user: dataResult.user || savedSession.user })
        setRecords(dataResult.records || [])
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(dataResult.records || []))
        const normalizedMaterials = normalizeImportedMaterials(workflowResult.collections?.materials || [])
        const nextCollections = { ...EMPTY_COLLECTIONS, ...workflowResult.collections, materials: normalizedMaterials.records }
        setWorkflowCollections(nextCollections)
        window.localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(nextCollections))
        if (normalizedMaterials.changed) {
          const saveResponse = await apiPost({ action: 'saveWorkflow', collection: 'materials', records: normalizedMaterials.records })
          const saveResult = await saveResponse.json()
          if (saveResult.ok && !cancelled) setNotice('Harga material impor telah disesuaikan.')
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (auth) return undefined
    let cancelled = false
    const refreshPublicData = async () => {
      try {
        const response = await apiGet('publicDashboard', null)
        const result = await response.json()
        if (!response.ok || !result.ok || cancelled) return
        setPublicRows((result.summary?.rows || []).map((row, index) => ({ ...row, id: `public-row-${index}` })))
        const publicRecords = (result.summary?.groups || []).map((group, index) => ({
          id: `public-${index}`, program: group.program, year: group.year, publicCount: group.count,
          totalFinal: group.pagu, totalPrk: group.pagu, rabTotal: group.rab, paTotal: group.pa,
          contractValue: group.contract, billed: group.billed, paid: group.paid,
          prkRemaining: group.remainingPrk, contractCount: group.contractCount,
        }))
        setRecords(publicRecords)
        setPublicUpdatedAt(result.summary?.updatedAt || new Date().toISOString())
        setConnection('cloud')
      } catch {}
    }
    const interval = window.setInterval(refreshPublicData, 30000)
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') refreshPublicData() }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      cancelled = true
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [auth])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  }, [records])

  useEffect(() => {
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(''), 3600)
    return () => window.clearTimeout(timer)
  }, [notice])

  const years = useMemo(() => [...new Set(records.map((record) => record.year).filter(Boolean))].sort((a, b) => b - a), [records])
  const programs = useMemo(() => [...new Set(records.map((record) => record.program).filter(Boolean))].sort(), [records])
  const dashboardRecords = useMemo(() => records.filter((record) =>
    (selectedYear === 'all' || String(record.year) === selectedYear)
      && (selectedProgram === 'all' || record.program === selectedProgram)
  ), [records, selectedYear, selectedProgram])
  const contractRecords = useMemo(() => records.filter((record) => Number(record.paTotal) > 0
    || hasContractNumber(record)
    || String(record.vendor ?? '').trim().length > 0
    || Number(record.contractValue) > 0), [records])
  const budgetSummaryRecords = useMemo(() => dashboardRecords.filter((record) => !hasContractNumber(record)), [dashboardRecords])
  const contractDetailRecords = useMemo(() => dashboardRecords.filter(hasContractNumber), [dashboardRecords])
  const filteredRecords = useMemo(() => dashboardRecords.filter((record) => {
    const matchesSearch = `${record.prk} ${record.rabNumber} ${record.description} ${record.vendor}`.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesSearch
  }), [dashboardRecords, searchTerm])
  const latestPrkRecords = useMemo(() => filteredRecords
    .filter((record) => String(record.prk ?? '').trim().length > 0), [filteredRecords])
  const totals = useMemo(() => auth ? ({
    prk: budgetSummaryRecords.reduce((sum, record) => sum + Number(record.totalFinal || record.totalPrk || 0), 0),
    rab: budgetSummaryRecords.reduce((sum, record) => sum + Number(record.rabTotal || 0), 0),
    contract: contractDetailRecords.reduce((sum, record) => sum + Number(record.contractValue || 0), 0),
    paid: dashboardRecords.reduce((sum, record) => sum + Number(record.paid || 0), 0),
    billed: dashboardRecords.reduce((sum, record) => sum + Number(record.billed || 0), 0),
  }) : dashboardRecords.reduce((sum, record) => ({
    prk: sum.prk + Number(record.totalFinal || record.totalPrk || 0),
    rab: sum.rab + Number(record.rabTotal || 0),
    contract: sum.contract + Number(record.contractValue || 0),
    paid: sum.paid + Number(record.paid || 0),
    billed: sum.billed + Number(record.billed || 0),
  }), { prk: 0, rab: 0, contract: 0, paid: 0, billed: 0 }), [auth, budgetSummaryRecords, contractDetailRecords, dashboardRecords])
  const chartData = useMemo(() => {
    const groups = {}
    if (!auth) {
      dashboardRecords.forEach((record) => {
        const key = record.program || 'Program lain'
        groups[key] ??= { program: key, pagu: 0, kontrak: 0 }
        groups[key].pagu += Number(record.totalFinal || record.totalPrk || 0)
        groups[key].kontrak += Number(record.contractValue || 0)
      })
      return Object.values(groups).sort((a, b) => b.pagu - a.pagu).slice(0, 5)
    }
    budgetSummaryRecords.forEach((record) => {
      const key = record.program || 'Program lain'
      groups[key] ??= { program: key, pagu: 0, kontrak: 0 }
      groups[key].pagu += Number(record.totalFinal || record.totalPrk || 0)
    })
    contractDetailRecords.forEach((record) => {
      const key = record.program || 'Program lain'
      groups[key] ??= { program: key, pagu: 0, kontrak: 0 }
      groups[key].kontrak += Number(record.contractValue || 0)
    })
    return Object.values(groups).sort((a, b) => b.pagu - a.pagu).slice(0, 5)
  }, [auth, budgetSummaryRecords, contractDetailRecords, dashboardRecords])
  const workflowSummary = useMemo(() => {
    const activities = workflowCollections.activities || []
    const realizations = workflowCollections.realizations || []
    return {
      rab: records.reduce((sum, record) => sum + Number(record.rabTotal || 0), 0),
      activities: activities.length,
      tm: activities.filter((activity) => activity.criteria === 'TM').length,
      tr: activities.filter((activity) => activity.criteria === 'TR').length,
      realizedVolume: realizations.reduce((sum, item) => sum + Number(item.volume || 0), 0),
      billed: realizations.reduce((sum, item) => sum + Number(item.billed || 0), 0),
      paid: realizations.reduce((sum, item) => sum + Number(item.paid || 0), 0),
    }
  }, [workflowCollections, records])

  async function submitAuth(event) {
    event.preventDefault()
    setAuthBusy(true)
    setAuthMessage('')
    const form = new FormData(event.currentTarget)
    const setup = authDialog === 'setup'
    const payload = setup
      ? { action: 'bootstrapAdmin', setupKey: form.get('setupKey'), username: form.get('username'), name: form.get('name'), password: form.get('password') }
      : { action: 'login', username: form.get('username'), password: form.get('password') }
    try {
      const response = await apiPost(payload)
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || 'Autentikasi gagal.')
      const session = { token: result.token, expiresAt: result.expiresAt, user: result.user }
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
      const [dataResponse, workflowResponse] = await Promise.all([apiGet('load', session.token), apiGet('loadWorkflow', session.token)])
      const [dataResult, workflowResult] = await Promise.all([dataResponse.json(), workflowResponse.json()])
      if (!dataResult.ok || !workflowResult.ok) throw new Error(dataResult.error || workflowResult.error || 'Data akun gagal dimuat.')
      setAuth({ ...session, user: dataResult.user || session.user })
      setSidebarOpen(true)
      setRecords(dataResult.records || [])
      const nextCollections = { ...EMPTY_COLLECTIONS, ...workflowResult.collections }
      setWorkflowCollections(nextCollections)
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(dataResult.records || []))
      window.localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(nextCollections))
      setAuthDialog('')
      setActiveView('overview')
    } catch (error) {
      window.sessionStorage.removeItem(SESSION_KEY)
      setAuthMessage(error.message)
    } finally {
      setAuthBusy(false)
    }
  }

  async function logout() {
    try { await apiPost({ action: 'logout' }) } catch {}
    window.sessionStorage.removeItem(SESSION_KEY)
    window.localStorage.removeItem(STORAGE_KEY)
    window.localStorage.removeItem(WORKFLOW_STORAGE_KEY)
    setAuth(null)
    setSidebarOpen(false)
    setRecords(sampleRecords)
    setWorkflowCollections(EMPTY_COLLECTIONS)
    setActiveView('overview')
  }

  async function saveRecords(nextRecords, successMessage) {
    setRecords(nextRecords)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRecords))
    try {
      const response = await apiPost({ action: 'save', records: nextRecords })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || 'Penyimpanan cloud gagal.')
      setConnection('cloud')
      setNotice(`${successMessage} Tersimpan di Google Sheets.`)
    } catch {
      setConnection('local')
      setNotice(`${successMessage} Tersimpan di browser ini.`)
    }
  }

  async function saveWorkflowCollection(collection, nextRecords, successMessage) {
    const nextCollections = { ...workflowCollections, [collection]: nextRecords }
    setWorkflowCollections(nextCollections)
    window.localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(nextCollections))
    if (collection === 'activities' || collection === 'components') {
      const activitiesForTotals = collection === 'activities' ? nextRecords : workflowCollections.activities
      const componentsForTotals = collection === 'components' ? nextRecords : workflowCollections.components
      const affectedRecords = new Set()
      const addAffectedRecord = (activity) => {
        const record = records.find((item) => activity.programRecordId
          ? item.id === activity.programRecordId
          : item.prk === activity.prk || item.rabNumber === activity.rabNumber)
        if (record) affectedRecords.add(record.id)
        return record
      }
      workflowCollections.activities.forEach(addAffectedRecord)
      activitiesForTotals.forEach(addAffectedRecord)
      const totalsByRecord = new Map()
      activitiesForTotals.forEach((activity) => {
        const sourceRecord = addAffectedRecord(activity)
        if (!sourceRecord) return
        const matchingComponents = componentsForTotals.filter((component) => component.criteria === activity.criteria
          && component.activity.trim().toLowerCase() === activity.name.trim().toLowerCase())
        const unitCost = matchingComponents.reduce((sum, component) => sum
          + Number(component.quantityPerUnit || 0) * (Number(component.materialPrice || 0) + Number(component.servicePrice || 0)), 0)
        totalsByRecord.set(sourceRecord.id, (totalsByRecord.get(sourceRecord.id) || 0) + unitCost * Number(activity.volume || 0))
      })
      const updatedProgramRecords = records.map((record) => affectedRecords.has(record.id)
        ? { ...record, rabTotal: totalsByRecord.get(record.id) || 0 }
        : record)
      if (updatedProgramRecords.some((record, index) => record !== records[index])) {
        await saveRecords(updatedProgramRecords, 'Total RAB per PRK diperbarui.')
      }
    }
    try {
      const response = await apiPost({ action: 'saveWorkflow', collection, records: nextRecords })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || 'Penyimpanan Google Sheets gagal.')
      if (collection === 'realizations' && result.updatedRecords?.length) {
        const recordsById = new Map(result.updatedRecords.map((record) => [String(record.id), record]))
        const updatedProgramRecords = records.map((record) => recordsById.has(String(record.id))
          ? { ...record, ...recordsById.get(String(record.id)) }
          : record)
        setRecords(updatedProgramRecords)
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProgramRecords))
      }
      setConnection('cloud')
      setNotice(collection === 'realizations'
        ? `${successMessage} Total tagihan dan pembayaran diperbarui di RABData.`
        : `${successMessage} Tersimpan di Google Sheets.`)
    } catch {
      setConnection('local')
      setNotice(`${successMessage} Tersimpan di browser ini.`)
    }
  }

  async function transferToPA(transfer) {
    const source = records.find((record) => record.id === transfer.recordId)
    const amount = Number(transfer.amount) || 0
    const remaining = Number(source?.rabTotal) || 0
    if (!source || amount <= 0 || amount > remaining) {
      setNotice('Finalisasi ditolak: nilai harus lebih dari nol dan tidak melebihi sisa RAB.')
      return false
    }
    const confirmed = window.confirm(`Finalisasi ${formatCurrency(amount)} dari RAB ${source.prk || source.rabNumber} ke PA? Sisa RAB berkurang, saldo PA bertambah, dan kolom nilai kontrak mengikuti nilai PA.`)
    if (!confirmed) return false

    try {
      const response = await apiPost({ action: 'transferToPA', ...transfer })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || 'Finalisasi gagal.')
      const updatedRecord = result.record || {
        ...source,
        rabTotal: Math.max(0, remaining - amount),
        paTotal: Number(source.paTotal || 0) + amount,
        contractValue: Number(source.paTotal || 0) + amount,
      }
      const nextRecords = records.map((record) => record.id === source.id ? updatedRecord : record)
      setRecords(nextRecords)
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRecords))
      const nextTransfers = [result.transfer, ...workflowCollections.paTransfers]
      const nextCollections = { ...workflowCollections, paTransfers: nextTransfers }
      setWorkflowCollections(nextCollections)
      window.localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(nextCollections))
      setConnection('cloud')
      setNotice(`Finalisasi ${formatCurrency(amount)} berhasil. Sisa RAB ${formatCurrency(updatedRecord.rabTotal)}; saldo PA/nilai kontrak ${formatCurrency(updatedRecord.paTotal)}.`)
      return true
    } catch (error) {
      setNotice(`Finalisasi tidak tersimpan: ${error.message}`)
      return false
    }
  }

  async function cancelTransferFromPA(transfer) {
    const source = records.find((record) => String(record.id) === String(transfer.recordId))
    if (!source) {
      setNotice('Pembatalan ditolak: data PRK sumber tidak ditemukan.')
      return false
    }
    const confirmed = window.confirm(`Batalkan transfer ${formatCurrency(transfer.amount)} untuk PRK ${transfer.prk || source.prk || source.rabNumber}? Saldo RAB dan PA akan dikembalikan ke sebelum transfer.`)
    if (!confirmed) return false

    try {
      const response = await apiPost({ action: 'cancelTransferToPA', transferId: transfer.id })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || 'Pembatalan transfer gagal.')

      const restoredRecord = { ...source, ...result.record }
      const nextRecords = records.map((record) => record.id === restoredRecord.id ? restoredRecord : record)
      const nextTransfers = workflowCollections.paTransfers.filter((item) => String(item.id) !== String(transfer.id))
      const nextCollections = { ...workflowCollections, paTransfers: nextTransfers }
      setRecords(nextRecords)
      setWorkflowCollections(nextCollections)
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRecords))
      window.localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(nextCollections))
      setConnection('cloud')
      setNotice(`Transfer ${formatCurrency(transfer.amount)} dibatalkan. RAB ${formatCurrency(restoredRecord.rabTotal)}; saldo PA ${formatCurrency(restoredRecord.paTotal)}.`)
      return true
    } catch (error) {
      setNotice(`Pembatalan transfer gagal: ${error.message}`)
      return false
    }
  }

  async function receiveFile(file) {
    if (!file) return
    setImportError('')
    try {
      const result = await importWorkbook(file)
      setPendingImport({ ...result, fileName: file.name })
    } catch (error) {
      setPendingImport(null)
      setImportError(error.message)
    }
  }

  async function confirmImport() {
    if (!pendingImport?.records.length) return
    await saveRecords(pendingImport.records, `${pendingImport.records.length} baris RAB berhasil diimpor.`)
    const mergeImported = (current, imported) => {
      const manualRows = current.filter((row) => !row.importedFrom)
      const mergedImported = new Map(imported.map((row) => [row.id, row]))
      return [...manualRows, ...mergedImported.values()]
    }
    if (pendingImport.materials?.length) {
      await saveWorkflowCollection('materials', mergeImported(workflowCollections.materials, pendingImport.materials), 'Master material diperbarui.')
    }
    if (pendingImport.activityCatalog?.length) {
      await saveWorkflowCollection('activityCatalog', mergeImported(workflowCollections.activityCatalog, pendingImport.activityCatalog), 'Database kegiatan diperbarui.')
    }
    setImportModal(false)
    setPendingImport(null)
    setActiveView('data')
  }

  async function saveContract(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const updated = records.map((record) => record.id === editingRecord.id ? {
      ...record,
      contractNumber: String(form.get('contractNumber') || '').trim(),
      vendor: String(form.get('vendor') || '').trim(),
      contractValue: Number(form.get('contractValue') || 0),
    } : record)
    await saveRecords(updated, 'Data kontrak diperbarui.')
    setEditingRecord(null)
  }

  async function downloadWorkbook() {
    await exportWorkbook(filteredRecords)
    setNotice('File Excel berhasil disiapkan.')
  }

  const pageTitle = {
    overview: 'Dashboard', data: 'Rekap RAB', materials: 'Input Material', activityCatalog: 'Master Kegiatan', components: 'RAB Komponen',
    activities: 'RAB Kegiatan', paFinalization: 'Finalisasi ke PA', contracts: 'Data Kontrak', users: 'Manajemen User', materialRecap: 'Rekap Material', realizations: 'Realisasi',
  }[activeView] || 'Dashboard'
  const canEdit = Boolean(auth && auth.user.role !== 'viewer')
  const isAdmin = auth?.user.role === 'admin'
  const dashboardRecordCount = auth
    ? dashboardRecords.length
    : dashboardRecords.reduce((sum, record) => sum + Number(record.publicCount || 0), 0)

  return (
    <div className={`app-shell min-h-screen ${sidebarOpen ? 'sidebar-expanded' : 'sidebar-collapsed'} ${auth ? 'authenticated-layout' : 'public-layout'}`}>
      {sidebarOpen && <aside className="sidebar sidebar-open">
        <div className="brand-lockup">
          <div className="brand-mark"><Zap size={21} strokeWidth={2.5} /></div>
          <div><strong>MONITORING</strong><span>RAB &amp; REALISASI</span></div>
          <button className="icon-button sidebar-close" aria-label="Tutup menu" onClick={() => setSidebarOpen(false)}><X size={18} /></button>
        </div>
        <div className="workspace-label">RAB &amp; MONITORING</div>
        <nav className="side-nav" aria-label="Navigasi utama">
          <button className={activeView === 'overview' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveView('overview')}><LayoutDashboard size={18} /><span>Dashboard</span></button>
          {auth && WORKFLOW_NAV.map((item) => {
            const Icon = item.icon
            return <div className="nav-group" key={item.id}>
              {item.section && <div className="nav-section-label">{item.section}</div>}
              <button className={activeView === item.id ? 'nav-item active' : 'nav-item'} onClick={() => setActiveView(item.id)}><Icon size={18} /><span>{item.label}</span><span className="nav-count">{item.id === 'contracts' ? contractRecords.length : workflowCollections[item.id]?.length || 0}</span></button>
            </div>
          })}
          {auth && <button className={activeView === 'data' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveView('data')}><FolderKanban size={18} /><span>Rekap RAB</span><span className="nav-count">{records.length}</span></button>}
          {isAdmin && <button className={activeView === 'users' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveView('users')}><Users size={18} /><span>Manajemen User</span></button>}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-note"><div className="note-icon"><ShieldCheck size={16} /></div><div><strong>Monitoring RAB</strong><span>Rekap anggaran dan realisasi</span></div></div>
        <div className="profile-row"><div className="profile-avatar">{auth ? auth.user.name.slice(0, 3).toUpperCase() : 'PUB'}</div><div className="profile-copy"><strong>{auth?.user.name || 'Dashboard Publik'}</strong><span>{auth ? ({ admin: 'Admin', planner: 'Tim Perencanaan', viewer: 'Viewer' }[auth.user.role]) : 'Akses umum'}</span></div>{auth && <Settings2 size={17} className="profile-settings" />}</div>
      </aside>}
      {sidebarOpen && <button className="sidebar-scrim" aria-label="Tutup menu" onClick={() => setSidebarOpen(false)} />}

      <main className="main-content">
        <header className="topbar">
          <button className="icon-button sidebar-toggle" aria-label={sidebarOpen ? 'Sembunyikan menu' : 'Tampilkan menu'} title={sidebarOpen ? 'Sembunyikan menu' : 'Tampilkan menu'} onClick={() => setSidebarOpen((open) => !open)}>{sidebarOpen ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}</button>
          <div className="breadcrumb"><span>Monitoring PLN</span><span className="breadcrumb-slash">/</span><strong>{pageTitle}</strong></div>
          <div className="topbar-actions">
            <div className={`sync-status ${connection === 'cloud' ? 'is-cloud' : ''}`} title={connection === 'cloud' ? 'Google Sheets tersambung' : 'Penyimpanan browser'}>{connection === 'cloud' ? <Cloud size={15} /> : <CircleAlert size={15} />}<span>{connection === 'cloud' ? 'Google Sheets' : 'Lokal'}</span></div>
            {auth ? <>
              <button className="button button-secondary export-button" onClick={downloadWorkbook}><ArrowDownToLine size={16} /><span>Ekspor</span></button>
              {canEdit && <button className="button button-primary" onClick={() => { setImportModal(true); setImportError(''); setPendingImport(null) }}><Plus size={17} /><span>Impor Excel</span></button>}
              <button className="icon-button" aria-label="Keluar" title="Keluar" onClick={logout}><LogOut size={17} /></button>
            </> : <button className="button button-primary" onClick={() => { setAuthMessage(''); setAuthDialog(authStatus?.setupRequired ? 'setup' : 'login') }}><LogIn size={16} /><span>{authStatus?.setupRequired ? 'Setup Admin' : 'Login'}</span></button>}
          </div>
        </header>

        <div className="page-content">
          {activeView === 'overview' && !auth ? <PublicDashboard groups={dashboardRecords} rows={publicRows} selectedYear={selectedYear} setSelectedYear={setSelectedYear} updatedAt={publicUpdatedAt} connection={connection} /> : activeView === 'overview' ? <>
            <section className="page-heading"><div><p className="eyebrow">DASHBOARD RAB</p><h1>Dashboard</h1><p className="heading-subtitle">Rekap anggaran investasi dan realisasi per program.</p></div>
              <div className="filter-pair"><label className="select-wrap"><span className="sr-only">Filter tahun</span><select value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)}><option value="all">Semua tahun</option>{years.map((year) => <option key={year} value={String(year)}>{year}</option>)}</select><ChevronDown size={15} /></label><label className="select-wrap"><span className="sr-only">Filter program</span><select value={selectedProgram} onChange={(event) => setSelectedProgram(event.target.value)}><option value="all">Semua program</option>{programs.map((program) => <option key={program} value={program}>{program}</option>)}</select><ChevronDown size={15} /></label></div>
            </section>

            <section className="metric-grid" aria-label="Indikator utama">
              <article className="metric-card metric-primary"><div className="metric-top"><span>Pagu PRK final</span><span className="metric-icon"><BarChart3 size={17} /></span></div><strong>{formatCurrency(totals.prk)}</strong><div className="metric-foot"><span className="metric-dot lime-dot" />Dari {dashboardRecordCount} data anggaran</div></article>
              <article className="metric-card"><div className="metric-top"><span>Total RAB</span><span className="metric-icon pale-icon"><FileSpreadsheet size={17} /></span></div><strong>{formatCurrency(totals.rab)}</strong><div className="metric-foot">Akumulasi nilai RAB</div></article>
              <article className="metric-card"><div className="metric-top"><span>Nilai kontrak</span><span className="metric-icon orange-icon"><FolderKanban size={17} /></span></div><strong>{formatCurrency(totals.contract)}</strong><div className="metric-foot">Nilai yang dicatat manual</div></article>
              <article className="metric-card"><div className="metric-top"><span>Total dibayar</span><span className="metric-icon mint-icon"><Check size={17} /></span></div><strong>{formatCurrency(totals.paid)}</strong><div className="metric-foot">Tagihan tercatat {formatCurrency(totals.billed)}</div></article>
            </section>

            {auth && <section className="workflow-overview panel" aria-label="Ringkasan input RAB dan realisasi">
              <div className="workflow-overview-heading"><div><p className="eyebrow">ALUR INPUT RAB</p><h2>RAB sampai realisasi</h2></div><button className="text-action" onClick={() => setActiveView('materials')}>Buka alur <span aria-hidden="true">-&gt;</span></button></div>
              <div className="workflow-overview-grid">
                <div><span>Kegiatan RAB</span><strong>{workflowSummary.activities}</strong><small>TM {workflowSummary.tm} <i /> TR {workflowSummary.tr}</small></div>
                <div><span>Nilai RAB input</span><strong>{formatCurrency(workflowSummary.rab)}</strong><small>Hasil komponen pekerjaan</small></div>
                <div><span>Volume realisasi</span><strong>{workflowSummary.realizedVolume}</strong><small>Total volume tercatat</small></div>
                <div><span>Dibayar dari realisasi</span><strong>{formatCurrency(workflowSummary.paid)}</strong><small>Tagihan {formatCurrency(workflowSummary.billed)}</small></div>
              </div>
            </section>}

            <section className="analytics-grid">
              <article className="panel chart-panel"><div className="panel-heading"><div><p className="eyebrow">ALOKASI ANGGARAN</p><h2>Pagu dan nilai kontrak</h2></div><div className="legend"><span><i className="legend-swatch pagu-swatch" />Pagu</span><span><i className="legend-swatch contract-swatch" />Kontrak</span></div></div>
                <div className="chart-frame">{chartData.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}><XAxis dataKey="program" axisLine={false} tickLine={false} tick={{ fill: '#778398', fontSize: 11 }} tickFormatter={(value) => value.length > 12 ? `${value.slice(0, 12)}...` : value} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#8994a8', fontSize: 10 }} tickFormatter={(value) => value >= 1000000000 ? `${(value / 1000000000).toFixed(1)} M` : `${Math.round(value / 1000000)} jt`} width={55} /><Tooltip formatter={(value) => formatCurrency(value)} cursor={{ fill: '#f0f7fb' }} contentStyle={{ border: '1px solid #dce7f0', borderRadius: 5, fontSize: 12 }} /><Bar dataKey="pagu" name="Pagu" fill="#0878b9" radius={[3, 3, 0, 0]} maxBarSize={30} /><Bar dataKey="kontrak" name="Kontrak" fill="#24bfd3" radius={[3, 3, 0, 0]} maxBarSize={30} /></BarChart></ResponsiveContainer> : <div className="empty-chart">Belum ada data anggaran untuk ditampilkan.</div>}</div>
                <div className="chart-caption"><span>Menampilkan hingga 5 kelompok program.</span><span className="chart-period"><span className="period-dot" /> Data aktif</span></div>
              </article>
              {auth ? <article className="panel status-panel"><div className="panel-heading"><div><p className="eyebrow">KELENGKAPAN DATA</p><h2>Kontrol administrasi</h2></div><span className="status-icon"><ShieldCheck size={17} /></span></div>
                <div className="status-total"><strong>{dashboardRecords.length}</strong><span>data dalam rekap</span></div>
                <div className="status-line"><div className="status-label"><span>Nilai kontrak terisi</span><strong>{contractDetailRecords.filter((record) => record.contractValue > 0).length}</strong></div><div className="progress-track"><span style={{ width: `${dashboardRecords.length ? contractDetailRecords.filter((record) => record.contractValue > 0).length / dashboardRecords.length * 100 : 0}%` }} /></div></div>
                <div className="status-line"><div className="status-label"><span>Nomor kontrak terisi</span><strong>{dashboardRecords.filter((record) => record.contractNumber).length}</strong></div><div className="progress-track progress-orange"><span style={{ width: `${dashboardRecords.length ? dashboardRecords.filter((record) => record.contractNumber).length / dashboardRecords.length * 100 : 0}%` }} /></div></div>
                <button className="text-action" onClick={() => setActiveView('data')}>Tinjau data anggaran <span aria-hidden="true">-&gt;</span></button>
              </article> : <article className="panel status-panel public-dashboard-note"><div className="panel-heading"><div><p className="eyebrow">AKSES PUBLIK</p><h2>Ringkasan anggaran</h2></div><span className="status-icon"><ShieldCheck size={17} /></span></div><p>Rincian PRK, vendor, dan transaksi tersedia setelah login.</p></article>}
            </section>
            {auth && <ProjectTable records={latestPrkRecords} onEdit={canEdit ? setEditingRecord : undefined} onViewAll={() => setActiveView('data')} compact readOnly={!canEdit} />}
          </> : activeView === 'data' && auth ? <>
            <section className="page-heading data-heading"><div><p className="eyebrow">PORTOFOLIO ANGGARAN</p><h1>Data anggaran</h1><p className="heading-subtitle">Kelola rekap RAB dan lengkapi nilai kontrak secara manual.</p></div>{canEdit && <button className="button button-primary" onClick={() => { setImportModal(true); setImportError(''); setPendingImport(null) }}><Upload size={16} /><span>Impor data</span></button>}</section>
            <ProjectTable records={filteredRecords} onEdit={canEdit ? setEditingRecord : undefined} onViewAll={() => setActiveView('data')} searchTerm={searchTerm} setSearchTerm={setSearchTerm} selectedYear={selectedYear} setSelectedYear={setSelectedYear} years={years} selectedProgram={selectedProgram} setSelectedProgram={setSelectedProgram} programs={programs} readOnly={!canEdit} />
            <div className="table-footnote"><ShieldCheck size={14} /> Aplikasi ini untuk rekap dan monitoring. Proses tender dan kontrak dilakukan di luar aplikasi.</div>
          </> : activeView === 'contracts' && auth ? <>
            <section className="page-heading data-heading"><div><p className="eyebrow">ADMINISTRASI PENGADAAN</p><h1>Data Kontrak</h1><p className="heading-subtitle">Catat nomor kontrak, vendor pemenang, dan nilai kontrak aktual per PRK/RAB.</p></div></section>
            <div className="table-footnote contract-guidance"><ShieldCheck size={14} /> Nilai PA adalah alokasi/pagu. Nilai kontrak diisi sesuai kontrak pemenang dan tidak otomatis mengikuti saldo PA.</div>
            <ContractTable records={contractRecords} onEdit={canEdit ? setEditingRecord : undefined} readOnly={!canEdit} />
          </> : activeView === 'users' && isAdmin ? <UserManagement />
            : auth && activeView !== 'overview' ? <RabWorkflow key={activeView} view={activeView} collections={workflowCollections} programRecords={records} onSave={saveWorkflowCollection} onTransfer={transferToPA} onCancelTransfer={cancelTransferFromPA} readOnly={!canEdit} />
              : null}
          <footer className="page-footer"><span>PLN <span className="footer-separator">/</span> RAB &amp; Realisasi</span><span>Data tersimpan {connection === 'cloud' ? 'di Google Sheets' : 'di browser ini'}</span></footer>
        </div>
      </main>

      {authDialog && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAuthDialog('') }}><section className="modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <div className="modal-heading"><div><p className="eyebrow">{authDialog === 'setup' ? 'AKUN PERTAMA' : 'AKSES PENGGUNA'}</p><h2 id="auth-title">{authDialog === 'setup' ? 'Setup admin' : 'Login'}</h2><p>{authDialog === 'setup' ? 'Buat akun admin pertama untuk mengelola pengguna.' : 'Masuk untuk membuka data dan alur kerja.'}</p></div><button className="icon-button" aria-label="Tutup" onClick={() => setAuthDialog('')}><X size={19} /></button></div>
        <form onSubmit={submitAuth}>
          {authDialog === 'setup' && !authStatus?.setupAvailable ? <div className="inline-error"><CircleAlert size={16} />ADMIN_SETUP_KEY belum diatur pada Script Properties Apps Script.</div> : <>
            {authDialog === 'setup' && <label className="field-label">Kunci setup<input name="setupKey" type="password" required autoComplete="off" /></label>}
            {authDialog === 'setup' && <label className="field-label">Nama admin<input name="name" required autoComplete="name" /></label>}
            <label className="field-label">Username<input name="username" required autoComplete="username" /></label>
            <label className="field-label">Kata sandi<input name="password" type="password" required minLength="12" autoComplete={authDialog === 'setup' ? 'new-password' : 'current-password'} /></label>
          </>}
          {authMessage && <div className="inline-error"><CircleAlert size={16} />{authMessage}</div>}
          <div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setAuthDialog('')}>Batal</button><button type="submit" className="button button-primary" disabled={authBusy || (authDialog === 'setup' && !authStatus?.setupAvailable)}><LogIn size={15} />{authBusy ? 'Memproses...' : authDialog === 'setup' ? 'Buat admin' : 'Login'}</button></div>
        </form>
      </section></div>}

      {importModal && canEdit && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setImportModal(false) }}><section className="modal import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <div className="modal-heading"><div><p className="eyebrow">IMPOR DATA</p><h2 id="import-title">Unggah workbook Excel</h2><p>Pilih file DATA APLIKASI.xlsx atau file dengan kolom rekap A-Z.</p></div><button className="icon-button" aria-label="Tutup" onClick={() => setImportModal(false)}><X size={19} /></button></div>
        <button className={`upload-zone ${pendingImport ? 'has-file' : ''}`} onClick={() => fileInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); receiveFile(event.dataTransfer.files[0]) }}><input ref={fileInput} type="file" accept=".xlsx" hidden onChange={(event) => { receiveFile(event.target.files[0]); event.target.value = '' }} /><div className="upload-icon">{pendingImport ? <Check size={20} /> : <Upload size={20} />}</div><strong>{pendingImport ? pendingImport.fileName : 'Klik untuk memilih file'}</strong><span>{pendingImport ? `Sheet: ${pendingImport.sheetName}` : 'atau tarik file Excel ke area ini (.xlsx)'}</span></button>
        {importError && <div className="inline-error"><CircleAlert size={16} />{importError}</div>}
        {pendingImport && <div className="import-preview"><div><span>Data rekap/PRK</span><strong>{pendingImport.records.length} baris</strong></div><div><span>Sheet rekap</span><strong>{pendingImport.sheetName}</strong></div><div><span>Master material</span><strong>{pendingImport.materials?.length || 0} item</strong></div><div><span>Database kegiatan</span><strong>{pendingImport.activityCatalog?.length || 0} kegiatan</strong></div><p>Data material dan kegiatan dari workbook akan digabung dengan master manual yang sudah ada.</p></div>}
        <div className="modal-actions"><button className="button button-secondary" onClick={() => setImportModal(false)}>Batal</button><button className="button button-primary" disabled={!pendingImport?.records.length} onClick={confirmImport}><ArrowUpFromLine size={16} /><span>Impor {pendingImport ? `${pendingImport.records.length} data` : 'data'}</span></button></div>
      </section></div>}

      {editingRecord && canEdit && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingRecord(null) }}><section className="modal contract-modal" role="dialog" aria-modal="true" aria-labelledby="contract-title"><div className="modal-heading"><div><p className="eyebrow">INPUT DATA KONTRAK</p><h2 id="contract-title">Lengkapi data pemenang</h2><p className="modal-project-name">{editingRecord.description}</p></div><button className="icon-button" aria-label="Tutup" onClick={() => setEditingRecord(null)}><X size={19} /></button></div>
        <form onSubmit={saveContract}><label className="field-label">Nomor kontrak<input name="contractNumber" defaultValue={editingRecord.contractNumber} placeholder="Masukkan nomor kontrak" /></label><label className="field-label">Vendor pemenang<input name="vendor" defaultValue={editingRecord.vendor} placeholder="Masukkan nama vendor pemenang" /></label><label className="field-label">Nilai kontrak aktual (Rp)<input name="contractValue" type="number" min="0" step="1" defaultValue={editingRecord.contractValue || ''} placeholder="0" /></label><p className="form-note"><CircleAlert size={15} /> Nilai kontrak mengikuti dokumen kontrak; nilai PA tetap menjadi alokasi/pagu. Input ini untuk pencatatan, bukan penerbitan kontrak.</p><div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setEditingRecord(null)}>Batal</button><button type="submit" className="button button-primary"><Check size={16} />Simpan data</button></div></form>
      </section></div>}
      {notice && <div className="toast" role="status"><Check size={16} />{notice}</div>}
    </div>
  )
}

function ContractTable({ records, onEdit, readOnly = false }) {
  return <section className="panel table-panel">
    <div className="table-heading"><div><p className="eyebrow">PAKET DENGAN ALOKASI PA</p><h2>Daftar data kontrak</h2></div><span className="row-count">{records.length} data</span></div>
    <div className="table-scroll contract-register-scroll"><table><thead><tr><th>No. PRK / RAB</th><th>Uraian</th><th>Nilai PA</th><th>Nomor kontrak</th><th>Vendor pemenang</th><th>Nilai kontrak</th><th>Status</th><th><span className="sr-only">Aksi</span></th></tr></thead><tbody>
      {records.length ? records.map((record) => {
        const complete = hasContractNumber(record) && String(record.vendor ?? '').trim() && Number(record.contractValue) > 0
        return <tr key={record.id}><td>{record.prk || record.rabNumber || '-'}</td><td className="contract-register-description">{record.description || '-'}</td><td className="money-cell">{formatCurrency(record.paTotal)}</td><td className="contract-register-detail" title={record.contractNumber || undefined}>{record.contractNumber || '-'}</td><td className="contract-register-detail" title={record.vendor || undefined}>{record.vendor || '-'}</td><td className="money-cell">{formatCurrency(record.contractValue)}</td><td><span className={`contract-status ${complete ? 'is-complete' : ''}`}>{complete ? 'Lengkap' : 'Perlu dilengkapi'}</span></td><td>{!readOnly && <button className="row-action" aria-label={`Input kontrak ${record.prk || record.rabNumber || record.description}`} onClick={() => onEdit?.(record)}><Pencil size={15} /></button>}</td></tr>
      }) : <tr><td colSpan="8"><div className="empty-table"><FileText size={24} /><strong>Belum ada data PA atau kontrak</strong><span>Data akan muncul setelah finalisasi ke PA atau impor data kontrak.</span></div></td></tr>}
    </tbody></table></div>
    <div className="table-summary"><span>Lengkapi nomor kontrak, vendor pemenang, dan nilai aktual.</span><span><span className="summary-dot" /> Data tersimpan pada rekap RAB</span></div>
  </section>
}

function ProjectTable({ records, onEdit, onViewAll, compact = false, readOnly = false, searchTerm = '', setSearchTerm, selectedYear, setSelectedYear, years = [], selectedProgram, setSelectedProgram, programs = [] }) {
  const columns = compact ? DASHBOARD_COLUMNS : REKAP_COLUMNS
  return <section className={`panel table-panel ${compact ? 'dashboard-latest-panel' : ''}`}>
    <div className="table-heading"><div><p className="eyebrow">{compact ? 'DATA TERBARU' : 'DAFTAR RAB'}</p><h2>{compact ? 'Anggaran terbaru' : 'Seluruh data anggaran'}</h2></div>{compact ? <button className="text-action" onClick={onViewAll}>Lihat semua <span aria-hidden="true">-&gt;</span></button> : <span className="row-count">{records.length} data</span>}</div>
    {!compact && <div className="table-toolbar"><label className="search-field"><Search size={16} /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Cari PRK, RAB, uraian..." /></label><label className="select-wrap toolbar-select"><span className="sr-only">Filter tahun</span><select value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)}><option value="all">Semua tahun</option>{years.map((year) => <option key={year} value={String(year)}>{year}</option>)}</select><ChevronDown size={15} /></label><label className="select-wrap toolbar-select"><span className="sr-only">Filter program</span><select value={selectedProgram} onChange={(event) => setSelectedProgram(event.target.value)}><option value="all">Semua program</option>{programs.map((program) => <option key={program} value={program}>{program}</option>)}</select><ChevronDown size={15} /></label></div>}
    <div className={`table-scroll ${compact ? 'dashboard-latest-scroll' : 'all-rekap-scroll'}`}><table><thead><tr>{compact && <th>NO</th>}{columns.map(([header, key], index) => <th key={`${key}-${index}`}>{header}</th>)}{!compact && !readOnly && <th><span className="sr-only">Aksi</span></th>}</tr></thead><tbody>
      {records.length ? records.map((record, rowIndex) => <tr key={record.id}>{compact && <td className="row-number-cell">{rowIndex + 1}</td>}{columns.map(([, key], index) => {
        const value = record[key]
        const isDescription = key === 'description'
        const descriptionTitle = isDescription && value ? `${value}${record.position ? ` — Pos anggaran ${record.position}` : ''}` : undefined
        const cellTitle = key === 'contractNumber' || key === 'vendor' ? value || undefined : descriptionTitle
        const descriptionClass = isDescription ? (compact ? 'dashboard-description-cell' : 'all-rekap-description-cell') : ''
        return <td className={`${MONEY_COLUMNS.has(key) ? 'money-cell ' : ''}${descriptionClass}`} title={cellTitle} key={`${key}-${index}`}>{!readOnly && !compact && key === 'contractValue' ? <button className="contract-value" onClick={() => onEdit?.(record)} title="Edit nilai kontrak"><span>{formatCurrency(value)}</span><Pencil size={13} /></button> : value === null || value === undefined || value === '' ? '-' : MONEY_COLUMNS.has(key) ? formatCurrency(value) : value}</td>
      })}{!compact && !readOnly && <td><button className="row-action" aria-label={`Edit kontrak ${record.prk || record.rabNumber || record.description}`} onClick={() => onEdit?.(record)}><Pencil size={15} /></button></td>}</tr>) : <tr><td colSpan={columns.length + (compact ? 1 : readOnly ? 0 : 1)}><div className="empty-table"><FileSpreadsheet size={24} /><strong>Belum ada data yang cocok</strong><span>Ubah filter atau impor workbook Excel.</span></div></td></tr>}
    </tbody></table></div>
    <div className="table-summary"><span>Menampilkan {records.length} baris</span>{!compact && !readOnly && <span><span className="summary-dot" /> Nilai kontrak dapat diedit manual</span>}</div>
  </section>
}

function PublicProgramCard({ card, selectedYear }) {
  const unpaid = Math.max(0, card.billed - card.paid)
  const pieData = [
    { name: 'RAB', value: Math.max(0, card.rab), color: '#2878a5' },
    { name: 'Kontrak', value: Math.max(0, card.contract), color: '#e5a23b' },
    { name: 'Terbayar', value: Math.max(0, card.paid), color: '#23866a' },
    { name: 'Sisa PRK', value: Math.max(0, card.remainingPrk), color: '#d25d55' },
  ]
  const pieTotal = pieData.reduce((sum, item) => sum + item.value, 0)
  const pieDataWithPercent = pieData.map((item) => ({ ...item, percentage: pieTotal ? item.value / pieTotal * 100 : 0 }))
  const chartType = card.chartType === 'donut' ? 'donut' : 'pie'

  return <article className={`public-program-card public-program-card--${chartType}`}>
    <h2>{card.title}</h2>
    <div className="public-program-total"><span>{selectedYear === 'all' ? 'Semua tahun' : selectedYear} / {card.count} paket</span><strong>{formatCurrency(card.pagu)}</strong></div>
    <div className="public-program-body">
      <div className={`public-chart-wrap public-chart-wrap--${chartType}`}>
        {pieTotal ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pieDataWithPercent} dataKey="value" nameKey="name" innerRadius={chartType === 'donut' ? '61%' : 0} outerRadius="84%" paddingAngle={2} stroke="none">{pieDataWithPercent.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip formatter={(value, name) => [formatCurrency(value), name]} contentStyle={{ border: '1px solid #dce4ee', borderRadius: 4, fontSize: 10 }} /></PieChart></ResponsiveContainer> : <div className={`public-chart-empty public-chart-empty--${chartType}`} />}
        {chartType === 'donut' && <div className="public-donut-center"><strong>{pieTotal ? '100%' : '0%'}</strong><span>komposisi</span></div>}
      </div>
      <div className="public-program-metrics">
        {pieDataWithPercent.map((item) => <div key={item.name}><span><i style={{ backgroundColor: item.color }} />{item.name}<small>{item.percentage.toFixed(1)}%</small></span><strong>{formatCurrency(item.value)}</strong></div>)}
        <div className="public-unpaid-metric"><span><i />Belum terbayar</span><strong>{formatCurrency(unpaid)}</strong></div>
      </div>
    </div>
  </article>
}

function PublicDashboard({ groups, rows, selectedYear, setSelectedYear, updatedAt, connection }) {
  const [programFilter, setProgramFilter] = useState('all')
  const [notesFilter, setNotesFilter] = useState('all')
  const publicYears = ['2024', '2025', '2026', '2027', '2028', '2029', '2030']
  const programCode = (value) => String(value || '').match(/\b(DAL|EFI|SAR)\b/i)?.[1].toUpperCase() || ''
  const notesCategory = (row) => {
    const value = String(row.notes || `${row.program || ''}`).trim()
    if (/lanjutan|luncuran/i.test(value)) return 'Lanjutan'
    if (/murni/i.test(value)) return 'Murni'
    return value
  }
  const selectedGroups = groups.filter((group) =>
    (selectedYear === 'all' || String(group.year) === selectedYear)
      && (programFilter === 'all' || programCode(group.program) === programFilter)
  ).sort((left, right) => right.pagu - left.pagu)
  const chartRows = rows.filter((row) =>
    (selectedYear === 'all' || String(row.year) === selectedYear)
      && (programFilter === 'all' || programCode(row.program) === programFilter)
  )
  const programCards = [
    { code: 'SAR', category: 'Lanjutan', title: 'SAR LANJUTAN', chartType: 'pie' },
    { code: 'DAL', category: 'Lanjutan', title: 'DAL LANJUTAN', chartType: 'pie' },
    { code: 'EFI', category: 'Lanjutan', title: 'EFI LANJUTAN', chartType: 'pie' },
    { code: 'SAR', category: 'Murni', title: 'SAR MURNI', chartType: 'donut' },
    { code: 'DAL', category: 'Murni', title: 'DAL MURNI', chartType: 'donut' },
    { code: 'EFI', category: 'Murni', title: 'EFI MURNI', chartType: 'donut' },
  ].map((card) => {
    const matchingRows = chartRows.filter((row) => programCode(row.program) === card.code && notesCategory(row) === card.category)
    return matchingRows.reduce((summary, row) => ({
      ...summary,
      count: summary.count + 1,
      pagu: summary.pagu + Number(row.totalFinal || row.totalPrk || 0),
      rab: summary.rab + Number(row.rabTotal || 0),
      contract: summary.contract + Number(row.contractValue || 0),
      billed: summary.billed + Number(row.billed || 0),
      paid: summary.paid + Number(row.paid || 0),
      remainingPrk: summary.remainingPrk + Number(row.prkRemaining || 0),
    }), { ...card, count: 0, pagu: 0, rab: 0, contract: 0, billed: 0, paid: 0, remainingPrk: 0 })
  })
  const filteredRows = rows.filter((row) =>
    (selectedYear === 'all' || String(row.year) === selectedYear)
      && (programFilter === 'all' || programCode(row.program) === programFilter)
      && (notesFilter === 'all' || notesCategory(row) === notesFilter)
  )
  const summaryRows = rows.filter((row) =>
    (selectedYear === 'all' || String(row.year) === selectedYear)
      && (programFilter === 'all' || programCode(row.program) === programFilter)
  )
  const totals = selectedGroups.reduce((sum, group) => ({
    count: sum.count + Number(group.publicCount || 0),
    pagu: sum.pagu + Number(group.totalFinal || group.totalPrk || 0),
    rab: sum.rab + Number(group.rabTotal || 0),
    contract: sum.contract + Number(group.contractValue || 0),
    billed: sum.billed + Number(group.billed || 0),
    paid: sum.paid + Number(group.paid || 0),
    remainingPrk: sum.remainingPrk + Number(group.prkRemaining || 0),
  }), { count: 0, pagu: 0, rab: 0, contract: 0, billed: 0, paid: 0, remainingPrk: 0 })
  const notesTotals = summaryRows.reduce((sum, row) => {
    const category = notesCategory(row)
    if (category === 'Murni') sum.murni += Number(row.totalFinal || row.totalPrk || 0)
    if (category === 'Lanjutan') sum.lanjutan += Number(row.totalFinal || row.totalPrk || 0)
    return sum
  }, { murni: 0, lanjutan: 0 })
  const paguPercent = (value) => totals.pagu > 0 ? `${(value / totals.pagu * 100).toFixed(1)}%` : '0%'
  const latestYear = [...new Set(groups.map((group) => String(group.year || '')).filter(Boolean))].sort().at(-1)
  const titleYear = selectedYear === 'all' ? latestYear || new Date().getFullYear() : selectedYear
  const updatedLabel = updatedAt ? new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(updatedAt)) : '--:--'

  return <div className="public-dashboard">
    <section className="public-dashboard-heading"><div><p className="eyebrow">RINGKASAN ANGGARAN INVESTASI</p><h1>DASHBOARD AI {titleYear}</h1><p>Ringkasan RAB, kontrak, dan pembayaran.</p></div><div className="public-dashboard-filters"><label className="select-wrap"><span className="sr-only">Filter program</span><select value={programFilter} onChange={(event) => setProgramFilter(event.target.value)}><option value="all">Semua program</option><option value="DAL">DAL</option><option value="EFI">EFI</option><option value="SAR">SAR</option></select><ChevronDown size={15} /></label><label className="select-wrap"><span className="sr-only">Filter tahun</span><select value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)}><option value="all">Semua tahun</option>{publicYears.map((year) => <option key={year} value={year}>{year}</option>)}</select><ChevronDown size={15} /></label><label className="select-wrap"><span className="sr-only">Filter keterangan</span><select value={notesFilter} onChange={(event) => setNotesFilter(event.target.value)}><option value="all">Semua keterangan</option><option value="Murni">Murni</option><option value="Lanjutan">Lanjutan</option></select><ChevronDown size={15} /></label></div></section>

    <section className="public-board-layout" aria-label="Ringkasan per program">
      <aside className="public-annual-summary"><div className="public-annual-heading">SKKI BARA {titleYear}</div><strong>{formatCurrency(totals.pagu)}</strong><div className="public-summary-label">TOTAL PAGU</div>
        <div className="public-summary-line"><span>MURNI</span><strong>{formatCurrency(notesTotals.murni)}</strong></div>
        <div className="public-summary-line"><span>LANJUTAN</span><strong>{formatCurrency(notesTotals.lanjutan)}</strong></div>
        <div className="public-summary-line"><span>KONTRAK</span><strong>{formatCurrency(totals.contract)}<small>{paguPercent(totals.contract)} dari pagu</small></strong></div>
        <div className="public-summary-line"><span>SISA PRK</span><strong>{formatCurrency(totals.remainingPrk)}<small>{paguPercent(totals.remainingPrk)} dari pagu</small></strong></div>
      </aside>
      <div className="public-program-column public-program-column--pure" aria-label="Program murni">
        {programCards.filter((card) => card.category === 'Murni').map((card) => <PublicProgramCard key={card.title} card={card} selectedYear={selectedYear} />)}
      </div>
      <div className="public-program-column public-program-column--continuation" aria-label="Program lanjutan">
        {programCards.filter((card) => card.category === 'Lanjutan').map((card) => <PublicProgramCard key={card.title} card={card} selectedYear={selectedYear} />)}
      </div>

    </section>

    <section className="public-dashboard-table panel">
      <div className="public-table-heading"><div><p className="eyebrow">SINKRON DARI RABDATA</p><h2>Data dashboard per PRK</h2></div><span className={`public-live-status ${connection === 'cloud' ? 'is-live' : ''}`}><i />{connection === 'cloud' ? `Diperbarui ${updatedLabel} · refresh 30 detik` : 'Menunggu koneksi Google Sheets'}</span></div>
      <div className="table-scroll public-summary-scroll"><table><thead><tr><th>NO</th><th>NO. PRK</th><th>URAIAN</th><th>PROGRAM</th><th>TAHUN</th><th>KETERANGAN</th><th>TOTAL AKHIR</th><th>RAB</th><th>TOTAL PA</th><th>KONTRAK</th><th>SISA PRK</th><th>TAGIHAN</th><th>TOTAL BAYAR</th><th>BELUM TERBAYAR</th></tr></thead><tbody>
        {filteredRows.map((row, index) => <tr key={row.id}><td>{index + 1}</td><td>{row.prk || '-'}</td><td className="public-description-cell" title={row.description}>{row.description || '-'}</td><td>{row.program || '-'}</td><td>{row.year || '-'}</td><td>{notesCategory(row) || '-'}</td><td className="money-cell">{formatCurrency(row.totalFinal)}</td><td className="money-cell">{formatCurrency(row.rabTotal)}</td><td className="money-cell">{formatCurrency(row.paTotal)}</td><td className="money-cell">{formatCurrency(row.contractValue)}</td><td className="money-cell">{formatCurrency(row.prkRemaining)}</td><td className="money-cell">{formatCurrency(row.billed)}</td><td className="money-cell">{formatCurrency(row.paid)}</td><td className="money-cell">{formatCurrency(Math.max(0, Number(row.billed || 0) - Number(row.paid || 0)))}</td></tr>)}
        {!filteredRows.length && <tr><td colSpan="14">Belum ada data untuk filter ini.</td></tr>}
      </tbody></table></div>
      <div className="public-table-footer"><span>Menampilkan {filteredRows.length} dari {rows.length} baris PRK</span><span>Nomor kontrak dan vendor hanya tersedia setelah login.</span></div>
    </section>
  </div>
}

function UserManagement() {
  const emptyUser = { id: '', username: '', name: '', role: 'planner', password: '', active: true }
  const [users, setUsers] = useState([])
  const [form, setForm] = useState(emptyUser)
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  async function reloadUsers() {
    const response = await apiPost({ action: 'listUsers' })
    const result = await response.json()
    if (!response.ok || !result.ok) throw new Error(result.error || 'Daftar pengguna gagal dimuat.')
    setUsers(result.users || [])
  }

  useEffect(() => {
    reloadUsers().catch((error) => setNotice(error.message))
  }, [])

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    setNotice('')
    try {
      const response = await apiPost({ action: 'saveUser', user: form })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || 'Pengguna gagal disimpan.')
      setForm(emptyUser)
      await reloadUsers()
      setNotice('Data pengguna berhasil disimpan.')
    } catch (error) {
      setNotice(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(user) {
    setNotice('')
    try {
      const response = await apiPost({ action: 'saveUser', user: { ...user, password: '', active: !user.active } })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || 'Status pengguna gagal diubah.')
      await reloadUsers()
    } catch (error) {
      setNotice(error.message)
    }
  }

  return <div className="user-management-page">
    <section className="page-heading"><div><p className="eyebrow">AKSES APLIKASI</p><h1>Manajemen User</h1><p className="heading-subtitle">Atur akun admin, tim perencanaan, dan viewer.</p></div></section>
    <div className="user-management-grid">
      <section className="panel user-form-panel"><div className="table-heading"><div><p className="eyebrow">{form.id ? 'UBAH AKUN' : 'AKUN BARU'}</p><h2>{form.id ? 'Perbarui pengguna' : 'Tambah pengguna'}</h2></div></div>
        <form className="user-form" onSubmit={save}>
          <label className="field-label">Nama<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label className="field-label">Username<input required minLength="3" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></label>
          <label className="field-label">Peran<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option value="admin">Admin</option><option value="planner">Tim Perencanaan</option><option value="viewer">Viewer (baca saja)</option></select></label>
          <label className="field-label">{form.id ? 'Kata sandi baru (opsional)' : 'Kata sandi'}<input type="password" minLength="12" required={!form.id} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="new-password" /></label>
          <div className="user-form-actions"><button type="submit" className="button button-primary" disabled={saving}>{saving ? 'Menyimpan...' : form.id ? 'Simpan perubahan' : 'Buat akun'}</button>{form.id && <button type="button" className="button button-secondary" onClick={() => setForm(emptyUser)}>Batal</button>}</div>
        </form>
      </section>
      <section className="panel table-panel user-list-panel"><div className="table-heading"><div><p className="eyebrow">AKUN TERDAFTAR</p><h2>Pengguna</h2></div><span className="row-count">{users.length} akun</span></div>
        <div className="table-scroll"><table><thead><tr><th>Nama</th><th>Username</th><th>Peran</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
          {users.map((user) => <tr key={user.id}><td>{user.name}</td><td>{user.username}</td><td>{{ admin: 'Admin', planner: 'Tim Perencanaan', viewer: 'Viewer' }[user.role]}</td><td>{user.active ? 'Aktif' : 'Nonaktif'}</td><td><div className="user-row-actions"><button className="workflow-edit" aria-label={`Edit ${user.username}`} onClick={() => setForm({ ...user, password: '' })}><Pencil size={14} /></button><button className="button button-secondary user-status-button" onClick={() => toggleActive(user)}>{user.active ? 'Nonaktifkan' : 'Aktifkan'}</button></div></td></tr>)}
          {!users.length && <tr><td colSpan="5">Belum ada akun.</td></tr>}
        </tbody></table></div>
      </section>
    </div>
    {notice && <div className="user-management-notice" role="status">{notice}</div>}
  </div>
}

export default App
