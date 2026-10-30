import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ArrowRightLeft, Boxes, Check, ChevronDown, CircleAlert, ClipboardList, Pencil, Plus, Printer, Save, Search, Trash2, Wrench, X } from 'lucide-react'
import { formatCurrency, parseNumber } from './lib/workbook.js'
import { terbilangRupiah } from './lib/terbilang.js'
import { findProgramRecordForRabGroup } from './lib/rabReferences.js'
import { calculateRabBudgetTotal } from './lib/rabTotals.js'
import { getBillingForDate, getPlannedBilling } from './lib/contractBilling.js'
import plnLogo from '../logo/Logo_PLN.png'
import './workflow.css'

const VIEW_META = {
  materials: { title: 'Input Material', description: 'Master material dan harga yang menjadi sumber komponen RAB.', icon: Boxes, collection: 'materials' },
  activityCatalog: { title: 'Master Kegiatan', description: 'Kelola paket, nama, satuan, kriteria, dan PRK untuk acuan komponen RAB.', icon: ClipboardList, collection: 'activityCatalog' },
  components: { title: 'Input RAB', description: 'Susun kebutuhan material dan jasa per kegiatan, dipisah TM dan TR.', icon: Wrench, collection: 'components' },
  activities: { title: 'Rekap RAB', description: 'Lihat dan cetak RAB yang sudah disimpan pada menu Input RAB.', icon: ClipboardList, collection: 'activities' },
  paFinalization: { title: 'Finalisasi RAB ke PA', description: 'Pilih Rekap RAB untuk ditambahkan ke PA, lalu catat nomor dan nilai kontrak.', icon: ArrowRightLeft, collection: 'paTransfers' },
  materialRecap: { title: 'Rekap Material', description: 'Bandingkan kebutuhan material dari RAB dengan pemakaian aktual.', icon: Boxes, collection: 'materialRecap' },
  realizations: { title: 'Realisasi', description: 'Catat setiap tanggal tagihan dan pembayaran per kontrak, lalu pantau sisa nilai kontrak.', icon: Activity, collection: 'realizations' },
}

const EMPTY_FORM = {
  materials: { code: '', componentActivity: '', name: '', unit: '', criteria: 'TR', materialPrice: '', servicePrice: '', source: 'NON MDU', operation: '', notes: '' },
  activityCatalog: { workPackage: '', name: '', unit: '', prk: '', criteria: 'TR', notes: '' },
  components: { criteria: 'TR', activity: '', workPackage: '', prk: '', prkFix: '', program: '', year: '', status: '', rabNumber: '', paNumber: '', rabTitle: '', programRecordId: '', name: '', materialId: '', quantityPerUnit: '1', unit: '', materialPrice: '', servicePrice: '', materialVolumes: {}, notes: '' },
  activities: { rabNumber: '', rabTitle: '', paNumber: '', programRecordId: '', prk: '', position: '', criteria: 'TR', workPackage: '', year: new Date().getFullYear(), notes: '' },
  paFinalization: { recordId: '', amount: '', date: new Date().toISOString().slice(0, 10), notes: '' },
  materialRecap: { activityId: '', materialId: '', quantity: '', date: new Date().toISOString().slice(0, 10), notes: '' },
  realizations: { prk: '', activityId: '', date: new Date().toISOString().slice(0, 10), billed: '', paymentDate: '', paid: '', paymentStatus: 'BELUM LUNAS', notes: '' },
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
const getRealizationActivityName = (activity, contract) =>
  String(contract?.description || activity?.workPackage || activity?.componentName || activity?.name || '').trim()
const hasContractDetails = (record) => String(record?.contractNumber ?? '').trim().length > 0
  || String(record?.vendor ?? '').trim().length > 0
  || number(record?.contractValue) > 0
  || ['startDate', 'endDate', 'plannedContract', 'plannedBilling', 'progress', 'projectedBilling', 'paymentDate']
    .some((key) => String(record?.[key] ?? '').trim().length > 0)
const getActivityComponents = (activity, components) => {
  const matching = components.filter((component) =>
    normalizeWorkName(component.activity) === normalizeWorkName(activity.name)
  )
  const programComponents = matching.filter((component) => String(component.prk || '').trim() === String(activity.prk || '').trim())
  return programComponents.length ? programComponents : matching.filter((component) => !String(component.prk || '').trim())
}

export default function RabWorkflow({ view, collections, programRecords = [], onSave, onTransfer, onFinalizeRab, onCancelTransfer, onEditRab, editComponentId, onEditComponentHandled, readOnly = false }) {
  const meta = VIEW_META[view]
  const Icon = meta.icon
  const rows = useMemo(() => collections[meta.collection] || [], [collections, meta.collection])
  const materials = collections.materials || []
  const activityCatalog = useMemo(() => collections.activityCatalog || [], [collections])
  const components = useMemo(() => collections.components || [], [collections])
  const activities = collections.activities || []
  const recapEntries = collections.materialRecap || []
  const [form, setForm] = useState(() => ({ ...EMPTY_FORM[view] }))
  const [criteriaFilter, setCriteriaFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [choiceSearch, setChoiceSearch] = useState('')
  const [openChoiceField, setOpenChoiceField] = useState('')
  const [printGroupKey, setPrintGroupKey] = useState('')
  const [printRequestVersion, setPrintRequestVersion] = useState(0)
  const handledPrintRequestRef = useRef(0)
  const [componentMaterialFilters, setComponentMaterialFilters] = useState({ operation: 'all', criteria: 'all', source: 'all' })
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [saveStatus, setSaveStatus] = useState(null)
  const [editingId, setEditingId] = useState('')
  const [editingRecordIndex, setEditingRecordIndex] = useState(-1)
  const [expandedComponentGroup, setExpandedComponentGroup] = useState('')
  const [expandedRabMaterialGroup, setExpandedRabMaterialGroup] = useState('')
  const [expandedActivityGroup, setExpandedActivityGroup] = useState('')
  const [expandedRealizationGroup, setExpandedRealizationGroup] = useState('')
  const [finalizeRabGroup, setFinalizeRabGroup] = useState(null)
  const [finalizationSearch, setFinalizationSearch] = useState('')
  const [finalizationPrkFilter, setFinalizationPrkFilter] = useState('all')
  const [finalizationActivityFilter, setFinalizationActivityFilter] = useState('all')
  const [finalizationProgramFilter, setFinalizationProgramFilter] = useState('all')
  const [finalizationYearFilter, setFinalizationYearFilter] = useState('all')
  const [finalizationStatusFilter, setFinalizationStatusFilter] = useState('all')
  const [activityPrkFilter, setActivityPrkFilter] = useState('')
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
      const componentName = String(row.activity || row.componentName || row.name || row.materialName || '').trim()
      const rabTitle = String(row.rabTitle || '').trim()
      const rabNumber = String(row.rabNumber || '').trim()
      const title = [rabTitle, rabNumber && `No. RAB ${rabNumber}`].filter(Boolean).join(' — ') || componentName
      const legacyTitle = rabTitle || rabNumber ? '' : componentName
      const key = JSON.stringify([
        String(row.prk || '').trim(),
        normalizeWorkName(row.workPackage),
        normalizeWorkName(rabTitle),
        normalizeWorkName(rabNumber),
        normalizeWorkName(legacyTitle),
      ])
      const group = groups.get(key) || { key, title, rabTitle, rabNumber, prk: row.prk || '', workPackage: row.workPackage || '', criteria: row.criteria || '', rows: [] }
      group.rows.push(row)
      groups.set(key, group)
      return groups
    }, new Map()).values()]
      .filter((group) => !searchTerm || `${group.title} ${group.prk} ${group.workPackage} ${group.criteria} ${group.rows.map((row) => Object.values(row).join(' ')).join(' ')}`
        .toLowerCase().includes(searchTerm.toLowerCase()))
    : []
  const selectedActivity = activities.find((activity) => activity.id === form.activityId)
  const selectedProgramRecord = programRecords.find((record) => record.id === form.recordId)
  const selectedPrkRecord = findProgramRecordForRabGroup(programRecords, {
    prk: form.prk,
    records: [{ programRecordId: form.programRecordId }],
  })
  const transferAmount = number(form.amount)
  const remainingRab = number(selectedProgramRecord?.rabTotal)
  const currentPA = number(selectedProgramRecord?.paTotal)
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
    .map(([prk]) => ({ value: prk, label: prk }))
  const activityCatalogChoices = [...new Map(activityCatalog
    .filter((activity) => String(activity.prk || '').trim() === String(form.prk || '').trim()
      && normalizeWorkName(activity.workPackage) === normalizeWorkName(form.workPackage)
      && String(activity.name || '').trim())
    .map((activity) => [normalizeWorkName(activity.name), activity]))
    .values()]
    .map((activity) => ({ value: activity.name, label: `${activity.name}${activity.unit ? ` (${activity.unit})` : ''}` }))
  const materialActivityChoices = [...activityCatalog.reduce((choices, activity) => {
    const name = String(activity.name || '').trim()
    const key = normalizeWorkName(name)
    if (!key) return choices
    const choice = choices.get(key) || { name, unit: activity.unit, references: new Set() }
    const reference = [activity.prk, activity.workPackage].map((value) => String(value || '').trim()).filter(Boolean).join(' | ')
    if (reference) choice.references.add(reference)
    choices.set(key, choice)
    return choices
  }, new Map()).values()]
    .map(({ name, unit, references }) => ({
      value: name,
      label: `${name}${unit ? ` (${unit})` : ''}${references.size ? ` — ${[...references].join('; ')}` : ''}`,
    }))
  if (editingId && form.componentActivity && !materialActivityChoices.some((choice) =>
    normalizeWorkName(choice.value) === normalizeWorkName(form.componentActivity)
  )) {
    materialActivityChoices.push({ value: form.componentActivity, label: `${form.componentActivity} (data lama)` })
  }
  const selectedMaterialActivity = activityCatalog.find((activity) =>
    normalizeWorkName(activity.name) === normalizeWorkName(form.componentActivity)
  ) || (editingId && form.componentActivity ? { name: form.componentActivity } : null)
  const activityWorkPackageChoices = [...new Map(activityCatalog
    .filter((activity) => String(activity.prk || '').trim() === String(form.prk || '').trim() && String(activity.workPackage || '').trim())
    .map((activity) => [normalizeWorkName(activity.workPackage), activity.workPackage.trim()]))
    .values()]
    .map((workPackage) => ({ value: workPackage, label: workPackage }))
  const savedRabChoices = view === 'activities' && form.prk && form.workPackage
    ? [...new Map(components
      .filter((row) => String(row.prk || '').trim() === String(form.prk).trim()
        && (!row.workPackage || normalizeWorkName(row.workPackage) === normalizeWorkName(form.workPackage))
        && (String(row.rabTitle || '').trim() || String(row.rabNumber || '').trim()))
      .map((row) => {
        const title = String(row.rabTitle || '').trim()
        const rabNumber = String(row.rabNumber || '').trim()
        const key = JSON.stringify([normalizeWorkName(title), normalizeWorkName(rabNumber)])
        return [key, {
          value: key,
          label: [title || 'Nama RAB belum diisi', rabNumber && `No. RAB ${rabNumber}`].filter(Boolean).join(' — '),
          rabTitle: title,
          rabNumber,
        }]
      }))
      .values()]
    : []
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
        quantityPerUnit: number(component?.quantityPerUnit ?? 1),
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
        quantityPerUnit: number(component.quantityPerUnit ?? 1),
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
    }).filter((group) => {
      if (!form.rabTitle && !form.rabNumber) return true
      return group.lines.some((line) =>
        normalizeWorkName(line.rabTitle) === normalizeWorkName(form.rabTitle)
          && normalizeWorkName(line.rabNumber) === normalizeWorkName(form.rabNumber))
    })
    : []
  const visibleActivityLineItems = view !== 'components' ? activityLineItems : activityLineItems.filter((line) =>
    (componentMaterialFilters.operation === 'all' || line.operation === componentMaterialFilters.operation)
      && (componentMaterialFilters.criteria === 'all' || normalizeCriteria(line.criteria) === componentMaterialFilters.criteria)
      && (componentMaterialFilters.source === 'all' || String(line.source || '').trim().toUpperCase() === componentMaterialFilters.source)
  )
  const activityCriteriaLabels = [...new Set(visibleActivityLineItems.map((line) => normalizeCriteria(line.criteria)).filter(Boolean))]
  const activitySourceLabels = [...new Set(visibleActivityLineItems.map((line) => String(line.source || '').trim().toUpperCase()).filter(Boolean))]
  const selectedRabRows = components.filter((component) =>
    String(component.prk || '').trim() === String(form.prk || '').trim()
      && normalizeWorkName(component.workPackage) === normalizeWorkName(form.workPackage)
      && normalizeWorkName(component.rabTitle) === normalizeWorkName(form.rabTitle)
      && normalizeWorkName(component.rabNumber) === normalizeWorkName(form.rabNumber))
  const selectedComponentName = normalizeWorkName(form.name)
  const subtotalOutsideSelectedComponent = selectedRabRows
    .filter((component) => normalizeWorkName(component.activity) !== selectedComponentName)
    .reduce((sum, component) => sum + number(component.totalPart
      ?? (number(component.materialPrice) + number(component.servicePrice)) * number(component.quantityPerUnit ?? 1)), 0)
  const draftComponentSubtotal = activityLineItems.reduce((sum, line) => {
    const quantity = number(form.materialVolumes?.[line.id])
    return sum + quantity * line.quantityPerUnit * (line.materialPrice + line.servicePrice)
  }, 0)
  const inputRabSubtotal = subtotalOutsideSelectedComponent + draftComponentSubtotal
  const inputRabDpp = inputRabSubtotal * 11 / 12
  const inputRabTotalAnggaran = calculateRabBudgetTotal(inputRabSubtotal)
  const inputRabPpn = inputRabTotalAnggaran - inputRabSubtotal
  const realizationActivities = view === 'realizations'
    ? [...components.reduce((groups, component) => {
      const name = String(component.activity || component.componentName || component.name || '').trim()
      if (!name) return groups
      const prk = String(component.prk || '').trim()
      const catalogActivity = activityCatalog.find((activity) =>
        String(activity.prk || '').trim() === prk
          && normalizeWorkName(activity.name) === normalizeWorkName(name))
      const workPackage = component.workPackage || catalogActivity?.workPackage || name
      const rabTitle = String(component.rabTitle || '').trim()
      const rabNumber = String(component.rabNumber || '').trim()
      const key = JSON.stringify([prk, normalizeWorkName(workPackage), normalizeWorkName(rabTitle), normalizeWorkName(rabNumber), normalizeWorkName(name)])
      const group = groups.get(key) || {
        id: `input-rab:${key}`,
        name,
        componentName: name,
        prk,
        workPackage,
        criteriaValues: new Set(),
        programRecordIds: new Set(),
        program: component.program || '',
        year: component.year || '',
      }
      const criteria = normalizeCriteria(component.criteria || catalogActivity?.criteria)
      if (criteria) group.criteriaValues.add(criteria)
      if (component.programRecordId) group.programRecordIds.add(String(component.programRecordId))
      groups.set(key, group)
      return groups
    }, new Map()).values()].map((group) => ({
      ...group,
      criteria: [...group.criteriaValues].join(', '),
      programRecordId: group.programRecordIds.size === 1 ? [...group.programRecordIds][0] : '',
    }))
    : []
  const activityGroupChoices = view === 'realizations'
    ? realizationActivities.filter((activity) => String(activity.prk || '') === String(form.prk || ''))
    : [...new Map(activities.map((activity) => {
      const key = `${String(activity.prk || '').trim()}::${normalizeWorkName(activity.componentName || activity.name)}`
      return [key, activity]
    })).values()]
  const realizationActivityById = new Map([
    ...activities.map((activity) => [String(activity.id), activity]),
    ...realizationActivities.map((activity) => [String(activity.id), activity]),
  ])
  const programRecordForActivity = (activity) => activity ? findProgramRecordForRabGroup(programRecords, {
    prk: activity.prk,
    workPackage: activity.workPackage || activity.componentName || activity.name,
    records: [{ programRecordId: activity.programRecordId, program: activity.program, year: activity.year }],
  }) : null
  const selectedRealizationActivity = realizationActivityById.get(String(form.activityId))
  const selectedRealizationContract = programRecordForActivity(selectedRealizationActivity)
  const selectedRealizationBilling = getBillingForDate(selectedRealizationContract, form.date)
  const selectedRealizationBillingIsScheduled = selectedRealizationBilling.amount !== ''
    && selectedRealizationBilling.amount !== null
    && selectedRealizationBilling.amount !== undefined
  const realizationGroups = view === 'realizations' ? [...filteredRows.reduce((groups, row) => {
    const activity = realizationActivityById.get(String(row.activityId))
    const contract = programRecordForActivity(activity)
    const activityGroup = activity
      ? `${String(activity.prk || '').trim()}::${normalizeWorkName(activity.componentName || activity.name)}`
      : String(row.activityId || 'unknown')
    const key = contract ? `contract:${contract.id}` : `activity:${activityGroup}`
    const group = groups.get(key) || {
      key,
      contract,
      prk: contract?.prk || activity?.prk || row.prk || '',
      contractNumber: contract?.contractNumber || '',
      activityNames: new Set(),
      entries: [],
    }
    const activityName = getRealizationActivityName(activity, contract) || row.activityName
    if (activityName) group.activityNames.add(activityName)
    group.entries.push({ row, activity, contract })
    groups.set(key, group)
    return groups
  }, new Map()).values()].map((group) => {
    const billed = group.entries.reduce((sum, entry) => sum + number(entry.row.billed), 0)
    const paid = group.entries.reduce((sum, entry) => sum + number(entry.row.paid), 0)
    const latest = group.entries.reduce((current, entry) => {
      const date = String(entry.row.date || '')
      const createdAt = String(entry.row.createdAt || '')
      return !current || date > current.date || (date === current.date && createdAt > current.createdAt)
        ? { date, createdAt, status: entry.row.paymentStatus }
        : current
    }, null)
    return {
      ...group,
      activityNames: [...group.activityNames],
      entries: group.entries.sort((left, right) => String(right.row.date || '').localeCompare(String(left.row.date || ''))),
      contractValue: number(group.contract?.contractValue),
      billed,
      paid,
      remaining: Math.max(0, number(group.contract?.contractValue) - paid),
      latestStatus: latest?.status || '',
    }
  }) : []
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
    ? { material: number(activity.materialPrice) * number(activity.quantityPerUnit ?? 1), service: number(activity.servicePrice) * number(activity.quantityPerUnit ?? 1) }
    : activityTotals(activity)
  const resolveActivityWorkPackage = (activity) => activity.workPackage || activityCatalog.find((item) =>
    String(item.prk || '').trim() === String(activity.prk || '').trim()
      && normalizeWorkName(item.name) === normalizeWorkName(activity.componentName || activity.name))?.workPackage || ''
  const savedInputActivityRows = components.map((component) => ({
    ...component,
    name: component.activity || component.componentName || component.name,
    componentName: component.activity || component.componentName || component.name,
    componentId: component.componentId || component.id,
    materialName: component.materialName || component.name,
    volume: 1,
    total: number(component.totalPart
      ?? (number(component.materialPrice) + number(component.servicePrice)) * number(component.quantityPerUnit ?? 1)),
  }))
  const activityRows = view === 'activities' || view === 'paFinalization' ? savedInputActivityRows : rows
  const activityDisplayRows = view === 'activities' || view === 'paFinalization'
    ? [...new Map(activityRows.map((activity) => {
      const isMaterialGroup = Boolean(activity.materialId || activity.componentId)
      const workPackage = resolveActivityWorkPackage(activity)
      const rabTitle = String(activity.rabTitle || '').trim()
      const rabNumber = String(activity.rabNumber || '').trim()
      const key = isMaterialGroup
        ? `${String(activity.prk || '').trim()}::${normalizeWorkName(workPackage)}::${normalizeWorkName(rabTitle)}::${normalizeWorkName(rabNumber)}::${normalizeWorkName(activity.componentName || activity.name)}`
        : activity.id
      const groupRows = activityRows.filter((item) => (isMaterialGroup
        ? Boolean(item.materialId || item.componentId)
          && String(item.prk || '').trim() === String(activity.prk || '').trim()
          && normalizeWorkName(resolveActivityWorkPackage(item)) === normalizeWorkName(workPackage)
          && normalizeWorkName(item.rabTitle) === normalizeWorkName(rabTitle)
          && normalizeWorkName(item.rabNumber) === normalizeWorkName(rabNumber)
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
          && normalizeWorkName(item.name) === normalizeWorkName(activity.componentName || activity.name))
      const materialUnitPrice = groupRows.reduce((sum, item) => sum
        + number(item.materialPrice) * number(item.quantityPerUnit ?? 1), 0)
      const serviceUnitPrice = groupRows.reduce((sum, item) => sum
        + number(item.servicePrice) * number(item.quantityPerUnit ?? 1), 0)
      return [key, {
        ...activity,
        id: key,
        displayName: activity.componentName || activity.name,
        workPackage,
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
        && (view === 'paFinalization' || [row.prk, row.displayName, row.workPackage, row.rabTitle, row.rabNumber,
          ...row.records.map((item) => `${item.materialName || item.name || ''} ${item.materialId || ''}`)]
          .join(' ').toLowerCase().includes(searchTerm.toLowerCase()))
    )
    : []
  const activitySavedGroups = view === 'activities' || view === 'paFinalization'
    ? [...activityDisplayRows.reduce((groups, component) => {
      const catalogActivity = activityCatalog.find((item) =>
        String(item.prk || '').trim() === String(component.prk || '').trim()
          && normalizeWorkName(item.name) === normalizeWorkName(component.componentName || component.name))
      const workPackage = component.workPackage || catalogActivity?.workPackage || component.displayName
      const rabTitle = String(component.rabTitle || '').trim()
      const rabNumber = String(component.rabNumber || '').trim()
      const key = `${String(component.prk || '').trim()}::${normalizeWorkName(workPackage)}::${normalizeWorkName(rabTitle)}::${normalizeWorkName(rabNumber)}`
      const group = groups.get(key) || {
        key,
        prk: component.prk || '',
        workPackage,
        rabTitle,
        rabNumber,
        criteria: component.criteria || '',
        components: [],
        records: [],
      }
      group.components.push(component)
      group.records.push(...component.records)
      groups.set(key, group)
      return groups
    }, new Map()).values()]
      .filter((group) => {
        const selectedPrk = view === 'activities' ? form.prk || activityPrkFilter : ''
        const matchesPrk = !selectedPrk || String(group.prk).trim() === String(selectedPrk).trim()
        const matchesRab = view !== 'activities' || (!form.rabTitle && !form.rabNumber)
          || (normalizeWorkName(group.rabTitle) === normalizeWorkName(form.rabTitle)
            && normalizeWorkName(group.rabNumber) === normalizeWorkName(form.rabNumber))
        return matchesPrk && matchesRab
      })
      .map((group) => ({
        ...group,
        sourcePrk: (() => {
          const componentNames = new Set(group.components.map((component) => normalizeWorkName(component.displayName || component.name)))
          const nameMatches = activityCatalog.filter((item) =>
            componentNames.has(normalizeWorkName(item.name)) && String(item.prk || '').trim())
          const packageMatches = nameMatches.filter((item) =>
            normalizeWorkName(item.workPackage) === normalizeWorkName(group.workPackage))
          const catalogMatches = packageMatches.length ? packageMatches : nameMatches
          const prks = [...new Set(catalogMatches.map((item) => String(item.prk).trim()))]
          return prks.length === 1 ? prks[0] : ''
        })(),
        finalizationKey: `${normalizeWorkName(group.sourcePrk || group.prk)}::${normalizeWorkName(group.workPackage)}::${normalizeWorkName(group.rabTitle)}::${normalizeWorkName(group.rabNumber)}`,
        records: [...new Map(group.records.map((record) => [record.id, record])).values()],
        materialTotal: group.components.reduce((sum, component) => sum + component.materialTotal, 0),
        serviceTotal: group.components.reduce((sum, component) => sum + component.serviceTotal, 0),
        total: group.components.reduce((sum, component) => sum + component.total, 0),
        totalAnggaran: calculateRabBudgetTotal(group.components.reduce((sum, component) => sum + component.total, 0)),
      }))
    : []
  const realizationPrkChoices = [...new Set(realizationActivities.map((activity) => activity.prk).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right))
  const finalizationGroups = view === 'activities' || view === 'paFinalization'
    ? activitySavedGroups.filter((group) => {
      const source = findProgramRecordForRabGroup(programRecords, group)
      const marker = `FINALIZED_RAB_GROUP::${group.finalizationKey || group.key}`
      const legacyMarker = `FINALIZED_RAB_GROUP::${group.key}`
      const finalized = collections.paTransfers?.some((transfer) =>
        transfer.notes === marker || transfer.notes === legacyMarker
          || transfer.rabGroupKey === group.finalizationKey || transfer.rabGroupKey === group.key)
      const exceedsAvailableRab = source && number(group.totalAnggaran) > number(source.rabTotal)
      const text = `${group.workPackage} ${group.rabTitle} ${group.rabNumber} ${group.sourcePrk || group.prk} ${source?.description || ''}`.toLowerCase()
      const matchesText = !finalizationSearch || text.includes(finalizationSearch.toLowerCase())
      const matchesPrk = finalizationPrkFilter === 'all' || (group.sourcePrk || group.prk) === finalizationPrkFilter
      const matchesActivity = finalizationActivityFilter === 'all' || group.workPackage === finalizationActivityFilter
      const matchesProgram = finalizationProgramFilter === 'all' || source?.program === finalizationProgramFilter
      const matchesYear = finalizationYearFilter === 'all' || String(source?.year || '') === finalizationYearFilter
      const status = finalized ? 'finalized' : !source ? 'notfound' : exceedsAvailableRab ? 'unavailable' : 'pending'
      const matchesStatus = finalizationStatusFilter === 'all' || status === finalizationStatusFilter
      return matchesText && matchesPrk && matchesActivity && matchesProgram && matchesYear && matchesStatus
    })
    : []
  const finalizationPrks = [...new Set(activitySavedGroups.map((group) => group.sourcePrk || group.prk).filter(Boolean))].sort()
  const finalizationActivities = [...new Set(activitySavedGroups.map((group) => group.workPackage).filter(Boolean))].sort()
  const finalizationPrograms = [...new Set(activitySavedGroups.map((group) => {
    const source = findProgramRecordForRabGroup(programRecords, group)
    return source?.program
  }).filter(Boolean))]
  const finalizationYears = [...new Set(activitySavedGroups.map((group) => {
    const source = findProgramRecordForRabGroup(programRecords, group)
    return source?.year ? String(source.year) : ''
  }).filter(Boolean))].sort((left, right) => Number(right) - Number(left))
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
    if (view === 'realizations' && name === 'date') {
      const billing = getBillingForDate(selectedRealizationContract, value)
      setForm((current) => ({
        ...current,
        date: value,
        billed: billing.amount === '' ? '' : String(billing.amount),
      }))
      return
    }
    setForm((current) => ({ ...current, [name]: value }))
  }

  function updateRealizationActivity(activityId) {
    const activity = realizationActivityById.get(String(activityId))
    const contract = programRecordForActivity(activity)
    const billing = getPlannedBilling(contract)
    setSaveStatus(null)
    setForm((current) => ({
      ...current,
      activityId,
      date: billing.date,
      billed: billing.amount === '' ? '' : String(billing.amount),
      paymentDate: '',
    }))
  }

  function updateRealizationPrk(prk) {
    setSaveStatus(null)
    setForm((current) => ({
      ...current,
      prk,
      activityId: '',
      date: '',
      billed: '',
      paymentDate: '',
    }))
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

  function updateMaterialActivity(componentActivity) {
    const matchingActivities = activityCatalog.filter((activity) =>
      normalizeWorkName(activity.name) === normalizeWorkName(componentActivity)
    )
    const catalogActivity = matchingActivities.find((activity) =>
      normalizeCriteria(activity.criteria) === normalizeCriteria(form.criteria)
    ) || matchingActivities[0]
    setSaveStatus(null)
    setForm((current) => ({
      ...current,
      componentActivity,
      criteria: normalizeCriteria(catalogActivity?.criteria) || current.criteria,
    }))
  }

  function updateComponentActivity(name) {
    const matchingActivities = allComponentActivities.filter((activity) => activity.name === name)
    const selected = matchingActivities.find((activity) => normalizeCriteria(activity.criteria) === normalizeCriteria(form.criteria)) || matchingActivities[0]
    setForm((current) => ({ ...current, activity: name, criteria: selected?.criteria || current.criteria }))
  }

  function updatePrkSelection(prk) {
    setSaveStatus(null)
    setActivityPrkFilter(String(prk).trim())
    setComponentMaterialFilters({ operation: 'all', criteria: 'all', source: 'all' })
    const source = findProgramRecordForRabGroup(programRecords, { prk, records: [] })
    const catalogActivity = activityCatalog.find((activity) => String(activity.prk || '').trim() === String(prk).trim())
    setForm((current) => ({
      ...current,
      programRecordId: source?.id || '',
      prk: String(prk).trim(),
      position: source?.position || source?.budgetPosition || '',
      prkFix: source?.prkFix || '',
      program: source?.program || '',
      year: source?.year ? String(source.year) : '',
      status: source?.status || source?.notes || '',
      rabNumber: '',
      paNumber: '',
      rabTitle: '',
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
      rabNumber: '',
      paNumber: '',
      rabTitle: '',
      materialVolumes: {},
      componentVolumes: {},
    }))
  }

  function selectSavedRab(value) {
    if (!value) {
      setForm((current) => ({ ...current, rabTitle: '', rabNumber: '', paNumber: '' }))
      return
    }
    const selected = savedRabChoices.find((choice) => choice.value === value)
    if (!selected) return
    setSaveStatus(null)
    setExpandedRabMaterialGroup('')
    setExpandedComponentGroup('')
    setForm((current) => ({
      ...current,
      rabTitle: selected.rabTitle,
      rabNumber: selected.rabNumber,
      name: '',
      materialVolumes: {},
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
        && (view !== 'components' || normalizeWorkName(item.rabTitle) === normalizeWorkName(form.rabTitle))
        && (view !== 'components' || normalizeWorkName(item.rabNumber) === normalizeWorkName(form.rabNumber))
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
    const recordsToSave = view === 'realizations'
      ? nextRecords.map((record) => {
        const normalized = { ...record }
        delete normalized.volume
        return normalized
      })
      : nextRecords
    const result = await onSave(meta.collection, recordsToSave, successMessage, (stage) => {
      setSaveStatus({
        type: 'progress',
        message: stage === 'local' ? 'Data tersimpan lokal. Menyiapkan Google Sheets...' : 'Mengirim data ke Google Sheets...',
      })
    })
    setSaveStatus(result?.ok === false
      ? { type: 'error', message: result.message || 'Data tersimpan lokal, tetapi gagal disimpan ke Google Sheets.' }
      : { type: 'success', message: result?.message || 'Data berhasil disimpan ke Google Sheets.' })
    return result
  }

  async function submit(event) {
    event.preventDefault()
    if (view === 'activities' || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setSaveStatus({ type: 'progress', message: 'Menyiapkan penyimpanan...' })
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
        if (completed) {
          setForm({ ...EMPTY_FORM[view] })
          setSaveStatus({ type: 'success', message: 'Finalisasi berhasil disimpan.' })
        } else {
          setSaveStatus({ type: 'error', message: 'Finalisasi gagal disimpan. Periksa pemberitahuan sebelum mencoba lagi.' })
        }
        return
      }
      if (view === 'materials' && !selectedMaterialActivity) {
        throw new Error('Pilih nama kegiatan/komponen dari Master Kegiatan terlebih dahulu.')
      }
      const originalRecord = view === 'activityCatalog' && editingRecordIndex >= 0
        ? rows[editingRecordIndex]
        : editingId ? rows.find((row) => String(row.id) === String(editingId)) : undefined
      const isEditing = Boolean(editingId) || (view === 'activityCatalog' && editingRecordIndex >= 0)
      const record = { ...(originalRecord || {}), id: editingId || originalRecord?.id || createId(), ...form, createdAt: originalRecord?.createdAt || new Date().toISOString() }
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
        const selectedProgramRecord = findProgramRecordForRabGroup(programRecords, {
          prk: form.prk,
          records: [{ programRecordId: form.programRecordId, program: form.program, year: form.year }],
        })
        const nextGroupRows = activityPrkComponents.flatMap((group) => {
          const groupRows = rows.filter((item) => String(item.prk || '').trim() === String(form.prk || '').trim()
            && (!item.workPackage || normalizeWorkName(item.workPackage) === normalizeWorkName(form.workPackage))
            && normalizeWorkName(item.componentName || item.name) === group.key)
          return group.lines.map((line) => {
            const existing = groupRows.find((item) => (item.materialId || item.componentId) === (line.materialId || line.id)
              && normalizeWorkName(item.rabTitle) === normalizeWorkName(form.rabTitle || line.rabTitle)
              && normalizeWorkName(item.rabNumber) === normalizeWorkName(form.rabNumber || line.rabNumber))
            return {
              ...(existing || {}),
              id: existing?.id || createId(),
              rabNumber: form.rabNumber || selectedProgramRecord?.rabNumber || '',
              rabTitle: form.rabTitle || line.rabTitle || '',
              paNumber: form.paNumber || line.paNumber || '',
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
              quantityPerUnit: number(line.quantityPerUnit ?? 1),
              source: line.source || '',
              materialTotal: number(line.materialPart ?? number(line.materialPrice) * number(line.quantityPerUnit ?? 1)),
              serviceTotal: number(line.servicePart ?? number(line.servicePrice) * number(line.quantityPerUnit ?? 1)),
              total: number(line.totalPart ?? (number(line.materialPrice) + number(line.servicePrice)) * number(line.quantityPerUnit ?? 1)),
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
              || normalizeWorkName(item.rabTitle) !== normalizeWorkName(form.rabTitle)
              || normalizeWorkName(item.rabNumber) !== normalizeWorkName(form.rabNumber)
              || !activityPrkComponents.some((group) => group.key === normalizeWorkName(item.componentName || item.name))
          }),
          ...nextGroupRows,
        ]
        await saveWorkflowData(nextRecords, editingId ? `${meta.title} berhasil diperbarui.` : `${meta.title} berhasil disimpan.`)
        setForm({ ...EMPTY_FORM[view] })
        setEditingId('')
        setEditingRecordIndex(-1)
        return
      }
      if (view === 'components' && activityCatalog.length) {
        const sourceRecord = findProgramRecordForRabGroup(programRecords, {
          prk: form.prk,
          records: [{ programRecordId: form.programRecordId, program: form.program, year: form.year }],
        })
        const groupRows = rows.filter((item) => String(item.prk || '').trim() === String(form.prk || '').trim()
          && (!item.workPackage || normalizeWorkName(item.workPackage) === normalizeWorkName(form.workPackage))
          && normalizeWorkName(item.rabTitle) === normalizeWorkName(form.rabTitle)
          && normalizeWorkName(item.rabNumber) === normalizeWorkName(form.rabNumber)
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
            prkFix: form.prkFix || sourceRecord?.prkFix || '',
            program: form.program || sourceRecord?.program || '',
            year: form.year || sourceRecord?.year || '',
            status: form.status || sourceRecord?.status || sourceRecord?.notes || '',
            rabNumber: form.rabNumber,
            paNumber: form.paNumber,
            rabTitle: form.rabTitle,
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
            && normalizeWorkName(item.rabTitle) === normalizeWorkName(form.rabTitle)
            && normalizeWorkName(item.rabNumber) === normalizeWorkName(form.rabNumber)
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
        record.activityName = activity?.componentName || activity?.name || ''
      }
      if (view === 'realizations') {
        const billing = getBillingForDate(selectedRealizationContract, form.date)
        record.billed = billing.amount !== '' && billing.amount !== null && billing.amount !== undefined
          ? number(billing.amount)
          : number(form.billed)
        record.paid = number(form.paid)
        record.paymentDate = String(form.paymentDate || '')
        record.paymentStatus = String(form.paymentStatus || 'BELUM LUNAS')
        const activity = realizationActivityById.get(String(form.activityId))
        record.criteria = activity?.criteria || ''
        record.prk = activity?.prk || ''
        record.activityName = getRealizationActivityName(activity, selectedRealizationContract)
        record.programRecordId = selectedRealizationContract?.id || activity?.programRecordId || ''
      }
      const nextRecords = view === 'activityCatalog' && editingRecordIndex >= 0
        ? rows.map((row, index) => index === editingRecordIndex ? record : row)
        : editingId ? rows.map((row) => String(row.id) === String(editingId) ? record : row) : [record, ...rows]
      await saveWorkflowData(nextRecords, isEditing ? `${meta.title} berhasil diperbarui.` : `${meta.title} berhasil disimpan.`)
      setForm(view === 'components'
        ? { ...EMPTY_FORM.components, criteria: form.criteria, activity: form.activity }
        : { ...EMPTY_FORM[view] })
      setEditingId('')
      setEditingRecordIndex(-1)
    } catch (error) {
      setSaveStatus({ type: 'error', message: `Penyimpanan gagal: ${error.message || 'Terjadi kesalahan yang tidak diketahui.'}` })
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  async function removeRecord(id) {
    if (saving) return
    if (view === 'components' && !window.confirm('Hapus baris material ini dari Input RAB? Total RAB dan kolom M akan dihitung ulang.')) return
    if (view === 'activityCatalog') {
      const activity = rows.find((row) => row.id === id)
      if (!activity) return
      const linkedMaterials = materials.filter((material) =>
        String(material.prk || '').trim() === String(activity.prk || '').trim()
          && normalizeWorkName(material.workPackage) === normalizeWorkName(activity.workPackage)
          && normalizeWorkName(material.componentActivity) === normalizeWorkName(activity.name)
      ).length
      const linkedComponents = components.filter((component) =>
        String(component.prk || '').trim() === String(activity.prk || '').trim()
          && (!component.workPackage || normalizeWorkName(component.workPackage) === normalizeWorkName(activity.workPackage))
          && normalizeWorkName(component.activity) === normalizeWorkName(activity.name)
      ).length
      if (!window.confirm(
        `Hapus kegiatan "${activity.name}" dari Master Kegiatan?`
        + `\nTerkait dengan ${linkedMaterials} material dan ${linkedComponents} komponen RAB.`
        + '\nData material/RAB yang sudah tersimpan tidak ikut dihapus, tetapi kegiatan ini tidak lagi tersedia sebagai acuan. Lanjutkan?',
      )) return
    }
    if (view === 'materials') {
      const material = rows.find((row) => row.id === id)
      if (!material || !window.confirm(`Hapus material "${material.name}"? Data material yang sudah digunakan pada RAB tidak ikut diubah.`)) return
    }
    const next = rows.filter((row) => row.id !== id)
    await persistWorkflowChanges(meta.collection, next, 'Data berhasil dihapus.')
  }

  async function persistWorkflowChanges(collection, nextRecords, successMessage) {
    if (saving) return
    setSaving(true)
    setSaveStatus({ type: 'progress', message: 'Menyimpan perubahan...' })
    try {
      const result = await onSave(collection, nextRecords, successMessage, (stage) => {
        setSaveStatus({
          type: 'progress',
          message: stage === 'local' ? 'Data tersimpan lokal. Menyiapkan Google Sheets...' : 'Mengirim data ke Google Sheets...',
        })
      })
      setSaveStatus(result?.ok === false
        ? { type: 'error', message: result.message || 'Data tersimpan lokal, tetapi gagal disimpan ke Google Sheets.' }
        : { type: 'success', message: result?.message || successMessage })
    } catch (error) {
      setSaveStatus({ type: 'error', message: `Penyimpanan gagal: ${error.message || 'Terjadi kesalahan yang tidak diketahui.'}` })
    } finally {
      setSaving(false)
    }
  }

  function printActivitySavedGroup(group) {
    const printGroup = printGroups.find((item) => item.isComponentSummary
      && String(item.prk || '').trim() === String(group.prk || '').trim()
      && normalizeWorkName(item.activity) === normalizeWorkName(group.workPackage))
    if (!printGroup) return
    requestPrint(printGroup.key)
  }

  async function removeComponentGroup(group) {
    if (saving) return
    if (!window.confirm(`Hapus "${group.title}" beserta seluruh materialnya dari Input RAB? Total RAB dan kolom M akan dihitung ulang.`)) return
    const groupIds = new Set(group.rows.map((row) => row.id))
    const next = rows.filter((row) => !groupIds.has(row.id))
    await persistWorkflowChanges(meta.collection, next, 'RAB komponen berhasil dihapus.')
  }

  function printComponentGroup(group) {
    if (group.components[0]) printActivityComponent(group.components[0])
  }

  function requestPrint(groupKey) {
    setPrintGroupKey(groupKey)
    setPrintRequestVersion((version) => version + 1)
  }

  function printActivityComponent(component, group) {
    const printGroup = view === 'activities'
      ? printGroups.find((item) => item.isActivityComponent
        && item.sourceGroupKey === group?.key
        && item.sourceComponentKey === component.id)
      : (() => {
        const componentIds = new Set(component.records.map((record) => record.id))
        return printGroups.find((item) => item.isMaterialGroup
          && item.componentIds?.some((id) => componentIds.has(id)))
      })()
    if (!printGroup) return
    requestPrint(printGroup.key)
  }

  const editRecord = useCallback((record) => {
    const defaults = EMPTY_FORM[view]
    setEditingId(String(record.id || ''))
    setEditingRecordIndex(view === 'activityCatalog' ? rows.indexOf(record) : -1)
    if (view === 'activities' && record.prk) setActivityPrkFilter(String(record.prk).trim())
    if (view === 'components' && activityCatalog.length && record.prk) {
      const workPackage = record.workPackage || activityCatalog.find((activity) =>
        String(activity.prk || '').trim() === String(record.prk || '').trim()
          && normalizeWorkName(activity.name) === normalizeWorkName(record.activity)
      )?.workPackage || ''
      const matchingRows = rows.filter((item) => String(item.prk || '').trim() === String(record.prk || '').trim()
        && (!item.workPackage || normalizeWorkName(item.workPackage) === normalizeWorkName(workPackage))
        && normalizeWorkName(item.rabTitle) === normalizeWorkName(record.rabTitle)
        && normalizeWorkName(item.rabNumber) === normalizeWorkName(record.rabNumber)
        && normalizeWorkName(item.activity) === normalizeWorkName(record.activity))
      setForm({
        ...defaults,
        prk: record.prk,
        workPackage,
        programRecordId: record.programRecordId || '',
        prkFix: record.prkFix || '',
        program: record.program || '',
        year: record.year ? String(record.year) : '',
        status: record.status || '',
        rabNumber: record.rabNumber || '',
        paNumber: record.paNumber || '',
        rabTitle: record.rabTitle || '',
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
      const nextForm = Object.fromEntries(Object.keys(defaults).map((key) => [key, record[key] ?? defaults[key]]))
      if (view === 'materials') {
        const nameMatches = activityCatalog.filter((activity) =>
          normalizeWorkName(activity.name) === normalizeWorkName(record.componentActivity)
        )
        const linkedActivity = nameMatches.find((activity) =>
          normalizeCriteria(activity.criteria) === normalizeCriteria(record.criteria)
        ) || nameMatches[0]
        nextForm.componentActivity = record.componentActivity || linkedActivity?.name || ''
        if (!record.criteria && linkedActivity?.criteria) nextForm.criteria = linkedActivity.criteria
      }
      setForm(nextForm)
    }
    window.requestAnimationFrame(() => formPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }, [activityCatalog, rows, view])

  useEffect(() => {
    if (view !== 'components' || !editComponentId) return undefined
    const record = components.find((component) => String(component.id) === String(editComponentId))
    const frame = window.requestAnimationFrame(() => {
      if (record) editRecord(record)
      onEditComponentHandled?.()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [components, editComponentId, editRecord, onEditComponentHandled, view])

  async function removeSavedActivityGroup(group) {
    if (readOnly || saving) return
    const groupIds = new Set(group.records.map((record) => record.id))
    if (!groupIds.size || !window.confirm(`Hapus "${group.rabTitle || group.workPackage}" beserta seluruh komponennya dari Input RAB? Total anggaran dan kolom M akan dihitung ulang.`)) return
    const next = components.filter((component) => !groupIds.has(component.id))
    await persistWorkflowChanges('components', next, 'Rekap RAB berhasil dihapus.')
  }

  function rowActions(record, label, onDelete) {
    if (readOnly) return <td className="workflow-actions-cell" />
    return <td className="workflow-actions-cell"><div className="workflow-row-actions">{!onDelete && <button className="workflow-edit" type="button" disabled={saving} aria-label={`Edit ${label}`} onClick={() => editRecord(record)}><Pencil size={14} /></button>}<button className="workflow-delete" type="button" disabled={saving} aria-label={onDelete ? `Batalkan ${label}` : `Hapus ${label}`} onClick={() => onDelete ? onDelete(record) : removeRecord(record.id)}><Trash2 size={14} /></button></div></td>
  }

  function field(name, label, options = {}) {
    const { type = 'text', required = true, placeholder = '', choices, min = 0, max, onChange, searchable = false, value = form[name], readOnly = false } = options
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
        </select> : <input required={required} readOnly={readOnly} type={type === 'number' ? 'text' : type} inputMode={type === 'number' ? 'decimal' : undefined} value={value} placeholder={placeholder} onChange={(event) => {
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
    return <div className="workflow-rab-table-scroll workflow-rab-step-full"><table className="workflow-rab-table workflow-rab-material-table">
      <colgroup><col /><col /><col /><col /><col /><col /><col /><col /><col /></colgroup>
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

  function openFinalizeRab(group) {
    setFinalizeRabGroup(group)
    setSaveStatus(null)
  }

  async function submitFinalizeRab(event) {
    event.preventDefault()
    if (!finalizeRabGroup || !onFinalizeRab || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setSaveStatus({ type: 'progress', message: 'Memfinalisasi RAB ke PA...' })
    try {
      const result = await onFinalizeRab({
        group: finalizeRabGroup,
      })
      if (result?.finalized) {
        setFinalizeRabGroup(null)
        setSaveStatus(result.ok === false
          ? { type: 'error', message: result.message || 'Finalisasi tersimpan lokal, tetapi sinkronisasi cloud gagal.' }
          : { type: 'success', message: result.message || 'RAB berhasil difinalisasi ke PA.' })
      } else {
        setSaveStatus({ type: 'error', message: result?.message || 'Finalisasi RAB gagal.' })
      }
    } catch (error) {
      setSaveStatus({ type: 'error', message: `Finalisasi gagal: ${error.message || 'Terjadi kesalahan yang tidak diketahui.'}` })
    } finally {
      savingRef.current = false
      setSaving(false)
    }
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
      {activityCatalog.length === 0 && <div className="workflow-hint workflow-rab-step-full">Buat atau impor Master Kegiatan terlebih dahulu agar material dapat dihubungkan ke nama kegiatan/komponen.</div>}
      {field('componentActivity', 'Nama kegiatan/komponen', { choices: materialActivityChoices, onChange: updateMaterialActivity, searchable: true })}
      {field('code', 'Kode material', { required: false, placeholder: 'Contoh: MTR-001' })}
      {field('name', 'Uraian material', { placeholder: 'Nama material sesuai standar' })}
      {field('unit', 'Satuan', { placeholder: 'btg, set, m, unit' })}
      {criteriaField()}
      {field('materialPrice', 'Harga material (Rp)', { type: 'number', step: '1', placeholder: '0' })}
      {field('servicePrice', 'Tarif jasa tunggal (Rp)', { type: 'number', step: '1', placeholder: '0', required: false })}
      {field('source', 'Jenis material', { choices: [{ value: 'MDU', label: 'MDU' }, { value: 'NON MDU', label: 'NON MDU' }] })}
      {field('operation', 'Keterangan', { required: false, placeholder: 'Contoh: Pasang' })}
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
      {field('prk', 'Uraian PRK', { choices: activityPrkChoices, onChange: updatePrkSelection, searchable: true })}
      {form.prk && <>
        <div className="workflow-prk-details workflow-rab-step-full">
          <div><span>No. PRK</span><strong>{form.prk}</strong></div>
          <div><span>No. PRK FIX</span><strong>{form.prkFix || selectedPrkRecord?.prkFix || '-'}</strong></div>
          <div><span>Program</span><strong>{form.program || selectedPrkRecord?.program || '-'}</strong></div>
          <div><span>Tahun</span><strong>{form.year || selectedPrkRecord?.year || '-'}</strong></div>
          <div><span>Status</span><strong>{form.status || selectedPrkRecord?.status || selectedPrkRecord?.notes || '-'}</strong></div>
        </div>
        <div className="workflow-rab-step"><strong>2. Pilih kegiatan</strong><span>Pilih kegiatan sesuai PRK.</span></div>
        {field('workPackage', 'Kegiatan', { choices: activityWorkPackageChoices, onChange: updateActivityWorkPackage, searchable: true })}
      </>}
      {form.workPackage && <>
      <div className="workflow-rab-step workflow-rab-step-full"><strong>Informasi RAB</strong><span>Isi nomor RAB, nomor PA jika ada, dan nama RAB secara manual.</span></div>
      {field('rabNumber', 'No. RAB (Manual)', { required: false, placeholder: 'Isi nomor RAB baru' })}
      {field('paNumber', 'No. PA (Manual)', { required: false, placeholder: 'Isi nomor PA jika ada' })}
      <div className="workflow-rab-title-field">{field('rabTitle', 'Nama RAB (Manual)', { placeholder: 'Ketik judul utama RAB secara manual...' })}</div>
      <div className="workflow-rab-step workflow-rab-step-full"><strong>3. Pilih RAB komponen</strong><span>Pilih komponen dari kegiatan ini. Daftar material dan input volume akan muncul setelah komponen dipilih.</span></div>
      {activityCatalogChoices.length
        ? <div className="workflow-rab-component-picker workflow-rab-step-full" role="list" aria-label="RAB komponen pada kegiatan">
          {activityCatalogChoices.map((choice) => {
            const materialCount = materials.filter((material) =>
              normalizeWorkName(material.componentActivity) === normalizeWorkName(choice.value)).length
            const selected = normalizeWorkName(form.name) === normalizeWorkName(choice.value)
            return <button
              className={`workflow-rab-component-option${selected ? ' is-selected' : ''}`}
              type="button"
              role="listitem"
              aria-pressed={selected}
              key={choice.value}
              onClick={() => updateActivityComponent(choice.value)}
            >
              <span className="workflow-rab-component-option-copy"><strong>{choice.value}</strong><small>{materialCount} material terdaftar</small></span>
              <ChevronDown className={selected ? 'is-expanded' : ''} size={16} />
            </button>
          })}
        </div>
        : <div className="workflow-hint workflow-rab-step-full">Belum ada RAB komponen pada kegiatan ini di DATABASE KEGIATAN.</div>}
      {form.name && <>
        <div className="workflow-rab-step workflow-rab-step-full"><strong>4. Isi volume material</strong><span>Daftar material dimuat berdasarkan RAB komponen yang dipilih.</span></div>
        {componentMaterialFilterControls()}
        {rabSelectionSummary()}
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
        {savedRabChoices.length > 0 && <>
          <div className="workflow-rab-step workflow-rab-step-full"><strong>3. Pilih Nama RAB</strong><span>Pilih nama RAB dan nomor RAB yang sudah diinput pada menu RAB.</span></div>
          <div className="workflow-rab-saved-choice workflow-rab-step-full">
            <label className="workflow-field">
              <span>Nama RAB / No. RAB</span>
              <select value={form.rabTitle || form.rabNumber ? JSON.stringify([normalizeWorkName(form.rabTitle), normalizeWorkName(form.rabNumber)]) : ''} onChange={(event) => selectSavedRab(event.target.value)}>
                <option value="">Pilih Nama RAB</option>
                {savedRabChoices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
              </select>
            </label>
          </div>
          {(form.rabTitle || form.rabNumber) && <div className="workflow-rab-selected-title workflow-rab-step-full">
            <span>Nama RAB</span><strong>{form.rabTitle || 'Nama RAB belum diisi'}{form.rabNumber && ` — No. RAB ${form.rabNumber}`}</strong>
          </div>}
        </>}
        <div className="workflow-rab-step workflow-rab-step-full"><strong>Rekap RAB Komponen</strong><span>Jumlah komponen pekerjaan ditarik dari RAB Komponen. Tidak perlu mengisi volume di RAB Kegiatan.</span></div>
        {activityPrkSummary()}
        {activityPrkComponents.length
          ? activityPrkComponentTable()
          : <div className="workflow-hint workflow-rab-step-full">Belum ada data RAB Komponen untuk kegiatan ini. Isi dan simpan RAB Komponen terlebih dahulu.</div>}
      </>}
    </>
    if (view === 'paFinalization') return <>
      <div className="workflow-rab-step workflow-rab-step-full"><strong>DATA TERSIMPAN — Rekap RAB</strong><span>Pilih rekap yang akan difinalisasi. Nilai RAB terpilih akan ditambahkan ke PA; nomor dan nilai kontrak disimpan pada Data Kontrak.</span></div>
      <div className="workflow-finalization-filters workflow-rab-step-full">
        <label className="workflow-finalization-search"><Search size={15} /><input type="search" value={finalizationSearch} onChange={(event) => setFinalizationSearch(event.target.value)} placeholder="Cari kegiatan, Nama RAB, No. RAB, atau PRK..." aria-label="Cari Rekap RAB" /></label>
        <label><span>PRK</span><select value={finalizationPrkFilter} onChange={(event) => setFinalizationPrkFilter(event.target.value)}><option value="all">Semua PRK</option>{finalizationPrks.map((prk) => <option key={prk} value={prk}>{prk}</option>)}</select></label>
        <label><span>Kegiatan</span><select value={finalizationActivityFilter} onChange={(event) => setFinalizationActivityFilter(event.target.value)}><option value="all">Semua kegiatan</option>{finalizationActivities.map((activity) => <option key={activity} value={activity}>{activity}</option>)}</select></label>
        <label><span>Program</span><select value={finalizationProgramFilter} onChange={(event) => setFinalizationProgramFilter(event.target.value)}><option value="all">Semua program</option>{finalizationPrograms.map((program) => <option key={program} value={program}>{program}</option>)}</select></label>
        <label><span>Tahun</span><select value={finalizationYearFilter} onChange={(event) => setFinalizationYearFilter(event.target.value)}><option value="all">Semua tahun</option>{finalizationYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
        <label><span>Status</span><select value={finalizationStatusFilter} onChange={(event) => setFinalizationStatusFilter(event.target.value)}><option value="all">Semua status</option><option value="pending">Belum difinalisasi</option><option value="finalized">Sudah difinalisasi</option><option value="unavailable">Melebihi sisa RAB</option><option value="notfound">PRK tidak ditemukan</option></select></label>
      </div>
      <div className="workflow-table-scroll workflow-rab-step-full workflow-finalization-list"><table>
        <thead><tr><th>No</th><th>Kegiatan / Nama RAB</th><th>No. PRK</th><th>No. RAB</th><th>Total RAB</th><th>Status PA</th><th>Aksi</th></tr></thead>
        <tbody>{finalizationGroups.map((group, index) => {
          const source = findProgramRecordForRabGroup(programRecords, group)
          const transferMarker = `FINALIZED_RAB_GROUP::${group.finalizationKey || group.key}`
          const legacyTransferMarker = `FINALIZED_RAB_GROUP::${group.key}`
          const alreadyFinalized = collections.paTransfers?.some((transfer) =>
            transfer.notes === transferMarker || transfer.notes === legacyTransferMarker
              || transfer.rabGroupKey === group.finalizationKey || transfer.rabGroupKey === group.key)
          const sourceHasTransfers = Boolean(source && collections.paTransfers?.some((transfer) =>
            String(transfer.recordId) === String(source.id)))
          const needsRabSync = Boolean(source && number(group.totalAnggaran) > number(source.rabTotal))
          const canFinalize = Boolean(source && !alreadyFinalized && number(group.totalAnggaran) > 0 && !(needsRabSync && sourceHasTransfers))
          return <tr key={group.key}>
            <td>{index + 1}</td>
            <td className="workflow-component-description"><strong>{group.workPackage}</strong>{group.rabTitle && <small>Nama RAB: {group.rabTitle}</small>}</td>
            <td>{group.sourcePrk || group.prk || '-'}</td>
            <td>{group.rabNumber || '-'}</td>
            <td className="workflow-total">{formatCurrency(group.totalAnggaran)}</td>
            <td>{alreadyFinalized ? 'Sudah difinalisasi' : source ? `RAB ${formatCurrency(source.rabTotal)} · PA ${formatCurrency(source.paTotal)}${needsRabSync ? ' · akan disinkronkan' : ''}` : 'PRK dan kegiatan tidak cocok dengan RABData'}</td>
            <td className="workflow-actions-cell">
              <button className="button button-primary workflow-finalize-button" type="button" disabled={readOnly || saving || !canFinalize} title={alreadyFinalized ? 'RAB ini sudah difinalisasi' : !source ? 'PRK dan kegiatan belum cocok dengan data anggaran' : needsRabSync && sourceHasTransfers ? 'TOTAL RAB tidak cukup dan baris ini memiliki riwayat PA' : canFinalize ? 'Finalisasi ke PA' : 'Total RAB tidak valid'} onClick={() => openFinalizeRab(group)}><Check size={14} />{alreadyFinalized ? 'Selesai' : 'Ke PA'}</button>
              {!alreadyFinalized && !source && <small className="workflow-finalization-link-warning">Pastikan PRK dan nama kegiatan cocok antara Rekap RAB, DATABASE KEGIATAN, dan RABData.</small>}
              {!alreadyFinalized && needsRabSync && sourceHasTransfers && <small className="workflow-finalization-link-warning">Baris ini memiliki riwayat PA; sinkronisasi akan ditolak demi menjaga saldo.</small>}
            </td>
          </tr>
        })}{finalizationGroups.length === 0 && <tr><td colSpan="7"><div className="workflow-empty"><Icon size={23} /><strong>{activitySavedGroups.length === 0 ? 'Belum ada Rekap RAB' : 'Tidak ada data yang cocok'}</strong><span>{activitySavedGroups.length === 0 ? 'Data Rekap RAB yang tersimpan akan tampil di sini.' : 'Ubah kata kunci atau filter untuk mencari Rekap RAB.'}</span></div></td></tr>}</tbody>
      </table></div>
      {saveStatus && <p className={`workflow-finalization-link-status is-${saveStatus.type}`} role={saveStatus.type === 'error' ? 'alert' : 'status'} aria-live="polite">{saveStatus.message}</p>}
      {selectedProgramRecord && <div className="workflow-transfer-preview workflow-rab-step-full"><div><span>PRK terpilih</span><strong>{selectedProgramRecord.prk || '-'}</strong></div><div><span>Sisa RAB</span><strong>{formatCurrency(remainingRab)}</strong></div><div><span>Saldo PA saat ini</span><strong>{formatCurrency(currentPA)}</strong></div></div>}
    </>
    if (view === 'materialRecap') return <>
      {field('activityId', 'Kegiatan RAB', { choices: activityGroupChoices.map((activity) => ({ value: activity.id, label: `${activity.criteria} | ${activity.prk} | ${activity.componentName || activity.name}` })) })}
      {field('materialId', 'Material digunakan', { choices: availableMaterials.map((material) => ({ value: material.id, label: `${material.name} (${material.unit})` })) })}
      {field('quantity', 'Volume material aktual', { type: 'number', step: '0.001', placeholder: '0' })}
      {field('date', 'Tanggal pemakaian', { type: 'date' })}
    </>
    return <>
      {field('prk', 'No. PRK', { choices: realizationPrkChoices.map((prk) => ({ value: prk, label: prk })), onChange: updateRealizationPrk })}
      {field('activityId', 'Kegiatan RAB', { choices: activityGroupChoices.map((activity) => ({ value: activity.id, label: `${activity.criteria || '-'} | ${getRealizationActivityName(activity, programRecordForActivity(activity))}` })), onChange: updateRealizationActivity, searchable: true })}
      {selectedRealizationContract && <div className="workflow-realization-contract workflow-rab-step-full"><div><span>Nilai kontrak</span><strong>{formatCurrency(selectedRealizationContract.contractValue)}</strong></div><div><span>Total dibayar</span><strong>{formatCurrency(number(selectedRealizationContract.paid))}</strong></div><div><span>Sisa kontrak</span><strong>{formatCurrency(Math.max(0, number(selectedRealizationContract.contractValue) - number(selectedRealizationContract.paid)))}</strong></div></div>}
      {selectedRealizationContract && <div className="workflow-realization-contract workflow-rab-step-full"><div><span>Rencana tagih kontrak</span><strong>{selectedRealizationContract.plannedBilling || '-'}</strong></div><div><span>Nilai tagihan terjadwal bulan ini</span><strong>{selectedRealizationBillingIsScheduled ? formatCurrency(selectedRealizationBilling.amount) : 'Belum diatur'}</strong></div></div>}
      {field('date', 'Tanggal tagihan', { type: 'date' })}
      {field('billed', 'Nilai tagihan (Rp)', { type: 'number', step: '1', placeholder: '0', value: selectedRealizationBillingIsScheduled ? String(selectedRealizationBilling.amount) : form.billed, readOnly: selectedRealizationBillingIsScheduled })}
      {selectedRealizationContract && form.date && !selectedRealizationBillingIsScheduled && <div className="workflow-hint workflow-rab-step-full" role="status">
        Nominal tagihan untuk bulan ini belum ditemukan pada kontrak yang terhubung. Periksa kolom TAGIHAN BULANAN di Data Kontrak, lalu muat ulang data jika nilainya baru diubah di Google Sheets. Nilai yang diisi di sini menjadi tagihan Realisasi saja, bukan tambahan proyeksi.
      </div>}
      {field('paymentDate', 'Tanggal bayar', { type: 'date', required: number(form.paid) > 0 })}
      {field('paid', 'Nilai dibayar (Rp)', { type: 'number', step: '1', placeholder: '0', required: false })}
      {field('paymentStatus', 'Status pembayaran', { choices: [
        { value: 'BELUM LUNAS', label: 'BELUM LUNAS' },
        { value: 'LUNAS', label: 'LUNAS' },
      ] })}
    </>
  }

  function tableRows() {
    if (view === 'paFinalization') return filteredRows.map((row) => <tr key={row.id}><td>{row.date}</td><td>{row.criteria || '-'}</td><td>{row.prk || '-'}</td><td>{row.rabNumber || '-'}</td><td className="workflow-total">{formatCurrency(row.amount)}</td><td>{formatCurrency(row.rabBefore)}</td><td>{formatCurrency(row.rabAfter)}</td><td>{formatCurrency(row.paBefore)}</td><td>{formatCurrency(row.paAfter)}</td>{rowActions(row, 'transfer PA', onCancelTransfer)}</tr>)
    if (view === 'activityCatalog') return filteredRows.map((row) => <tr key={row.id}><td>{row.workPackage || '-'}</td><td>{row.name}</td><td>{row.unit}</td><td>{row.criteria}</td><td>{row.prk || '-'}</td>{rowActions(row, 'master kegiatan')}</tr>)
    if (view === 'materialRecap') return filteredMaterialRows.map((row) => <tr key={row.id}><td>{row.criteria}</td><td>{row.prk}</td><td>{row.activity}</td><td>{row.material?.name || '-'}</td><td>{row.planned} {row.unit}</td><td>{row.actual} {row.unit}</td><td className={row.actual < row.planned ? 'workflow-warning' : ''}>{(row.planned - row.actual).toFixed(3)} {row.unit}</td></tr>)
    if (view === 'activities') return activitySavedGroups.flatMap((group, index) => {
      const isExpanded = expandedActivityGroup === group.key
      return [
        <tr key={group.key}>
          <td>{index + 1}</td>
          <td className="workflow-component-description">
            <button className="workflow-component-expand" type="button" aria-expanded={isExpanded} onClick={() => setExpandedActivityGroup((current) => current === group.key ? '' : group.key)}>
              <ChevronDown className={isExpanded ? 'is-expanded' : ''} size={15} />
              <span>
                <strong>{group.workPackage || 'Kegiatan tanpa nama'}</strong>
                {group.rabTitle && <small>Nama RAB: {group.rabTitle}{group.rabNumber && ` — No. RAB ${group.rabNumber}`}</small>}
                {!group.rabTitle && group.rabNumber && <small>No. RAB {group.rabNumber}</small>}
                {group.prk && <small>PRK {group.prk}</small>}
              </span>
            </button>
          </td>
          <td>{group.components.length} RAB komponen</td>
          <td className="workflow-total">{formatCurrency(group.totalAnggaran)}</td>
          <td className="workflow-actions-cell"><div className="workflow-row-actions">
            <button className="workflow-edit" type="button" aria-label={`Cetak ${group.workPackage}`} title="Cetak" onClick={() => printActivitySavedGroup(group)}><Printer size={14} /></button>
            {!readOnly && <button className="workflow-edit" type="button" aria-label={`Edit ${group.rabTitle || group.workPackage}`} title="Edit RAB" onClick={() => {
              const record = group.components[0]?.records[0]
              if (record) onEditRab?.(record)
            }}><Pencil size={14} /></button>}
            {!readOnly && <button className="workflow-delete" type="button" aria-label={`Hapus ${group.rabTitle || group.workPackage}`} title="Hapus RAB" onClick={() => removeSavedActivityGroup(group)}><Trash2 size={14} /></button>}
            {(() => {
              const source = findProgramRecordForRabGroup(programRecords, group)
              const marker = `FINALIZED_RAB_GROUP::${group.finalizationKey || group.key}`
              const legacyMarker = `FINALIZED_RAB_GROUP::${group.key}`
              const finalized = collections.paTransfers?.some((transfer) =>
                transfer.notes === marker || transfer.notes === legacyMarker
                  || transfer.rabGroupKey === group.finalizationKey || transfer.rabGroupKey === group.key)
              const finalizedTransfer = collections.paTransfers?.find((transfer) =>
                String(transfer.recordId) === String(source?.id)
                  && (transfer.notes === marker || transfer.notes === legacyMarker
                    || transfer.rabGroupKey === group.finalizationKey || transfer.rabGroupKey === group.key))
              const contractDetailsEntered = hasContractDetails(source)
              const sourceHasTransfers = Boolean(source && collections.paTransfers?.some((transfer) =>
                String(transfer.recordId) === String(source.id)))
              const needsRabSync = Boolean(source && number(group.totalAnggaran) > number(source.rabTotal))
              const canFinalize = Boolean(source && !finalized && number(group.totalAnggaran) > 0
                && !(needsRabSync && sourceHasTransfers))
              return <>
                <button
                  className="button button-primary workflow-finalize-button"
                  type="button"
                  disabled={readOnly || saving || !canFinalize}
                  title={finalized ? 'RAB ini sudah difinalisasi' : !source ? 'PRK dan kegiatan belum cocok dengan RABData' : needsRabSync && sourceHasTransfers ? 'Baris ini memiliki riwayat PA dan tidak dapat disinkronkan otomatis' : 'Finalisasi ke PA'}
                  onClick={() => openFinalizeRab(group)}
                ><Check size={14} />{finalized ? 'Selesai' : 'Ke PA'}</button>
                {finalized && finalizedTransfer && <button
                  className="workflow-delete"
                  type="button"
                  aria-label={`Batalkan PA ${group.rabTitle || group.workPackage}`}
                  title={contractDetailsEntered ? 'Pembatalan dikunci karena data kontrak sudah diisi' : 'Batalkan pemindahan ke PA'}
                  disabled={readOnly || saving || contractDetailsEntered}
                  onClick={() => onCancelTransfer?.(finalizedTransfer)}
                ><Trash2 size={14} /></button>}
              </>
            })()}
          </div></td>
        </tr>,
        ...(isExpanded ? [<tr className="workflow-component-detail-row" key={`${group.key}-components`}><td colSpan="5"><div className="workflow-component-details">
          <table><thead><tr><th>No</th><th>RAB Komponen</th><th>Jumlah Material</th><th>Total (Rp)</th><th>Aksi</th></tr></thead>
            <tbody>{group.components.map((component, componentIndex) => {
              const componentExpanded = expandedComponentGroup === `activity:${group.key}:${component.id}`
              return <Fragment key={component.id}>
                <tr>
                  <td>{componentIndex + 1}</td>
                  <td><button className="workflow-component-expand workflow-rab-component-title" type="button" aria-expanded={componentExpanded} onClick={() => setExpandedComponentGroup((current) => current === `activity:${group.key}:${component.id}` ? '' : `activity:${group.key}:${component.id}`)}><ChevronDown className={componentExpanded ? 'is-expanded' : ''} size={14} /><strong>{component.displayName}</strong></button></td>
                  <td>{component.records.length} material</td>
                  <td className="workflow-total">{formatCurrency(component.total)}</td>
                  <td className="workflow-actions-cell"><div className="workflow-row-actions">
                    <button className="workflow-edit" type="button" title="Cetak RAB Komponen" aria-label={`Cetak ${component.displayName}`} onClick={() => printActivityComponent(component, group)}><Printer size={14} /></button>
                    {!readOnly && <button className="workflow-edit" type="button" title="Edit volume RAB" aria-label={`Edit volume ${component.displayName}`} onClick={() => onEditRab?.(component.records[0])}><Pencil size={14} /></button>}
                  </div></td>
                </tr>
                {componentExpanded && <tr><td colSpan="5"><div className="workflow-component-details">
                  <table className="workflow-rab-detail-table">
                    <colgroup>
                      <col /><col /><col /><col /><col /><col /><col /><col /><col /><col />
                    </colgroup>
                    <thead>
                      <tr><th rowSpan="2">No</th><th rowSpan="2">Uraian</th><th rowSpan="2">Vol</th><th rowSpan="2">Sat</th><th colSpan="2">Harga Satuan (Rp)</th><th colSpan="2">Harga Bagian (Rp)</th><th rowSpan="2">Total Harga (Rp)</th><th rowSpan="2">Aksi</th></tr>
                      <tr><th>Material</th><th>Jasa</th><th>Material</th><th>Jasa</th></tr>
                    </thead>
                    <tbody>{component.records.map((record, rowIndex) => {
                      const quantity = number(record.volume) * number(record.quantityPerUnit ?? 1)
                      const materialTotal = quantity * number(record.materialPrice)
                      const serviceTotal = quantity * number(record.servicePrice)
                      return <tr key={record.id}><td>{rowIndex + 1}</td><td className="workflow-component-description">{record.materialName || record.name || '-'}</td><td>{quantity}</td><td>{record.unit || '-'}</td><td>{formatCurrency(record.materialPrice)}</td><td>{formatCurrency(record.servicePrice)}</td><td>{formatCurrency(materialTotal)}</td><td>{formatCurrency(serviceTotal)}</td><td className="workflow-total">{formatCurrency(materialTotal + serviceTotal)}</td><td className="workflow-actions-cell"><div className="workflow-row-actions">
                        {!readOnly && <button className="workflow-delete" type="button" title="Hapus dari Input RAB" aria-label={`Hapus ${record.materialName || record.name}`} onClick={() => removeComponentGroup({ ...group, title: record.materialName || record.name, rows: [record] })}><Trash2 size={14} /></button>}
                      </div></td></tr>
                    })}</tbody>
                    <tfoot><tr><td colSpan="6">Jumlah</td><td>{formatCurrency(component.materialTotal)}</td><td>{formatCurrency(component.serviceTotal)}</td><td className="workflow-total">{formatCurrency(component.total)}</td><td /></tr></tfoot>
                  </table>
                </div></td></tr>}
              </Fragment>
            })}</tbody>
            <tfoot>
              <tr><td colSpan="3">Subtotal</td><td>{formatCurrency(group.total)}</td><td /></tr>
              <tr><td colSpan="3">DPP (11/12)</td><td>{formatCurrency(group.total * 11 / 12)}</td><td /></tr>
              <tr><td colSpan="3">PPN 12%</td><td>{formatCurrency(group.totalAnggaran - group.total)}</td><td /></tr>
              <tr><td colSpan="3"><strong>TOTAL ANGGARAN — kolom M</strong></td><td className="workflow-total">{formatCurrency(group.totalAnggaran)}</td><td /></tr>
            </tfoot>
          </table>
        </div></td></tr>,
        ] : []),
      ]
    })
    if (view === 'realizations') return realizationGroups.flatMap((group) => {
      const isExpanded = expandedRealizationGroup === group.key
      return [
        <tr key={group.key}>
          <td>{group.entries[0]?.activity?.criteria || '-'}</td>
          <td className="workflow-prk-name">{group.prk || '-'}</td>
          <td className="workflow-activity-name">{group.activityNames.join(', ') || '-'}</td>
          <td className="workflow-contract-number">{group.contractNumber || '-'}</td>
          <td className="workflow-total">{formatCurrency(group.contractValue)}</td>
          <td className="workflow-total">{formatCurrency(group.billed)}</td>
          <td className="workflow-total">{formatCurrency(group.paid)}</td>
          <td className="workflow-total">{formatCurrency(group.remaining)}</td>
          <td><span className={`workflow-payment-status ${group.latestStatus === 'LUNAS' ? 'is-paid' : 'is-unpaid'}`}>{group.latestStatus || 'BELUM LUNAS'}</span></td>
          <td><button className="workflow-expand-button" type="button" aria-expanded={isExpanded} onClick={() => setExpandedRealizationGroup(isExpanded ? '' : group.key)}><ChevronDown size={14} />{isExpanded ? 'Tutup' : `${group.entries.length} rincian`}</button></td>
        </tr>,
        ...(isExpanded ? [<tr className="workflow-component-detail-row" key={`${group.key}-details`}><td colSpan="10"><div className="workflow-component-details"><table><thead><tr><th className="workflow-date-heading">Tanggal<br />tagihan</th><th className="workflow-date-heading">Tanggal<br />bayar</th><th>Kegiatan</th><th>Nilai tagihan</th><th>Nilai dibayar</th><th>Status pembayaran</th><th>Catatan</th><th>Aksi</th></tr></thead><tbody>{group.entries.map(({ row, activity, contract }) => <tr key={row.id}><td>{row.date || '-'}</td><td>{row.paymentDate || '-'}</td><td className="workflow-activity-name">{getRealizationActivityName(activity, contract) || row.activityName || '-'}</td><td>{formatCurrency(row.billed)}</td><td>{formatCurrency(row.paid)}</td><td><span className={`workflow-payment-status ${row.paymentStatus === 'LUNAS' ? 'is-paid' : 'is-unpaid'}`}>{row.paymentStatus || 'BELUM LUNAS'}</span></td><td>{row.notes || '-'}</td>{rowActions(row, 'realisasi')}</tr>)}</tbody><tfoot><tr><td colSpan="3">Total kumulatif</td><td>{formatCurrency(group.billed)}</td><td>{formatCurrency(group.paid)}</td><td colSpan="3">Sisa kontrak {formatCurrency(group.remaining)}</td></tr></tfoot></table></div></td></tr>] : []),
      ]
    })
    if (view === 'components') {
      return componentDisplayGroups.flatMap((group, index) => {
        const isExpanded = expandedComponentGroup === group.key
        const rabComponents = [...group.rows.reduce((componentGroups, row) => {
          const name = String(row.activity || row.componentName || row.name || row.materialName || '').trim()
          const key = JSON.stringify([normalizeWorkName(name), normalizeCriteria(row.criteria)])
          const component = componentGroups.get(key) || {
            id: key,
            displayName: name || 'Komponen tanpa nama',
            prk: group.prk,
            workPackage: group.workPackage,
            criteria: row.criteria || '',
            records: [],
          }
          component.records.push(row)
          componentGroups.set(key, component)
          return componentGroups
        }, new Map()).values()].map((component) => {
          component.materialTotal = component.records.reduce((sum, row) =>
            sum + number(row.materialPart ?? number(row.quantityPerUnit) * number(row.materialPrice)), 0)
          component.serviceTotal = component.records.reduce((sum, row) =>
            sum + number(row.servicePart ?? number(row.quantityPerUnit) * number(row.servicePrice)), 0)
          component.total = component.materialTotal + component.serviceTotal
          return component
        })
        const materialPart = group.rows.reduce((sum, row) => sum + number(row.materialPart ?? number(row.quantityPerUnit) * number(row.materialPrice)), 0)
        const servicePart = group.rows.reduce((sum, row) => sum + number(row.servicePart ?? number(row.quantityPerUnit) * number(row.servicePrice)), 0)
        const totalPart = materialPart + servicePart
        group.components = rabComponents
        return [
          <tr key={group.key}>
            <td>{index + 1}</td>
            <td className="workflow-component-description">
              <button className="workflow-component-expand" type="button" aria-expanded={isExpanded} onClick={() => setExpandedComponentGroup((current) => current === group.key ? '' : group.key)}>
                <ChevronDown className={isExpanded ? 'is-expanded' : ''} size={15} />
                <span><strong>{group.title || 'RAB tanpa nama'}</strong>{(group.prk || group.workPackage) && <small>{[group.prk && `PRK ${group.prk}`, group.workPackage].filter(Boolean).join(' | ')}</small>}</span>
              </button>
            </td>
            <td>{rabComponents.length} komponen</td>
            <td className="workflow-total">{formatCurrency(totalPart)}</td>
            <td className="workflow-actions-cell"><div className="workflow-row-actions">
              {rabComponents.length > 0 && <button className="workflow-edit" type="button" aria-label={`Cetak RAB ${group.title}`} title="Cetak RAB" onClick={() => printComponentGroup(group)}><Printer size={14} /></button>}
              {!readOnly && <button className="workflow-edit" type="button" aria-label={`Edit ${group.title}`} title="Edit" onClick={() => editRecord(group.rows[0])}><Pencil size={14} /></button>}
              {!readOnly && <button className="workflow-delete" type="button" aria-label={`Hapus ${group.title}`} title="Hapus" onClick={() => removeComponentGroup(group)}><Trash2 size={14} /></button>}
            </div></td>
          </tr>,
          ...(isExpanded ? [<tr className="workflow-component-detail-row" key={`${group.key}-components`}><td colSpan="5"><div className="workflow-component-details">
            <table><thead><tr><th>No</th><th>Komponen</th><th>Jumlah Material</th><th>Total (Rp)</th><th>Aksi</th></tr></thead>
              <tbody>{rabComponents.map((component, componentIndex) => {
                const materialExpanded = expandedRabMaterialGroup === `${group.key}:${component.id}`
                return <Fragment key={component.id}>
                  <tr>
                    <td>{componentIndex + 1}</td>
                    <td><button className="workflow-component-expand workflow-rab-component-title" type="button" aria-expanded={materialExpanded} onClick={() => setExpandedRabMaterialGroup((current) => current === `${group.key}:${component.id}` ? '' : `${group.key}:${component.id}`)}><ChevronDown className={materialExpanded ? 'is-expanded' : ''} size={14} /><strong>{component.displayName}</strong></button></td>
                    <td>{component.records.length} material</td>
                    <td className="workflow-total">{formatCurrency(component.total)}</td>
                    <td className="workflow-actions-cell"><div className="workflow-row-actions">
                      <button className="workflow-edit" type="button" title="Cetak komponen" aria-label={`Cetak ${component.displayName}`} onClick={() => printActivityComponent(component)}><Printer size={14} /></button>
                      {!readOnly && <button className="workflow-edit" type="button" title="Edit" aria-label={`Edit ${component.displayName}`} onClick={() => editRecord(component.records[0])}><Pencil size={14} /></button>}
                      {!readOnly && <button className="workflow-delete" type="button" title="Hapus" aria-label={`Hapus ${component.displayName}`} onClick={() => removeComponentGroup({ ...group, rows: component.records })}><Trash2 size={14} /></button>}
                    </div></td>
                  </tr>
                  {materialExpanded && <tr><td colSpan="5"><div className="workflow-component-details">
                    <table className="workflow-rab-detail-table">
                      <colgroup><col /><col /><col /><col /><col /><col /><col /><col /><col /><col /></colgroup>
                      <thead><tr><th>No</th><th>Uraian Material</th><th>Volume</th><th>Satuan</th><th>Harga satuan material</th><th>Harga satuan jasa</th><th>Bagian material</th><th>Bagian jasa</th><th>Jumlah (Rp)</th><th className="workflow-actions-heading">Aksi</th></tr></thead>
                      <tbody>{component.records.map((row, rowIndex) => {
                        const lineMaterial = number(row.materialPart ?? number(row.quantityPerUnit) * number(row.materialPrice))
                        const lineService = number(row.servicePart ?? number(row.quantityPerUnit) * number(row.servicePrice))
                        return <tr key={row.id}><td>{rowIndex + 1}</td><td className="workflow-component-description">{row.materialName || row.name || '-'}</td><td>{number(row.quantityPerUnit)}</td><td>{row.unit || '-'}</td><td>{formatCurrency(row.materialPrice)}</td><td>{formatCurrency(row.servicePrice)}</td><td>{formatCurrency(lineMaterial)}</td><td>{formatCurrency(lineService)}</td><td className="workflow-total">{formatCurrency(number(row.totalPart ?? lineMaterial + lineService))}</td>{rowActions(row, 'komponen RAB')}</tr>
                      })}</tbody>
                      <tfoot><tr><td colSpan="6">Jumlah</td><td>{formatCurrency(component.materialTotal)}</td><td>{formatCurrency(component.serviceTotal)}</td><td className="workflow-total">{formatCurrency(component.total)}</td><td /></tr></tfoot>
                    </table>
                  </div></td></tr>}
                </Fragment>
              })}</tbody>
              <tfoot>
                <tr><td colSpan="5"><table className="workflow-rab-tax-alignment"><colgroup><col /><col /><col /><col /><col /><col /><col /><col /><col /><col /></colgroup><tbody>
                  <tr><td colSpan="8">Subtotal</td><td className="workflow-total workflow-rab-tax-amount">{formatCurrency(totalPart)}</td><td /></tr>
                  <tr><td colSpan="8">DPP (11/12)</td><td className="workflow-rab-tax-amount">{formatCurrency(totalPart * 11 / 12)}</td><td /></tr>
                  <tr><td colSpan="8">PPN 12%</td><td className="workflow-rab-tax-amount">{formatCurrency(calculateRabBudgetTotal(totalPart) - totalPart)}</td><td /></tr>
                  <tr><td colSpan="8"><strong>TOTAL ANGGARAN — kolom M</strong></td><td className="workflow-total workflow-rab-tax-amount">{formatCurrency(calculateRabBudgetTotal(totalPart))}</td><td /></tr>
                </tbody></table></td></tr>
              </tfoot>
            </table>
          </div></td></tr>] : []),
        ]
      })
    }
    return filteredRows.map((row) => <tr key={row.id}><td>{row.name}</td><td>{row.unit || '-'}</td><td>{formatCurrency(row.materialPrice)}</td><td>{formatCurrency(row.servicePrice ?? (number(row.installPrice) + number(row.removalPrice)))}</td><td>{row.componentActivity || '-'}</td><td>{row.operation || '-'}</td><td>{row.criteria || '-'}</td><td>{row.source || '-'}</td>{rowActions(row, 'material')}</tr>)
  }

  const tableHeaders = {
    materials: ['Uraian', 'SAT', 'Harga Material', 'Harga Jasa', 'Komponen Pekerjaan', 'Keterangan', 'Kriteria', 'MDU/NON MDU', ''],
    activityCatalog: ['Paket pekerjaan', 'Nama kegiatan', 'Satuan', 'Kriteria', 'No. PRK acuan', ''],
    components: ['No', 'Uraian Material', 'Volume', 'Satuan', 'Harga satuan material', 'Harga satuan jasa', 'Bagian material', 'Bagian jasa', 'Jumlah', 'Aksi'],
    activities: ['No', 'Uraian Komponen', 'Jumlah material', 'Jumlah jasa', 'Jumlah', 'Aksi'],
    paFinalization: ['Tanggal', 'Kriteria', 'No. PRK', 'No. RAB', 'Dialihkan', 'RAB sebelum', 'RAB sesudah', 'PA sebelum', 'PA sesudah', ''],
    materialRecap: ['Kriteria', 'No. PRK', 'Kegiatan', 'Material', 'Kebutuhan RAB', 'Terpakai aktual', 'Sisa/selisih'],
    realizations: ['Kriteria', 'No. PRK', 'Kegiatan', 'No. Kontrak', 'Nilai Kontrak', 'Nilai Terserap/Tagihan', 'Total Dibayar', 'Sisa Kontrak', 'Status Pembayaran', 'Rincian'],
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
    ? activitySavedGroups.reduce((sum, group) => ({
      material: sum.material + group.materialTotal,
      service: sum.service + group.serviceTotal,
      total: sum.total + group.total,
    }), { material: 0, service: 0, total: 0 })
    : { material: 0, service: 0, total: 0 }
  const activityDpp = activityTableTotals.total * 11 / 12
  const activityTotalAnggaran = view === 'activities'
    ? activitySavedGroups.reduce((sum, group) => sum + group.totalAnggaran, 0)
    : 0
  const activityPpn = activityTotalAnggaran - activityTableTotals.total
  const componentTaxTotals = componentDisplayGroups.reduce((sum, group) => {
    const subtotal = group.rows.reduce((groupTotal, row) => groupTotal + number(row.totalPart
      ?? (number(row.materialPrice) + number(row.servicePrice)) * number(row.quantityPerUnit ?? 1)), 0)
    const budgetTotal = calculateRabBudgetTotal(subtotal)
    return {
      subtotal: sum.subtotal + subtotal,
      dpp: sum.dpp + subtotal * 11 / 12,
      ppn: sum.ppn + budgetTotal - subtotal,
      budgetTotal: sum.budgetTotal + budgetTotal,
    }
  }, { subtotal: 0, dpp: 0, ppn: 0, budgetTotal: 0 })
  const componentPrintGroups = [...componentDisplayGroups.map((group) => {
    const componentGroups = [...group.rows.reduce((groups, row) => {
      const activity = String(row.activity || row.componentName || row.name || row.materialName || '').trim()
      const key = JSON.stringify([normalizeWorkName(activity), normalizeCriteria(row.criteria)])
      const component = groups.get(key) || { name: activity, rows: [] }
      component.rows.push(row)
      groups.set(key, component)
      return groups
    }, new Map()).values()]
    return componentGroups.map((component) => ({
      key: `component::${group.key}::${normalizeWorkName(component.name)}`,
      criteria: component.rows[0]?.criteria || group.criteria || '',
      activity: component.name,
      prk: group.prk,
      rabNumber: group.rabNumber,
      rabTitle: group.rabTitle,
      workPackage: group.workPackage,
      componentIds: component.rows.map((row) => row.id),
      isMaterialGroup: true,
    }))
  }).flat()]
  const componentBackedPrintGroups = [...new Map(components.flatMap((component) => {
    const catalogActivity = activityCatalog.find((activity) =>
      String(activity.prk || '').trim() === String(component.prk || '').trim()
        && (!component.workPackage || normalizeWorkName(activity.workPackage) === normalizeWorkName(component.workPackage))
        && normalizeWorkName(activity.name) === normalizeWorkName(component.activity)
    )
    const workPackage = component.workPackage || catalogActivity?.workPackage
    if (!workPackage) return []
    const key = `${String(component.prk || '').trim()}::${normalizeWorkName(workPackage)}`
    return [[`package::${key}`, { key: `package::${key}`, criteria: catalogActivity?.criteria || component.criteria || '', activity: workPackage, prk: component.prk || '', isComponentSummary: true }]]
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
  const activityComponentPrintGroups = activitySavedGroups.flatMap((group) => group.components.map((component) => ({
    key: `activity-component::${group.key}::${component.id}`,
    criteria: component.criteria || group.criteria || '',
    activity: component.displayName,
    prk: group.prk,
    rabNumber: group.rabNumber,
    rabTitle: group.rabTitle,
    componentGroups: [{
      id: component.id,
      activity: component.displayName,
      quantityPerUnit: 1,
      materialPrice: component.materialTotal,
      servicePrice: component.serviceTotal,
    }],
    isActivityComponent: true,
    sourceGroupKey: group.key,
    sourceComponentKey: component.id,
  })))
  const activityPrintGroups = [...componentBackedPrintGroups, ...activityComponentPrintGroups]
  const printGroups = view === 'activities' ? activityPrintGroups : componentPrintGroups
  const selectedPrintGroup = printGroups.find((group) => group.key === printGroupKey)
  const printableComponents = selectedPrintGroup
    ? view === 'activities'
      ? selectedPrintGroup.componentGroups
      : components.filter((row) => selectedPrintGroup.componentIds?.includes(row.id))
    : []
  useEffect(() => {
    if (printRequestVersion === handledPrintRequestRef.current || !selectedPrintGroup || !printableComponents.length) return undefined
    const frame = window.requestAnimationFrame(() => {
      handledPrintRequestRef.current = printRequestVersion
      window.print()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [printRequestVersion, printableComponents.length, selectedPrintGroup])
  const printVolumeMultiplier = 1
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
  const printableDisplayRows = view === 'activities' && selectedPrintGroup?.isComponentSummary
    ? printableRows.map((row) => ({
      ...row,
      materialName: row.activity,
      unit: row.unit || activityCatalog.find((item) =>
        String(item.prk || '').trim() === String(selectedPrintGroup.prk || '').trim()
          && normalizeWorkName(item.name) === normalizeWorkName(row.activity))?.unit || '-',
    }))
    : printableRows
  const printableDpp = printableTotals * 11 / 12
  const printableTotalAnggaran = calculateRabBudgetTotal(printableTotals)
  const printablePpn = printableTotalAnggaran - printableTotals
  const printableAmountInWords = terbilangRupiah(view === 'activities' ? printableTotalAnggaran : printableTotals)

  const totals = view === 'activities'
    ? { label: 'Nilai RAB terdaftar', value: activities.filter((activity) => criteriaFilter === 'all' || activity.criteria === criteriaFilter).reduce((sum, activity) => {
      const costs = activityUnitCosts(activity)
      return sum + costs.material * number(activity.volume) + costs.service * number(activity.volume)
    }, 0) }
    : view === 'paFinalization'
      ? { label: 'Total dana dialihkan', value: filteredRows.reduce((sum, row) => sum + number(row.amount), 0) }
    : view === 'realizations'
      ? {
        contractValue: realizationGroups.reduce((sum, group) => sum + group.contractValue, 0),
        billed: realizationGroups.reduce((sum, group) => sum + group.billed, 0),
        paid: realizationGroups.reduce((sum, group) => sum + group.paid, 0),
        remaining: realizationGroups.reduce((sum, group) => sum + group.remaining, 0),
      }
      : null
  const isFormEditing = Boolean(editingId) || (view === 'activityCatalog' && editingRecordIndex >= 0)

  return <div className={`workflow-page ${readOnly ? 'is-read-only' : ''}`}>
    <section className="workflow-heading"><div className="workflow-title-icon"><Icon size={21} /></div><div><p className="eyebrow">ALUR RAB &amp; REALISASI</p><h1>{meta.title}</h1><p>{meta.description}</p></div></section>
    {saveStatus && <p className={`workflow-save-status is-${saveStatus.type}`} role={saveStatus.type === 'error' ? 'alert' : 'status'} aria-live="polite">{saveStatus.type === 'progress' && <span className="workflow-save-spinner" aria-hidden="true" />}{saveStatus.message}</p>}
    {(view === 'activities' || (view === 'components' && activityCatalog.length > 0))
      ? <div className="workflow-stepbar" aria-label="Tahapan RAB"><span className={!form.prk ? 'current' : ''}>1 PRK</span><i /><span className={form.prk && !form.workPackage ? 'current' : ''}>2 Kegiatan</span><i /><span className={form.workPackage && (!form.name || view === 'activities') ? 'current' : ''}>{view === 'activities' ? '3 Rekap komponen' : '3 Komponen pekerjaan'}</span><i /><span>4 Finalisasi PA</span><i /><span>5 Realisasi</span></div>
      : <div className="workflow-stepbar" aria-label="Tahapan RAB"><span className={view === 'materials' ? 'current' : ''}>1 Material</span><i /><span className={view === 'components' ? 'current' : ''}>2 Komponen</span><i /><span className={view === 'activities' ? 'current' : ''}>3 Kegiatan</span><i /><span className={view === 'paFinalization' ? 'current' : ''}>4 Finalisasi PA</span><i /><span className={view === 'realizations' ? 'current' : ''}>5 Realisasi</span></div>}
    <div className={`workflow-layout ${view === 'components' || view === 'activities' || view === 'paFinalization' ? 'workflow-layout-rab-wide' : ''}`}>
      <section ref={formPanelRef} className="panel workflow-form-panel">
        <div className="workflow-section-heading"><div><span className="workflow-section-icon">{isFormEditing ? <Pencil size={15} /> : <Plus size={16} />}</span><h2>{isFormEditing ? `Edit ${meta.title.toLowerCase()}` : view === 'materialRecap' ? 'Catat pemakaian material' : `Tambah ${meta.title.toLowerCase()}`}</h2></div></div>
        {view === 'components' && materials.length === 0 && components.length === 0 && <div className="workflow-hint">{activityCatalog.length ? 'Impor FORM MATERIAL & HARGA terlebih dahulu agar uraian dan harga dapat terisi otomatis.' : 'Isi master material terlebih dahulu. Harga material dan jasa tetap dapat diketik manual.'}</div>}
        {view === 'activities' && <div className="workflow-hint">Rekap RAB menampilkan data yang sudah tersimpan melalui menu Input RAB. Untuk menambah atau mengubah data, gunakan Input RAB.</div>}
        {view === 'materialRecap' && activities.length === 0 && <div className="workflow-hint">Buat RAB kegiatan terlebih dahulu. Kebutuhan material akan direkap dari komponen RAB.</div>}
        {view === 'realizations' && <div className="workflow-hint">{realizationActivities.length ? 'Pilih No. PRK terlebih dahulu, lalu cari kegiatan RAB.' : 'Belum ada Input RAB. Simpan komponen melalui menu Input RAB terlebih dahulu.'}</div>}
        {view !== 'activities' && <form className="workflow-form" onSubmit={submit}>
          <div className="workflow-fields">{formFields()}{view !== 'paFinalization' && view !== 'materials' && field('notes', 'Catatan', { required: false, placeholder: 'Opsional' })}</div>
          {view === 'components' && form.name && <div className="workflow-tax-summary workflow-input-rab-tax workflow-rab-step-full"><div><span>Subtotal RAB</span><strong>{formatCurrency(inputRabSubtotal)}</strong></div><div><span>DPP (11/12)</span><strong>{formatCurrency(inputRabDpp)}</strong></div><div><span>PPN 12%</span><strong>{formatCurrency(inputRabPpn)}</strong></div><div className="workflow-tax-total"><span>TOTAL ANGGARAN — akan masuk kolom M</span><strong>{formatCurrency(inputRabTotalAnggaran)}</strong></div></div>}
          {view !== 'paFinalization' && <div className={`workflow-form-footer ${view === 'components' ? 'workflow-rab-save-footer' : ''}`}><span>* Wajib diisi</span><div className="workflow-form-actions">{isFormEditing && <button className="button button-secondary" type="button" disabled={saving} onClick={() => { setForm({ ...EMPTY_FORM[view] }); setEditingId(''); setEditingRecordIndex(-1); setSaveStatus(null) }}><X size={14} />Batal edit</button>}<button className="button button-primary" type="submit" disabled={saving || (view === 'materials' && !selectedMaterialActivity) || (view === 'materialRecap' && activities.length === 0) || (view === 'realizations' && realizationActivities.length === 0) || (view === 'components' && activityCatalog.length > 0 && (!form.prk || !form.workPackage || !form.name || activityLineItems.length === 0))}>{saving ? <><span className="workflow-save-spinner" aria-hidden="true" />Menyimpan...</> : <><Save size={15} />{view === 'components' ? 'Simpan ke Google Sheets' : isFormEditing ? 'Simpan perubahan' : 'Simpan data'}</>}</button></div></div>}
        </form>}
      </section>
      {view !== 'components' && view !== 'activities' && <section className="workflow-summary panel">
        <span className="workflow-summary-icon"><Icon size={19} /></span>
        <div><span>{view === 'materialRecap' ? 'Baris kebutuhan material' : view === 'realizations' ? 'Kontrak tercatat' : `Total ${meta.title.toLowerCase()}`}</span><strong>{view === 'materialRecap' ? plannedMaterialRows.length : view === 'realizations' ? realizationGroups.length : rows.length}</strong></div>
        {view === 'realizations' && totals && <>
          <div className="workflow-sum-money"><span>Nilai kontrak</span><strong>{formatCurrency(totals.contractValue)}</strong></div>
          <div className="workflow-sum-money"><span>Total terserap / tagihan</span><strong>{formatCurrency(totals.billed)}</strong></div>
          <div className="workflow-sum-money"><span>Total dibayar kumulatif</span><strong>{formatCurrency(totals.paid)}</strong></div>
          <div className="workflow-sum-money"><span>Sisa anggaran kontrak</span><strong>{formatCurrency(totals.remaining)}</strong></div>
        </>}
        {view !== 'realizations' && totals && <div className="workflow-sum-money"><span>{totals.label}</span><strong>{formatCurrency(totals.value)}</strong></div>}
        </section>}
    </div>

    {(view === 'components' || view === 'activities') && <section className="workflow-rab-total-panel panel" aria-label={`Total ${meta.title}`}>
      <span className="workflow-summary-icon"><Icon size={19} /></span>
      <div className="workflow-rab-total-count"><span>{view === 'components' ? 'Komponen pekerjaan' : view === 'activities' ? 'Kegiatan' : `Baris ${meta.title.toLowerCase()}`}</span><strong>{view === 'activities' ? activitySavedGroups.length : view === 'components' ? componentDisplayGroups.length : filteredRows.length}</strong></div>
      {view === 'activities' && <>
        <div><span>Subtotal</span><strong>{formatCurrency(activityTableTotals.total)}</strong></div>
        <div><span>DPP (11/12)</span><strong>{formatCurrency(activityDpp)}</strong></div>
        <div><span>PPN (12%)</span><strong>{formatCurrency(activityPpn)}</strong></div>
        <div className="workflow-rab-total-final"><span>Total Anggaran</span><strong>{formatCurrency(activityTotalAnggaran)}</strong></div>
      </>}
      {view === 'components' && <>
        <div><span>Subtotal</span><strong>{formatCurrency(componentTaxTotals.subtotal)}</strong></div>
        <div><span>DPP (11/12)</span><strong>{formatCurrency(componentTaxTotals.dpp)}</strong></div>
        <div><span>PPN (12%)</span><strong>{formatCurrency(componentTaxTotals.ppn)}</strong></div>
        <div className="workflow-rab-total-final"><span>Total Anggaran — kolom M</span><strong>{formatCurrency(componentTaxTotals.budgetTotal)}</strong></div>
      </>}
    </section>}

    <section className="panel workflow-table-panel">
      <div className="workflow-table-heading"><div><p className="eyebrow">DATA TERSIMPAN</p><h2>{view === 'materialRecap' ? 'Rencana dan pemakaian material' : meta.title}</h2></div>{(view === 'components' || view === 'activities') ? <div className="workflow-print-controls"><select aria-label={view === 'activities' ? 'Pilih kegiatan untuk dicetak' : 'Pilih komponen pekerjaan untuk dicetak'} value={printGroupKey} onChange={(event) => setPrintGroupKey(event.target.value)}><option value="">{view === 'activities' ? 'Pilih kegiatan' : 'Pilih komponen pekerjaan'}</option>{printGroups.map((group) => <option key={group.key} value={group.key}>{group.criteria ? `${group.criteria} | ` : ''}{group.activity}{group.prk ? ` | PRK ${group.prk}` : ''}</option>)}</select><button className="button button-secondary" type="button" disabled={!printableComponents.length} onClick={() => requestPrint(printGroupKey)}><Printer size={15} /> Cetak RAB</button></div> : <span className="workflow-count">{view === 'materialRecap' ? plannedMaterialRows.length : view === 'realizations' ? realizationGroups.length : rows.length} {view === 'realizations' ? 'kontrak' : 'baris'}</span>}</div>
      <div className="workflow-toolbar"><label className="workflow-search"><Search size={15} /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Cari uraian, PRK, atau kegiatan" /></label>{view !== 'components' && <div className="workflow-segment" role="group" aria-label="Filter kriteria"><button className={criteriaFilter === 'all' ? 'selected' : ''} onClick={() => setCriteriaFilter('all')}>Semua</button><button className={criteriaFilter === 'TM' ? 'selected' : ''} onClick={() => setCriteriaFilter('TM')}>TM</button><button className={criteriaFilter === 'TR' ? 'selected' : ''} onClick={() => setCriteriaFilter('TR')}>TR</button></div>}</div>
      <div className={`workflow-table-scroll ${view === 'components' || view === 'activities' ? 'workflow-component-table' : ''} ${view === 'activities' ? 'workflow-activities-table' : ''} ${view === 'realizations' ? 'workflow-realizations-table' : ''} ${view === 'materials' ? 'workflow-materials-freeze-scroll' : ''} ${view === 'activityCatalog' ? 'workflow-catalog-freeze-scroll' : ''}`}><table><thead>{view === 'components' ? <tr>{['No', 'Nama RAB', 'Jumlah Komponen', 'Subtotal (Rp)', 'Aksi'].map((header) => <th key={header}>{header}</th>)}</tr> : view === 'activities' ? <tr>{['No', 'Kegiatan', 'Jumlah RAB Komponen', 'Total Anggaran (Rp)', 'Aksi'].map((header) => <th key={header}>{header}</th>)}</tr> : <tr>{tableHeaders.map((header, index) => <th className={!header || header === 'Aksi' ? 'workflow-actions-heading' : undefined} key={`${header}-${index}`}>{header || <span className="sr-only">Aksi</span>}</th>)}</tr>}</thead><tbody>
        {view === 'materialRecap' ? tableRows() : tableRows()}
        {((view === 'materialRecap' && filteredMaterialRows.length === 0) || (view === 'activities' && activitySavedGroups.length === 0) || (view === 'components' && componentDisplayGroups.length === 0) || (view === 'realizations' && realizationGroups.length === 0) || (view !== 'components' && view !== 'materialRecap' && view !== 'activities' && view !== 'realizations' && filteredRows.length === 0)) && <tr><td colSpan={view === 'components' || view === 'activities' ? 5 : tableHeaders.length}><div className="workflow-empty"><Icon size={23} /><strong>Belum ada data</strong><span>{view === 'activities' && (form.prk || activityPrkFilter) ? 'Belum ada Rekap RAB tersimpan untuk PRK ini.' : 'Gunakan formulir di atas untuk memulai alur ini.'}</span></div></td></tr>}
      </tbody>{view === 'components' && componentDisplayGroups.length > 0 && <tfoot className="workflow-summary-footer"><tr><td colSpan="3">Subtotal</td><td className="workflow-total">{formatCurrency(componentTotals.total)}</td><td /></tr></tfoot>}{view === 'activities' && activitySavedGroups.length > 0 && <tfoot className="workflow-summary-footer"><tr><td colSpan="3">Total anggaran dari Input RAB</td><td className="workflow-total">{formatCurrency(activitySavedGroups.reduce((sum, group) => sum + group.totalAnggaran, 0))}</td><td /></tr></tfoot>}</table></div>
      {view === 'activities' && activitySavedGroups.length > 0 && <div className="workflow-tax-summary"><div><span>Subtotal</span><strong>{formatCurrency(activityTableTotals.total)}</strong></div><div><span>DPP (11/12)</span><strong>{formatCurrency(activityDpp)}</strong></div><div><span>PPN 12%</span><strong>{formatCurrency(activityPpn)}</strong></div><div className="workflow-tax-total"><span>TOTAL ANGGARAN</span><strong>{formatCurrency(activityTotalAnggaran)}</strong></div></div>}
    </section>
    {view === 'materialRecap' && <section className="panel workflow-table-panel">
      <div className="workflow-table-heading"><div><p className="eyebrow">RIWAYAT PEMAKAIAN</p><h2>Catatan material aktual</h2></div><span className="workflow-count">{filteredRows.length} transaksi</span></div>
      <div className="workflow-table-scroll"><table><thead><tr><th>Tanggal</th><th>Kriteria</th><th>No. PRK</th><th>Kegiatan</th><th>Material</th><th>Volume</th><th className="workflow-actions-heading">Aksi</th></tr></thead><tbody>
        {filteredRows.length ? filteredRows.map((row) => <tr key={row.id}><td>{row.date}</td><td>{row.criteria}</td><td>{row.prk}</td><td>{row.activityName}</td><td>{materials.find((material) => material.id === row.materialId)?.name || '-'}</td><td>{row.quantity} {row.unit}</td>{rowActions(row, 'pemakaian material')}</tr>) : <tr><td colSpan="7"><div className="workflow-empty"><Boxes size={22} /><strong>Belum ada transaksi pemakaian</strong><span>Catat material aktual pada form di atas.</span></div></td></tr>}
      </tbody></table></div>
    </section>}
    {(view === 'components' || view === 'activities') && selectedPrintGroup && <article className={`workflow-print-sheet${view === 'activities' ? ' is-activity-recap' : ''}`}>
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
          ? <thead>
            <tr><th rowSpan="2">NO</th><th rowSpan="2">URAIAN</th><th rowSpan="2">VOL</th><th rowSpan="2">SAT</th><th colSpan="2">HARGA SATUAN (Rp)</th><th colSpan="2">HARGA BAGIAN (Rp)</th><th rowSpan="2">TOTAL HARGA (Rp)</th></tr>
            <tr><th>MATERIAL</th><th>JASA</th><th>MATERIAL</th><th>JASA</th></tr>
          </thead>
          : <thead><tr><th rowSpan="2">No</th><th rowSpan="2">Uraian Komponen / Material</th><th rowSpan="2">Volume</th><th rowSpan="2">Satuan</th><th colSpan="2">Harga Satuan (Rp)</th><th colSpan="2">Bagian (Rp)</th><th rowSpan="2">Total Harga (Rp)</th></tr><tr><th>Material</th><th>Jasa</th><th>Material</th><th>Jasa</th></tr></thead>}
        <tbody>{view === 'activities'
          ? printableDisplayRows.map((row, index) => <tr key={row.id}><td>{index + 1}</td><td><strong>{row.materialName || row.name || row.activity}</strong></td><td>{row.printVolume}</td><td>{row.unit || '-'}</td><td>{formatCurrency(row.materialPrice)}</td><td>{formatCurrency(row.servicePrice)}</td><td>{formatCurrency(row.printMaterialPart)}</td><td>{formatCurrency(row.printServicePart)}</td><td>{formatCurrency(row.printTotalPart)}</td></tr>)
          : printableRows.map((row, index) => <tr key={row.id}><td>{index + 1}</td><td><strong>{row.activity || selectedPrintGroup.activity}</strong><small>{row.materialName || row.name || '-'}</small></td><td>{row.printVolume}</td><td>{row.unit || '-'}</td><td>{formatCurrency(row.materialPrice)}</td><td>{formatCurrency(row.servicePrice)}</td><td>{formatCurrency(row.printMaterialPart)}</td><td>{formatCurrency(row.printServicePart)}</td><td>{formatCurrency(row.printTotalPart)}</td></tr>)}</tbody>
        {(view === 'components' || view === 'activities') && <tfoot><tr><th colSpan="6">Subtotal</th><th>{formatCurrency(printableActivityTotals.material)}</th><th>{formatCurrency(printableActivityTotals.service)}</th><th>{formatCurrency(printableTotals)}</th></tr></tfoot>}
      </table>
      <div className="workflow-print-summary">
        <div className="workflow-print-terbilang"><strong>Terbilang:</strong><span>{printableAmountInWords}</span></div>
        <div className="workflow-print-totals">
          <div><span>Subtotal</span><strong>{formatCurrency(printableTotals)}</strong></div>
          <div><span>DPP (11/12)</span><strong>{formatCurrency(printableDpp)}</strong></div>
          <div><span>PPN (12%)</span><strong>{formatCurrency(printablePpn)}</strong></div>
          <div className="workflow-print-budget-total">
            <span>TOTAL ANGGARAN</span>
            <strong>{formatCurrency(printableTotalAnggaran)}</strong>
          </div>
        </div>
      </div>
      <section className="workflow-print-signatures workflow-print-signatures-recap" aria-label="Tanda tangan manager dan asman perencanaan">
        <div className="workflow-print-manager"><strong>MANAGER</strong><span className="workflow-print-signature-space" /><strong className="workflow-print-signature-name">RM DIMAS ADHI PRABOWO</strong></div>
        <div className="workflow-print-planner"><span>Singaraja, {new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}</span><strong>ASMAN PERENCANAAN</strong><span className="workflow-print-signature-space" /><strong className="workflow-print-signature-name">LUTFI ABDILAH</strong></div>
      </section>
    </article>}
    {view === 'activities' && <p className="workflow-footnote"><Check size={14} /> Harga material dan jasa mengikuti komponen pekerjaan; total RAB dihitung dari harga satuan dikalikan volume setiap material.</p>}
    {(view === 'paFinalization' || view === 'activities') && finalizeRabGroup && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) setFinalizeRabGroup(null)
    }}>
      <section className="modal workflow-finalize-modal" role="dialog" aria-modal="true" aria-labelledby="workflow-finalize-title">
        <div className="modal-heading"><div><p className="eyebrow">FINALISASI KE PA</p><h2 id="workflow-finalize-title">Konfirmasi pemindahan RAB ke PA</h2><p className="modal-project-name">{finalizeRabGroup.workPackage}</p></div>
          <button className="icon-button" type="button" aria-label="Tutup" disabled={saving} onClick={() => setFinalizeRabGroup(null)}><X size={19} /></button>
        </div>
        <div className="workflow-finalize-summary">
          <div><span>Nama RAB</span><strong>{finalizeRabGroup.rabTitle || finalizeRabGroup.workPackage}</strong></div>
          <div><span>No. RAB</span><strong>{finalizeRabGroup.rabNumber || '-'}</strong></div>
          <div><span>No. PRK</span><strong>{finalizeRabGroup.prk || '-'}</strong></div>
          <div><span>Nilai yang ditambahkan ke PA</span><strong>{formatCurrency(finalizeRabGroup.totalAnggaran ?? calculateRabBudgetTotal(finalizeRabGroup.total))}</strong></div>
        </div>
        <form onSubmit={submitFinalizeRab}>
          <p className="form-note"><CircleAlert size={15} /> {(() => {
            const source = findProgramRecordForRabGroup(programRecords, finalizeRabGroup)
            return source && number(finalizeRabGroup.totalAnggaran ?? calculateRabBudgetTotal(finalizeRabGroup.total)) > number(source.rabTotal)
              ? 'TOTAL RAB akan disinkronkan otomatis ke kolom M berdasarkan kegiatan dan PRK, lalu dipindahkan ke kolom N. '
              : 'Nilai RAB dari kolom M akan dipindahkan ke kolom N. '
          })()}Nomor kontrak, nilai kontrak, vendor, dan tanggal dapat dilengkapi nanti melalui menu Data Kontrak.</p>
          {saveStatus && <p className={`workflow-save-status is-${saveStatus.type}`} role={saveStatus.type === 'error' ? 'alert' : 'status'} aria-live="polite">{saveStatus.type === 'progress' && <span className="workflow-save-spinner" aria-hidden="true" />}{saveStatus.message}</p>}
          <div className="modal-actions"><button type="button" className="button button-secondary" disabled={saving} onClick={() => setFinalizeRabGroup(null)}>Batal</button><button type="submit" className="button button-primary" disabled={saving || readOnly}><Check size={16} />{saving ? 'Memproses...' : 'Kirim ke PA'}</button></div>
        </form>
      </section>
    </div>}
  </div>
}