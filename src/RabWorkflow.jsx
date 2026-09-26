import { useEffect, useMemo, useState } from 'react'
import { Activity, Boxes, Check, ClipboardList, Pencil, Plus, Save, Search, Trash2, Wrench, X } from 'lucide-react'
import { formatCurrency } from './lib/workbook.js'
import './workflow.css'

const VIEW_META = {
  materials: { title: 'Input Material', description: 'Master material dan harga yang menjadi sumber komponen RAB.', icon: Boxes, collection: 'materials' },
  components: { title: 'Input RAB Komponen', description: 'Susun kebutuhan material dan jasa per kegiatan, dipisah TM dan TR.', icon: Wrench, collection: 'components' },
  activities: { title: 'Input RAB Kegiatan', description: 'Hitung RAB kegiatan berdasarkan volume dan komponen pekerjaan.', icon: ClipboardList, collection: 'activities' },
  materialRecap: { title: 'Rekap Material', description: 'Bandingkan kebutuhan material dari RAB dengan pemakaian aktual.', icon: Boxes, collection: 'materialRecap' },
  realizations: { title: 'Realisasi', description: 'Catat progres volume, tagihan, dan pembayaran kegiatan.', icon: Activity, collection: 'realizations' },
}

const EMPTY_FORM = {
  materials: { code: '', name: '', unit: '', criteria: 'TR', materialPrice: '', installPrice: '', removalPrice: '', source: 'NON MDU', notes: '' },
  components: { criteria: 'TR', activity: '', name: '', materialId: '', quantityPerUnit: '1', unit: '', materialPrice: '', servicePrice: '', notes: '' },
  activities: { rabNumber: '', prk: '', position: '', criteria: 'TR', name: '', unit: '', volume: '', year: new Date().getFullYear(), notes: '' },
  materialRecap: { activityId: '', materialId: '', quantity: '', date: new Date().toISOString().slice(0, 10), notes: '' },
  realizations: { activityId: '', date: new Date().toISOString().slice(0, 10), volume: '', billed: '', paid: '', notes: '' },
}

const number = (value) => Number(value) || 0
const createId = () => globalThis.crypto?.randomUUID?.() || `rab-${Date.now()}-${Math.random().toString(16).slice(2)}`
const getActivityComponents = (activity, components) => components.filter((component) =>
  component.criteria === activity.criteria && component.activity.trim().toLowerCase() === activity.name.trim().toLowerCase()
)

export default function RabWorkflow({ view, collections, programRecords = [], onSave }) {
  const meta = VIEW_META[view]
  const Icon = meta.icon
  const rows = collections[meta.collection] || []
  const materials = collections.materials || []
  const components = collections.components || []
  const activities = collections.activities || []
  const recapEntries = collections.materialRecap || []
  const realizationEntries = collections.realizations || []
  const [form, setForm] = useState(() => ({ ...EMPTY_FORM[view] }))
  const [criteriaFilter, setCriteriaFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState('')

  useEffect(() => {
    setForm({ ...EMPTY_FORM[view] })
    setCriteriaFilter('all')
    setSearchTerm('')
    setEditingId('')
  }, [view])

  const filteredRows = rows.filter((row) => {
    const search = Object.values(row).join(' ').toLowerCase().includes(searchTerm.toLowerCase())
    return search && (criteriaFilter === 'all' || row.criteria === criteriaFilter)
  })

  const selectedActivity = activities.find((activity) => activity.id === form.activityId)
  const activityChoices = [...new Set(components.filter((component) => component.criteria === form.criteria).map((component) => component.activity).filter(Boolean))]
    .map((name) => ({ value: name, label: name }))
  const availableMaterials = selectedActivity
    ? [...new Set(getActivityComponents(selectedActivity, components).map((component) => component.materialId).filter(Boolean))]
      .map((id) => materials.find((material) => material.id === id)).filter(Boolean)
    : materials

  const activityTotals = (activity) => getActivityComponents(activity, components).reduce((total, component) => {
    total.material += number(component.quantityPerUnit) * number(component.materialPrice)
    total.service += number(component.quantityPerUnit) * number(component.servicePrice)
    return total
  }, { material: 0, service: 0 })

  const plannedMaterialRows = useMemo(() => {
    const grouped = new Map()
    activities.forEach((activity) => getActivityComponents(activity, components).forEach((component) => {
      if (!component.materialId) return
      const key = `${activity.id}:${component.materialId}`
      const item = grouped.get(key) || { id: key, activityId: activity.id, activity: activity.name, prk: activity.prk, criteria: activity.criteria, materialId: component.materialId, planned: 0, unit: component.unit }
      item.planned += number(activity.volume) * number(component.quantityPerUnit)
      grouped.set(key, item)
    }))
    recapEntries.forEach((entry) => {
      const activity = activities.find((item) => item.id === entry.activityId)
      if (!activity || !entry.materialId) return
      const key = `${activity.id}:${entry.materialId}`
      const item = grouped.get(key) || { id: key, activityId: activity.id, activity: activity.name, prk: activity.prk, criteria: activity.criteria, materialId: entry.materialId, planned: 0, unit: entry.unit }
      item.actual = number(item.actual) + number(entry.quantity)
      grouped.set(key, item)
    })
    return [...grouped.values()].map((item) => ({ ...item, actual: number(item.actual), material: materials.find((material) => material.id === item.materialId) }))
  }, [activities, components, materials, recapEntries])
  const filteredMaterialRows = plannedMaterialRows.filter((row) =>
    (criteriaFilter === 'all' || row.criteria === criteriaFilter)
      && `${row.prk} ${row.activity} ${row.material?.name || ''}`.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const activityRealization = (activity) => realizationEntries.filter((entry) => entry.activityId === activity.id)
    .reduce((sum, entry) => ({ volume: sum.volume + number(entry.volume), billed: sum.billed + number(entry.billed), paid: sum.paid + number(entry.paid) }), { volume: 0, billed: 0, paid: 0 })

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }))
  }

  function updateMaterialSelection(materialId) {
    const material = materials.find((item) => item.id === materialId)
    setForm((current) => ({
      ...current,
      materialId,
      unit: current.unit || material?.unit || '',
      materialPrice: material ? String(material.materialPrice || 0) : current.materialPrice,
      servicePrice: material ? String(material.installPrice || 0) : current.servicePrice,
    }))
  }

  function updatePrkSelection(prk) {
    const source = programRecords.find((record) => record.prk === prk)
    setForm((current) => ({
      ...current,
      prk,
      position: current.position || source?.position || source?.budgetPosition || '',
      rabNumber: current.rabNumber || source?.rabNumber || '',
    }))
  }

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    try {
      const originalRecord = rows.find((row) => row.id === editingId)
      const record = { ...(originalRecord || {}), id: editingId || createId(), ...form, createdAt: originalRecord?.createdAt || new Date().toISOString() }
      if (view === 'materials') {
        record.materialPrice = number(form.materialPrice)
        record.installPrice = number(form.installPrice)
        record.removalPrice = number(form.removalPrice)
      }
      if (view === 'components') {
        record.quantityPerUnit = number(form.quantityPerUnit)
        record.materialPrice = number(form.materialPrice)
        record.servicePrice = number(form.servicePrice)
        record.materialName = materials.find((item) => item.id === form.materialId)?.name || ''
      }
      if (view === 'activities') {
        record.volume = number(form.volume)
        const totals = activityTotals(record)
        record.materialTotal = totals.material * record.volume
        record.serviceTotal = totals.service * record.volume
        record.total = record.materialTotal + record.serviceTotal
      }
      if (view === 'materialRecap') {
        record.quantity = number(form.quantity)
        const activity = activities.find((item) => item.id === form.activityId)
        record.unit = materials.find((item) => item.id === form.materialId)?.unit || ''
        record.criteria = activity?.criteria || ''
        record.prk = activity?.prk || ''
        record.activityName = activity?.name || ''
      }
      if (view === 'realizations') {
        record.volume = number(form.volume)
        record.billed = number(form.billed)
        record.paid = number(form.paid)
        const activity = activities.find((item) => item.id === form.activityId)
        record.criteria = activity?.criteria || ''
        record.prk = activity?.prk || ''
        record.activityName = activity?.name || ''
      }
      const nextRecords = editingId ? rows.map((row) => row.id === editingId ? record : row) : [record, ...rows]
      await onSave(meta.collection, nextRecords, editingId ? `${meta.title} berhasil diperbarui.` : `${meta.title} berhasil disimpan.`)
      setForm({ ...EMPTY_FORM[view] })
      setEditingId('')
    } finally {
      setSaving(false)
    }
  }

  async function removeRecord(id) {
    const next = rows.filter((row) => row.id !== id)
    await onSave(meta.collection, next, 'Data berhasil dihapus.')
  }

  function editRecord(record) {
    const defaults = EMPTY_FORM[view]
    setEditingId(record.id)
    setForm(Object.fromEntries(Object.keys(defaults).map((key) => [key, record[key] ?? defaults[key]])))
  }

  function rowActions(record, label) {
    return <td><div className="workflow-row-actions"><button className="workflow-edit" aria-label={`Edit ${label}`} onClick={() => editRecord(record)}><Pencil size={14} /></button><button className="workflow-delete" aria-label={`Hapus ${label}`} onClick={() => removeRecord(record.id)}><Trash2 size={14} /></button></div></td>
  }

  function field(name, label, options = {}) {
    const { type = 'text', required = true, placeholder = '', choices, step, min = 0, onChange } = options
    return <label className="workflow-field" key={name}>
      <span>{label}</span>
      {choices ? <select required={required} value={form[name]} onChange={(event) => onChange ? onChange(event.target.value) : updateField(name, event.target.value)}>
        <option value="">Pilih {label.toLowerCase()}</option>
        {choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
      </select> : <input required={required} type={type} min={type === 'number' ? min : undefined} step={step} value={form[name]} placeholder={placeholder} onChange={(event) => updateField(name, event.target.value)} />}
    </label>
  }

  function criteriaField() {
    return field('criteria', 'Kriteria jaringan', { choices: [{ value: 'TM', label: 'TM - Tegangan Menengah' }, { value: 'TR', label: 'TR - Tegangan Rendah' }] })
  }

  function formFields() {
    if (view === 'materials') return <>
      {field('code', 'Kode material', { required: false, placeholder: 'Contoh: MTR-001' })}
      {field('name', 'Uraian material', { placeholder: 'Nama material sesuai standar' })}
      {field('unit', 'Satuan', { placeholder: 'btg, set, m, unit' })}
      {criteriaField()}
      {field('materialPrice', 'Harga material (Rp)', { type: 'number', step: '1', placeholder: '0' })}
      {field('installPrice', 'Jasa pasang (Rp)', { type: 'number', step: '1', placeholder: '0', required: false })}
      {field('removalPrice', 'Jasa bongkar (Rp)', { type: 'number', step: '1', placeholder: '0', required: false })}
      {field('source', 'Jenis material', { choices: [{ value: 'MDU', label: 'MDU' }, { value: 'NON MDU', label: 'NON MDU' }] })}
    </>
    if (view === 'components') return <>
      {criteriaField()}
      {field('activity', 'Nama kegiatan', { placeholder: 'Contoh: Pemasangan SUTM per kilometer' })}
      {field('name', 'Uraian komponen pekerjaan', { placeholder: 'Nama material/pekerjaan' })}
      {field('materialId', 'Sumber material', { required: false, choices: materials.map((material) => ({ value: material.id, label: `${material.name} (${material.unit})` })), onChange: updateMaterialSelection })}
      {field('quantityPerUnit', 'Kebutuhan per satuan kegiatan', { type: 'number', step: '0.001', placeholder: '1' })}
      {field('unit', 'Satuan komponen', { placeholder: 'btg, set, m, unit' })}
      {field('materialPrice', 'Harga material per satuan (Rp)', { type: 'number', step: '1', placeholder: '0', required: false })}
      {field('servicePrice', 'Harga jasa per satuan (Rp)', { type: 'number', step: '1', placeholder: '0', required: false })}
    </>
    if (view === 'activities') return <>
      {field('rabNumber', 'No. RAB', { required: false, placeholder: 'Nomor RAB' })}
      {programRecords.length
        ? field('prk', 'No. PRK', { choices: programRecords.map((record) => ({ value: record.prk || record.rabNumber, label: `${record.prk || record.rabNumber} | ${record.description || 'Uraian belum diisi'}` })), onChange: updatePrkSelection })
        : field('prk', 'No. PRK', { placeholder: 'Pilih/isi nomor PRK' })}
      {field('position', 'Pos anggaran', { placeholder: 'Contoh: 62' })}
      {criteriaField()}
      {field('name', 'Nama kegiatan', { choices: activityChoices })}
      {field('unit', 'Satuan kegiatan', { placeholder: 'kms, unit, set' })}
      {field('volume', 'Volume RAB', { type: 'number', step: '0.001', placeholder: '0' })}
      {field('year', 'Tahun anggaran', { type: 'number', step: '1', placeholder: String(new Date().getFullYear()) })}
    </>
    if (view === 'materialRecap') return <>
      {field('activityId', 'Kegiatan RAB', { choices: activities.map((activity) => ({ value: activity.id, label: `${activity.criteria} | ${activity.prk} | ${activity.name}` })) })}
      {field('materialId', 'Material digunakan', { choices: availableMaterials.map((material) => ({ value: material.id, label: `${material.name} (${material.unit})` })) })}
      {field('quantity', 'Volume material aktual', { type: 'number', step: '0.001', placeholder: '0' })}
      {field('date', 'Tanggal pemakaian', { type: 'date' })}
    </>
    return <>
      {field('activityId', 'Kegiatan RAB', { choices: activities.map((activity) => ({ value: activity.id, label: `${activity.criteria} | ${activity.prk} | ${activity.name}` })) })}
      {field('date', 'Tanggal realisasi', { type: 'date' })}
      {field('volume', 'Volume terealisasi', { type: 'number', step: '0.001', placeholder: '0' })}
      {field('billed', 'Nilai tagihan (Rp)', { type: 'number', step: '1', placeholder: '0', required: false })}
      {field('paid', 'Nilai dibayar (Rp)', { type: 'number', step: '1', placeholder: '0', required: false })}
    </>
  }

  function tableRows() {
    if (view === 'materialRecap') return filteredMaterialRows.map((row) => <tr key={row.id}><td>{row.criteria}</td><td>{row.prk}</td><td>{row.activity}</td><td>{row.material?.name || '-'}</td><td>{row.planned} {row.unit}</td><td>{row.actual} {row.unit}</td><td className={row.actual < row.planned ? 'workflow-warning' : ''}>{(row.planned - row.actual).toFixed(3)} {row.unit}</td></tr>)
    if (view === 'activities') return filteredRows.map((row) => {
      const costs = activityTotals(row)
      const realized = activityRealization(row)
      return <tr key={row.id}><td>{row.criteria}</td><td>{row.prk}</td><td>{row.rabNumber || '-'}</td><td>{row.name}</td><td>{row.volume} {row.unit}</td><td>{formatCurrency(costs.material * number(row.volume))}</td><td>{formatCurrency(costs.service * number(row.volume))}</td><td className="workflow-total">{formatCurrency((costs.material + costs.service) * number(row.volume))}</td><td>{realized.volume} {row.unit}</td><td>{Math.max(0, number(row.volume) - realized.volume)} {row.unit}</td><td>{row.year}</td>{rowActions(row, 'kegiatan RAB')}</tr>
    })
    if (view === 'realizations') return filteredRows.map((row) => {
      const activity = activities.find((item) => item.id === row.activityId)
      return <tr key={row.id}><td>{activity?.criteria || '-'}</td><td>{activity?.prk || '-'}</td><td>{activity?.name || '-'}</td><td>{row.date}</td><td>{row.volume}</td><td>{formatCurrency(row.billed)}</td><td>{formatCurrency(row.paid)}</td>{rowActions(row, 'realisasi')}</tr>
    })
    if (view === 'components') return filteredRows.map((row) => <tr key={row.id}><td>{row.criteria}</td><td>{row.activity}</td><td>{row.name}</td><td>{row.materialName || '-'}</td><td>{row.quantityPerUnit} {row.unit}</td><td>{formatCurrency(row.materialPrice)}</td><td>{formatCurrency(row.servicePrice)}</td><td>{formatCurrency(number(row.quantityPerUnit) * (number(row.materialPrice) + number(row.servicePrice)))}</td>{rowActions(row, 'komponen RAB')}</tr>)
    return filteredRows.map((row) => <tr key={row.id}><td>{row.code || '-'}</td><td>{row.name}</td><td>{row.criteria}</td><td>{row.unit}</td><td>{row.source || '-'}</td><td>{formatCurrency(row.materialPrice)}</td><td>{formatCurrency(row.installPrice)}</td><td>{formatCurrency(row.removalPrice)}</td>{rowActions(row, 'material')}</tr>)
  }

  const tableHeaders = {
    materials: ['Kode', 'Uraian material', 'Kriteria', 'Satuan', 'Jenis', 'Harga material', 'Jasa pasang', 'Jasa bongkar', ''],
    components: ['Kriteria', 'Kegiatan', 'Uraian komponen', 'Material', 'Kebutuhan/unit', 'Material/unit', 'Jasa/unit', 'Total/unit', ''],
    activities: ['Kriteria', 'No. PRK', 'No. RAB', 'Nama kegiatan', 'Volume RAB', 'Total material', 'Total jasa', 'Total RAB', 'Terealisasi', 'Sisa volume', 'Tahun', ''],
    materialRecap: ['Kriteria', 'No. PRK', 'Kegiatan', 'Material', 'Kebutuhan RAB', 'Terpakai aktual', 'Sisa/selisih'],
    realizations: ['Kriteria', 'No. PRK', 'Kegiatan', 'Tanggal', 'Volume', 'Tagihan', 'Dibayar', ''],
  }[view]

  const totals = view === 'activities'
    ? { label: 'Nilai RAB terdaftar', value: activities.filter((activity) => criteriaFilter === 'all' || activity.criteria === criteriaFilter).reduce((sum, activity) => sum + activityTotals(activity).material * number(activity.volume) + activityTotals(activity).service * number(activity.volume), 0) }
    : view === 'realizations'
      ? { label: 'Total pembayaran tercatat', value: filteredRows.reduce((sum, row) => sum + number(row.paid), 0) }
      : null

  return <div className="workflow-page">
    <section className="workflow-heading"><div className="workflow-title-icon"><Icon size={21} /></div><div><p className="eyebrow">ALUR RAB &amp; REALISASI</p><h1>{meta.title}</h1><p>{meta.description}</p></div></section>
    <div className="workflow-stepbar" aria-label="Tahapan RAB"><span className={view === 'materials' ? 'current' : ''}>1 Material</span><i /><span className={view === 'components' ? 'current' : ''}>2 Komponen</span><i /><span className={view === 'activities' ? 'current' : ''}>3 Kegiatan</span><i /><span className={view === 'materialRecap' ? 'current' : ''}>4 Rekap material</span><i /><span className={view === 'realizations' ? 'current' : ''}>5 Realisasi</span></div>
    <div className="workflow-layout">
      <section className="panel workflow-form-panel">
        <div className="workflow-section-heading"><div><span className="workflow-section-icon">{editingId ? <Pencil size={15} /> : <Plus size={16} />}</span><h2>{editingId ? `Edit ${meta.title.toLowerCase()}` : view === 'materialRecap' ? 'Catat pemakaian material' : `Tambah ${meta.title.toLowerCase()}`}</h2></div></div>
        {view === 'components' && materials.length === 0 && <div className="workflow-hint">Isi master material terlebih dahulu. Harga material dan jasa tetap dapat diketik manual.</div>}
        {view === 'activities' && components.length === 0 && <div className="workflow-hint">Tambahkan komponen pekerjaan lebih dahulu agar total kegiatan dihitung otomatis.</div>}
        {view === 'materialRecap' && activities.length === 0 && <div className="workflow-hint">Buat RAB kegiatan terlebih dahulu. Kebutuhan material akan direkap dari komponen RAB.</div>}
        {view === 'realizations' && activities.length === 0 && <div className="workflow-hint">Buat RAB kegiatan terlebih dahulu sebelum mencatat realisasi.</div>}
        <form className="workflow-form" onSubmit={submit}>
          <div className="workflow-fields">{formFields()}{field('notes', 'Catatan', { required: false, placeholder: 'Opsional' })}</div>
          <div className="workflow-form-footer"><span>* Wajib diisi</span><div className="workflow-form-actions">{editingId && <button className="button button-secondary" type="button" onClick={() => { setForm({ ...EMPTY_FORM[view] }); setEditingId('') }}><X size={14} />Batal edit</button>}<button className="button button-primary" type="submit" disabled={saving || ((view === 'materialRecap' || view === 'realizations') && activities.length === 0)}><Save size={15} />{saving ? 'Menyimpan...' : editingId ? 'Simpan perubahan' : 'Simpan data'}</button></div></div>
        </form>
      </section>
      <section className="workflow-summary panel">
        <span className="workflow-summary-icon"><Icon size={19} /></span>
        <div><span>{view === 'materialRecap' ? 'Baris kebutuhan material' : `Total ${meta.title.toLowerCase()}`}</span><strong>{view === 'materialRecap' ? plannedMaterialRows.length : rows.length}</strong></div>
        {totals && <div className="workflow-sum-money"><span>{totals.label}</span><strong>{formatCurrency(totals.value)}</strong></div>}
        {view === 'activities' && <div className="workflow-criteria-count"><span>TM <b>{activities.filter((activity) => activity.criteria === 'TM').length}</b></span><span>TR <b>{activities.filter((activity) => activity.criteria === 'TR').length}</b></span></div>}
      </section>
    </div>

    <section className="panel workflow-table-panel">
      <div className="workflow-table-heading"><div><p className="eyebrow">DATA TERSIMPAN</p><h2>{view === 'materialRecap' ? 'Rencana dan pemakaian material' : meta.title}</h2></div><span className="workflow-count">{view === 'materialRecap' ? plannedMaterialRows.length : rows.length} baris</span></div>
      <div className="workflow-toolbar"><label className="workflow-search"><Search size={15} /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Cari uraian, PRK, atau kegiatan" /></label><div className="workflow-segment" role="group" aria-label="Filter kriteria"><button className={criteriaFilter === 'all' ? 'selected' : ''} onClick={() => setCriteriaFilter('all')}>Semua</button><button className={criteriaFilter === 'TM' ? 'selected' : ''} onClick={() => setCriteriaFilter('TM')}>TM</button><button className={criteriaFilter === 'TR' ? 'selected' : ''} onClick={() => setCriteriaFilter('TR')}>TR</button></div></div>
      <div className="workflow-table-scroll"><table><thead><tr>{tableHeaders.map((header, index) => <th key={`${header}-${index}`}>{header}</th>)}</tr></thead><tbody>
        {view === 'materialRecap' ? tableRows() : tableRows()}
        {((view === 'materialRecap' && filteredMaterialRows.length === 0) || (view !== 'materialRecap' && filteredRows.length === 0)) && <tr><td colSpan={tableHeaders.length}><div className="workflow-empty"><Icon size={23} /><strong>Belum ada data</strong><span>Gunakan formulir di atas untuk memulai alur ini.</span></div></td></tr>}
      </tbody></table></div>
    </section>
    {view === 'materialRecap' && <section className="panel workflow-table-panel">
      <div className="workflow-table-heading"><div><p className="eyebrow">RIWAYAT PEMAKAIAN</p><h2>Catatan material aktual</h2></div><span className="workflow-count">{filteredRows.length} transaksi</span></div>
      <div className="workflow-table-scroll"><table><thead><tr><th>Tanggal</th><th>Kriteria</th><th>No. PRK</th><th>Kegiatan</th><th>Material</th><th>Volume</th><th>Aksi</th></tr></thead><tbody>
        {filteredRows.length ? filteredRows.map((row) => <tr key={row.id}><td>{row.date}</td><td>{row.criteria}</td><td>{row.prk}</td><td>{row.activityName}</td><td>{materials.find((material) => material.id === row.materialId)?.name || '-'}</td><td>{row.quantity} {row.unit}</td>{rowActions(row, 'pemakaian material')}</tr>) : <tr><td colSpan="7"><div className="workflow-empty"><Boxes size={22} /><strong>Belum ada transaksi pemakaian</strong><span>Catat material aktual pada form di atas.</span></div></td></tr>}
      </tbody></table></div>
    </section>}
    {view === 'activities' && <p className="workflow-footnote"><Check size={14} /> Nilai RAB dihitung dari komponen dengan kombinasi kriteria dan nama kegiatan yang sama.</p>}
  </div>
}