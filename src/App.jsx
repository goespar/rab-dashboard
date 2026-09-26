import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownToLine, ArrowUpFromLine, BarChart3, Check, ChevronDown, CircleAlert,
  Cloud, FileSpreadsheet, FolderKanban, LayoutDashboard, Menu, Pencil, Plus,
  Search, Settings2, ShieldCheck, Upload, X,
} from 'lucide-react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { exportWorkbook, formatCurrency, importWorkbook, sampleRecords } from './lib/workbook.js'
import './App.css'

const STORAGE_KEY = 'rab-monitor-records-v1'

function App() {
  const [records, setRecords] = useState(() => {
    try {
      const cached = window.localStorage.getItem(STORAGE_KEY)
      return cached ? JSON.parse(cached) : sampleRecords
    } catch {
      return sampleRecords
    }
  })
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
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const fileInput = useRef(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/apps-script?action=load')
      .then((response) => response.json())
      .then((result) => {
        if (cancelled || !result.ok) return
        if (Array.isArray(result.records) && result.records.length) {
          setRecords(result.records)
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(result.records))
        }
        setConnection('cloud')
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

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
  const filteredRecords = useMemo(() => dashboardRecords.filter((record) => {
    const matchesSearch = `${record.prk} ${record.rabNumber} ${record.description} ${record.vendor}`.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesSearch
  }), [dashboardRecords, searchTerm])
  const totals = useMemo(() => dashboardRecords.reduce((sum, record) => ({
    prk: sum.prk + Number(record.totalFinal || record.totalPrk || 0),
    rab: sum.rab + Number(record.rabTotal || 0),
    contract: sum.contract + Number(record.contractValue || 0),
    paid: sum.paid + Number(record.paid || 0),
    billed: sum.billed + Number(record.billed || 0),
  }), { prk: 0, rab: 0, contract: 0, paid: 0, billed: 0 }), [dashboardRecords])
  const chartData = useMemo(() => {
    const groups = dashboardRecords.reduce((result, record) => {
      const key = record.program || 'Program lain'
      result[key] ??= { program: key, pagu: 0, kontrak: 0 }
      result[key].pagu += Number(record.rabTotal || record.totalFinal || record.totalPrk || 0)
      result[key].kontrak += Number(record.contractValue || 0)
      return result
    }, {})
    return Object.values(groups).sort((a, b) => b.pagu - a.pagu).slice(0, 5)
  }, [dashboardRecords])

  async function saveRecords(nextRecords, successMessage) {
    setRecords(nextRecords)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRecords))
    try {
      const response = await fetch('/api/apps-script', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'save', records: nextRecords }),
      })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || 'Penyimpanan cloud gagal.')
      setConnection('cloud')
      setNotice(`${successMessage} Tersimpan di Google Sheets.`)
    } catch {
      setConnection('local')
      setNotice(`${successMessage} Tersimpan di browser ini.`)
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

  const pageTitle = activeView === 'overview' ? 'Ringkasan RAB' : 'Data Anggaran'

  return (
    <div className="app-shell min-h-screen">
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><BarChart3 size={20} strokeWidth={2.4} /></div>
          <div><strong>RAB Monitor</strong><span>PLANNING OFFICE</span></div>
          <button className="icon-button sidebar-close" aria-label="Tutup menu" onClick={() => setSidebarOpen(false)}><X size={18} /></button>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Navigasi utama">
          <button className={activeView === 'overview' ? 'nav-item active' : 'nav-item'} onClick={() => { setActiveView('overview'); setSidebarOpen(false) }}><LayoutDashboard size={18} /><span>Ringkasan</span></button>
          <button className={activeView === 'data' ? 'nav-item active' : 'nav-item'} onClick={() => { setActiveView('data'); setSidebarOpen(false) }}><FolderKanban size={18} /><span>Data anggaran</span><span className="nav-count">{records.length}</span></button>
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-note"><div className="note-icon"><ShieldCheck size={16} /></div><div><strong>Rekap internal</strong><span>Di luar proses tender & kontrak</span></div></div>
        <div className="profile-row"><div className="profile-avatar">RB</div><div className="profile-copy"><strong>Pengelola RAB</strong><span>Unit kerja</span></div><Settings2 size={17} className="profile-settings" /></div>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" aria-label="Tutup menu" onClick={() => setSidebarOpen(false)} />}

      <main className="main-content">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Buka menu" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <div className="breadcrumb"><span>Rencana anggaran</span><span className="breadcrumb-slash">/</span><strong>{pageTitle}</strong></div>
          <div className="topbar-actions">
            <div className={`sync-status ${connection === 'cloud' ? 'is-cloud' : ''}`} title={connection === 'cloud' ? 'Google Sheets tersambung' : 'Penyimpanan browser'}>{connection === 'cloud' ? <Cloud size={15} /> : <CircleAlert size={15} />}<span>{connection === 'cloud' ? 'Google Sheets' : 'Lokal'}</span></div>
            <button className="button button-secondary export-button" onClick={downloadWorkbook}><ArrowDownToLine size={16} /><span>Ekspor</span></button>
            <button className="button button-primary" onClick={() => { setImportModal(true); setImportError(''); setPendingImport(null) }}><Plus size={17} /><span>Impor Excel</span></button>
          </div>
        </header>

        <div className="page-content">
          {activeView === 'overview' ? <>
            <section className="page-heading"><div><p className="eyebrow">MONITORING PORTOFOLIO</p><h1>Ringkasan RAB</h1><p className="heading-subtitle">Pantau pagu, rencana anggaran, dan realisasi per program.</p></div>
              <div className="filter-pair"><label className="select-wrap"><span className="sr-only">Filter tahun</span><select value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)}><option value="all">Semua tahun</option>{years.map((year) => <option key={year} value={String(year)}>{year}</option>)}</select><ChevronDown size={15} /></label><label className="select-wrap"><span className="sr-only">Filter program</span><select value={selectedProgram} onChange={(event) => setSelectedProgram(event.target.value)}><option value="all">Semua program</option>{programs.map((program) => <option key={program} value={program}>{program}</option>)}</select><ChevronDown size={15} /></label></div>
            </section>

            <section className="metric-grid" aria-label="Indikator utama">
              <article className="metric-card metric-primary"><div className="metric-top"><span>Pagu PRK final</span><span className="metric-icon"><BarChart3 size={17} /></span></div><strong>{formatCurrency(totals.prk)}</strong><div className="metric-foot"><span className="metric-dot lime-dot" />Dari {dashboardRecords.length} data anggaran</div></article>
              <article className="metric-card"><div className="metric-top"><span>Total RAB</span><span className="metric-icon pale-icon"><FileSpreadsheet size={17} /></span></div><strong>{formatCurrency(totals.rab)}</strong><div className="metric-foot">Akumulasi nilai RAB</div></article>
              <article className="metric-card"><div className="metric-top"><span>Nilai kontrak</span><span className="metric-icon orange-icon"><FolderKanban size={17} /></span></div><strong>{formatCurrency(totals.contract)}</strong><div className="metric-foot">Nilai yang dicatat manual</div></article>
              <article className="metric-card"><div className="metric-top"><span>Total dibayar</span><span className="metric-icon mint-icon"><Check size={17} /></span></div><strong>{formatCurrency(totals.paid)}</strong><div className="metric-foot">Tagihan tercatat {formatCurrency(totals.billed)}</div></article>
            </section>

            <section className="analytics-grid">
              <article className="panel chart-panel"><div className="panel-heading"><div><p className="eyebrow">ALOKASI ANGGARAN</p><h2>Pagu dan nilai kontrak</h2></div><div className="legend"><span><i className="legend-swatch pagu-swatch" />Pagu</span><span><i className="legend-swatch contract-swatch" />Kontrak</span></div></div>
                <div className="chart-frame">{chartData.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}><XAxis dataKey="program" axisLine={false} tickLine={false} tick={{ fill: '#778076', fontSize: 11 }} tickFormatter={(value) => value.length > 12 ? `${value.slice(0, 12)}...` : value} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#899088', fontSize: 10 }} tickFormatter={(value) => value >= 1000000000 ? `${(value / 1000000000).toFixed(1)} M` : `${Math.round(value / 1000000)} jt`} width={55} /><Tooltip formatter={(value) => formatCurrency(value)} cursor={{ fill: '#f4f6f0' }} contentStyle={{ border: '1px solid #e4e8e0', borderRadius: 5, fontSize: 12 }} /><Bar dataKey="pagu" name="Pagu" fill="#315f49" radius={[3, 3, 0, 0]} maxBarSize={30} /><Bar dataKey="kontrak" name="Kontrak" fill="#dceba7" radius={[3, 3, 0, 0]} maxBarSize={30} /></BarChart></ResponsiveContainer> : <div className="empty-chart">Belum ada data anggaran untuk ditampilkan.</div>}</div>
                <div className="chart-caption"><span>Menampilkan hingga 5 kelompok program.</span><span className="chart-period"><span className="period-dot" /> Data aktif</span></div>
              </article>
              <article className="panel status-panel"><div className="panel-heading"><div><p className="eyebrow">KELENGKAPAN DATA</p><h2>Kontrol administrasi</h2></div><span className="status-icon"><ShieldCheck size={17} /></span></div>
                <div className="status-total"><strong>{dashboardRecords.length}</strong><span>data dalam rekap</span></div>
                <div className="status-line"><div className="status-label"><span>Nilai kontrak terisi</span><strong>{dashboardRecords.filter((record) => record.contractValue > 0).length}</strong></div><div className="progress-track"><span style={{ width: `${dashboardRecords.length ? dashboardRecords.filter((record) => record.contractValue > 0).length / dashboardRecords.length * 100 : 0}%` }} /></div></div>
                <div className="status-line"><div className="status-label"><span>Nomor kontrak terisi</span><strong>{dashboardRecords.filter((record) => record.contractNumber).length}</strong></div><div className="progress-track progress-orange"><span style={{ width: `${dashboardRecords.length ? dashboardRecords.filter((record) => record.contractNumber).length / dashboardRecords.length * 100 : 0}%` }} /></div></div>
                <button className="text-action" onClick={() => setActiveView('data')}>Tinjau data anggaran <span aria-hidden="true">-&gt;</span></button>
              </article>
            </section>
            <ProjectTable records={filteredRecords.slice(0, 6)} onEdit={setEditingRecord} onViewAll={() => setActiveView('data')} compact />
          </> : <>
            <section className="page-heading data-heading"><div><p className="eyebrow">PORTOFOLIO ANGGARAN</p><h1>Data anggaran</h1><p className="heading-subtitle">Kelola rekap RAB dan lengkapi nilai kontrak secara manual.</p></div><button className="button button-primary" onClick={() => { setImportModal(true); setImportError(''); setPendingImport(null) }}><Upload size={16} /><span>Impor data</span></button></section>
            <ProjectTable records={filteredRecords} onEdit={setEditingRecord} onViewAll={() => setActiveView('data')} searchTerm={searchTerm} setSearchTerm={setSearchTerm} selectedYear={selectedYear} setSelectedYear={setSelectedYear} years={years} selectedProgram={selectedProgram} setSelectedProgram={setSelectedProgram} programs={programs} />
            <div className="table-footnote"><ShieldCheck size={14} /> Aplikasi ini untuk rekap dan monitoring. Proses tender dan kontrak dilakukan di luar aplikasi.</div>
          </>}
          <footer className="page-footer"><span>RAB Monitor <span className="footer-separator">/</span> Rekap anggaran</span><span>Data tersimpan {connection === 'cloud' ? 'di Google Sheets' : 'di browser ini'}</span></footer>
        </div>
      </main>

      {importModal && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setImportModal(false) }}><section className="modal import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <div className="modal-heading"><div><p className="eyebrow">IMPOR DATA</p><h2 id="import-title">Unggah workbook Excel</h2><p>Pilih file DATA APLIKASI.xlsx atau file dengan kolom rekap A-Z.</p></div><button className="icon-button" aria-label="Tutup" onClick={() => setImportModal(false)}><X size={19} /></button></div>
        <button className={`upload-zone ${pendingImport ? 'has-file' : ''}`} onClick={() => fileInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); receiveFile(event.dataTransfer.files[0]) }}><input ref={fileInput} type="file" accept=".xlsx" hidden onChange={(event) => { receiveFile(event.target.files[0]); event.target.value = '' }} /><div className="upload-icon">{pendingImport ? <Check size={20} /> : <Upload size={20} />}</div><strong>{pendingImport ? pendingImport.fileName : 'Klik untuk memilih file'}</strong><span>{pendingImport ? `Sheet: ${pendingImport.sheetName}` : 'atau tarik file Excel ke area ini (.xlsx)'}</span></button>
        {importError && <div className="inline-error"><CircleAlert size={16} />{importError}</div>}
        {pendingImport && <div className="import-preview"><div><span>Baris terbaca</span><strong>{pendingImport.records.length}</strong></div><div><span>Sheet sumber</span><strong>{pendingImport.sheetName}</strong></div><p>Kolom kontrak tetap dapat diperbarui manual setelah data diimpor.</p></div>}
        <div className="modal-actions"><button className="button button-secondary" onClick={() => setImportModal(false)}>Batal</button><button className="button button-primary" disabled={!pendingImport?.records.length} onClick={confirmImport}><ArrowUpFromLine size={16} /><span>Impor {pendingImport ? `${pendingImport.records.length} data` : 'data'}</span></button></div>
      </section></div>}

      {editingRecord && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingRecord(null) }}><section className="modal contract-modal" role="dialog" aria-modal="true" aria-labelledby="contract-title"><div className="modal-heading"><div><p className="eyebrow">INPUT MANUAL</p><h2 id="contract-title">Lengkapi data kontrak</h2><p className="modal-project-name">{editingRecord.description}</p></div><button className="icon-button" aria-label="Tutup" onClick={() => setEditingRecord(null)}><X size={19} /></button></div>
        <form onSubmit={saveContract}><label className="field-label">Nomor kontrak<input name="contractNumber" defaultValue={editingRecord.contractNumber} placeholder="Masukkan nomor kontrak" /></label><label className="field-label">Vendor<input name="vendor" defaultValue={editingRecord.vendor} placeholder="Masukkan nama vendor" /></label><label className="field-label">Nilai kontrak (Rp)<input name="contractValue" type="number" min="0" step="1" defaultValue={editingRecord.contractValue || ''} placeholder="0" /></label><p className="form-note"><CircleAlert size={15} /> Input ini hanya untuk pencatatan rekap, bukan penerbitan kontrak.</p><div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setEditingRecord(null)}>Batal</button><button type="submit" className="button button-primary"><Check size={16} />Simpan data</button></div></form>
      </section></div>}
      {notice && <div className="toast" role="status"><Check size={16} />{notice}</div>}
    </div>
  )
}

function ProjectTable({ records, onEdit, onViewAll, compact = false, searchTerm = '', setSearchTerm, selectedYear, setSelectedYear, years = [], selectedProgram, setSelectedProgram, programs = [] }) {
  return <section className="panel table-panel">
    <div className="table-heading"><div><p className="eyebrow">{compact ? 'DATA TERBARU' : 'DAFTAR RAB'}</p><h2>{compact ? 'Anggaran terbaru' : 'Seluruh data anggaran'}</h2></div>{compact ? <button className="text-action" onClick={onViewAll}>Lihat semua <span aria-hidden="true">-&gt;</span></button> : <span className="row-count">{records.length} data</span>}</div>
    {!compact && <div className="table-toolbar"><label className="search-field"><Search size={16} /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Cari PRK, RAB, uraian..." /></label><label className="select-wrap toolbar-select"><span className="sr-only">Filter tahun</span><select value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)}><option value="all">Semua tahun</option>{years.map((year) => <option key={year} value={String(year)}>{year}</option>)}</select><ChevronDown size={15} /></label><label className="select-wrap toolbar-select"><span className="sr-only">Filter program</span><select value={selectedProgram} onChange={(event) => setSelectedProgram(event.target.value)}><option value="all">Semua program</option>{programs.map((program) => <option key={program} value={program}>{program}</option>)}</select><ChevronDown size={15} /></label></div>}
    <div className="table-scroll"><table><thead><tr><th>NO. PRK / RAB</th><th>URAIAN PEKERJAAN</th><th>PROGRAM</th><th>PAGU PRK</th><th>RAB</th><th>NILAI KONTRAK</th><th>TAHUN</th><th><span className="sr-only">Aksi</span></th></tr></thead><tbody>
      {records.length ? records.map((record) => <tr key={record.id}><td><div className="prk-cell"><span className="prk-chip">{(record.program || 'RAB').slice(0, 3)}</span><div><strong>{record.prk || record.rabNumber || record.paNumber || '-'}</strong><span>{record.prkFix || record.rabNumber || 'Nomor PRK belum diisi'}</span></div></div></td><td><div className="description-cell"><strong>{record.description || 'Uraian belum tersedia'}</strong><span>{record.position ? `Pos anggaran ${record.position}` : record.budgetPosition || 'Rekap anggaran'}</span></div></td><td><span className="program-tag">{record.program || 'Lainnya'}</span></td><td className="money-cell">{formatCurrency(record.totalFinal || record.totalPrk)}</td><td className="money-cell">{formatCurrency(record.rabTotal)}</td><td><button className="contract-value" onClick={() => onEdit(record)} title="Edit nilai kontrak"><span>{formatCurrency(record.contractValue)}</span><Pencil size={13} /></button></td><td className="year-cell">{record.year || '-'}</td><td><button className="row-action" aria-label={`Edit kontrak ${record.prk || record.rabNumber || record.description}`} onClick={() => onEdit(record)}><Pencil size={15} /></button></td></tr>) : <tr><td colSpan="8"><div className="empty-table"><FileSpreadsheet size={24} /><strong>Belum ada data yang cocok</strong><span>Ubah filter atau impor workbook Excel.</span></div></td></tr>}
    </tbody></table></div>
    <div className="table-summary"><span>Menampilkan {records.length} baris</span><span><span className="summary-dot" /> Nilai kontrak dapat diedit manual</span></div>
  </section>
}

export default App
