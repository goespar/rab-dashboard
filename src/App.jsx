import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, ArrowDownToLine, ArrowUpFromLine, BarChart3, Boxes, Check, ChevronDown,
  CircleAlert, ClipboardList, Cloud, FileSpreadsheet, FolderKanban, LayoutDashboard, LoaderCircle,
  ArrowUpRight, FileText, LockKeyhole, LogIn, LogOut, MapPin, PanelLeftClose, PanelLeftOpen, Pencil, PhoneCall, Plus, Search, Settings2, ShieldCheck, Upload, Users, Wrench, X, Zap,
} from 'lucide-react'
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { exportWorkbook, formatCurrency, importWorkbook, parseRupiahPrice, sampleRecords } from './lib/workbook.js'
import { applyFinalizedPaBalances, summarizePublicDashboard } from './lib/publicDashboard.js'
import { accumulateProjectedBilling, getPlannedBilling } from './lib/contractBilling.js'
import { findProgramRecordForRabGroup } from './lib/rabReferences.js'
import { calculateRabBudgetTotal, calculateRabTotalsByProgramRecord } from './lib/rabTotals.js'
import RabWorkflow from './RabWorkflow.jsx'
import danantaraLogo from '../logo/Danantara_Indonesia_(no_SW).svg.webp'
import plnLogo from '../logo/Logo_PLN.png'
import contactCenterLogo from '../logo/call center PLN 123.png'
import loginBackground from '../logo/halamanlogin.png'
import plnOfficer from '../logo/petugaspln.png'
import './App.css'
import './pln-theme.css'

const STORAGE_KEY = 'rab-monitor-records-v1'
const WORKFLOW_STORAGE_KEY = 'rab-monitor-workflow-v1'
const PUBLIC_CACHE_KEY = 'rab-monitor-public-dashboard-v1'
const SESSION_KEY = 'rab-monitor-session-v1'
const YEAR_OPTIONS = ['2024', '2025', '2026', '2027', '2028', '2029', '2030']
const EMPTY_COLLECTIONS = { materials: [], activityCatalog: [], components: [], activities: [], paTransfers: [], materialRecap: [], realizations: [] }
const WORKFLOW_NAV = [
  { id: 'contracts', label: 'Data Kontrak', icon: FileText },
  { id: 'realizations', label: 'Realisasi', icon: Activity },
]

const hasContractNumber = (record) => String(record.contractNumber ?? '').trim().length > 0
const hasContractDetails = (record) => hasContractNumber(record)
  || String(record.vendor ?? '').trim().length > 0
  || Number(record.contractValue) > 0
  || ['startDate', 'endDate', 'plannedContract', 'plannedBilling', 'progress', 'projectedBilling', 'paymentDate']
    .some((key) => String(record[key] ?? '').trim().length > 0)
function getNotesCategory(record) {
  const value = String(record.notes || record.program || '').trim()
  if (/lanjutan|luncuran/i.test(value)) return 'Lanjutan'
  if (/murni/i.test(value)) return 'Murni'
  return value
}

function readSession() {
  try {
    return JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || 'null')
  } catch {
    return null
  }
}

function readPublicDashboardCache() {
  try {
    const cached = JSON.parse(window.localStorage.getItem(PUBLIC_CACHE_KEY) || 'null')
    return cached?.summary && Array.isArray(cached.summary.rows) && Array.isArray(cached.summary.groups)
      ? cached.summary
      : null
  } catch (error) {
    console.warn('Cache dashboard publik tidak dapat dibaca.', error)
    return null
  }
}

function writePublicDashboardCache(summary) {
  try {
    window.localStorage.setItem(PUBLIC_CACHE_KEY, JSON.stringify({ summary }))
  } catch (error) {
    console.warn('Cache dashboard publik tidak dapat disimpan.', error)
  }
}

function publicGroupsToRecords(groups) {
  return groups.map((group, index) => ({
    id: `public-${index}`, program: group.program, year: group.year, publicCount: group.count,
    totalFinal: group.pagu, totalPrk: group.pagu, rabTotal: group.rab, paTotal: group.pa,
    contractValue: group.contract, billed: group.billed, paid: group.paid,
    prkRemaining: group.remainingPrk, projectedBilling: group.projectedBilling || 0, contractCount: group.contractCount,
    contractNumber: group.contract ? 'Ringkasan' : '',
  }))
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
  ['KETERANGAN', 'notes'], ['POS ANGGARAN', 'position'], ['TANGGAL AWAL', 'startDate'], ['TANGGAL AKHIR', 'endDate'],
  ['RENCANA KONTRAK', 'plannedContract'], ['RENCANA TAGIH', 'plannedBilling'],
  ['TAGIHAN JANUARI', 'billingJanuary'], ['TAGIHAN PEBRUARI', 'billingFebruary'], ['TAGIHAN MARET', 'billingMarch'],
  ['TAGIHAN APRIL', 'billingApril'], ['TAGIHAN MEI', 'billingMay'], ['TAGIHAN JUNI', 'billingJune'],
  ['TAGIHAN JULI', 'billingJuly'], ['TAGIHAN AGUSTUS', 'billingAugust'], ['TAGIHAN SEPTEMBER', 'billingSeptember'],
  ['TAGIHAN OKTOBER', 'billingOctober'], ['TAGIHAN NOPEMBER', 'billingNovember'], ['TAGIHAN DESEMBER', 'billingDecember'],
  ['PROGRESS', 'progress'],
  ['PROYEKSI TAGIH', 'projectedBilling'], ['TANGGAL BAYAR', 'paymentDate'],
]
const DASHBOARD_COLUMNS = [
  REKAP_COLUMNS[0], REKAP_COLUMNS[7], REKAP_COLUMNS[11], REKAP_COLUMNS[12], REKAP_COLUMNS[13], REKAP_COLUMNS[16],
  REKAP_COLUMNS[19], REKAP_COLUMNS[20], REKAP_COLUMNS[21], REKAP_COLUMNS[22], REKAP_COLUMNS[23], REKAP_COLUMNS[24],
]
const MONEY_COLUMNS = new Set([
  'totalPrk', 'relocation', 'skkiRevision', 'totalFinal', 'rabTotal', 'paTotal', 'contractValue', 'paReturn',
  'costReplacement', 'billed', 'paid', 'prkRemaining', 'projectedBilling',
  'billingJanuary', 'billingFebruary', 'billingMarch', 'billingApril', 'billingMay', 'billingJune',
  'billingJuly', 'billingAugust', 'billingSeptember', 'billingOctober', 'billingNovember', 'billingDecember',
])
const DATE_COLUMNS = new Set(['startDate', 'endDate', 'plannedContract', 'plannedBilling', 'paymentDate'])
function formatDateDisplay(value) {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value
}

function formatDateInput(value) {
  return String(value ?? '').trim().match(/^\d{4}-\d{2}-\d{2}/)?.[0] || ''
}

function plannedBillingAmount(record) {
  return getPlannedBilling(record).amount
}

function App() {
  const [publicCache] = useState(readPublicDashboardCache)
  const [auth, setAuth] = useState(null)
  const [authStatus, setAuthStatus] = useState(null)
  const [authDialog, setAuthDialog] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [authDataLoading, setAuthDataLoading] = useState(false)
  const [authDataReady, setAuthDataReady] = useState(false)
  const [records, setRecords] = useState(() => publicCache ? publicGroupsToRecords(publicCache.groups) : sampleRecords)
  const [publicRows, setPublicRows] = useState(() => (publicCache?.rows || []).map((row, index) => ({ ...row, id: `public-row-${index}` })))
  const [workflowCollections, setWorkflowCollections] = useState(EMPTY_COLLECTIONS)
  const [activeView, setActiveView] = useState('overview')
  const [rabEditRecordId, setRabEditRecordId] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedYear, setSelectedYear] = useState('all')
  const [selectedProgram, setSelectedProgram] = useState('all')
  const [selectedNotesCategory, setSelectedNotesCategory] = useState('all')
  const [importModal, setImportModal] = useState(false)
  const [pendingImport, setPendingImport] = useState(null)
  const [importError, setImportError] = useState('')
  const [importSaving, setImportSaving] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [connection, setConnection] = useState('local')
  const [notice, setNotice] = useState('')
  const [savePending, setSavePending] = useState(false)
  const [logoutPending, setLogoutPending] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(() => Boolean(readSession()?.token))
  const [rabMenuOpen, setRabMenuOpen] = useState(false)
  const [managementOpen, setManagementOpen] = useState(false)
  const [publicUpdatedAt, setPublicUpdatedAt] = useState(() => publicCache?.updatedAt || null)
  const [publicLoading, setPublicLoading] = useState(true)
  const [publicError, setPublicError] = useState('')
  const fileInput = useRef(null)
  const saveRecordsPendingRef = useRef(false)
  const importSavingRef = useRef(false)
  const clearRabEditRecord = useCallback(() => setRabEditRecordId(''), [])

  useEffect(() => {
    let cancelled = false
    const loadPublicDashboard = async () => {
      try {
        const response = await apiGet('publicDashboard', null)
        const result = await response.json()
        if (!response.ok || !result.ok) throw new Error(result.error || 'Data dashboard publik gagal dimuat.')
        if (cancelled) return
        const summary = result.summary || { rows: [], groups: [] }
        setPublicRows((summary.rows || []).map((row, index) => ({ ...row, id: `public-row-${index}` })))
        if (!readSession()?.token) setRecords(publicGroupsToRecords(summary.groups || []))
        setPublicUpdatedAt(summary.updatedAt || new Date().toISOString())
        writePublicDashboardCache(summary)
        setConnection('cloud')
        setPublicError('')
      } catch (error) {
        if (!cancelled) {
          setPublicError(error.message)
          setConnection('local')
        }
      } finally {
        if (!cancelled) setPublicLoading(false)
      }
    }
    const loadAuthStatus = async () => {
      try {
        const response = await apiGet('authStatus', null)
        const result = await response.json()
        if (!cancelled && response.ok && result.ok) setAuthStatus(result)
      } catch (error) {
        if (!cancelled) console.warn('Status autentikasi tidak dapat dimuat.', error)
      }
    }
    const loadSavedSession = async () => {
      const savedSession = readSession()
      if (!savedSession?.token) return
      try {
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
        setAuthDataReady(true)
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
      } catch (error) {
        if (!cancelled) console.warn('Sesi tersimpan tidak dapat dipulihkan.', error)
      }
    }
    void loadPublicDashboard()
    void loadAuthStatus()
    void loadSavedSession()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (auth) return undefined
    let cancelled = false
    const refreshPublicData = async () => {
      try {
        const response = await apiGet('publicDashboard', null)
        const result = await response.json()
        if (!response.ok || !result.ok) throw new Error(result.error || 'Data dashboard publik gagal dimuat.')
        if (cancelled) return
        const summary = result.summary || { rows: [], groups: [] }
        setPublicRows((summary.rows || []).map((row, index) => ({ ...row, id: `public-row-${index}` })))
        if (!readSession()?.token) setRecords(publicGroupsToRecords(summary.groups || []))
        setPublicUpdatedAt(summary.updatedAt || new Date().toISOString())
        writePublicDashboardCache(summary)
        setPublicError('')
        setConnection('cloud')
      } catch (error) {
        if (!cancelled) setPublicError(error.message)
      } finally {
        if (!cancelled) setPublicLoading(false)
      }
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
    if (!notice || logoutPending || savePending) return undefined
    const timer = window.setTimeout(() => setNotice(''), 3600)
    return () => window.clearTimeout(timer)
  }, [notice, logoutPending, savePending])

  const years = YEAR_OPTIONS
  const recordsWithFinalizedPa = useMemo(
    () => applyFinalizedPaBalances(records, workflowCollections.paTransfers || []),
    [records, workflowCollections.paTransfers],
  )
  const programs = useMemo(() => [...new Set(recordsWithFinalizedPa.map((record) => record.program).filter(Boolean))].sort(), [recordsWithFinalizedPa])
  const dashboardRecords = useMemo(() => recordsWithFinalizedPa.filter((record) =>
    (selectedYear === 'all' || String(record.year) === selectedYear)
      && (selectedProgram === 'all' || record.program === selectedProgram)
      && (selectedNotesCategory === 'all' || getNotesCategory(record) === selectedNotesCategory)
  ), [recordsWithFinalizedPa, selectedYear, selectedProgram, selectedNotesCategory])
  const investmentSummary = useMemo(() => summarizePublicDashboard(dashboardRecords), [dashboardRecords])
  const contractRecords = useMemo(() => recordsWithFinalizedPa.filter((record) => Number(record.paTotal) > 0
    || hasContractNumber(record)
    || String(record.vendor ?? '').trim().length > 0
    || Number(record.contractValue) > 0), [recordsWithFinalizedPa])
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
  async function loadAuthenticatedData(session) {
    try {
      const [dataResponse, workflowResponse] = await Promise.all([
        apiGet('load', session.token), apiGet('loadWorkflow', session.token),
      ])
      const [dataResult, workflowResult] = await Promise.all([dataResponse.json(), workflowResponse.json()])
      if (!dataResult.ok || !workflowResult.ok) {
        throw new Error(dataResult.error || workflowResult.error || 'Data akun gagal dimuat.')
      }
      if (readSession()?.token !== session.token) return
      const nextRecords = dataResult.records || []
      const nextCollections = { ...EMPTY_COLLECTIONS, ...workflowResult.collections }
      setAuth((current) => current?.token === session.token
        ? { ...session, user: dataResult.user || session.user }
        : current)
      setAuthDataReady(true)
      setRecords(nextRecords)
      setWorkflowCollections(nextCollections)
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRecords))
      window.localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(nextCollections))
    } catch (error) {
      if (readSession()?.token === session.token) {
        setNotice(`Login berhasil, tetapi data terbaru gagal dimuat: ${error.message}`)
      }
    } finally {
      if (readSession()?.token === session.token) setAuthDataLoading(false)
    }
  }

  async function submitAuth(event) {
    event.preventDefault()
    setAuthBusy(true)
    setAuthMessage('')
    const form = new FormData(event.currentTarget)
    const setup = event.currentTarget.dataset.authMode
      ? event.currentTarget.dataset.authMode === 'setup'
      : authDialog === 'setup'
    const payload = setup
      ? { action: 'bootstrapAdmin', setupKey: form.get('setupKey'), username: form.get('username'), name: form.get('name'), password: form.get('password') }
      : { action: 'login', username: form.get('username'), password: form.get('password') }
    try {
      const response = await apiPost(payload)
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || 'Autentikasi gagal.')
      const session = { token: result.token, expiresAt: result.expiresAt, user: result.user }
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
      try {
        const cachedRecords = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null')
        const cachedCollections = JSON.parse(window.localStorage.getItem(WORKFLOW_STORAGE_KEY) || 'null')
        if (Array.isArray(cachedRecords)) setRecords(cachedRecords)
        if (cachedCollections && typeof cachedCollections === 'object') {
          setWorkflowCollections({ ...EMPTY_COLLECTIONS, ...cachedCollections })
        }
      } catch (error) {
        console.warn('Data cache lokal tidak dapat dibaca.', error)
      }
      setAuth(session)
      setLogoutPending(false)
      setAuthDataLoading(true)
      setSidebarOpen(true)
      setAuthDialog('')
      setActiveView('overview')
      setNotice('Login berhasil. Data terbaru dimuat di latar belakang.')
      void loadAuthenticatedData(session)
    } catch (error) {
      window.sessionStorage.removeItem(SESSION_KEY)
      setAuthMessage(error.message)
    } finally {
      setAuthBusy(false)
    }
  }

  function logout() {
    const logoutRequest = apiPost({ action: 'logout' })
    window.sessionStorage.removeItem(SESSION_KEY)
    window.localStorage.removeItem(STORAGE_KEY)
    window.localStorage.removeItem(WORKFLOW_STORAGE_KEY)
    setAuth(null)
    setAuthDataReady(false)
    setSidebarOpen(false)
    setRecords(sampleRecords)
    setWorkflowCollections(EMPTY_COLLECTIONS)
    setActiveView('overview')
    setLogoutPending(true)
    setNotice('Anda sudah keluar. Sedang mengakhiri sesi di server...')
    void logoutRequest
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok || !result.ok) throw new Error(result.error || 'Sesi server belum dapat diakhiri.')
        setLogoutPending(false)
        if (!readSession()?.token) setNotice('Anda sudah keluar.')
      })
      .catch((error) => {
        console.warn('Logout server gagal.', error)
        setLogoutPending(false)
        if (!readSession()?.token) setNotice(`Anda sudah keluar dari perangkat ini, tetapi sesi server belum diakhiri: ${error.message}`)
      })
  }

  async function saveRecords(nextRecords, successMessage) {
    if (saveRecordsPendingRef.current) {
      return { ok: false, savedToSheets: false, message: 'Penyimpanan sedang berlangsung.' }
    }
    saveRecordsPendingRef.current = true
    setSavePending(true)
    setNotice('Menyimpan data ke Google Sheets...')
    let locallyStored = false
    try {
      setRecords(nextRecords)
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRecords))
      locallyStored = true
      const response = await apiPost({ action: 'save', records: nextRecords })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || 'Penyimpanan cloud gagal.')
      setConnection('cloud')
      setNotice(`${successMessage} Tersimpan di Google Sheets.`)
      return { ok: true, savedToSheets: true, message: `${successMessage} Tersimpan di Google Sheets.` }
    } catch (error) {
      setConnection('local')
      const message = locallyStored
        ? `${successMessage} Tersimpan lokal, tetapi gagal disinkronkan ke Google Sheets: ${error.message || 'Kesalahan koneksi.'}`
        : `Data gagal disimpan: ${error.message || 'Penyimpanan lokal tidak berhasil.'}`
      setNotice(message)
      return { ok: false, savedToSheets: false, message }
    } finally {
      saveRecordsPendingRef.current = false
      setSavePending(false)
    }
  }

  async function synchronizeRabTotals(
    activities,
    components,
    previousActivities,
    previousComponents,
    onProgress,
  ) {
    const totalsByRecord = calculateRabTotalsByProgramRecord(
      records,
      activities,
      components,
      workflowCollections.activityCatalog,
      workflowCollections.paTransfers,
      previousActivities,
      previousComponents,
    )
    const updatedProgramRecords = records.map((record) => {
      const total = totalsByRecord.get(String(record.id))
      return total === undefined || Number(record.rabTotal || 0) === total
        ? record
        : { ...record, rabTotal: total }
    })
    if (updatedProgramRecords.every((record, index) => record === records[index])) {
      return { ok: true, message: '' }
    }
    onProgress?.('sheets')
    return saveRecords(updatedProgramRecords, 'TOTAL RAB per PRK diperbarui.')
  }

  async function saveWorkflowCollection(collection, nextRecords, successMessage, onProgress) {
    const nextCollections = { ...workflowCollections, [collection]: nextRecords }
    setWorkflowCollections(nextCollections)
    window.localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(nextCollections))
    onProgress?.('local')
    let relatedRecordsSaved = true
    let relatedRecordsError = ''
    try {
      onProgress?.('sheets')
      const response = await apiPost({ action: 'saveWorkflow', collection, records: nextRecords })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || 'Penyimpanan Google Sheets gagal.')
      if (collection === 'components') {
        const relatedSave = await synchronizeRabTotals(
          workflowCollections.activities,
          nextRecords,
          workflowCollections.activities,
          workflowCollections.components,
          onProgress,
        )
        relatedRecordsSaved = relatedSave?.ok !== false
        relatedRecordsError = relatedSave?.message || ''
      }
      if (collection === 'realizations' && result.updatedRecords?.length) {
        const recordsById = new Map(result.updatedRecords.map((record) => [String(record.id), record]))
        const updatedProgramRecords = records.map((record) => recordsById.has(String(record.id))
          ? { ...record, ...recordsById.get(String(record.id)) }
          : record)
        setRecords(updatedProgramRecords)
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProgramRecords))
      }
      setConnection('cloud')
      const sheetMessage = collection === 'realizations'
        ? `${successMessage} Total tagihan dan pembayaran diperbarui di RABData.`
        : `${successMessage} Tersimpan di Google Sheets.`
      const message = relatedRecordsSaved ? sheetMessage : `${sheetMessage} Namun total RAB per PRK gagal disinkronkan: ${relatedRecordsError}`
      setNotice(message)
      return { ok: relatedRecordsSaved, savedToSheets: true, message }
    } catch (error) {
      setConnection('local')
      const relatedError = relatedRecordsSaved ? '' : ` Total RAB per PRK juga gagal disinkronkan: ${relatedRecordsError}`
      const message = `${successMessage} Tersimpan lokal, tetapi gagal disimpan ke Google Sheets: ${error.message || 'Kesalahan koneksi.'}${relatedError}`
      setNotice(message)
      return { ok: false, savedToSheets: false, message }
    }
  }

  async function transferToPA(transfer, { confirm = true, sourceOverride = null } = {}) {
    const source = sourceOverride || records.find((record) => String(record.id) === String(transfer.recordId))
    const amount = Number(transfer.amount) || 0
    const remaining = Number(source?.rabTotal) || 0
    if (!source || amount <= 0 || amount > remaining) {
      setNotice('Finalisasi ditolak: nilai harus lebih dari nol dan tidak melebihi sisa RAB.')
      return false
    }
    if (confirm) {
      const confirmed = window.confirm(`Finalisasi ${formatCurrency(amount)} dari RAB ${source.prk || source.rabNumber} ke PA? Sisa RAB berkurang dan saldo PA bertambah.`)
      if (!confirmed) return false
    }

    try {
      const response = await apiPost({ action: 'transferToPA', ...transfer })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || 'Finalisasi gagal.')
      const updatedRecord = result.record || {
        ...source,
        rabTotal: Math.max(0, remaining - amount),
        paTotal: Number(source.paTotal || 0) + amount,
        contractValue: Number(source.contractValue || 0),
      }
      const nextRecords = records.map((record) => String(record.id) === String(source.id) ? updatedRecord : record)
      setRecords(nextRecords)
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRecords))
      const nextTransfers = [result.transfer, ...workflowCollections.paTransfers]
      const nextCollections = { ...workflowCollections, paTransfers: nextTransfers }
      setWorkflowCollections(nextCollections)
      window.localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(nextCollections))
      setConnection('cloud')
      setNotice(`Finalisasi ${formatCurrency(amount)} berhasil. Sisa RAB ${formatCurrency(updatedRecord.rabTotal)}; saldo PA ${formatCurrency(updatedRecord.paTotal)}.`)
      return updatedRecord
    } catch (error) {
      setNotice(`Finalisasi tidak tersimpan: ${error.message}`)
      return false
    }
  }

  async function finalizeRabToPA({ group }) {
    let sourceRecord = findProgramRecordForRabGroup(records, group)
    if (!sourceRecord) {
      const message = `Finalisasi gagal: data anggaran untuk PRK ${group.prk || '-'} tidak ditemukan.`
      setNotice(message)
      return { ok: false, message }
    }
    const transferAmount = Number(group.totalAnggaran ?? calculateRabBudgetTotal(group.total)) || 0
    if (transferAmount <= 0) {
      return { ok: false, message: 'Total RAB harus lebih besar dari nol.' }
    }
    if (transferAmount > Number(sourceRecord.rabTotal || 0)) {
      const sourceHasTransfers = workflowCollections.paTransfers.some((transfer) =>
        String(transfer.recordId) === String(sourceRecord.id))
      if (sourceHasTransfers) {
        return { ok: false, message: 'Sinkronisasi dibatalkan karena PRK ini sudah memiliki riwayat PA. Periksa TOTAL RAB di kolom M agar saldo PA tidak tertimpa.' }
      }
      const synced = await linkRabGroupToProgramRecord({ group })
      if (!synced.ok || !synced.sourceRecord) {
        return { ok: false, message: synced.message || 'TOTAL RAB gagal disinkronkan dari kegiatan dan PRK.' }
      }
      sourceRecord = synced.sourceRecord
    }
    if (transferAmount > Number(sourceRecord.rabTotal || 0)) {
      return { ok: false, message: `Total RAB ${formatCurrency(transferAmount)} melebihi TOTAL RAB ${formatCurrency(sourceRecord.rabTotal)} pada RABData.` }
    }
    const updatedRecord = await transferToPA({
      recordId: sourceRecord.id,
      amount: transferAmount,
      date: new Date().toISOString().slice(0, 10),
      notes: `FINALIZED_RAB_GROUP::${group.finalizationKey || group.key}`,
      rabGroupKey: group.finalizationKey || group.key,
      preserveContractValue: true,
    }, { confirm: false, sourceOverride: sourceRecord })
    if (!updatedRecord) return { ok: false, finalized: false, message: 'Finalisasi RAB ke PA gagal.' }
    return {
      ok: true,
      finalized: true,
      message: `RAB berhasil dipindahkan ke PA. Nomor kontrak, nilai kontrak, vendor, dan tanggal dapat dilengkapi nanti melalui menu Data Kontrak.`,
    }
  }

  async function linkRabGroupToProgramRecord({ group }) {
    const sourceRecord = findProgramRecordForRabGroup(records, group)
    if (!sourceRecord) {
      return { ok: false, message: 'Baris RABData yang cocok berdasarkan PRK dan kegiatan tidak ditemukan atau tidak unik.' }
    }
    const groupActivityIds = new Set((group.records || []).map((activity) => String(activity.id)))
    if (!groupActivityIds.size) {
      return { ok: false, message: 'Baris Rekap RAB tidak ditemukan untuk ditautkan.' }
    }

    const nextActivities = workflowCollections.activities.map((activity) =>
      groupActivityIds.has(String(activity.id))
        ? {
          ...activity,
          prk: sourceRecord.prk || activity.prk,
          programRecordId: sourceRecord.id,
          program: sourceRecord.program || activity.program || '',
          year: sourceRecord.year || activity.year || '',
        }
        : activity)
    const linkedCount = nextActivities.filter((activity) => groupActivityIds.has(String(activity.id))
      && String(activity.programRecordId) === String(sourceRecord.id)).length
    if (linkedCount !== groupActivityIds.size) {
      return { ok: false, message: 'Tidak semua baris Rekap RAB berhasil ditemukan untuk ditautkan.' }
    }

    const syncedActivities = nextActivities.filter((activity) =>
      String(activity.programRecordId) === String(sourceRecord.id)
        || (!activity.programRecordId && String(activity.prk || '').trim()
          && String(activity.prk || '').trim() === String(sourceRecord.prk || '').trim()))
    const rabTotal = syncedActivities.reduce((total, activity) => {
      if (activity.total !== undefined) return total + Number(activity.total || 0)
      return total + (Number(activity.materialPrice || 0) + Number(activity.servicePrice || 0))
        * Number(activity.quantityPerUnit ?? 1) * Number(activity.volume || 0)
    }, 0)

    const nextCollections = { ...workflowCollections, activities: nextActivities }
    setWorkflowCollections(nextCollections)
    window.localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(nextCollections))
    try {
      const workflowResponse = await apiPost({ action: 'saveWorkflow', collection: 'activities', records: nextActivities })
      const workflowResult = await workflowResponse.json()
      if (!workflowResponse.ok || !workflowResult.ok) {
        throw new Error(workflowResult.error || 'Penyimpanan tautan kegiatan ke Google Sheets gagal.')
      }
    } catch (error) {
      setConnection('local')
      return { ok: false, message: `Tautan kegiatan tersimpan lokal, tetapi gagal disinkronkan: ${error.message}` }
    }

    const nextRecords = records.map((record) => String(record.id) === String(sourceRecord.id)
      ? { ...record, rabTotal }
      : record)
    const saved = await saveRecords(nextRecords, 'TOTAL RAB berhasil disinkronkan berdasarkan kegiatan dan PRK.')
    if (!saved.ok) return { ok: false, message: saved.message }

    return {
      ok: true,
      message: saved.message,
      sourceRecord: nextRecords.find((record) => String(record.id) === String(sourceRecord.id)),
    }
  }

  async function cancelTransferFromPA(transfer) {
    const source = records.find((record) => String(record.id) === String(transfer.recordId))
    if (!source) {
      setNotice('Pembatalan ditolak: data PRK sumber tidak ditemukan.')
      return false
    }
    if (hasContractDetails(source)) {
      setNotice('Pembatalan ditolak: data kontrak sudah diisi. Perubahan PA harus diselesaikan melalui administrasi kontrak.')
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
    if (!pendingImport?.records.length || importSavingRef.current) return
    importSavingRef.current = true
    setImportSaving(true)
    setNotice('Mengimpor dan menyimpan data...')
    try {
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
    } finally {
      importSavingRef.current = false
      setImportSaving(false)
    }
  }

  async function saveRecord(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const numberOrBlank = (name) => {
      const value = String(form.get(name) ?? '').trim()
      return value ? Number(value) : ''
    }
    const updated = records.map((record) => record.id === editingRecord.id ? {
      ...record,
      contractNumber: String(form.get('contractNumber') || '').trim(),
      vendor: String(form.get('vendor') || '').trim(),
      contractValue: Number(form.get('contractValue') || 0),
      startDate: String(form.get('startDate') || '').trim(),
      endDate: String(form.get('endDate') || '').trim(),
      plannedContract: String(form.get('plannedContract') || '').trim(),
      plannedBilling: String(form.get('plannedBilling') || '').trim(),
      billingAmount: numberOrBlank('billingAmount'),
      progress: String(form.get('progress') || '').trim(),
      projectedBilling: accumulateProjectedBilling(record.projectedBilling, numberOrBlank('projectedBilling')),
      paymentDate: String(form.get('paymentDate') || '').trim(),
    } : record)
    await saveRecords(updated, 'Data anggaran diperbarui.')
    setEditingRecord(null)
  }

  async function downloadWorkbook() {
    await exportWorkbook(filteredRecords)
    setNotice('File Excel berhasil disiapkan.')
  }

  const pageTitle = {
    overview: 'Dashboard', data: 'Detail AI', materials: 'Input Material', activityCatalog: 'Master Kegiatan', components: 'Input RAB',
    activities: 'Rekap RAB', paFinalization: 'Finalisasi ke PA', contracts: 'Data Kontrak', users: 'Manajemen User', materialRecap: 'Rekap Material', realizations: 'Realisasi',
  }[activeView] || 'Dashboard'
  const canEdit = Boolean(auth && auth.user.role !== 'viewer' && authDataReady && !authDataLoading)
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
          {auth && <div className="nav-management">
            <button className={`nav-item${['components', 'activities'].includes(activeView) ? ' active' : ''}`} aria-expanded={rabMenuOpen} onClick={() => setRabMenuOpen((open) => !open)}>
              <ClipboardList size={18} /><span>RAB</span><ChevronDown className={`nav-chevron${rabMenuOpen ? ' is-open' : ''}`} size={15} />
            </button>
            {rabMenuOpen && <div className="nav-submenu">
              <button className={activeView === 'components' ? 'nav-item nav-subitem active' : 'nav-item nav-subitem'} onClick={() => setActiveView('components')}><Wrench size={16} /><span>Input RAB</span><span className="nav-count">{workflowCollections.components.length}</span></button>
              <button className={activeView === 'activities' ? 'nav-item nav-subitem active' : 'nav-item nav-subitem'} onClick={() => setActiveView('activities')}><ClipboardList size={16} /><span>Rekap RAB</span><span className="nav-count">{workflowCollections.components.length}</span></button>
            </div>}
          </div>}
          {auth && WORKFLOW_NAV.map((item) => {
            const Icon = item.icon
            return <div className="nav-group" key={item.id}>
              {item.section && <div className="nav-section-label">{item.section}</div>}
              <button className={activeView === item.id ? 'nav-item active' : 'nav-item'} onClick={() => setActiveView(item.id)}><Icon size={18} /><span>{item.label}</span><span className="nav-count">{item.id === 'contracts' ? contractRecords.length : workflowCollections[item.collection || item.id]?.length || 0}</span></button>
            </div>
          })}
          {auth && <button className={activeView === 'data' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveView('data')}><FolderKanban size={18} /><span>Detail AI</span><span className="nav-count">{records.length}</span></button>}
          {auth && <div className="nav-management">
            <button className={`nav-item${['materials', 'activityCatalog', 'users'].includes(activeView) ? ' active' : ''}`} aria-expanded={managementOpen} onClick={() => setManagementOpen((open) => !open)}>
              <Settings2 size={18} /><span>Manajemen</span><ChevronDown className={`nav-chevron${managementOpen ? ' is-open' : ''}`} size={15} />
            </button>
            {managementOpen && <div className="nav-submenu">
              <button className={activeView === 'materials' ? 'nav-item nav-subitem active' : 'nav-item nav-subitem'} onClick={() => setActiveView('materials')}><Boxes size={16} /><span>Input Material</span></button>
              <button className={activeView === 'activityCatalog' ? 'nav-item nav-subitem active' : 'nav-item nav-subitem'} onClick={() => setActiveView('activityCatalog')}><ClipboardList size={16} /><span>Master Kegiatan</span></button>
              {isAdmin && <button className={activeView === 'users' ? 'nav-item nav-subitem active' : 'nav-item nav-subitem'} onClick={() => setActiveView('users')}><Users size={16} /><span>Manajemen User</span></button>}
            </div>}
          </div>}
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
            </> : <button className="button button-primary" onClick={() => {
              if (authStatus?.setupRequired) {
                setAuthMessage('')
                setAuthDialog('setup')
              } else {
                document.querySelector('.pln-login-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                document.querySelector('#public-login-username')?.focus({ preventScroll: true })
              }
            }}><LogIn size={16} /><span>{authStatus?.setupRequired ? 'Setup Admin' : 'Login'}</span></button>}
          </div>
        </header>

        <div className="page-content">
          {activeView === 'overview' && !auth ? <PublicDashboard rows={publicRows} selectedYear={selectedYear} showLogin authStatus={authStatus} authMessage={authMessage} authBusy={authBusy} onSubmitAuth={submitAuth} onOpenSetup={() => { setAuthMessage(''); setAuthDialog('setup') }} /> : activeView === 'overview' ? <>
            <PublicDashboard rows={recordsWithFinalizedPa} selectedYear={selectedYear} setSelectedYear={setSelectedYear} selectedProgram={selectedProgram} setSelectedProgram={setSelectedProgram} selectedNotesCategory={selectedNotesCategory} setSelectedNotesCategory={setSelectedNotesCategory} showCharts connection={connection} loading={authDataLoading || publicLoading} error={publicError} updatedAt={publicUpdatedAt} />

            <AuthenticatedInvestmentSummary summary={investmentSummary} />

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
            <ProjectTable records={filteredRecords} onEdit={canEdit ? setEditingRecord : undefined} onViewAll={() => setActiveView('data')} searchTerm={searchTerm} setSearchTerm={setSearchTerm} selectedYear={selectedYear} setSelectedYear={setSelectedYear} years={years} selectedProgram={selectedProgram} setSelectedProgram={setSelectedProgram} programs={programs} selectedNotesCategory={selectedNotesCategory} setSelectedNotesCategory={setSelectedNotesCategory} readOnly={!canEdit} />
            <div className="table-footnote"><ShieldCheck size={14} /> Aplikasi ini untuk rekap dan monitoring. Proses tender dan kontrak dilakukan di luar aplikasi.</div>
          </> : activeView === 'contracts' && auth ? <>
            <section className="page-heading data-heading"><div><p className="eyebrow">ADMINISTRASI PENGADAAN</p><h1>Data Kontrak</h1><p className="heading-subtitle">Catat nomor kontrak, vendor pemenang, dan nilai kontrak aktual per PRK/RAB.</p></div></section>
            <div className="table-footnote contract-guidance"><ShieldCheck size={14} /> Nilai PA adalah alokasi/pagu. Nilai kontrak diisi sesuai kontrak pemenang dan tidak otomatis mengikuti saldo PA.</div>
            <ContractTable records={contractRecords} workflowCollections={workflowCollections} onEdit={canEdit ? setEditingRecord : undefined} readOnly={!canEdit} />
          </> : activeView === 'users' && isAdmin ? <UserManagement />
            : auth && activeView !== 'overview' ? <RabWorkflow key={activeView} view={activeView} collections={workflowCollections} programRecords={records} onSave={saveWorkflowCollection} onTransfer={transferToPA} onFinalizeRab={finalizeRabToPA} onCancelTransfer={cancelTransferFromPA} onEditRab={(record) => { setRabEditRecordId(record.id); setActiveView('components') }} editComponentId={rabEditRecordId} onEditComponentHandled={clearRabEditRecord} readOnly={!canEdit} />
              : null}
          <footer className="page-footer"><span>PLN <span className="footer-separator">/</span> RAB &amp; Realisasi</span><span>Data tersimpan {connection === 'cloud' ? 'di Google Sheets' : 'di browser ini'}</span></footer>
        </div>
      </main>

      {authDialog && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAuthDialog('') }}><section className="modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <div className="modal-heading"><div><p className="eyebrow">{authDialog === 'setup' ? 'AKUN PERTAMA' : 'AKSES PENGGUNA'}</p><h2 id="auth-title">{authDialog === 'setup' ? 'Setup admin' : 'Login'}</h2><p>{authDialog === 'setup' ? 'Buat akun admin pertama untuk mengelola pengguna.' : 'Masuk untuk membuka data dan alur kerja.'}</p></div><button className="icon-button" aria-label="Tutup" onClick={() => setAuthDialog('')}><X size={19} /></button></div>
        <form onSubmit={submitAuth} data-auth-mode={authDialog}>
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
        <div className="modal-heading"><div><p className="eyebrow">IMPOR DATA</p><h2 id="import-title">Unggah workbook Excel</h2><p>Pilih file DATA APLIKASI.xlsx atau file dengan kolom rekap hingga AG.</p></div><button className="icon-button" aria-label="Tutup" onClick={() => setImportModal(false)}><X size={19} /></button></div>
        <button className={`upload-zone ${pendingImport ? 'has-file' : ''}`} onClick={() => fileInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); receiveFile(event.dataTransfer.files[0]) }}><input ref={fileInput} type="file" accept=".xlsx" hidden onChange={(event) => { receiveFile(event.target.files[0]); event.target.value = '' }} /><div className="upload-icon">{pendingImport ? <Check size={20} /> : <Upload size={20} />}</div><strong>{pendingImport ? pendingImport.fileName : 'Klik untuk memilih file'}</strong><span>{pendingImport ? `Sheet: ${pendingImport.sheetName}` : 'atau tarik file Excel ke area ini (.xlsx)'}</span></button>
        {importError && <div className="inline-error"><CircleAlert size={16} />{importError}</div>}
        {pendingImport && <div className="import-preview"><div><span>Data rekap/PRK</span><strong>{pendingImport.records.length} baris</strong></div><div><span>Sheet rekap</span><strong>{pendingImport.sheetName}</strong></div><div><span>Master material</span><strong>{pendingImport.materials?.length || 0} item</strong></div><div><span>Database kegiatan</span><strong>{pendingImport.activityCatalog?.length || 0} kegiatan</strong></div><p>Data material dan kegiatan dari workbook akan digabung dengan master manual yang sudah ada.</p></div>}
        <div className="modal-actions"><button className="button button-secondary" disabled={savePending || importSaving} onClick={() => setImportModal(false)}>Batal</button><button className="button button-primary" disabled={savePending || importSaving || !pendingImport?.records.length} onClick={confirmImport}>{savePending || importSaving ? <LoaderCircle className="toast-progress" size={16} /> : <ArrowUpFromLine size={16} />}<span>{savePending || importSaving ? 'Menyimpan...' : `Impor ${pendingImport ? `${pendingImport.records.length} data` : 'data'}`}</span></button></div>
      </section></div>}

      {editingRecord && canEdit && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingRecord(null) }}><section className="modal contract-modal" role="dialog" aria-modal="true" aria-labelledby="contract-title"><div className="modal-heading"><div><p className="eyebrow">INPUT DATA ANGGARAN</p><h2 id="contract-title">Edit data anggaran</h2><p className="modal-project-name">{editingRecord.description}</p></div><button className="icon-button" aria-label="Tutup" onClick={() => setEditingRecord(null)}><X size={19} /></button></div>
        <form onSubmit={saveRecord}><div className="record-edit-grid"><label className="field-label">Nomor kontrak<input name="contractNumber" defaultValue={editingRecord.contractNumber} placeholder="Masukkan nomor kontrak" /></label><label className="field-label">Vendor pemenang<input name="vendor" defaultValue={editingRecord.vendor} placeholder="Masukkan nama vendor pemenang" /></label><label className="field-label">Nilai kontrak aktual (Rp)<input name="contractValue" type="number" min="0" step="1" defaultValue={editingRecord.contractValue || ''} placeholder="0" /></label><label className="field-label">Tanggal awal<input name="startDate" type="date" defaultValue={formatDateInput(editingRecord.startDate)} /></label><label className="field-label">Tanggal akhir<input name="endDate" type="date" defaultValue={formatDateInput(editingRecord.endDate)} /></label><label className="field-label">Rencana kontrak<input name="plannedContract" type="date" defaultValue={formatDateInput(editingRecord.plannedContract)} /></label><label className="field-label">Rencana tagih<input name="plannedBilling" type="date" defaultValue={formatDateInput(editingRecord.plannedBilling)} /></label><label className="field-label">Nilai tagihan (Rp)<input name="billingAmount" type="number" min="0" step="1" defaultValue={plannedBillingAmount(editingRecord)} placeholder="0" /></label><label className="field-label">Progress<input name="progress" defaultValue={editingRecord.progress || ''} placeholder="Contoh: LUNAS" /></label><label className="field-label">Tambahan proyeksi tagih bulan ini (Rp)<input name="projectedBilling" type="number" min="0" step="1" defaultValue="" placeholder="0" /></label><label className="field-label">Tanggal bayar<input name="paymentDate" type="date" defaultValue={formatDateInput(editingRecord.paymentDate)} /></label></div><p className="form-note"><CircleAlert size={15} /> Nilai tagihan masuk ke kolom bulanan sesuai tanggal rencana tagih. Proyeksi bulan ini akan ditambahkan ke akumulasi proyeksi sebelumnya; kosongkan jika tidak ada tambahan.</p><div className="modal-actions"><button type="button" className="button button-secondary" disabled={savePending} onClick={() => setEditingRecord(null)}>Batal</button><button type="submit" className="button button-primary" disabled={savePending}>{savePending ? <><LoaderCircle className="toast-progress" size={16} />Menyimpan...</> : <><Check size={16} />Simpan data</>}</button></div></form>
      </section></div>}
      {notice && <div className="toast" role="status" aria-live="polite">{logoutPending || savePending || importSaving ? <LoaderCircle className="toast-progress" size={16} /> : notice.toLowerCase().includes('gagal') ? <CircleAlert size={16} /> : <Check size={16} />}{notice}</div>}
    </div>
  )
}

function ContractTable({ records, workflowCollections, onEdit, readOnly = false }) {
  const [prkNameSearch, setPrkNameSearch] = useState('')
  const [activitySearch, setActivitySearch] = useState('')
  const components = workflowCollections.components || []
  const activityCatalog = workflowCollections.activityCatalog || []
  const activityOptions = [...new Set([
    ...components.flatMap((component) => [
      component.workPackage,
      component.activity,
      activityCatalog.find((activity) =>
        String(activity.prk || '').trim() === String(component.prk || '').trim()
          && String(activity.name || '').trim().toLowerCase() === String(component.activity || '').trim().toLowerCase()
      )?.workPackage,
    ]),
    ...activityCatalog.flatMap((activity) => [activity.workPackage, activity.name]),
  ].map((value) => String(value || '').trim()).filter(Boolean))].sort()
  const filteredRecords = records.filter((record) =>
    String(record.description || '').toLowerCase().includes(prkNameSearch.trim().toLowerCase())
      && (!activitySearch.trim() || (() => {
        const matchingComponents = components.filter((component) =>
          String(component.programRecordId || '') === String(record.id)
            || (String(component.prk || '').trim() && String(component.prk || '').trim() === String(record.prk || '').trim())
        )
        const matchingActivityCatalog = activityCatalog.filter((activity) =>
          String(activity.prk || '').trim() === String(record.prk || '').trim()
        )
        const activityNames = [
          ...matchingComponents.flatMap((component) => [component.workPackage, component.activity]),
          ...matchingActivityCatalog.flatMap((activity) => [activity.workPackage, activity.name]),
        ]
        return activityNames.some((name) => String(name || '').toLowerCase().includes(activitySearch.trim().toLowerCase()))
      })())
  )

  return <section className="panel table-panel">
    <div className="table-heading"><div><p className="eyebrow">PAKET DENGAN ALOKASI PA</p><h2>Daftar data kontrak</h2></div><span className="row-count">{filteredRecords.length} dari {records.length} data</span></div>
    <div className="table-toolbar contract-table-filters">
      <label className="search-field contract-filter-field"><Search size={15} /><input type="search" list="contract-prk-names" value={prkNameSearch} onChange={(event) => setPrkNameSearch(event.target.value)} placeholder="Cari nama PRK..." aria-label="Filter nama PRK" /><datalist id="contract-prk-names">{[...new Set(records.map((record) => String(record.description || '').trim()).filter(Boolean))].sort().map((name) => <option key={name} value={name} />)}</datalist></label>
      <label className="search-field contract-filter-field"><Search size={15} /><input type="search" list="contract-activities" value={activitySearch} onChange={(event) => setActivitySearch(event.target.value)} placeholder="Cari kegiatan..." aria-label="Filter kegiatan" /><datalist id="contract-activities">{activityOptions.map((activity) => <option key={activity} value={activity} />)}</datalist></label>
    </div>
    <div className="table-scroll contract-register-scroll"><table><thead><tr><th>No. PRK / RAB</th><th>Uraian</th><th>Nilai PA</th><th>Nomor kontrak</th><th>Vendor pemenang</th><th>Nilai kontrak</th><th>Status</th><th><span className="sr-only">Aksi</span></th></tr></thead><tbody>
      {filteredRecords.length ? filteredRecords.map((record) => {
        const complete = hasContractNumber(record) && String(record.vendor ?? '').trim() && Number(record.contractValue) > 0
        return <tr key={record.id}><td>{record.prk || record.rabNumber || '-'}</td><td className="contract-register-description">{record.description || '-'}</td><td className="money-cell">{formatCurrency(record.paTotal)}</td><td className="contract-register-detail" title={record.contractNumber || undefined}>{record.contractNumber || '-'}</td><td className="contract-register-detail" title={record.vendor || undefined}>{record.vendor || '-'}</td><td className="money-cell">{formatCurrency(record.contractValue)}</td><td><span className={`contract-status ${complete ? 'is-complete' : ''}`}>{complete ? 'Lengkap' : 'Perlu dilengkapi'}</span></td><td>{!readOnly && <button className="row-action" aria-label={`Input kontrak ${record.prk || record.rabNumber || record.description}`} onClick={() => onEdit?.(record)}><Pencil size={15} /></button>}</td></tr>
      }) : <tr><td colSpan="8"><div className="empty-table"><FileText size={24} /><strong>{records.length ? 'Tidak ada data yang cocok' : 'Belum ada data PA atau kontrak'}</strong><span>{records.length ? 'Ubah filter PRK atau nama kegiatan.' : 'Data akan muncul setelah finalisasi ke PA atau impor data kontrak.'}</span></div></td></tr>}
    </tbody></table></div>
    <div className="table-summary"><span>Lengkapi nomor kontrak, vendor pemenang, dan nilai aktual.</span><span><span className="summary-dot" /> Data tersimpan pada rekap RAB</span></div>
  </section>
}

function ProjectTable({ records, onEdit, onViewAll, compact = false, readOnly = false, searchTerm = '', setSearchTerm, selectedYear, setSelectedYear, years = [], selectedProgram, setSelectedProgram, programs = [], selectedNotesCategory, setSelectedNotesCategory }) {
  const columns = compact ? DASHBOARD_COLUMNS : REKAP_COLUMNS
  return <section className={`panel table-panel ${compact ? 'dashboard-latest-panel' : ''}`}>
    <div className="table-heading"><div><p className="eyebrow">{compact ? 'DATA TERBARU' : 'DAFTAR RAB'}</p><h2>{compact ? 'Anggaran terbaru' : 'Seluruh data anggaran'}</h2></div>{compact ? <button className="text-action" onClick={onViewAll}>Lihat semua <span aria-hidden="true">-&gt;</span></button> : <span className="row-count">{records.length} data</span>}</div>
    {!compact && <div className="table-toolbar"><label className="search-field"><Search size={16} /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Cari PRK, RAB, uraian..." /></label><label className="select-wrap toolbar-select"><span className="sr-only">Filter tahun</span><select value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)}><option value="all">Semua tahun</option>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select><ChevronDown size={15} /></label><label className="select-wrap toolbar-select"><span className="sr-only">Filter program</span><select value={selectedProgram} onChange={(event) => setSelectedProgram(event.target.value)}><option value="all">Semua program</option>{programs.map((program) => <option key={program} value={program}>{program}</option>)}</select><ChevronDown size={15} /></label><label className="select-wrap toolbar-select"><span className="sr-only">Filter keterangan</span><select value={selectedNotesCategory} onChange={(event) => setSelectedNotesCategory(event.target.value)}><option value="all">Semua keterangan</option><option value="Murni">Murni</option><option value="Lanjutan">Lanjutan</option></select><ChevronDown size={15} /></label></div>}
    <div className={`table-scroll ${compact ? 'dashboard-latest-scroll' : 'all-rekap-scroll'}`}><table><thead><tr>{compact && <th>NO</th>}{columns.map(([header, key], index) => <th key={`${key}-${index}`}>{header}</th>)}{!compact && !readOnly && <th><span className="sr-only">Aksi</span></th>}</tr></thead><tbody>
      {records.length ? records.map((record, rowIndex) => <tr key={record.id}>{compact && <td className="row-number-cell">{rowIndex + 1}</td>}{columns.map(([, key], index) => {
        const value = record[key]
        const isDescription = key === 'description'
        const descriptionTitle = isDescription && value ? `${value}${record.position ? ` — Pos anggaran ${record.position}` : ''}` : undefined
        const cellTitle = key === 'contractNumber' || key === 'vendor' ? value || undefined : descriptionTitle
        const descriptionClass = isDescription ? (compact ? 'dashboard-description-cell' : 'all-rekap-description-cell') : ''
        return <td className={`${MONEY_COLUMNS.has(key) ? 'money-cell ' : ''}${descriptionClass}`} title={cellTitle} key={`${key}-${index}`}>{!readOnly && !compact && key === 'contractValue' ? <button className="contract-value" onClick={() => onEdit?.(record)} title="Edit data anggaran"><span>{formatCurrency(value)}</span><Pencil size={13} /></button> : value === null || value === undefined || value === '' ? '-' : MONEY_COLUMNS.has(key) ? formatCurrency(value) : DATE_COLUMNS.has(key) ? formatDateDisplay(value) : value}</td>
      })}{!compact && !readOnly && <td><button className="row-action" aria-label={`Edit data anggaran ${record.prk || record.rabNumber || record.description}`} onClick={() => onEdit?.(record)}><Pencil size={15} /></button></td>}</tr>) : <tr><td colSpan={columns.length + (compact ? 1 : readOnly ? 0 : 1)}><div className="empty-table"><FileSpreadsheet size={24} /><strong>Belum ada data yang cocok</strong><span>Ubah filter atau impor workbook Excel.</span></div></td></tr>}
    </tbody></table></div>
    <div className="table-summary"><span>Menampilkan {records.length} baris</span>{!compact && !readOnly && <span><span className="summary-dot" /> Data anggaran dapat diedit manual</span>}</div>
  </section>
}

function investmentPercent(value, denominator) {
  return denominator > 0 ? `${(value / denominator * 100).toFixed(2)}%` : '0.00%'
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(2)}%`
}

function formatReferencePercent(value, denominator, precision = 'rounded') {
  const result = denominator > 0 ? value / denominator * 100 : 0
  if (precision === 'one-decimal') return `${result.toFixed(1)}%`
  if (precision === 'exact') return `${result.toFixed(2)}%`
  return result > 0 && result < 1 ? `${result.toFixed(2)}%` : `${Math.round(result)}%`
}

function AuthenticatedInvestmentSummary({ summary }) {
  const { totals, categories, percentages } = summary
  const metrics = [
    ['Total RAB', 'rab', percentages.totals.rab, 'AI Total'],
    ['Total PA', 'pa', percentages.totals.pa, 'AI Total'],
    ['Total Kontrak', 'contract', percentages.totals.contract, 'AI Total'],
    ['Total Tagihan', 'billed', percentages.totals.billed, 'Total Kontrak'],
    ['Total Bayar', 'paid', percentages.totals.paid, 'Total Kontrak'],
    ['Sisa PRK', 'remainingPrk', percentages.totals.remainingPrk, 'AI Total'],
  ]

  return <section className="authenticated-investment-summary" aria-label="Ringkasan AI, RAB, PA, kontrak, tagihan, dan pembayaran">
    <article className="authenticated-ai-total">
      <span>AI TOTAL</span>
      <strong>{formatCurrency(totals.ai)}</strong>
      <div>
        <span>AI MURNI <b>{formatCurrency(categories.murni.ai)}</b><small>{formatPercent(percentages.ai.murni)} dari AI total</small></span>
        <span>AI LANJUTAN / LUNCURAN <b>{formatCurrency(categories.lanjutan.ai)}</b><small>{formatPercent(percentages.ai.lanjutan)} dari AI total</small></span>
      </div>
    </article>
    <div className="authenticated-total-grid" aria-label="Total anggaran">
      {metrics.map(([label, key, percent, denominator]) => <article key={key}>
        <span>{label}</span><strong>{formatCurrency(totals[key])}</strong>        <small>{formatPercent(percent)} dari {denominator}</small>
      </article>)}
    </div>
    <div className="authenticated-category-grid" aria-label="Rincian menurut anggaran">
      {[
        { key: 'murni', title: 'ANGGARAN MURNI' },
        { key: 'lanjutan', title: 'ANGGARAN LANJUTAN / LUNCURAN' },
      ].map(({ key, title }) => <article className={`authenticated-category-card authenticated-category-card--${key}`} key={key}>
        <h2>{title}</h2>
        <div className="authenticated-category-ai"><span>AI</span><strong>{formatCurrency(categories[key].ai)}</strong><small>{investmentPercent(percentages.ai[key], 100)} dari AI total</small></div>
        <div className="authenticated-category-metrics">
          {metrics.map(([label, metric]) => <div key={metric}>
            <span>{label}</span><strong>{formatCurrency(categories[key][metric])}</strong>
            <small>{investmentPercent(percentages.categories[key][metric], 100)} {metric === 'billed' || metric === 'paid' ? 'dari kontrak kategori' : metric === 'remainingPrk' ? 'dari AI kategori' : `dari AI ${key}`}</small>
          </div>)}
        </div>
      </article>)}
    </div>
  </section>
}

function PublicProgramCard({ card, selectedYear }) {
  const unpaid = Math.max(0, card.contract - card.paid)
  const continuation = card.category === 'Lanjutan'
  const paidColor = continuation ? '#4385ed' : '#e64b3f'
  const pieData = continuation
    ? [
      { name: 'Terbayar', value: Math.max(0, card.paid), color: paidColor },
      { name: 'Sisa', value: Math.max(0, card.remainingPrk), color: '#f0b33c' },
    ]
    : [
      { name: 'Kontrak', value: Math.max(0, card.contract), color: paidColor },
      { name: 'Sisa PRK', value: Math.max(0, card.remainingPrk), color: '#f0b33c' },
    ]
  const pieTotal = pieData.reduce((sum, item) => sum + item.value, 0)
  const metrics = continuation ? [
    { name: 'PA', value: card.pa, percent: formatReferencePercent(card.pa, card.pagu) },
    { name: 'KONTRAK', value: card.contract, percent: formatReferencePercent(card.contract, card.pagu) },
    { name: 'TERBAYAR', value: card.paid, percent: formatReferencePercent(card.paid, card.contract) },
    { name: 'SISA', value: card.remainingPrk, percent: formatReferencePercent(card.remainingPrk, card.pagu) },
  ] : [
    { name: 'RAB', value: card.rab, percent: formatReferencePercent(card.rab, card.pagu, 'exact') },
    { name: 'PA', value: card.pa, percent: formatReferencePercent(card.pa, card.pagu) },
    { name: 'KONTRAK', value: card.contract, percent: formatReferencePercent(card.contract, card.pagu) },
    { name: 'SISA PRK', value: card.remainingPrk, percent: formatReferencePercent(card.remainingPrk, card.pagu, 'exact') },
    { name: 'TERBAYAR', value: card.paid, percent: formatReferencePercent(card.paid, card.contract) },
    { name: 'BELUM TERBAYAR', value: unpaid, percent: formatReferencePercent(unpaid, card.contract) },
    { name: 'REN LUNCURAN', value: card.projectedBilling, percent: formatReferencePercent(card.projectedBilling, card.pagu, 'one-decimal') },
  ]

  return <article className={`public-program-card ${continuation ? 'public-program-card--continuation' : 'public-program-card--pure'}`}>
    <h2>{continuation ? card.title.replace('LANJUTAN', 'LUNCURAN') : card.title}</h2>
    <div className="public-program-total"><span>{selectedYear === 'all' ? 'Semua tahun' : selectedYear} · {card.count} paket</span><strong>{formatCurrency(card.pagu)}</strong></div>
    <div className={`public-program-body ${continuation ? 'is-continuation' : ''}`}>
      <div className="public-chart-column">
        <div className="public-chart-wrap">
          {pieTotal ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pieData} dataKey="value" nameKey="name" innerRadius={continuation ? 0 : '57%'} outerRadius="82%" paddingAngle={1} stroke="none">{pieData.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip formatter={(value, name) => [formatCurrency(value), name]} contentStyle={{ border: '1px solid #dce4ee', borderRadius: 4, fontSize: 10 }} /></PieChart></ResponsiveContainer> : <div className="public-chart-empty" />}
        </div>
        <div className="public-chart-legend" aria-label="Keterangan diagram">
          {continuation
            ? <>
              <span><i style={{ backgroundColor: paidColor }} />Terbayar <b>{formatReferencePercent(card.paid, card.contract)}</b></span>
              <span><i style={{ backgroundColor: '#f0b33c' }} />Sisa <b>{formatReferencePercent(card.remainingPrk, card.pagu, 'exact')}</b></span>
            </>
            : <>
              <span><i style={{ backgroundColor: paidColor }} />Kontrak <b>{formatReferencePercent(card.contract, card.pagu, 'exact')}</b></span>
              <span><i style={{ backgroundColor: '#f0b33c' }} />Sisa PRK <b>{formatReferencePercent(card.remainingPrk, card.pagu, 'exact')}</b></span>
            </>}
        </div>
      </div>
      <div className={`public-program-metrics ${continuation ? 'is-continuation' : ''}`}>
        {metrics.map((item) => <div key={item.name}><span>{item.name}</span><strong>{formatCurrency(item.value)}</strong><small>{item.percent}</small></div>)}
      </div>
    </div>
  </article>
}

function PublicDashboard({ rows, selectedYear, setSelectedYear, selectedProgram = 'all', setSelectedProgram, selectedNotesCategory = 'all', setSelectedNotesCategory, showLogin = false, showCharts = false, updatedAt, connection, loading, error, authStatus, authMessage, authBusy, onSubmitAuth, onOpenSetup }) {
  const dashboardPrograms = [...new Set(rows.map((row) => row.program).filter(Boolean))].sort()
  const programCode = (value) => String(value || '').match(/\b(DAL|EFI|SAR)\b/i)?.[1].toUpperCase() || ''
  const filteredRows = rows.filter((row) =>
    (selectedYear === 'all' || String(row.year) === selectedYear)
      && (selectedProgram === 'all' || row.program === selectedProgram)
      && (selectedNotesCategory === 'all' || getNotesCategory(row) === selectedNotesCategory)
  )
  const chartRows = filteredRows
  const programCards = [
    { code: 'SAR', category: 'Lanjutan', title: 'SAR LANJUTAN', chartType: 'pie' },
    { code: 'DAL', category: 'Lanjutan', title: 'DAL LANJUTAN', chartType: 'pie' },
    { code: 'EFI', category: 'Lanjutan', title: 'EFI LANJUTAN', chartType: 'pie' },
    { code: 'SAR', category: 'Murni', title: 'SAR MURNI', chartType: 'donut' },
    { code: 'DAL', category: 'Murni', title: 'DAL MURNI', chartType: 'donut' },
    { code: 'EFI', category: 'Murni', title: 'EFI MURNI', chartType: 'donut' },
  ].map((card) => {
    const matchingRows = chartRows.filter((row) => programCode(row.program) === card.code && getNotesCategory(row) === card.category)
    const summary = summarizePublicDashboard(matchingRows).totals
    return {
      ...card,
      count: summary.count,
      pagu: summary.ai,
      rab: summary.rab,
      pa: summary.pa,
      contract: summary.contract,
      billed: summary.billed,
      paid: summary.paid,
      remainingPrk: summary.remainingPrk,
      projectedBilling: summary.projectedBilling,
    }
  })
  const visibleProgramCards = programCards.filter((card) => card.count > 0)
  const pureCards = visibleProgramCards.filter((card) => card.category === 'Murni')
  const continuationCards = visibleProgramCards.filter((card) => card.category === 'Lanjutan')
  const boardLayout = pureCards.length && continuationCards.length
    ? ''
    : pureCards.length ? 'public-board-layout--only-pure'
      : continuationCards.length ? 'public-board-layout--only-continuation' : 'public-board-layout--empty'
  const summary = summarizePublicDashboard(filteredRows)
  const { totals, categories, percentages } = summary
  const latestYear = [...new Set(rows.map((row) => String(row.year || '')).filter(Boolean))].sort().at(-1)
  const titleYear = selectedYear === 'all' ? latestYear || new Date().getFullYear() : selectedYear
  const updatedLabel = updatedAt ? new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(updatedAt)) : '--:--'

  return <div className="public-dashboard">
    {showLogin && <>
    <section className="pln-welcome" style={{ backgroundImage: `linear-gradient(105deg, rgba(5, 35, 76, .91) 0%, rgba(5, 66, 119, .8) 56%, rgba(4, 62, 112, .62) 100%), url("${loginBackground}")` }} aria-label="Login PLN UP3 Bali Utara">
      <svg className="pln-network-lines" viewBox="0 0 900 420" aria-hidden="true">
        <path d="M15 312 128 241l105 30 97-116 116 63 102-112 110 44 105-105" />
        <path d="m83 380 150-109 97 36 116-89 102 8 110-76 115 15" />
        <path d="m230 271 30-146 70 30m116 33 30-118 72 20m110 24 21-104" />
        <g><circle cx="128" cy="241" r="5" /><circle cx="233" cy="271" r="5" /><circle cx="330" cy="155" r="5" /><circle cx="446" cy="218" r="5" /><circle cx="548" cy="106" r="5" /><circle cx="658" cy="150" r="5" /><circle cx="763" cy="45" r="5" /><circle cx="330" cy="307" r="5" /><circle cx="446" cy="218" r="5" /><circle cx="548" cy="226" r="5" /><circle cx="658" cy="150" r="5" /></g>
      </svg>
      <div className="pln-welcome-copy">
        <div className="pln-brand-logos" aria-label="PLN dan Danantara Indonesia">
          <span className="pln-logo-tile"><img src={plnLogo} alt="Logo PLN" /></span>
          <span className="danantara-logo-tile"><img src={danantaraLogo} alt="Danantara Indonesia" /></span>
        </div>
        <p className="pln-welcome-eyebrow"><Zap size={13} fill="currentColor" /> PLN UP3 BALI UTARA</p>
        <h2>Energi yang menghubungkan,<br />pelayanan yang menguatkan.</h2>
        <p className="pln-welcome-motto">Menerangi Bali Utara, melayani dengan sepenuh hati.</p>
        <div className="pln-welcome-signature">
          <img src={plnOfficer} alt="Petugas PLN siap melayani" />
          <div><strong>Siap melayani dengan sepenuh hati</strong><span>Monitoring RAB &amp; Realisasi</span></div>
        </div>
      </div>
      <div className="pln-login-panel">
        <span className="pln-login-icon"><LockKeyhole size={17} /></span>
        <p className="pln-login-eyebrow">PORTAL INTERNAL</p>
        <h3>Selamat datang</h3>
        <p className="pln-login-description">Masuk untuk mengakses data dan alur kerja.</p>
        <form className="pln-login-form" onSubmit={onSubmitAuth} data-auth-mode="login">
          <label className="field-label">Username<input id="public-login-username" name="username" required autoComplete="username" placeholder="Masukkan username" /></label>
          <label className="field-label">Kata sandi<input name="password" type="password" required minLength="12" autoComplete="current-password" placeholder="Masukkan kata sandi" /></label>
          {authMessage && <div className="inline-error" role="alert"><CircleAlert size={16} />{authMessage}</div>}
          <button type="submit" className="pln-login-submit" disabled={authBusy}><LogIn size={16} />{authBusy ? 'Memproses...' : 'Login ke dashboard'}<ArrowUpRight size={16} /></button>
        </form>
        {authStatus?.setupRequired && <button type="button" className="pln-setup-link" onClick={onOpenSetup}>Belum ada akun? Setup admin</button>}
        <div className="pln-login-footnote"><ShieldCheck size={13} /> Akses aman untuk petugas berwenang</div>
      </div>
      <a className="pln-call-center" href="tel:123" aria-label="Hubungi Call Center PLN 123">
        <img src={contactCenterLogo} alt="" />
        <span><small>CALL CENTER PLN</small><strong>123</strong></span>
        <PhoneCall size={17} />
      </a>
    </section>

    <section className="pln-location-card" aria-label="Lokasi PLN UP3 Bali Utara">
      <div className="pln-location-copy">
        <span className="pln-location-icon"><MapPin size={18} /></span>
        <div><p className="eyebrow">KUNJUNGI KAMI</p><h2>PLN UP3 Bali Utara</h2>
          <address>Jl. Udayana No. 27, Banyuasri, Kec. Buleleng,<br />Kabupaten Buleleng, Bali 81114</address>
          <a className="pln-contact-link" href="tel:+6236221071"><PhoneCall size={13} />(0362) 21071</a>
          <a className="pln-directions-link" href="https://www.google.com/maps/dir/?api=1&destination=-8.117583518860247%2C115.08546023442764" target="_blank" rel="noreferrer"><MapPin size={14} /> Lihat petunjuk arah <ArrowUpRight size={14} /></a>
        </div>
      </div>
      <iframe className="pln-location-map" title="Peta lokasi PLN UP3 Bali Utara" loading="lazy" src="https://www.google.com/maps?q=-8.117583518860247,115.08546023442764&z=17&output=embed" referrerPolicy="no-referrer-when-downgrade" />
    </section>
    </>}

    {showCharts && <>
    <section className="public-dashboard-heading">
      <div className="public-dashboard-title">
        <p className="eyebrow">RINGKASAN ANGGARAN INVESTASI <span className="investment-sync-label">· SINKRON DARI RABDATA</span></p>
        <h1>DASHBOARD AI {titleYear}</h1>
        <p>Ringkasan AI, RAB, PA, kontrak, tagihan, dan pembayaran.</p>
      </div>
      <div className="public-dashboard-controls">
        {setSelectedProgram && setSelectedNotesCategory && setSelectedYear && <div className="filter-pair">
          <label className="select-wrap"><span className="sr-only">Filter tahun</span><select value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)}><option value="all">Semua tahun</option>{YEAR_OPTIONS.map((year) => <option key={year} value={year}>{year}</option>)}</select><ChevronDown size={15} /></label>
          <label className="select-wrap"><span className="sr-only">Filter program</span><select value={selectedProgram} onChange={(event) => setSelectedProgram(event.target.value)}><option value="all">Semua program</option>{dashboardPrograms.map((program) => <option key={program} value={program}>{program}</option>)}</select><ChevronDown size={15} /></label>
          <label className="select-wrap"><span className="sr-only">Filter keterangan</span><select value={selectedNotesCategory} onChange={(event) => setSelectedNotesCategory(event.target.value)}><option value="all">Semua keterangan</option><option value="Murni">Murni</option><option value="Lanjutan">Lanjutan</option></select><ChevronDown size={15} /></label>
        </div>}
        <span className={`public-live-status ${connection === 'cloud' ? 'is-live' : ''}`}><i />{loading ? rows.length ? 'Data tersimpan · memuat pembaruan...' : 'Memuat data dashboard...' : error ? rows.length ? 'Koneksi lambat · menampilkan data tersimpan' : 'Data dashboard belum tersinkron' : connection === 'cloud' ? `Diperbarui ${updatedLabel} · sinkron dari RABData` : 'Sinkron dari data RABData'}</span>
      </div>
    </section>

    <div className="public-board-scroll">
    <section className={`public-board-layout ${boardLayout}`} aria-label="Ringkasan per program">
      <aside className="public-annual-summary">
        <div className="public-annual-heading">SKKI BARA {titleYear}</div>
        <div className="public-overall-ai"><span>AI TOTAL</span><strong>{formatCurrency(totals.ai)}</strong></div>
        <div className="public-overall-categories">
          <div><span>MURNI</span><strong>{formatCurrency(categories.murni.ai)}</strong><small>{formatPercent(percentages.ai.murni)}</small></div>
          <div><span>LANJUTAN</span><strong>{formatCurrency(categories.lanjutan.ai)}</strong><small>{formatPercent(percentages.ai.lanjutan)}</small></div>
        </div>
        <div className="public-annual-pair"><span>KONTRAK MURNI<strong>{formatCurrency(categories.murni.contract)}</strong><small>{formatReferencePercent(categories.murni.contract, categories.murni.ai, 'exact')}</small></span><span>KONTRAK LAN<strong>{formatCurrency(categories.lanjutan.contract)}</strong><small>{formatReferencePercent(categories.lanjutan.contract, categories.lanjutan.ai, 'exact')}</small></span></div>
        <div className="public-annual-pair"><span>PA MURNI<strong>{formatCurrency(categories.murni.pa)}</strong><small>{formatReferencePercent(categories.murni.pa, categories.murni.ai, 'exact')}</small></span><span>PA LANJUTAN<strong>{formatCurrency(categories.lanjutan.pa)}</strong><small>{formatReferencePercent(categories.lanjutan.pa, categories.lanjutan.ai, 'exact')}</small></span></div>
        <div className="public-annual-pair"><span>SISA MURNI<strong>{formatCurrency(categories.murni.remainingPrk)}</strong><small>{formatReferencePercent(categories.murni.remainingPrk, categories.murni.ai, 'exact')}</small></span><span>SISA LANJUTAN<strong>{formatCurrency(categories.lanjutan.remainingPrk)}</strong><small>{formatReferencePercent(categories.lanjutan.remainingPrk, categories.lanjutan.ai, 'exact')}</small></span></div>
      </aside>
      {pureCards.length > 0 && <div className="public-program-column public-program-column--pure" aria-label="Program murni">
        {pureCards.map((card) => <PublicProgramCard key={card.title} card={card} selectedYear={selectedYear} />)}
      </div>}
      {continuationCards.length > 0 && <div className="public-program-column public-program-column--continuation" aria-label="Program lanjutan">
        {continuationCards.map((card) => <PublicProgramCard key={card.title} card={card} selectedYear={selectedYear} />)}
      </div>}

    </section>
    </div>
    </>}

  </div>
}

function UserManagement() {
  const emptyUser = { id: '', username: '', name: '', role: 'planner', password: '', active: true }
  const [users, setUsers] = useState([])
  const [form, setForm] = useState(emptyUser)
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [updatingUserId, setUpdatingUserId] = useState('')
  const savingRef = useRef(false)

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
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setNotice('Menyimpan data pengguna...')
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
      savingRef.current = false
      setSaving(false)
    }
  }

  async function toggleActive(user) {
    if (savingRef.current) return
    savingRef.current = true
    setUpdatingUserId(user.id)
    setNotice('Menyimpan perubahan status pengguna...')
    try {
      const response = await apiPost({ action: 'saveUser', user: { ...user, password: '', active: !user.active } })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || 'Status pengguna gagal diubah.')
      await reloadUsers()
      setNotice('Status pengguna berhasil diperbarui.')
    } catch (error) {
      setNotice(error.message)
    } finally {
      savingRef.current = false
      setUpdatingUserId('')
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
          <div className="user-form-actions"><button type="submit" className="button button-primary" disabled={saving || Boolean(updatingUserId)}>{saving ? <><LoaderCircle className="toast-progress" size={15} />Menyimpan...</> : form.id ? 'Simpan perubahan' : 'Buat akun'}</button>{form.id && <button type="button" className="button button-secondary" disabled={saving || Boolean(updatingUserId)} onClick={() => setForm(emptyUser)}>Batal</button>}</div>
        </form>
      </section>
      <section className="panel table-panel user-list-panel"><div className="table-heading"><div><p className="eyebrow">AKUN TERDAFTAR</p><h2>Pengguna</h2></div><span className="row-count">{users.length} akun</span></div>
        <div className="table-scroll"><table><thead><tr><th>Nama</th><th>Username</th><th>Peran</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
          {users.map((user) => <tr key={user.id}><td>{user.name}</td><td>{user.username}</td><td>{{ admin: 'Admin', planner: 'Tim Perencanaan', viewer: 'Viewer' }[user.role]}</td><td>{user.active ? 'Aktif' : 'Nonaktif'}</td><td><div className="user-row-actions"><button className="workflow-edit" aria-label={`Edit ${user.username}`} disabled={saving || Boolean(updatingUserId)} onClick={() => setForm({ ...user, password: '' })}><Pencil size={14} /></button><button className="button button-secondary user-status-button" disabled={saving || Boolean(updatingUserId)} onClick={() => toggleActive(user)}>{updatingUserId === user.id ? <><LoaderCircle className="toast-progress" size={12} />Menyimpan...</> : user.active ? 'Nonaktifkan' : 'Aktifkan'}</button></div></td></tr>)}
          {!users.length && <tr><td colSpan="5">Belum ada akun.</td></tr>}
        </tbody></table></div>
      </section>
    </div>
    {notice && <div className="user-management-notice" role="status">{(saving || updatingUserId) && <LoaderCircle className="toast-progress" size={13} />}{notice}</div>}
  </div>
}

export default App
