import { useRef, useState } from 'react'
import { Activity, ArrowRightLeft, Boxes, Check, ChevronDown, ClipboardList, Pencil, Plus, Printer, Save, Search, Trash2, Wrench, X } from 'lucide-react'
import { formatCurrency, parseNumber } from './lib/workbook.js'
import { terbilangRupiah } from './lib/terbilang.js'
import plnLogo from '../logo/Logo_PLN.png'
import './workflow.css'

const VIEW_META = {
  materials: { title: 'Input Material', description: 'Master material dan harga yang menjadi sumber komponen RAB.', icon: Boxes, collection: 'materials' },
  activityCatalog: { title: 'Master Kegiatan', description: 'Kelola paket, nama, satuan, kriteria, dan PRK untuk acuan komponen RAB.', icon: ClipboardList, collection: 'activityCatalog' },
  components: { title: 'Input RAB', description: 'Susun kebutuhan material dan jasa per kegiatan, dipisah TM dan TR.', icon: Wrench, collection: 'components' },
  activities: { title: 'Rekap RAB', description: 'Hitung RAB kegiatan berdasarkan volume dan komponen pekerjaan.', icon: ClipboardList, collection: 'activities' },
  paFinalization: { title: 'Finalisasi RAB ke PA', description: 'Alihkan sebagian saldo RAB yang sudah final ke PA. Saldo PA dan nilai kontrak dicatat terpisah.', icon: ArrowRightLeft, collection: 'paTransfers' },
  materialRecap: { title: 'Rekap Material', description: 'Bandingkan kebutuhan material dari RAB dengan pemakaian aktual.', icon: Boxes, collection: 'materialRecap' },
  realizations: { title: 'Realisasi', description: 'Catat progres volume, tagihan, dan pembayaran kegiatan.', icon: Activity, collection: 'realizations' },
}

const EMPTY_FORM = {
  materials: { code: '', name: '', unit: '', criteria: 'TR', materialPrice: '', servicePrice: '', source: 'NON MDU', notes: '' },
  activityCatalog: { workPackage: '', name: '', unit: '', prk: '', criteria: 'TR', notes: '' },
  components: { criteria: 'TR', activity: '', workPackage: '', prk: '', programRecordId: '', name: '', materialId: '', quantityPerUnit: '1', unit: '', materialPrice: '', servicePrice: '', materialVolumes: {}, notes: '' },
  activities: { rabNumber: '', programRecordId: '', prk: '', position: '', criteria: 'TR', workPackage: '', year: new Date().getFullYear(), notes: '' },
  paFinalization: { recordId: '', amount: '', date: new Date().toISOString().slice(0, 10), notes: '' },
  materialRecap: { activityId: '', materialId: '', quantity: '', date: new Date().toISOString().slice(0, 10), notes: '' },
  realizations: { activityId: '', date: new Date().toISOString().slice(0, 10), volume: '', billed: '', paid: '', notes: '' },
}

const number = (value) => parseNumber(value)
const normalizeCriteria = (value) => {
  const criteria = String(value || '').trim().toUpperCase()
  if (criteria.startsWith('TM')) return 'TM'
  if (criteria.startsWith('TR')) return 'TR'
  return criteria
}
const createId = () => globalThis.crypto?.randomUUID?.() || `rab-${Date.now()}-${Math.random().toString(16).slice(2)}`
const normalizeWorkName = (value) => String(value || '').trim().toLocaleLowerCase()
const getActivityComponents = (activity, components) => {
  const matching = components.filter((component) =>
    normalizeWorkName(component.activity) === normalizeWorkName(activity.name)
  )
  const programComponents = matching.filter((component) => String(component.prk || '').trim() === String(activity.prk || '').trim())
  return programComponents.length ? programComponents : matching.filter((component) => !String(component.prk || '').trim())
}

export default function RabWorkflow({ view, collections, programRecords = [], onSave, onTransfer, onCancelTransfer, readOnly = false }) {
  const meta = VIEW_META[view]
  const Icon = meta.icon
  const rows = collections[meta.collection] || []
  const materials = collections.materials || []
  const activityCatalog = collections.activityCatalog || []
  const components = collections.components || []
  const activities = collections.activities || []
  const recapEntries = collections.materialRecap || []
  const [form, setForm] = useState(() => ({ ...EMPTY_FORM[view] }))
  const [criteriaFilter, setCriteriaFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [choiceSearch, setChoiceSearch] = useState('')
  const [openChoiceField, setOpenChoiceField] = useState('')
  const [printGroupKey, setPrintGroupKey] = useState('')
  const [componentMaterialFilters, setComponentMaterialFilters] = useState({ operation: 'all', criteria: 'all', source: 'all' })
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState(null)
  const [editingId, setEditingId] = useState('')
  const [expandedComponentGroup, setExpandedComponentGroup] = useState('')
  const formPanelRef = useRef(null)

  const componentFilterSourceRows = [
    ...materials.map((material) => ({
      operation: material.operation,
      criteria: material.criteria,
      source: material.source,
    })),
    ...components.map((component) => {
      const material = materials.find((item) => item.id === component.materialId)
      return {
        operation: component.operation || material?.operation,
        criteria: component.criteria || material?.criteria,
        source: component.source || material?.source,
      }
    }),
  ]
  const componentFilterOptions = {
    operation: [...new Set(componentFilterSourceRows.map((row) => String(row.operation || '').trim()).filter(Boolean))],
    criteria: [...new Set(componentFilterSourceRows.map((row) => normalizeCriteria(row.criteria)).filter(Boolean))],
    source: [...new Set(componentFilterSourceRows.map((row) => String(row.source || '').trim().toUpperCase()).filter(Boolean))],
  }
  const filteredRows = rows.filter((row) => {
    const search = Object.values(row).join(' ').toLowerCase().includes(searchTerm.toLowerCase())
    if (!search) return false
    return criteriaFilter === 'all' || row.criteria === criteriaFilter
  })
  const componentDisplayGroups = view === 'components'
    ? [...rows.reduce((groups, row) => {
      const title = String(row.activity || row.componentName || row.name || row.materialName || '').trim()
      const key = JSON.stringify([
        String(row.prk || '').trim(),
        normalizeWorkName(row.workPackage),
        normalizeWorkName(title),
        normalizeCriteria(row.criteria),
      ])
      const group = groups.get(key) || { key, title, prk: row.prk || '', workPackage: row.workPackage || '', criteria: row.criteria || '', rows: [] }
      group.rows.push(row)
      groups.set(key, group)
      return groups
    }, new Map()).values()]
      .filter((group) => !searchTerm || `${group.title} ${group.prk} ${group.workPackage} ${group.criteria} ${group.rows.map((row) => Object.values(row).join(' ')).join(' ')}`
        .toLowerCase().includes(searchTerm.toLowerCase()))
    : []

  const selectedActivity = activities.find((activity) => activity.id === form.activityId)
  const selectedProgramRecord = programRecords.find((record) => record.id === form.recordId)
  const transferAmount = number(form.amount)
  const remainingRab = number(selectedProgramRecord?.rabTotal)
  const currentPA = number(selectedProgramRecord?.paTotal)
  const nextPA = currentPA + transferAmount
  const allComponentActivities = [
    ...activityCatalog.map((activity) => ({ name: String(activity.name || '').trim(), criteria: activity.criteria })),
    ...components.map((component) => ({ name: String(component.activity || '').trim(), criteria: component.criteria })),
  ].filter((activity) => activity.name)
  const matchingComponentActivities = allComponentActivities.filter((activity) => normalizeCriteria(activity.criteria) === normalizeCriteria(form.criteria))
  const availableComponentActivities = matchingComponentActivities.length ? matchingComponentActivities : allComponentActivities
  const componentActivityChoices = [...new Map(availableComponentActivities.map((activity) => [activity.name, activity])).values()]
    .map((activity) => ({
      value: activity.name,
      label: matchingComponentActivities.length ? activity.name : `${activity.criteria} | ${activity.name}`,
    }))
  const activityPrkChoices = [...new Map(activityCatalog
    .filter((activity) => String(activity.prk || '').trim())
    .map((activity) => [String(activity.prk).trim(), activity]))
    .entries()]
    .map(([prk, activity]) => ({ value: prk, label: `${prk} | ${activity.workPackage || activity.name}` }))
  const activityCatalogChoices = [...new Map(activityCatalog
    .filter((activity) => String(activity.prk || '').trim() === String(form.prk || '').trim()
      && normalizeWorkName(activity.workPackage) === normalizeWorkName(form.workPackage)
      && String(activity.name || '').trim())
    .map((activity) => [normalizeWorkName(activity.name), activity]))
    .values()]
    .map((activity) => ({ value: activity.name, label: `${activity.name}${activity.unit ? ` (${activity.unit})` : ''}` }))
  const activityWorkPackageChoices = [...new Map(activityCatalog
    .filter((activity) => String(activity.prk || '').trim() === String(form.prk || '').trim() && String(activity.workPackage || '').trim())
    .map((activity) => [normalizeWorkName(activity.workPackage), activity.workPackage.trim()]))
    .values()]
    .map((workPackage) => ({ value: workPackage, label: workPackage }))
  const selectedCatalogActivity = activityCatalog.find((activity) =>
    String(activity.prk || '').trim() === String(form.prk || '').trim()
      && normalizeWorkName(activity.name) === normalizeWorkName(form.name)
  )
  const matchingActivityMaterials = form.name
    ? materials.filter((material) => normalizeWorkName(material.componentActivity) === normalizeWorkName(form.name))
    : []
  const matchingActivityComponents = form.name
    ? (() => {
      const matches = components.filter((component) => normalizeWorkName(component.activity) === normalizeWorkName(form.name)
        && (!component.workPackage || normalizeWorkName(component.workPackage) === normalizeWorkName(form.workPackage)))
      const prkMatches = matches.filter((component) => String(component.prk || '').trim() === String(form.prk || '').trim())
      const selectedMatches = prkMatches.length ? prkMatches : matches.filter((component) => !String(component.prk || '').trim())
      const materialOrder = new Map(materials.map((material, index) => [material.id, index]))
      return selectedMatches.sort((left, right) =>
        (materialOrder.get(left.materialId) ?? Number.MAX_SAFE_INTEGER)
        - (materialOrder.get(right.materialId) ?? Number.MAX_SAFE_INTEGER))
    })()
    : []
  const savedComponentsByMaterial = new Map(matchingActivityComponents.map((component) => [component.materialId || component.id, component]))
  const activityLineItems = [
    ...matchingActivityMaterials.map((material) => {
      const component = savedComponentsByMaterial.get(material.id)
      return {
        id: component?.id || material.id,
        componentId: component?.id || '',
        materialId: material.id,
        materialName: component?.materialName || material.name,
        unit: component?.unit || material.unit,
        quantityPerUnit: number(component?.quantityPerUnit ?? 1) || 1,
        criteria: normalizeCriteria(component?.criteria || material.criteria) || normalizeCriteria(selectedCatalogActivity?.criteria) || 'TR',
        source: String(component?.source || material.source || '').trim().toUpperCase(),
        operation: component?.operation || material.operation || '',
        materialPrice: number(component?.materialPrice ?? material.materialPrice),
        servicePrice: number(component?.servicePrice ?? (material.servicePrice ?? (number(material.installPrice) + number(material.removalPrice)))),
      }
    }),
    ...matchingActivityComponents
      .filter((component) => !matchingActivityMaterials.some((material) => material.id === (component.materialId || component.id)))
      .map((component) => ({
        id: component.id,
        componentId: component.id,
        materialId: component.materialId || '',
        materialName: component.materialName || component.name,
        unit: component.unit,
        quantityPerUnit: number(component.quantityPerUnit) || 1,
        criteria: normalizeCriteria(component.criteria) || 'TR',
        source: String(component.source || '').trim().toUpperCase(),
        operation: component.operation || '',
        materialPrice: number(component.materialPrice),
        servicePrice: number(component.servicePrice),
      })),
  ]
  const activityPrkComponents = form.prk && form.workPackage
    ? [...components.reduce((groups, component) => {
      if (String(component.prk || '').trim() !== String(form.prk).trim()
        || (component.workPackage && normalizeWorkName(component.workPackage) !== normalizeWorkName(form.workPackage))
        || !String(component.activity || '').trim()) return groups
      const key = normalizeWorkName(component.activity)
      const catalogActivity = activityCatalog.find((activity) =>
        String(activity.prk || '').trim() === String(form.prk).trim()
          && normalizeWorkName(activity.workPackage) === normalizeWorkName(form.workPackage)
          && normalizeWorkName(activity.name) === key
      )
      if (!catalogActivity) return groups
      const group = groups.get(key) || {
        key,
        name: component.activity,
        lines: [],
        catalogActivity,
      }
      group.lines.push(component)
      groups.set(key, group)
      return groups
    }, new Map()).values()].map((group) => {
      const existingActivity = activities.find((activity) =>
        String(activity.prk || '').trim() === String(form.prk).trim()
          && normalizeWorkName(activity.componentName || activity.name) === group.key
      )
      return {
        ...group,
        criteria: [...new Set(group.lines.map((line) => normalizeCriteria(line.criteria)).filter(Boolean))].join(', '),
        unit: group.catalogActivity?.unit || existingActivity?.unit || '-',
        materialTotal: group.lines.reduce((sum, line) =>
          sum + number(line.materialPart ?? number(line.quantityPerUnit) * number(line.materialPrice)), 0),
        serviceTotal: group.lines.reduce((sum, line) =>
          sum + number(line.servicePart ?? number(line.quantityPerUnit) * number(line.servicePrice)), 0),
      }
    })
    : []
  const visibleActivityLineItems = view !== 'components' ? activityLineItems : activityLineItems.filter((line) =>
    (componentMaterialFilters.operation === 'all' || line.operation === componentMaterialFilters.operation)
      && (componentMaterialFilters.criteria === 'all' || normalizeCriteria(line.criteria) === componentMaterialFilters.criteria)
      && (componentMaterialFilters.source === 'all' || String(line.source || '').trim().toUpperCase() === componentMaterialFilters.source)
  )
  const activityCriteriaLabels = [...new Set(visibleActivityLineItems.map((line) => normalizeCriteria(line.criteria)).filter(Boolean))]
  const activitySourceLabels = [...new Set(visibleActivityLineItems.map((line) => String(line.source || '').trim().toUpperCase()).filter(Boolean))]
  const activityGroupChoices = [...new Map(activities.map((activity) => {
    const key = `${String(activity.prk || '').trim()}::${normalizeWorkName(activity.componentName || activity.name)}`
    return [key, activity]
  })).values()]
  const availableMaterials = selectedActivity
    ? [...new Set([
      ...activities.filter((activity) => String(activity.prk || '').trim() === String(selectedActivity.prk || '').trim()
        && normalizeWorkName(activity.componentName || activity.name) === normalizeWorkName(selectedActivity.componentName || selectedActivity.name))
        .map((activity) => activity.materialId),
      ...getActivityComponents(selectedActivity, components).map((component) => component.materialId),
    ].filter(Boolean))]
      .map((id) => materials.find((material) => material.id === id)).filter(Boolean)
    : materials

  const activityTotals = (activity) => getActivityComponents(activity, components).reduce((total, component) => {
    total.material += number(component.quantityPerUnit) * number(component.materialPrice)
    total.service += number(component.quantityPerUnit) * number(component.servicePrice)
    return total
  }, { material: 0, service: 0 })
  const activityUnitCosts = (activity) => activity.materialId || activity.componentId
    ? { material: number(activity.materialPrice) * (number(activity.quantityPerUnit) || 1), service: number(activity.servicePrice) * (number(activity.quantityPerUnit) || 1) }
    : activityTotals(activity)
  const activityDisplayRows = view === 'activities'
    ? [...new Map(rows.map((activity) => {
      const isMaterialGroup = Boolean(activity.materialId || activity.componentId)
      const key = isMaterialGroup
        ? `${String(activity.prk || '').trim()}::${normalizeWorkName(activity.componentName || activity.name)}`
        : activity.id
      const groupRows = rows.filter((item) => (isMaterialGroup
        ? Boolean(item.materialId || item.componentId)
          && String(item.prk || '').trim() === String(activity.prk || '').trim()
          && normalizeWorkName(item.componentName || item.name) === normalizeWorkName(activity.componentName || activity.name)
        : item.id === activity.id))
      const materialTotal = groupRows.reduce((sum, item) => {
        const costs = activityUnitCosts(item)
        return sum + costs.material * number(item.volume)
      }, 0)
      const serviceTotal = groupRows.reduce((sum, item) => {
        const costs = activityUnitCosts(item)
        return sum + costs.service * number(item.volume)
      }, 0)
      const activityVolumes = [...new Set(groupRows.map((item) => number(item.volume)))]
      const catalogActivity = activityCatalog.find((item) =>
        String(item.prk || '').trim() === String(activity.prk || '').trim()
          && normalizeWorkName(item.name) === normalizeWorkName(activity.componentName || activity.name)
      )
      const materialUnitPrice = groupRows.reduce((sum, item) => sum
        + number(item.materialPrice) * (number(item.quantityPerUnit) || 1), 0)
      const serviceUnitPrice = groupRows.reduce((sum, item) => sum
        + number(item.servicePrice) * (number(item.quantityPerUnit) || 1), 0)
      return [key, {
        ...activity,
        id: key,
        displayName: activity.componentName || activity.name,
        criteria: [...new Set(groupRows.map((item) => normalizeCriteria(item.criteria)).filter(Boolean))].join(', '),
        displayVolume: activityVolumes.length === 1 ? activityVolumes[0] : '-',
        displayUnit: catalogActivity?.unit || activity.unit || '-',
        materialUnitPrice,
        serviceUnitPrice,
        materialTotal,
        serviceTotal,
        total: materialTotal + serviceTotal,
        records: groupRows,
      }]
    })).values()].filter((row) =>
      (criteriaFilter === 'all' || row.records.some((item) => normalizeCriteria(item.criteria) === criteriaFilter))
        && [row.prk, row.displayName, ...row.records.map((item) => `${item.materialName || item.name || ''} ${item.materialId || ''}`)]
          .join(' ').toLowerCase().includes(searchTerm.toLowerCase())
    )
    : []

  const plannedMaterialRows = (() => {
    const grouped = new Map()
    const processedComponentActivities = new Set()
    activities.forEach((activity) => {
      if (activity.materialId && !activity.componentId) {
        const key = `${activity.prk}:${activity.name}:${activity.materialId}`
        const material = materials.find((item) => item.id === activity.materialId)
        const item = grouped.get(key) || { id: key, activityId: activity.id, activity: activity.name, prk: activity.prk, criteria: activity.criteria, materialId: activity.materialId, planned: 0, unit: activity.unit || material?.unit || '' }
        item.planned += number(activity.volume)
        grouped.set(key, item)
        return
      }
      if (activity.componentId) {
        const groupKey = `${String(activity.prk || '').trim()}::${normalizeWorkName(activity.componentName || activity.name)}`
        if (processedComponentActivities.has(groupKey)) return
        processedComponentActivities.add(groupKey)
      }
      getActivityComponents(activity, components).forEach((component) => {
        if (!component.materialId) return
        const key = `${activity.id}:${component.materialId}`
        const item = grouped.get(key) || { id: key, activityId: activity.id, activity: activity.name, prk: activity.prk, criteria: activity.criteria, materialId: component.materialId, planned: 0, unit: component.unit }
        item.planned += number(activity.volume) * number(component.quantityPerUnit)
        grouped.set(key, item)
      })
    })
    recapEntries.forEach((entry) => {
      const activity = activities.find((item) => item.id === entry.activityId)
      if (!activity || !entry.materialId) return
      const key = `${activity.id}:${entry.materialId}`
      const item = grouped.get(key) || { id: key, activityId: activity.id, activity: activity.name, prk: activity.prk, criteria: activity.criteria, materialId: entry.materialId, planned: 0, unit: entry.unit }
      item.actual = number(item.actual) + number(entry.quantity)
      grouped.set(key, item)
    })
    return [...grouped.values()].map((item) => ({ ...item, actual: number(item.actual), material: materials.find((material) => material.id === item.materialId) }))
  })()
  const filteredMaterialRows = plannedMaterialRows.filter((row) =>
    (criteriaFilter === 'all' || row.criteria === criteriaFilter)
      && `${row.prk} ${row.activity} ${row.material?.name || ''}`.toLowerCase().includes(searchTerm.toLowerCase())
  )

  function updateField(name, value) {
    setSaveStatus(null)
    setForm((current) => ({ ...current, [name]: value }))
  }

  function updateMaterialSelection(materialId) {
    const material = materials.find((item) => item.id === materialId)
    setForm((current) => ({
      ...current,
      materialId,
      name: material?.name || current.name,
      unit: current.unit || material?.unit || '',
      materialPrice: material ? String(material.materialPrice || 0) : current.materialPrice,
      servicePrice: material ? String(material.servicePrice ?? (number(material.installPrice) + number(material.removalPrice))) : current.servicePrice,
    }))
  }

  function updateComponentActivity(name) {
    const matchingActivities = allComponentActivities.filter((activity) => activity.name === name)
    const selected = matchingActivities.find((activity) => normalizeCriteria(activity.criteria) === normalizeCriteria(form.criteria)) || matchingActivities[0]
    setForm((current) => ({ ...current, activity: name, criteria: selected?.criteria || current.criteria }))
  }

  function updatePrkSelection(prk) {
    setSaveStatus(null)
    setComponentMaterialFilters({ operation: 'all', criteria: 'all', source: 'all' })
    const source = programRecords.find((record) => record.id === prk || String(record.prk || '').trim() === String(prk).trim())
    const catalogActivity = activityCatalog.find((activity) => String(activity.prk || '').trim() === String(prk).trim())
    setForm((current) => ({
      ...current,
      programRecordId: source?.id || '',
      prk: String(prk).trim(),
      position: source?.position || source?.budgetPosition || '',
      rabNumber: source?.rabNumber || '',
      workPackage: '',
      name: '',
      unit: catalogActivity?.unit || '',
      criteria: normalizeCriteria(catalogActivity?.criteria) || current.criteria,
      componentVolumes: {},
      materialVolumes: {},
    }))
  }

  function updateActivityWorkPackage(workPackage) {
    setSaveStatus(null)
    setForm((current) => ({
      ...current,
      workPackage,
      name: '',
      materialVolumes: {},
      componentVolumes: {},
    }))
  }

  function updateActivityComponent(name) {
    setSaveStatus(null)
    setComponentMaterialFilters({ operation: 'all', criteria: 'all', source: 'all' })
    const catalogActivity = activityCatalog.find((activity) =>
      String(activity.prk || '').trim() === String(form.prk || '').trim()
        && normalizeWorkName(activity.workPackage) === normalizeWorkName(form.workPackage)
        && normalizeWorkName(activity.name) === normalizeWorkName(name)
    )
    const existingRows = (view === 'components' ? components : activities).filter((item) =>
      String(item.prk || '').trim() === String(form.prk || '').trim()
        && (view !== 'components' || !item.workPackage || normalizeWorkName(item.workPackage) === normalizeWorkName(form.workPackage))
        && normalizeWorkName(view === 'components' ? item.activity : item.componentName || item.name) === normalizeWorkName(name)
    )
    const materialVolumes = Object.fromEntries(existingRows.map((item) => [
      view === 'components' ? item.id : item.componentId || item.materialId,
      String(view === 'components' ? item.quantityPerUnit ?? '' : item.volume ?? ''),
    ]))
    setForm((current) => ({
      ...current,
      name,
      unit: catalogActivity?.unit || current.unit,
      criteria: normalizeCriteria(catalogActivity?.criteria) || current.criteria,
      ...(view === 'activities' ? { volume: String(existingRows[0]?.volume ?? '') } : {}),
      materialVolumes,
    }))
  }

  function updateActivityVolume(materialId, value) {
    setSaveStatus(null)
    setForm((current) => ({
      ...current,
      materialVolumes: { ...current.materialVolumes, [materialId]: value },
    }))
  }

  async function saveWorkflowData(nextRecords, successMessage) {
    const tracksSheetProgress = view === 'components' || view === 'activities'
    const result = await onSave(meta.collection, nextRecords, successMessage, (stage) => {
      if (!tracksSheetProgress) return
      setSaveStatus({
        type: 'progress',
        message: stage === 'local' ? 'Data tersimpan lokal. Menyiapkan Google Sheets...' : 'Mengirim data ke Google Sheets...',
      })
    })
    if (tracksSheetProgress) {
      setSaveStatus(result?.ok === false
        ? { type: 'error', message: result.message || 'Data tersimpan lokal, tetapi gagal disimpan ke Google Sheets.' }
        : { type: 'success', message: result?.message || 'Data berhasil disimpan ke Google Sheets.' })
    }
    return result
  }

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    if (view === 'components' || view === 'activities') {
      setSaveStatus({ type: 'progress', message: 'Menyiapkan penyimpanan lokal...' })
    }
    try {
      if (view === 'paFinalization') {
        const activity = activities.find((item) => item.programRecordId === selectedProgramRecord?.id)
          || activities.find((item) => item.prk === selectedProgramRecord?.prk)
        const completed = await onTransfer({
          recordId: selectedProgramRecord?.id,
          amount: transferAmount,
          date: form.date,
          notes: form.notes,
          criteria: activity?.criteria || '',
        })
        if (completed) setForm({ ...EMPTY_FORM[view] })
        return
      }
      const originalRecord = rows.find((row) => row.id === editingId)
      const record = { ...(originalRecord || {}), id: editingId || createId(), ...form, createdAt: originalRecord?.createdAt || new Date().toISOString() }
      if (view === 'materials') {
        record.materialPrice = number(form.materialPrice)
        record.servicePrice = number(form.servicePrice)
      }
      if (view === 'components') {
        record.quantityPerUnit = number(form.quantityPerUnit)
        record.materialPrice = number(form.materialPrice)
        record.servicePrice = number(form.servicePrice)
        record.materialPart = record.quantityPerUnit * record.materialPrice
        record.servicePart = record.quantityPerUnit * record.servicePrice
        record.totalPart = record.materialPart + record.servicePart
        record.materialName = materials.find((item) => item.id === form.materialId)?.name || ''
      }
      if (view === 'activities') {
        if (activityPrkComponents.length === 0) {
          throw new Error('Belum ada data RAB Komponen untuk kegiatan ini. Isi dan simpan RAB Komponen terlebih dahulu.')
        }
        const selectedProgramRecord = programRecords.find((item) => item.id === form.programRecordId)
          || programRecords.find((item) => String(item.prk || '').trim() === String(form.prk || '').trim())
        const nextGroupRows = activityPrkComponents.flatMap((group) => {
          const groupRows = rows.filter((item) => String(item.prk || '').trim() === String(form.prk || '').trim()
            && (!item.workPackage || normalizeWorkName(item.workPackage) === normalizeWorkName(form.workPackage))
            && normalizeWorkName(item.componentName || item.name) === group.key)
          return group.lines.map((line) => {
            const existing = groupRows.find((item) => (item.materialId || item.componentId) === (line.materialId || line.id))
            return {
              ...(existing || {}),
              id: existing?.id || createId(),
              rabNumber: form.rabNumber || selectedProgramRecord?.rabNumber || '',
              programRecordId: selectedProgramRecord?.id || '',
              prk: form.prk,
              position: form.position || selectedProgramRecord?.position || selectedProgramRecord?.budgetPosition || '',
              criteria: line.criteria || normalizeCriteria(form.criteria),
              workPackage: form.workPackage,
              name: group.name,
              componentName: group.name,
              unit: line.unit || group.unit,
              volume: 1,
              year: number(form.year),
              materialId: line.materialId || '',
              componentId: line.id || '',
              materialName: line.materialName || line.name,
              materialPrice: number(line.materialPrice),
              servicePrice: number(line.servicePrice),
              quantityPerUnit: number(line.quantityPerUnit) || 1,
              source: line.source || '',
              materialTotal: number(line.materialPart ?? number(line.materialPrice) * (number(line.quantityPerUnit) || 1)),
              serviceTotal: number(line.servicePart ?? number(line.servicePrice) * (number(line.quantityPerUnit) || 1)),
              total: number(line.totalPart ?? (number(line.materialPrice) + number(line.servicePrice)) * (number(line.quantityPerUnit) || 1)),
              notes: form.notes,
              createdAt: existing?.createdAt || new Date().toISOString(),
            }
          })
        })
        const nextRecords = [
          ...rows.filter((item) => {
            const itemCatalog = activityCatalog.find((activity) =>
              String(activity.prk || '').trim() === String(item.prk || '').trim()
                && normalizeWorkName(activity.name) === normalizeWorkName(item.componentName || item.name)
            )
            const itemWorkPackage = item.workPackage || itemCatalog?.workPackage
            return String(item.prk || '').trim() !== String(form.prk || '').trim()
              || normalizeWorkName(itemWorkPackage) !== normalizeWorkName(form.workPackage)
              || !activityPrkComponents.some((group) => group.key === normalizeWorkName(item.componentName || item.name))
          }),
          ...nextGroupRows,
        ]
        await saveWorkflowData(nextRecords, editingId ? `${meta.title} berhasil diperbarui.` : `${meta.title} berhasil disimpan.`)
        setForm({ ...EMPTY_FORM[view] })
        setEditingId('')
        return
      }
      if (view === 'components' && activityCatalog.length) {
        const sourceRecord = programRecords.find((item) => item.id === form.programRecordId)
          || programRecords.find((item) => String(item.prk || '').trim() === String(form.prk || '').trim())
        const groupRows = rows.filter((item) => String(item.prk || '').trim() === String(form.prk || '').trim()
          && (!item.workPackage || normalizeWorkName(item.workPackage) === normalizeWorkName(form.workPackage))
          && normalizeWorkName(item.activity) === normalizeWorkName(form.name))
        const visibleLineIds = new Set(visibleActivityLineItems.map((line) => line.id))
        const nextGroupRows = activityLineItems.map((line) => {
          const existing = groupRows.find((item) => (item.materialId || item.id) === (line.materialId || line.id))
          if (!visibleLineIds.has(line.id)) return existing || null
          const quantityPerUnit = number(form.materialVolumes[line.id])
          const materialPart = quantityPerUnit * line.materialPrice
          const servicePart = quantityPerUnit * line.servicePrice
          return {
            ...(existing || {}),
            id: existing?.id || createId(),
            criteria: line.criteria || normalizeCriteria(form.criteria),
            activity: form.name,
            workPackage: form.workPackage,
            prk: form.prk,
            programRecordId: sourceRecord?.id || '',
            name: line.materialName,
            materialId: line.materialId || '',
            materialName: line.materialName,
            quantityPerUnit,
            unit: line.unit || '',
            source: line.source,
            operation: line.operation,
            materialPrice: line.materialPrice,
            servicePrice: line.servicePrice,
            materialPart,
            servicePart,
            totalPart: materialPart + servicePart,
            notes: form.notes,
            createdAt: existing?.createdAt || new Date().toISOString(),
          }
        }).filter(Boolean)
        const nextRecords = [
          ...rows.filter((item) => !(String(item.prk || '').trim() === String(form.prk || '').trim()
            && (!item.workPackage || normalizeWorkName(item.workPackage) === normalizeWorkName(form.workPackage))
            && normalizeWorkName(item.activity) === normalizeWorkName(form.name))),
          ...nextGroupRows,
        ]
        await saveWorkflowData(nextRecords, editingId ? `${meta.title} berhasil diperbarui.` : `${meta.title} berhasil disimpan.`)
        setForm({ ...EMPTY_FORM[view] })
        setEditingId('')
        return
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
      await saveWorkflowData(nextRecords, editingId ? `${meta.title} berhasil diperbarui.` : `${meta.title} berhasil disimpan.`)
      setForm(view === 'components'
        ? { ...EMPTY_FORM.components, criteria: form.criteria, activity: form.activity }
        : { ...EMPTY_FORM[view] })
      setEditingId('')
    } catch (error) {
      if (view === 'components' || view === 'activities') {
        setSaveStatus({ type: 'error', message: `Penyimpanan gagal: ${error.message || 'Terjadi kesalahan yang tidak diketahui.'}` })
      } else throw error
    } finally {
      setSaving(false)
    }
  }

  async function removeRecord(id) {
    const next = rows.filter((row) => row.id !== id)
    await onSave(meta.collection, next, 'Data berhasil dihapus.')
  }

  async function removeActivityGroup(record) {
    const next = rows.filter((row) => !(String(row.prk || '').trim() === String(record.prk || '').trim()
      && normalizeWorkName(row.componentName || row.name) === normalizeWorkName(record.componentName || record.name)))
    await onSave(meta.collection, next, 'Rincian komponen RAB berhasil dihapus.')
  }

  function editRecord(record) {
    const defaults = EMPTY_FORM[view]
    setEditingId(record.id)
    if (view === 'components' && activityCatalog.length && record.prk) {
      const workPackage = record.workPackage || activityCatalog.find((activity) =>
        String(activity.prk || '').trim() === String(record.prk || '').trim()
          && normalizeWorkName(activity.name) === normalizeWorkName(record.activity)
      )?.workPackage || ''
      const matchingRows = rows.filter((item) => String(item.prk || '').trim() === String(record.prk || '').trim()
        && (!item.workPackage || normalizeWorkName(item.workPackage) === normalizeWorkName(workPackage))
        && normalizeWorkName(item.activity) === normalizeWorkName(record.activity))
      setForm({
        ...defaults,
        prk: record.prk,
        workPackage,
        programRecordId: record.programRecordId || '',
        activity: record.activity,
        name: record.activity,
        criteria: record.criteria || defaults.criteria,
        materialVolumes: Object.fromEntries(matchingRows.map((item) => [item.id, String(item.quantityPerUnit ?? '')])),
      })
    } else if (view === 'activities' && (record.materialId || record.componentId)) {
      const matchingRows = rows.filter((item) => String(item.prk || '').trim() === String(record.prk || '').trim())
      const componentVolumes = Object.fromEntries([...new Map(matchingRows.map((item) => [
        normalizeWorkName(item.componentName || item.name),
        [normalizeWorkName(item.componentName || item.name), String(item.volume ?? '')],
      ])).values()])
      setForm({
        ...defaults,
        rabNumber: record.rabNumber || '',
        programRecordId: record.programRecordId || '',
        prk: record.prk || '',
        position: record.position || '',
        criteria: record.criteria || defaults.criteria,
        workPackage: activityCatalog.find((activity) =>
          String(activity.prk || '').trim() === String(record.prk || '').trim()
            && normalizeWorkName(activity.name) === normalizeWorkName(record.componentName || record.name)
        )?.workPackage || '',
        componentVolumes,
        year: record.year || defaults.year,
        notes: record.notes || '',
      })
    } else {
      setForm(Object.fromEntries(Object.keys(defaults).map((key) => [key, record[key] ?? defaults[key]])))
    }
    window.requestAnimationFrame(() => formPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  function rowActions(record, label, onDelete) {
    if (readOnly) return <td className="workflow-actions-cell" />
    return <td className="workflow-actions-cell"><div className="workflow-row-actions">{!onDelete && <button className="workflow-edit" aria-label={`Edit ${label}`} onClick={() => editRecord(record)}><Pencil size={14} /></button>}<button className="workflow-delete" type="button" aria-label={onDelete ? `Batalkan ${label}` : `Hapus ${label}`} onClick={() => onDelete ? onDelete(record) : removeRecord(record.id)}><Trash2 size={14} /></button></div></td>
  }

  function field(name, label, options = {}) {
    const { type = 'text', required = true, placeholder = '', choices, min = 0, max, onChange, searchable = false } = options
    const choiceDropdownOpen = openChoiceField === name
    const matchingChoices = searchable && choiceDropdownOpen && choiceSearch
      ? choices.filter((choice) => choice.label.toLowerCase().includes(choiceSearch.toLowerCase()))
      : choices
    if (choices && searchable) {
      const selectedChoice = choices.find((choice) => choice.value === form[name])
      return <div className="workflow-field" key={name}>
        <span>{label}</span>
        <div className="workflow-searchable-select" onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setOpenChoiceField((current) => current === name ? '' : current)
        }}>
          <button className="workflow-select-trigger" type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={choiceDropdownOpen} aria-controls={`${name}-options`} onClick={() => {
            setChoiceSearch('')
            setOpenChoiceField((current) => current === name ? '' : name)
          }}>
            <span>{selectedChoice?.label || `Pilih ${label.toLowerCase()}`}</span><ChevronDown size={15} />
          </button>
          {choiceDropdownOpen && <div className="workflow-select-popover">
            <label className="workflow-select-search"><Search size={14} /><input type="search" autoFocus value={choiceSearch} placeholder={`Cari ${label.toLowerCase()}...`} aria-label={`Cari ${label.toLowerCase()}`} onKeyDown={(event) => {
              if (event.key === 'Escape') setOpenChoiceField('')
            }} onChange={(event) => setChoiceSearch(event.target.value)} /></label>
            <div className="workflow-select-options" role="listbox" id={`${name}-options`} aria-label={label}>
              {matchingChoices.map((choice) => <button className="workflow-select-option" type="button" role="option" aria-selected={form[name] === choice.value} title={choice.label} key={choice.value} onClick={() => {
                setChoiceSearch('')
                setOpenChoiceField('')
                if (onChange) onChange(choice.value)
                else updateField(name, choice.value)
              }}>{choice.label}</button>)}
              {matchingChoices.length === 0 && <span className="workflow-select-empty">Tidak ada pilihan yang cocok.</span>}
            </div>
          </div>}
        </div>
      </div>
    }
    return <label className="workflow-field" key={name}>
      <span>{label}</span>
      {choices ? <select required={required} value={form[name]} onChange={(event) => {
          if (onChange) onChange(event.target.value)
          else updateField(name, event.target.value)
        }}>
          <option value="">Pilih {label.toLowerCase()}</option>
          {choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
        </select> : <input required={required} type={type === 'number' ? 'text' : type} inputMode={type === 'number' ? 'decimal' : undefined} value={form[name]} placeholder={placeholder} onChange={(event) => {
        if (type === 'number') {
          const rawValue = event.target.value
          const numericValue = parseNumber(rawValue)
          const outsideRange = rawValue !== '' && (!Number.isFinite(numericValue) || numericValue < min || (max !== undefined && numericValue > max))
          const rangeMessage = max === undefined ? `Masukkan angka minimal ${min}.` : `Masukkan angka antara ${min} dan ${max}.`
          event.target.setCustomValidity(outsideRange ? rangeMessage : '')
        }
        updateField(name, event.target.value)
      }} />}
    </label>
  }

  function criteriaField() {
    return field('criteria', 'Kriteria jaringan', { choices: [{ value: 'TM', label: 'TM - Tegangan Menengah' }, { value: 'TR', label: 'TR - Tegangan Rendah' }] })
  }

  function rabSelectionSummary() {
    return <div className="workflow-rab-info workflow-rab-step-full">
      <div><span>No. PRK</span><strong>{form.prk || '-'}</strong></div>
      <div><span>Kegiatan</span><strong>{form.workPackage || '-'}</strong></div>
      <div><span>Komponen pekerjaan</span><strong>{form.name}</strong></div>
      <div><span>Kriteria</span><strong>{activityCriteriaLabels.join(', ') || normalizeCriteria(selectedCatalogActivity?.criteria) || '-'}</strong></div>
      <div><span>MDU / NON MDU</span><strong>{activitySourceLabels.join(', ') || 'Tidak tersedia'}</strong></div>
    </div>
  }

  function rabMaterialTable() {
    return <div className="workflow-rab-table-scroll workflow-rab-step-full"><table className="workflow-rab-table">
      <thead><tr><th>No.</th><th>Uraian</th><th>Volume</th><th>Satuan</th><th>Harga material</th><th>Harga jasa</th><th>Jml material</th><th>Jml jasa</th><th>Total harga</th></tr></thead>
      <tbody>{visibleActivityLineItems.map((line, index) => {
        const volume = number(form.materialVolumes[line.id])
        const lineMaterialTotal = line.materialPrice * line.quantityPerUnit * volume
        const lineServiceTotal = line.servicePrice * line.quantityPerUnit * volume
        return <tr key={line.id}>
          <td>{index + 1}</td>
          <td><strong>{line.materialName}</strong></td>
          <td><label className="workflow-rab-volume">
            <span className="sr-only">Volume {line.materialName}</span>
            <input required type="text" inputMode="decimal" value={form.materialVolumes[line.id] || ''} placeholder="0" onChange={(event) => {
              const rawValue = event.target.value
              const parsed = parseNumber(rawValue)
              event.target.setCustomValidity(rawValue !== '' && (!/^\d+(?:[.,]\d+)?$/.test(rawValue.trim()) || parsed < 0) ? 'Masukkan volume nol atau lebih.' : '')
              updateActivityVolume(line.id, rawValue)
            }} />
          </label></td>
          <td>{line.unit || '-'}</td>
          <td>{formatCurrency(line.materialPrice)}</td>
          <td>{formatCurrency(line.servicePrice)}</td>
          <td>{formatCurrency(lineMaterialTotal)}</td>
          <td>{formatCurrency(lineServiceTotal)}</td>
          <td className="workflow-total">{formatCurrency(lineMaterialTotal + lineServiceTotal)}</td>
        </tr>
      })}</tbody>
      <tfoot><tr><td colSpan="6">Jumlah</td><td>{formatCurrency(visibleActivityLineItems.reduce((sum, line) => sum + line.materialPrice * line.quantityPerUnit * number(form.materialVolumes[line.id]), 0))}</td><td>{formatCurrency(visibleActivityLineItems.reduce((sum, line) => sum + line.servicePrice * line.quantityPerUnit * number(form.materialVolumes[line.id]), 0))}</td><td className="workflow-total">{formatCurrency(visibleActivityLineItems.reduce((sum, line) => sum + (line.materialPrice + line.servicePrice) * line.quantityPerUnit * number(form.materialVolumes[line.id]), 0))}</td></tr></tfoot>
    </table></div>
  }

  function activityPrkComponentTable() {
    const materialTotal = activityPrkComponents.reduce((sum, group) => sum + group.materialTotal, 0)
    const serviceTotal = activityPrkComponents.reduce((sum, group) => sum + group.serviceTotal, 0)
    return <div className="workflow-rab-table-scroll workflow-rab-step-full"><table className="workflow-rab-table">
      <thead><tr><th>No.</th><th>Uraian Komponen</th><th>Jumlah material</th><th>Jumlah jasa</th><th>Total harga</th></tr></thead>
      <tbody>{activityPrkComponents.map((group, index) => <tr key={group.key}>
        <td>{index + 1}</td>
        <td><strong>{group.name}</strong></td>
        <td>{formatCurrency(group.materialTotal)}</td>
        <td>{formatCurrency(group.serviceTotal)}</td>
        <td className="workflow-total">{formatCurrency(group.materialTotal + group.serviceTotal)}</td>
      </tr>)}</tbody>
      <tfoot><tr><td colSpan="2">Jumlah</td><td>{formatCurrency(materialTotal)}</td><td>{formatCurrency(serviceTotal)}</td><td className="workflow-total">{formatCurrency(materialTotal + serviceTotal)}</td></tr></tfoot>
    </table></div>
  }

  function activityPrkSummary() {
    const criteria = [...new Set(activityPrkComponents.flatMap((group) => group.criteria.split(', ').filter(Boolean)))]
    const sources = [...new Set(activityPrkComponents.flatMap((group) =>
      group.lines.map((line) => String(line.source || '').trim().toUpperCase()).filter(Boolean)
    ))]
    return <div className="workflow-rab-info workflow-rab-step-full">
      <div><span>No. PRK</span><strong>{form.prk || '-'}</strong></div>
      <div><span>Kegiatan</span><strong>{form.workPackage || '-'}</strong></div>
      <div><span>Kriteria</span><strong>{criteria.join(', ') || '-'}</strong></div>
      <div><span>MDU / NON MDU</span><strong>{sources.join(', ') || 'Tidak tersedia'}</strong></div>
    </div>
  }

  function activityTaxSummary() {
    const subtotal = activityPrkComponents.reduce((sum, group) =>
      sum + group.materialTotal + group.serviceTotal, 0)
    const dpp = subtotal * 11 / 12
    const ppn = dpp * 0.12
    return <div className="workflow-tax-summary workflow-rab-step-full">
      <div><span>Subtotal</span><strong>{formatCurrency(subtotal)}</strong></div>
      <div><span>DPP (11/12)</span><strong>{formatCurrency(dpp)}</strong></div>
      <div><span>PPN 12%</span><strong>{formatCurrency(ppn)}</strong></div>
      <div className="workflow-tax-total"><span>TOTAL ANGGARAN</span><strong>{formatCurrency(subtotal + ppn)}</strong></div>
    </div>
  }

  function componentMaterialFilterControls() {
    const filterOptions = [
      { key: 'operation', label: 'Keterangan', values: componentFilterOptions.operation },
      { key: 'criteria', label: 'Kriteria', values: componentFilterOptions.criteria },
      { key: 'source', label: 'MDU / NON MDU', values: componentFilterOptions.source },
    ]
    return <div className="workflow-material-filters workflow-rab-step-full">
      {filterOptions.map(({ key, label, values }) => <label key={key}>
        <span>{label}</span>
        <select value={componentMaterialFilters[key]} onChange={(event) => setComponentMaterialFilters((current) => ({ ...current, [key]: event.target.value }))}>
          <option value="all">Semua</option>
          {values.map((value) => <option key={value} value={key === 'source' ? value.toUpperCase() : value}>{value}</option>)}
        </select>
      </label>)}
    </div>
  }

  function formFields() {
    if (view === 'materials') return <>
      {field('code', 'Kode material', { required: false, placeholder: 'Contoh: MTR-001' })}
      {field('name', 'Uraian material', { placeholder: 'Nama material sesuai standar' })}
      {field('unit', 'Satuan', { placeholder: 'btg, set, m, unit' })}
      {criteriaField()}
      {field('materialPrice', 'Harga material (Rp)', { type: 'number', step: '1', placeholder: '0' })}
      {field('servicePrice', 'Tarif jasa tunggal (Rp)', { type: 'number', step: '1', placeholder: '0', required: false })}
      {field('source', 'Jenis material', { choices: [{ value: 'MDU', label: 'MDU' }, { value: 'NON MDU', label: 'NON MDU' }] })}
    </>
    if (view === 'activityCatalog') return <>
      {field('workPackage', 'Paket pekerjaan', { required: false, placeholder: 'Contoh: Pembangunan jaringan' })}
      {field('name', 'Nama kegiatan', { placeholder: 'Nama kegiatan standar' })}
      {field('unit', 'Satuan kegiatan', { placeholder: 'kms, unit, set' })}
      {field('prk', 'No. PRK acuan', { required: false, placeholder: 'Opsional' })}
      {criteriaField()}
    </>
    if (view === 'components' && activityCatalog.length) return <>
      <div className="workflow-rab-step"><strong>1. Pilih PRK</strong><span>Pilih nomor PRK dari DATABASE KEGIATAN.</span></div>
      {field('prk', 'No. PRK', { choices: activityPrkChoices, onChange: updatePrkSelection, searchable: true })}
      {form.prk && <>
        <div className="workflow-rab-step"><strong>2. Pilih kegiatan</strong><span>Pilih kegiatan sesuai PRK.</span></div>
        {field('workPackage', 'Kegiatan', { choices: activityWorkPackageChoices, onChange: updateActivityWorkPackage, searchable: true })}
      </>}
      {form.workPackage && <>
      <div className="workflow-rab-step"><strong>3. Pilih komponen pekerjaan</strong><span>Komponen pekerjaan mengikuti kegiatan yang dipilih.</span></div>
      {field('name', 'Komponen pekerjaan', { choices: activityCatalogChoices, onChange: updateActivityComponent, searchable: true })}
      {componentMaterialFilterControls()}
      {form.name && <>
        {rabSelectionSummary()}
      <div className="workflow-rab-step workflow-rab-step-full"><strong>4. Isi volume komponen</strong><span>Data pilihan dimuat dari penyimpanan lokal. Uraian, satuan, kriteria, jenis material, dan harga terisi otomatis; Google Sheets baru diperbarui setelah volume diisi dan tombol simpan ditekan.</span></div>
        {activityLineItems.length
          ? <>{visibleActivityLineItems.length
            ? rabMaterialTable()
            : <div className="workflow-hint workflow-rab-step-full">Tidak ada material yang cocok dengan filter. Ubah pilihan filter atau pilih “Semua”.</div>}</>
          : <div className="workflow-hint workflow-rab-step-full">Belum ada material dengan komponen pekerjaan ini di FORM MATERIAL &amp; HARGA.</div>}
      </>}
      </>}
    </>
    if (view === 'components') return <>
      {criteriaField()}
      {componentActivityChoices.length
        ? field('activity', 'Nama kegiatan', { choices: componentActivityChoices, onChange: updateComponentActivity, searchable: true })
        : field('activity', 'Nama kegiatan', { placeholder: 'Contoh: Pemasangan SUTM per kilometer' })}
      {field('name', 'Uraian komponen pekerjaan', { placeholder: 'Nama material/pekerjaan' })}
      {field('materialId', 'Sumber material', { required: false, choices: materials.map((material) => ({ value: material.id, label: `${material.name} (${material.unit})` })), onChange: updateMaterialSelection, searchable: true })}
      {field('quantityPerUnit', 'Volume', { type: 'number', step: '0.001', placeholder: '1' })}
      {field('unit', 'Satuan komponen', { placeholder: 'btg, set, m, unit' })}
      {field('materialPrice', 'Harga material per satuan (Rp)', { type: 'number', step: '1', placeholder: '0', required: false })}
      {field('servicePrice', 'Tarif jasa tunggal per satuan (Rp)', { type: 'number', step: '1', placeholder: '0', required: false })}
    </>
    if (view === 'activities') return <>
      <div className="workflow-rab-step"><strong>1. Pilih PRK</strong><span>Pilih nomor PRK dari DATABASE KEGIATAN.</span></div>
      {field('prk', 'No. PRK', { choices: activityPrkChoices, onChange: updatePrkSelection, searchable: true })}
      {form.prk && <>
        <div className="workflow-rab-step"><strong>2. Pilih kegiatan</strong><span>Kegiatan mengikuti PRK yang dipilih.</span></div>
        {field('workPackage', 'Kegiatan', { choices: activityWorkPackageChoices, onChange: updateActivityWorkPackage, searchable: true })}
      </>}
      {form.workPackage && <>
        <div className="workflow-rab-step workflow-rab-step-full"><strong>Rekap RAB Komponen</strong><span>Jumlah komponen pekerjaan ditarik dari RAB Komponen. Tidak perlu mengisi volume di RAB Kegiatan.</span></div>
        {activityPrkSummary()}
        {activityPrkComponents.length
          ? activityPrkComponentTable()
          : <div className="workflow-hint workflow-rab-step-full">Belum ada data RAB Komponen untuk kegiatan ini. Isi dan simpan RAB Komponen terlebih dahulu.</div>}
      </>}
    </>
    if (view === 'paFinalization') return <>
      {field('recordId', 'PRK / RAB yang sudah final', { choices: programRecords.filter((record) => number(record.rabTotal) > 0).map((record) => ({ value: record.id, label: `${record.prk || record.rabNumber} | Sisa RAB ${formatCurrency(record.rabTotal)}` })), searchable: true })}
      {field('amount', 'Nilai dialihkan ke PA (Rp)', { type: 'number', step: '1', max: remainingRab, placeholder: 'Tidak melebihi sisa RAB' })}
      {field('date', 'Tanggal finalisasi', { type: 'date' })}
      {selectedProgramRecord && <div className="workflow-transfer-preview"><div><span>RAB sebelum</span><strong>{formatCurrency(remainingRab)}</strong></div><ArrowRightLeft size={16} /><div><span>RAB sesudah</span><strong>{formatCurrency(Math.max(0, remainingRab - transferAmount))}</strong></div><div><span>Saldo PA sesudah</span><strong>{formatCurrency(nextPA)}</strong></div></div>}
    </>
    if (view === 'materialRecap') return <>
      {field('activityId', 'Kegiatan RAB', { choices: activityGroupChoices.map((activity) => ({ value: activity.id, label: `${activity.criteria} | ${activity.prk} | ${activity.componentName || activity.name}` })) })}
      {field('materialId', 'Material digunakan', { choices: availableMaterials.map((material) => ({ value: material.id, label: `${material.name} (${material.unit})` })) })}
      {field('quantity', 'Volume material aktual', { type: 'number', step: '0.001', placeholder: '0' })}
      {field('date', 'Tanggal pemakaian', { type: 'date' })}
    </>
    return <>
      {field('activityId', 'Kegiatan RAB', { choices: activityGroupChoices.map((activity) => ({ value: activity.id, label: `${activity.criteria} | ${activity.prk} | ${activity.componentName || activity.name}` })) })}
      {field('date', 'Tanggal realisasi', { type: 'date' })}
      {field('volume', 'Volume terealisasi', { type: 'number', step: '0.001', placeholder: '0' })}
      {field('billed', 'Nilai tagihan (Rp)', { type: 'number', step: '1', placeholder: '0', required: false })}
      {field('paid', 'Nilai dibayar (Rp)', { type: 'number', step: '1', placeholder: '0', required: false })}
    </>
  }

  function tableRows() {
    if (view === 'paFinalization') return filteredRows.map((row) => <tr key={row.id}><td>{row.date}</td><td>{row.criteria || '-'}</td><td>{row.prk || '-'}</td><td>{row.rabNumber || '-'}</td><td className="workflow-total">{formatCurrency(row.amount)}</td><td>{formatCurrency(row.rabBefore)}</td><td>{formatCurrency(row.rabAfter)}</td><td>{formatCurrency(row.paBefore)}</td><td>{formatCurrency(row.paAfter)}</td>{rowActions(row, 'transfer PA', onCancelTransfer)}</tr>)
    if (view === 'activityCatalog') return filteredRows.map((row) => <tr key={row.id}><td>{row.workPackage || '-'}</td><td>{row.name}</td><td>{row.unit}</td><td>{row.criteria}</td><td>{row.prk || '-'}</td>{rowActions(row, 'master kegiatan')}</tr>)
    if (view === 'materialRecap') return filteredMaterialRows.map((row) => <tr key={row.id}><td>{row.criteria}</td><td>{row.prk}</td><td>{row.activity}</td><td>{row.material?.name || '-'}</td><td>{row.planned} {row.unit}</td><td>{row.actual} {row.unit}</td><td className={row.actual < row.planned ? 'workflow-warning' : ''}>{(row.planned - row.actual).toFixed(3)} {row.unit}</td></tr>)
    if (view === 'activities') return activityDisplayRows.map((row, index) => {
      const firstRecord = row.records[0]
      return <tr key={row.id}>
        <td>{index + 1}</td>
        <td className="workflow-component-description"><strong>{row.displayName}</strong></td>
        <td>{formatCurrency(row.materialTotal)}</td>
        <td>{formatCurrency(row.serviceTotal)}</td>
        <td className="workflow-total">{formatCurrency(row.total)}</td>
        {rowActions(firstRecord, 'kegiatan RAB', () => removeActivityGroup(row))}
      </tr>
    })
    if (view === 'realizations') return filteredRows.map((row) => {
      const activity = activities.find((item) => item.id === row.activityId)
      return <tr key={row.id}><td>{activity?.criteria || '-'}</td><td>{activity?.prk || '-'}</td><td>{activity?.name || '-'}</td><td>{row.date}</td><td>{row.volume}</td><td>{formatCurrency(row.billed)}</td><td>{formatCurrency(row.paid)}</td>{rowActions(row, 'realisasi')}</tr>
    })
    if (view === 'components') {
      return componentDisplayGroups.flatMap((group, index) => {
        const isExpanded = expandedComponentGroup === group.key
        const materialPart = group.rows.reduce((sum, row) => sum + number(row.materialPart ?? number(row.quantityPerUnit) * number(row.materialPrice)), 0)
        const servicePart = group.rows.reduce((sum, row) => sum + number(row.servicePart ?? number(row.quantityPerUnit) * number(row.servicePrice)), 0)
        const totalPart = group.rows.reduce((sum, row) => sum + number(row.totalPart ?? number(row.materialPart ?? number(row.quantityPerUnit) * number(row.materialPrice)) + number(row.servicePart ?? number(row.quantityPerUnit) * number(row.servicePrice))), 0)
        return [
          <tr key={group.key}>
            <td>{index + 1}</td>
            <td className="workflow-component-description">
              <button className="workflow-component-expand" type="button" aria-expanded={isExpanded} onClick={() => setExpandedComponentGroup((current) => current === group.key ? '' : group.key)}>
                <ChevronDown className={isExpanded ? 'is-expanded' : ''} size={15} />
                <span><strong>{group.title || 'Komponen tanpa judul'}</strong>{(group.prk || group.workPackage) && <small>{[group.prk && `PRK ${group.prk}`, group.workPackage].filter(Boolean).join(' | ')}</small>}</span>
              </button>
            </td>
            <td>{group.rows.length} material</td>
            <td className="workflow-total">{formatCurrency(totalPart)}</td>
          </tr>,
          ...(isExpanded ? [<tr className="workflow-component-detail-row" key={`${group.key}-details`}><td colSpan="4"><div className="workflow-component-details">
            <table><thead><tr><th>No</th><th>Uraian Material</th><th>Volume</th><th>Satuan</th><th>Harga satuan material</th><th>Harga satuan jasa</th><th>Bagian material</th><th>Bagian jasa</th><th>Jumlah (Rp)</th><th className="workflow-actions-heading">Aksi</th></tr></thead>
              <tbody>{group.rows.map((row, rowIndex) => {
                const lineMaterial = number(row.materialPart ?? number(row.quantityPerUnit) * number(row.materialPrice))
                const lineService = number(row.servicePart ?? number(row.quantityPerUnit) * number(row.servicePrice))
                return <tr key={row.id}><td>{rowIndex + 1}</td><td>{row.materialName || row.name || '-'}</td><td>{number(row.quantityPerUnit)}</td><td>{row.unit || '-'}</td><td>{formatCurrency(row.materialPrice)}</td><td>{formatCurrency(row.servicePrice)}</td><td>{formatCurrency(lineMaterial)}</td><td>{formatCurrency(lineService)}</td><td className="workflow-total">{formatCurrency(number(row.totalPart ?? lineMaterial + lineService))}</td>{rowActions(row, 'komponen RAB')}</tr>
              })}</tbody>
              <tfoot><tr><td colSpan="6">Jumlah</td><td>{formatCurrency(materialPart)}</td><td>{formatCurrency(servicePart)}</td><td className="workflow-total">{formatCurrency(totalPart)}</td><td /></tr></tfoot>
            </table>
          </div></td></tr>] : []),
        ]
      })
    }
    return filteredRows.map((row) => <tr key={row.id}><td>{row.code || '-'}</td><td>{row.name}</td><td>{row.criteria}</td><td>{row.unit}</td><td>{row.source || '-'}</td><td>{formatCurrency(row.materialPrice)}</td><td>{formatCurrency(row.servicePrice ?? (number(row.installPrice) + number(row.removalPrice)))}</td>{rowActions(row, 'material')}</tr>)
  }

  const tableHeaders = {
    materials: ['Kode', 'Uraian material', 'Kriteria', 'Satuan', 'Jenis', 'Harga material', 'Tarif jasa', ''],
    activityCatalog: ['Paket pekerjaan', 'Nama kegiatan', 'Satuan', 'Kriteria', 'No. PRK acuan', ''],
    components: ['No', 'Uraian Material', 'Volume', 'Satuan', 'Harga satuan material', 'Harga satuan jasa', 'Bagian material', 'Bagian jasa', 'Jumlah', 'Aksi'],
    activities: ['No', 'Uraian Komponen', 'Jumlah material', 'Jumlah jasa', 'Jumlah', 'Aksi'],
    paFinalization: ['Tanggal', 'Kriteria', 'No. PRK', 'No. RAB', 'Dialihkan', 'RAB sebelum', 'RAB sesudah', 'PA sebelum', 'PA sesudah', ''],
    materialRecap: ['Kriteria', 'No. PRK', 'Kegiatan', 'Material', 'Kebutuhan RAB', 'Terpakai aktual', 'Sisa/selisih'],
    realizations: ['Kriteria', 'No. PRK', 'Kegiatan', 'Tanggal', 'Volume', 'Tagihan', 'Dibayar', ''],
  }[view]
  const componentTotals = componentDisplayGroups.reduce((sum, group) => {
    group.rows.forEach((row) => {
      const materialPart = number(row.materialPart ?? number(row.quantityPerUnit) * number(row.materialPrice))
      const servicePart = number(row.servicePart ?? number(row.quantityPerUnit) * number(row.servicePrice))
      sum.materialPart += materialPart
      sum.servicePart += servicePart
      sum.total += number(row.totalPart ?? materialPart + servicePart)
    })
    return sum
  }, { materialPart: 0, servicePart: 0, total: 0 })
  const activityTableTotals = view === 'activities'
    ? form.workPackage && activityPrkComponents.length
      ? activityPrkComponents.reduce((sum, group) => ({
        material: sum.material + group.materialTotal,
        service: sum.service + group.serviceTotal,
        total: sum.total + group.materialTotal + group.serviceTotal,
      }), { material: 0, service: 0, total: 0 })
      : activityDisplayRows.reduce((sum, row) => ({
      material: sum.material + row.materialTotal,
      service: sum.service + row.serviceTotal,
      total: sum.total + row.total,
      }), { material: 0, service: 0, total: 0 })
    : { material: 0, service: 0, total: 0 }
  const activityDpp = activityTableTotals.total * 11 / 12
  const activityPpn = activityDpp * 0.12
  const activityTotalAnggaran = activityTableTotals.total + activityPpn
  const componentPrintGroups = [...new Map(components.filter((row) => row.activity?.trim()).map((row) => {
    const key = `${row.criteria || ''}::${row.prk || ''}::${row.activity.trim().toLowerCase()}`
    return [key, { key, criteria: row.criteria || '', activity: row.activity.trim(), prk: row.prk || '' }]
  })).values()]
  const componentBackedPrintGroups = [...new Map(components.flatMap((component) => {
    const catalogActivity = activityCatalog.find((activity) =>
      String(activity.prk || '').trim() === String(component.prk || '').trim()
        && (!component.workPackage || normalizeWorkName(activity.workPackage) === normalizeWorkName(component.workPackage))
        && normalizeWorkName(activity.name) === normalizeWorkName(component.activity)
    )
    const workPackage = component.workPackage || catalogActivity?.workPackage
    if (!workPackage) return []
    const key = `${String(component.prk || '').trim()}::${normalizeWorkName(workPackage)}`
    return [[key, { key, criteria: catalogActivity?.criteria || component.criteria || '', activity: workPackage, prk: component.prk || '', isComponentSummary: true }]]
  })).values()].map((group) => {
    const packageActivities = activityCatalog.filter((activity) =>
      String(activity.prk || '').trim() === String(group.prk).trim()
        && normalizeWorkName(activity.workPackage) === normalizeWorkName(group.activity)
    )
    const componentNames = new Map(packageActivities.map((activity) => [normalizeWorkName(activity.name), activity.name]))
    const componentGroups = [...components.reduce((groups, component) => {
      const componentKey = normalizeWorkName(component.activity)
      if (String(component.prk || '').trim() !== String(group.prk).trim() || !componentNames.has(componentKey)) return groups
      const lines = groups.get(componentKey) || { name: componentNames.get(componentKey), lines: [] }
      lines.lines.push(component)
      groups.set(componentKey, lines)
      return groups
    }, new Map()).values()].map((item) => ({
      id: `${group.key}::${normalizeWorkName(item.name)}`,
      activity: item.name,
      quantityPerUnit: 1,
      materialPrice: item.lines.reduce((sum, line) => sum + number(line.materialPart ?? number(line.quantityPerUnit) * number(line.materialPrice)), 0),
      servicePrice: item.lines.reduce((sum, line) => sum + number(line.servicePart ?? number(line.quantityPerUnit) * number(line.servicePrice)), 0),
    }))
    return { ...group, componentGroups }
  })
  const legacyActivityPrintGroups = [...new Map(activities.map((activity) => {
    const isMaterialLine = Boolean(activity.materialId)
    const key = isMaterialLine
      ? `${activity.prk || ''}::${normalizeWorkName(activity.componentName || activity.name)}`
      : activity.id
    const existing = activities.filter((item) => (isMaterialLine
      ? `${item.prk || ''}::${normalizeWorkName(item.componentName || item.name)}`
      : item.id) === key)
    return [key, {
      key,
      criteria: activity.criteria || '',
      activity: activity.componentName || activity.name,
      prk: activity.prk,
      rabNumber: activity.rabNumber,
      unit: activity.unit,
      activityIds: existing.map((item) => item.id),
      isMaterialGroup: isMaterialLine,
    }]
  })).values()]
  const activityPrintGroups = componentBackedPrintGroups.length ? componentBackedPrintGroups : legacyActivityPrintGroups
  const printGroups = view === 'activities' ? activityPrintGroups : componentPrintGroups
  const selectedPrintGroup = printGroups.find((group) => group.key === printGroupKey)
  const printableComponents = selectedPrintGroup
    ? view === 'activities'
      ? selectedPrintGroup.isComponentSummary
        ? selectedPrintGroup.componentGroups
        : selectedPrintGroup.isMaterialGroup
        ? activities.filter((activity) => selectedPrintGroup.activityIds.includes(activity.id)).map((activity) => ({
          id: activity.id,
          activity: activity.name,
          name: activity.materialName,
          materialName: activity.materialName,
          unit: activity.unit,
          quantityPerUnit: number(activity.volume) * (number(activity.quantityPerUnit) || 1),
          materialPrice: activity.materialPrice,
          servicePrice: activity.servicePrice,
        }))
        : getActivityComponents(activities.find((activity) => activity.id === selectedPrintGroup.activityIds[0]), components)
      : components.filter((row) => row.criteria === selectedPrintGroup.criteria
        && row.activity.trim().toLowerCase() === selectedPrintGroup.activity.toLowerCase()
        && (!selectedPrintGroup.prk || String(row.prk || '').trim() === String(selectedPrintGroup.prk).trim()))
    : []
  const printVolumeMultiplier = view === 'activities' && !selectedPrintGroup?.isMaterialGroup && !selectedPrintGroup?.isComponentSummary
    ? number(activities.find((activity) => activity.id === selectedPrintGroup?.activityIds[0])?.volume)
    : 1
  const printableRows = printableComponents.map((row) => {
    const volume = number(row.quantityPerUnit) * printVolumeMultiplier
    const materialPart = view === 'components'
      ? number(row.materialPart ?? volume * number(row.materialPrice))
      : volume * number(row.materialPrice)
    const servicePart = view === 'components'
      ? number(row.servicePart ?? volume * number(row.servicePrice))
      : volume * number(row.servicePrice)
    const masterMaterial = materials.find((material) => material.id === row.materialId)
    return {
      ...row,
      operation: row.operation || masterMaterial?.operation || '',
      printVolume: volume,
      printMaterialPart: materialPart,
      printServicePart: servicePart,
      printTotalPart: view === 'components'
        ? number(row.totalPart ?? materialPart + servicePart)
        : materialPart + servicePart,
    }
  })
  const printableActivityTotals = printableRows.reduce((sum, row) => ({
    material: sum.material + row.printMaterialPart,
    service: sum.service + row.printServicePart,
  }), { material: 0, service: 0 })
  const printableTotals = printableRows.reduce((sum, row) => sum + row.printTotalPart, 0)
  const printableDisplayRows = view === 'activities' && selectedPrintGroup
    ? selectedPrintGroup.isComponentSummary
      ? printableRows
      : [{
      id: selectedPrintGroup.key,
      activity: selectedPrintGroup.activity,
      printMaterialPart: printableActivityTotals.material,
      printServicePart: printableActivityTotals.service,
      printTotalPart: printableTotals,
    }]
    : printableRows
  const printableDpp = printableTotals * 11 / 12
  const printablePpn = printableDpp * 0.12
  const printableTotalAnggaran = printableTotals + printablePpn
  const printableAmountInWords = terbilangRupiah(view === 'activities' ? printableTotalAnggaran : printableTotals)

  const totals = view === 'activities'
    ? { label: 'Nilai RAB terdaftar', value: activities.filter((activity) => criteriaFilter === 'all' || activity.criteria === criteriaFilter).reduce((sum, activity) => {
      const costs = activityUnitCosts(activity)
      return sum + costs.material * number(activity.volume) + costs.service * number(activity.volume)
    }, 0) }
    : view === 'paFinalization'
      ? { label: 'Total dana dialihkan', value: filteredRows.reduce((sum, row) => sum + number(row.amount), 0) }
    : view === 'realizations'
      ? { label: 'Total pembayaran tercatat', value: filteredRows.reduce((sum, row) => sum + number(row.paid), 0) }
      : null

  return <div className={`workflow-page ${readOnly ? 'is-read-only' : ''}`}>
    <section className="workflow-heading"><div className="workflow-title-icon"><Icon size={21} /></div><div><p className="eyebrow">ALUR RAB &amp; REALISASI</p><h1>{meta.title}</h1><p>{meta.description}</p></div></section>
    {(view === 'activities' || (view === 'components' && activityCatalog.length > 0))
      ? <div className="workflow-stepbar" aria-label="Tahapan RAB"><span className={!form.prk ? 'current' : ''}>1 PRK</span><i /><span className={form.prk && !form.workPackage ? 'current' : ''}>2 Kegiatan</span><i /><span className={form.workPackage && (!form.name || view === 'activities') ? 'current' : ''}>{view === 'activities' ? '3 Rekap komponen' : '3 Komponen pekerjaan'}</span><i /><span>4 Finalisasi PA</span><i /><span>5 Realisasi</span></div>
      : <div className="workflow-stepbar" aria-label="Tahapan RAB"><span className={view === 'materials' ? 'current' : ''}>1 Material</span><i /><span className={view === 'components' ? 'current' : ''}>2 Komponen</span><i /><span className={view === 'activities' ? 'current' : ''}>3 Kegiatan</span><i /><span className={view === 'paFinalization' ? 'current' : ''}>4 Finalisasi PA</span><i /><span className={view === 'realizations' ? 'current' : ''}>5 Realisasi</span></div>}
    <div className={`workflow-layout ${view === 'components' || view === 'activities' ? 'workflow-layout-rab-wide' : ''}`}>
      <section ref={formPanelRef} className="panel workflow-form-panel">
        <div className="workflow-section-heading"><div><span className="workflow-section-icon">{editingId ? <Pencil size={15} /> : <Plus size={16} />}</span><h2>{editingId ? `Edit ${meta.title.toLowerCase()}` : view === 'materialRecap' ? 'Catat pemakaian material' : `Tambah ${meta.title.toLowerCase()}`}</h2></div></div>
        {view === 'components' && materials.length === 0 && components.length === 0 && <div className="workflow-hint">{activityCatalog.length ? 'Impor FORM MATERIAL & HARGA terlebih dahulu agar uraian dan harga dapat terisi otomatis.' : 'Isi master material terlebih dahulu. Harga material dan jasa tetap dapat diketik manual.'}</div>}
        {view === 'activities' && activityCatalog.length === 0 && <div className="workflow-hint">Impor DATABASE KEGIATAN terlebih dahulu agar PRK, kegiatan, dan komponen pekerjaan dapat dipilih.</div>}
        {view === 'materialRecap' && activities.length === 0 && <div className="workflow-hint">Buat RAB kegiatan terlebih dahulu. Kebutuhan material akan direkap dari komponen RAB.</div>}
        {view === 'realizations' && activities.length === 0 && <div className="workflow-hint">Buat RAB kegiatan terlebih dahulu sebelum mencatat realisasi.</div>}
        <form className="workflow-form" onSubmit={submit}>
          <div className="workflow-fields">{formFields()}{view !== 'activities' && field('notes', 'Catatan', { required: false, placeholder: 'Opsional' })}</div>
          {view === 'activities' && form.workPackage && activityPrkComponents.length > 0 && <div className="workflow-activities-form-tax">{activityTaxSummary()}</div>}
          <div className={`workflow-form-footer ${(view === 'components' || view === 'activities') ? 'workflow-rab-save-footer' : ''}`}><span>{view === 'activities' ? 'Rekap mengikuti total RAB Komponen.' : '* Wajib diisi'}</span><div className="workflow-form-actions">{editingId && <button className="button button-secondary" type="button" onClick={() => { setForm({ ...EMPTY_FORM[view] }); setEditingId(''); setSaveStatus(null) }}><X size={14} />Batal edit</button>}<button className="button button-primary" type="submit" disabled={saving || ((view === 'materialRecap' || view === 'realizations') && activities.length === 0) || (view === 'components' && activityCatalog.length > 0 && (!form.prk || !form.workPackage || !form.name || activityLineItems.length === 0)) || (view === 'activities' && (!form.prk || !form.workPackage || activityPrkComponents.length === 0))}><Save size={15} />{saving ? 'Menyimpan...' : view === 'components' ? 'Simpan ke Google Sheets' : view === 'activities' ? 'Simpan rekap ke Google Sheets' : editingId ? 'Simpan perubahan' : 'Simpan data'}</button></div>{(view === 'components' || view === 'activities') && saveStatus && <p className={`workflow-save-status is-${saveStatus.type}`} role={saveStatus.type === 'error' ? 'alert' : 'status'} aria-live="polite">{saveStatus.type === 'progress' && <span className="workflow-save-spinner" aria-hidden="true" />}{saveStatus.message}</p>}</div>
        </form>
      </section>
      {view !== 'components' && view !== 'activities' && <section className="workflow-summary panel">
        <span className="workflow-summary-icon"><Icon size={19} /></span>
        <div><span>{view === 'materialRecap' ? 'Baris kebutuhan material' : `Total ${meta.title.toLowerCase()}`}</span><strong>{view === 'materialRecap' ? plannedMaterialRows.length : rows.length}</strong></div>
        {totals && <div className="workflow-sum-money"><span>{totals.label}</span><strong>{formatCurrency(totals.value)}</strong></div>}
        {view === 'activities' && <div className="workflow-criteria-count"><span>TM <b>{activities.filter((activity) => activity.criteria === 'TM').length}</b></span><span>TR <b>{activities.filter((activity) => activity.criteria === 'TR').length}</b></span></div>}
      </section>}
    </div>

    {(view === 'components' || view === 'activities') && <section className="workflow-rab-total-panel panel" aria-label={`Total ${meta.title}`}>
      <span className="workflow-summary-icon"><Icon size={19} /></span>
      <div className="workflow-rab-total-count"><span>{view === 'components' ? 'Komponen pekerjaan' : `Baris ${meta.title.toLowerCase()}`}</span><strong>{view === 'activities' ? activityDisplayRows.length : view === 'components' ? componentDisplayGroups.length : filteredRows.length}</strong></div>
      {view === 'activities' && <>
        <div><span>Subtotal</span><strong>{formatCurrency(activityTableTotals.total)}</strong></div>
        <div><span>DPP (11/12)</span><strong>{formatCurrency(activityDpp)}</strong></div>
        <div><span>PPN (12%)</span><strong>{formatCurrency(activityPpn)}</strong></div>
        <div className="workflow-rab-total-final"><span>Total Anggaran</span><strong>{formatCurrency(activityTotalAnggaran)}</strong></div>
      </>}
      {view === 'components' && <div className="workflow-rab-total-final"><span>Total input RAB Komponen</span><strong>{formatCurrency(componentTotals.total)}</strong></div>}
    </section>}

    <section className="panel workflow-table-panel">
      <div className="workflow-table-heading"><div><p className="eyebrow">DATA TERSIMPAN</p><h2>{view === 'materialRecap' ? 'Rencana dan pemakaian material' : meta.title}</h2></div>{(view === 'components' || view === 'activities') ? <div className="workflow-print-controls"><select aria-label={view === 'activities' ? 'Pilih kegiatan untuk dicetak' : 'Pilih komponen pekerjaan untuk dicetak'} value={printGroupKey} onChange={(event) => setPrintGroupKey(event.target.value)}><option value="">{view === 'activities' ? 'Pilih kegiatan' : 'Pilih komponen pekerjaan'}</option>{printGroups.map((group) => <option key={group.key} value={group.key}>{group.criteria ? `${group.criteria} | ` : ''}{group.activity}{group.prk ? ` | PRK ${group.prk}` : ''}</option>)}</select><button className="button button-secondary" type="button" disabled={!printableComponents.length} onClick={() => window.print()}><Printer size={15} /> Cetak RAB</button></div> : <span className="workflow-count">{view === 'materialRecap' ? plannedMaterialRows.length : rows.length} baris</span>}</div>
      <div className="workflow-toolbar"><label className="workflow-search"><Search size={15} /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Cari uraian, PRK, atau kegiatan" /></label>{view !== 'components' && <div className="workflow-segment" role="group" aria-label="Filter kriteria"><button className={criteriaFilter === 'all' ? 'selected' : ''} onClick={() => setCriteriaFilter('all')}>Semua</button><button className={criteriaFilter === 'TM' ? 'selected' : ''} onClick={() => setCriteriaFilter('TM')}>TM</button><button className={criteriaFilter === 'TR' ? 'selected' : ''} onClick={() => setCriteriaFilter('TR')}>TR</button></div>}</div>
      <div className={`workflow-table-scroll ${view === 'components' || view === 'activities' ? 'workflow-component-table' : ''} ${view === 'materials' ? 'workflow-materials-freeze-scroll' : ''} ${view === 'activityCatalog' ? 'workflow-catalog-freeze-scroll' : ''}`}><table><thead>{view === 'components' ? <tr>{['No', 'Komponen Pekerjaan', 'Uraian', 'Jumlah (Rp)'].map((header) => <th key={header}>{header}</th>)}</tr> : <tr>{tableHeaders.map((header, index) => <th className={!header || header === 'Aksi' ? 'workflow-actions-heading' : undefined} key={`${header}-${index}`}>{header || <span className="sr-only">Aksi</span>}</th>)}</tr>}</thead><tbody>
        {view === 'materialRecap' ? tableRows() : tableRows()}
        {((view === 'materialRecap' && filteredMaterialRows.length === 0) || (view === 'activities' && activityDisplayRows.length === 0) || (view === 'components' && componentDisplayGroups.length === 0) || (view !== 'components' && view !== 'materialRecap' && view !== 'activities' && filteredRows.length === 0)) && <tr><td colSpan={view === 'components' ? 4 : tableHeaders.length}><div className="workflow-empty"><Icon size={23} /><strong>Belum ada data</strong><span>Gunakan formulir di atas untuk memulai alur ini.</span></div></td></tr>}
      </tbody>{view === 'components' && componentDisplayGroups.length > 0 && <tfoot className="workflow-summary-footer"><tr><td colSpan="3">Jumlah</td><td className="workflow-total">{formatCurrency(componentTotals.total)}</td></tr></tfoot>}{view === 'activities' && activityDisplayRows.length > 0 && <tfoot className="workflow-summary-footer"><tr><td colSpan="2">Jumlah</td><td>{formatCurrency(activityTableTotals.material)}</td><td>{formatCurrency(activityTableTotals.service)}</td><td className="workflow-total">{formatCurrency(activityTableTotals.total)}</td><td /></tr></tfoot>}</table></div>
      {view === 'activities' && activityDisplayRows.length > 0 && <div className="workflow-tax-summary"><div><span>DPP (11/12)</span><strong>{formatCurrency(activityDpp)}</strong></div><div><span>PPN 12%</span><strong>{formatCurrency(activityPpn)}</strong></div><div className="workflow-tax-total"><span>TOTAL ANGGARAN</span><strong>{formatCurrency(activityTotalAnggaran)}</strong></div></div>}
    </section>
    {view === 'materialRecap' && <section className="panel workflow-table-panel">
      <div className="workflow-table-heading"><div><p className="eyebrow">RIWAYAT PEMAKAIAN</p><h2>Catatan material aktual</h2></div><span className="workflow-count">{filteredRows.length} transaksi</span></div>
      <div className="workflow-table-scroll"><table><thead><tr><th>Tanggal</th><th>Kriteria</th><th>No. PRK</th><th>Kegiatan</th><th>Material</th><th>Volume</th><th className="workflow-actions-heading">Aksi</th></tr></thead><tbody>
        {filteredRows.length ? filteredRows.map((row) => <tr key={row.id}><td>{row.date}</td><td>{row.criteria}</td><td>{row.prk}</td><td>{row.activityName}</td><td>{materials.find((material) => material.id === row.materialId)?.name || '-'}</td><td>{row.quantity} {row.unit}</td>{rowActions(row, 'pemakaian material')}</tr>) : <tr><td colSpan="7"><div className="workflow-empty"><Boxes size={22} /><strong>Belum ada transaksi pemakaian</strong><span>Catat material aktual pada form di atas.</span></div></td></tr>}
      </tbody></table></div>
    </section>}
    {(view === 'components' || view === 'activities') && selectedPrintGroup && <article className="workflow-print-sheet">
      <header className="workflow-print-header">
        <div className="workflow-print-brand"><img className="workflow-print-logo" src={plnLogo} alt="Logo PT PLN (Persero)" /><strong>PT PLN (Persero)</strong></div>
        <div className="workflow-print-organization"><strong>Unit Induk Distribusi Bali</strong><span>Unit Pelaksana Pelayanan Pelanggan - Bali Utara</span></div>
      </header>
      <h1>Rencana Anggaran Biaya (RAB)</h1>
      <p className="workflow-print-activity">{selectedPrintGroup.criteria && <strong>{selectedPrintGroup.criteria} | </strong>}{selectedPrintGroup.activity}</p>
      {view === 'components' && selectedPrintGroup.prk && <p className="workflow-print-meta"><span>No. PRK: {selectedPrintGroup.prk}</span></p>}
      {view === 'activities' && (selectedPrintGroup.prk || selectedPrintGroup.rabNumber) && <p className="workflow-print-meta">{selectedPrintGroup.prk && <span>No. PRK: {selectedPrintGroup.prk}</span>}{selectedPrintGroup.rabNumber && <span>No. RAB: {selectedPrintGroup.rabNumber}</span>}</p>}
      <table className="workflow-print-table">
        {view === 'activities'
          ? <thead><tr><th>No</th><th>Uraian Komponen</th><th>Jumlah material (Rp)</th><th>Jumlah jasa (Rp)</th><th>Subtotal (Rp)</th></tr></thead>
          : <thead><tr><th rowSpan="2">No</th><th rowSpan="2">Uraian Material</th><th rowSpan="2">Volume</th><th rowSpan="2">Satuan</th><th colSpan="2">Harga Satuan (Rp)</th><th colSpan="2">Bagian (Rp)</th><th rowSpan="2">Jumlah (Rp)</th></tr><tr><th>Material</th><th>Jasa</th><th>Material</th><th>Jasa</th></tr></thead>}
        <tbody>{view === 'activities'
          ? printableDisplayRows.map((row, index) => <tr key={row.id}><td>{index + 1}</td><td><strong>{row.activity}</strong></td><td>{formatCurrency(row.printMaterialPart)}</td><td>{formatCurrency(row.printServicePart)}</td><td>{formatCurrency(row.printTotalPart)}</td></tr>)
          : printableRows.map((row, index) => <tr key={row.id}><td>{index + 1}</td><td><strong>{row.materialName || row.name || row.activity}</strong></td><td>{row.printVolume}</td><td>{row.unit || '-'}</td><td>{formatCurrency(row.materialPrice)}</td><td>{formatCurrency(row.servicePrice)}</td><td>{formatCurrency(row.printMaterialPart)}</td><td>{formatCurrency(row.printServicePart)}</td><td>{formatCurrency(row.printTotalPart)}</td></tr>)}</tbody>
        {view === 'components' && <tfoot><tr><th colSpan="6">Jumlah</th><th>{formatCurrency(printableActivityTotals.material)}</th><th>{formatCurrency(printableActivityTotals.service)}</th><th>{formatCurrency(printableTotals)}</th></tr></tfoot>}
      </table>
      <div className="workflow-print-summary">
        <div className="workflow-print-terbilang"><strong>Terbilang:</strong><span>{printableAmountInWords}</span></div>
        <div className="workflow-print-totals">
          {view === 'activities' && <div><span>Subtotal</span><strong>{formatCurrency(printableTotals)}</strong></div>}
          {view === 'activities' && <div><span>DPP (11/12)</span><strong>{formatCurrency(printableDpp)}</strong></div>}
          {view === 'activities' && <div><span>PPN (12%)</span><strong>{formatCurrency(printablePpn)}</strong></div>}
          <div className={view === 'activities' ? 'workflow-print-budget-total' : 'workflow-print-component-total'}>
            <span>{view === 'activities' ? 'TOTAL ANGGARAN' : 'JUMLAH'}</span>
            <strong>{formatCurrency(view === 'activities' ? printableTotalAnggaran : printableTotals)}</strong>
          </div>
        </div>
      </div>
      <p className="workflow-print-location">Bali, ........................................</p>
      <section className="workflow-print-signatures" aria-label="Tempat tanda tangan">
        {['Disusun oleh', 'Diperiksa oleh', 'Disetujui oleh'].map((label) => <div key={label}><strong>{label}</strong><span className="workflow-print-signature-space" /><span>Nama / Jabatan</span></div>)}
      </section>
    </article>}
    {view === 'activities' && <p className="workflow-footnote"><Check size={14} /> Harga material dan jasa mengikuti komponen pekerjaan; total RAB dihitung dari harga satuan dikalikan volume setiap material.</p>}
  </div>
}