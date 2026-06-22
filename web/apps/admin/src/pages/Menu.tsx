import { useState, useCallback, useRef } from 'react'
import { Button, Modal } from '@wolfchow/ui'
import { ApiError } from '@wolfchow/api-client'
import type { AvailabilityState, MenuCategory, MenuItem, ModifierGroup, ModifierOption } from '@wolfchow/types'
import { useApi } from '../lib/api'
import { useAsync } from '../lib/useAsync'

// ── Constants ──────────────────────────────────────────────────────────────────

const DIETARY_TAGS = [
  { value: 'vegan', label: 'Vegan' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'spicy', label: 'Spicy 🌶' },
  { value: 'gluten_free', label: 'Gluten-Free' },
  { value: 'contains_nuts', label: 'Contains Nuts' },
  { value: 'halal', label: 'Halal' },
  { value: 'dairy_free', label: 'Dairy-Free' },
]

const AVAILABILITY_OPTIONS: Array<{ value: AvailabilityState; label: string; color: string }> = [
  { value: 'in_stock',    label: 'In Stock',     color: 'bg-green-100 text-green-800' },
  { value: 'out_of_stock', label: 'Out of Stock', color: 'bg-red-100 text-red-800' },
  { value: 'limited',     label: 'Limited',      color: 'bg-amber-100 text-amber-800' },
  { value: 'hidden',      label: 'Hidden',       color: 'bg-gray-100 text-gray-600' },
]

// ── Helpers ────────────────────────────────────────────────────────────────────

function AvailabilityBadge({ state }: { state: string }) {
  const opt = AVAILABILITY_OPTIONS.find((o) => o.value === state) ?? AVAILABILITY_OPTIONS[0]
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${opt.color}`}>
      {opt.label}
    </span>
  )
}

function formatPrice(cents: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}

// ── Plan limit bar ─────────────────────────────────────────────────────────────

function PlanLimitBar({ label, used, cap }: { label: string; used: number; cap: number }) {
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0
  return (
    <div className="flex items-center gap-2 text-xs text-gray-500">
      <span>{label}: {used}/{cap}</span>
      <div className="h-1.5 w-20 rounded-full bg-gray-200">
        <div
          className={`h-1.5 rounded-full ${pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-indigo-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ── Category panel ─────────────────────────────────────────────────────────────

interface CategoryRowProps {
  category: MenuCategory
  selected: boolean
  isFirst: boolean
  isLast: boolean
  onClick: () => void
  onEdit: () => void
  onDelete: () => void
  onToggleActive: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

function CategoryRow({ category, selected, isFirst, isLast, onClick, onEdit, onDelete, onToggleActive, onMoveUp, onMoveDown }: CategoryRowProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      className={[
        'group flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm',
        selected ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-100',
      ].join(' ')}
    >
      <span className="flex flex-col gap-0.5">
        <button
          type="button"
          aria-label={`Move ${category.name} up`}
          disabled={isFirst}
          onClick={(e) => { e.stopPropagation(); onMoveUp() }}
          className="text-gray-300 hover:text-gray-600 disabled:opacity-0 leading-none text-xs"
        >▲</button>
        <button
          type="button"
          aria-label={`Move ${category.name} down`}
          disabled={isLast}
          onClick={(e) => { e.stopPropagation(); onMoveDown() }}
          className="text-gray-300 hover:text-gray-600 disabled:opacity-0 leading-none text-xs"
        >▼</button>
      </span>
      <span className="flex-1 truncate font-medium">{category.name}</span>
      {!category.active && <span className="text-xs text-gray-400">Off</span>}
      <div className="hidden items-center gap-1 group-hover:flex">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleActive() }}
          className="rounded p-0.5 text-xs text-gray-400 hover:text-gray-700"
          title={category.active ? 'Deactivate' : 'Activate'}
        >
          {category.active ? '●' : '○'}
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEdit() }}
          className="rounded p-0.5 text-xs text-gray-400 hover:text-gray-700"
          title="Edit"
        >✎</button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="rounded p-0.5 text-xs text-gray-400 hover:text-red-500"
          title="Delete"
        >✕</button>
      </div>
    </div>
  )
}

// ── Category modal ─────────────────────────────────────────────────────────────

function CategoryModal({ category, onClose, onSave }: {
  category: MenuCategory | null
  onClose: () => void
  onSave: (data: { name: string; active: boolean }) => Promise<void>
}) {
  const [name, setName] = useState(category?.name ?? '')
  const [active, setActive] = useState(category?.active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!name.trim()) { setError('Name is required.'); return }
    setSaving(true)
    try {
      await onSave({ name: name.trim(), active })
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : 'Save failed.')
      setSaving(false)
    }
  }

  return (
    <Modal
      title={category ? 'Edit category' : 'Add category'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={() => void submit()}>
            {category ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
          <input
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-indigo-600" />
          Active (visible to customers)
        </label>
      </div>
    </Modal>
  )
}

// ── Item card ──────────────────────────────────────────────────────────────────

interface ItemCardProps {
  item: MenuItem
  onClick: () => void
  onQuickToggle: (newState: AvailabilityState) => void
}

function ItemCard({ item, onClick, onQuickToggle }: ItemCardProps) {
  const [quickOpen, setQuickOpen] = useState(false)
  const hasVariants = item.has_variants && item.variants && item.variants.length > 0
  const minPrice = hasVariants
    ? Math.min(...(item.variants ?? []).map((v) => v.price))
    : item.price

  return (
    <div className="group cursor-pointer rounded-lg border border-gray-200 bg-white p-3 hover:border-indigo-300 hover:shadow-sm">
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => e.key === 'Enter' && onClick()}
      >
        {item.image_r2_key && (
          <div className="mb-2 h-24 w-full overflow-hidden rounded-md bg-gray-100">
            <img src={`/r2/${item.image_r2_key}`} alt={item.name} className="h-full w-full object-cover" />
          </div>
        )}
        <p className="truncate text-sm font-medium text-gray-900">{item.name}</p>
        <p className="mt-0.5 text-sm text-gray-600">
          {hasVariants ? `From ${formatPrice(minPrice)}` : formatPrice(minPrice)}
        </p>
        {item.tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {item.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                {DIETARY_TAGS.find((t) => t.value === tag)?.label ?? tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Quick availability toggle */}
      <div className="relative mt-2">
        <button
          type="button"
          aria-label={`Availability: ${item.availability_state}`}
          onClick={(e) => { e.stopPropagation(); setQuickOpen((v) => !v) }}
          className="text-left"
        >
          <AvailabilityBadge state={item.availability_state} />
        </button>
        {quickOpen && (
          <div className="absolute left-0 top-full z-10 mt-1 w-36 rounded-md border border-gray-200 bg-white shadow-lg">
            {AVAILABILITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={[
                  'flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50',
                  item.availability_state === opt.value ? 'font-medium text-indigo-700' : 'text-gray-700',
                ].join(' ')}
                onClick={(e) => {
                  e.stopPropagation()
                  onQuickToggle(opt.value)
                  setQuickOpen(false)
                }}
              >
                <span className={`inline-block h-2 w-2 rounded-full ${opt.color.replace('text-', 'bg-').split(' ')[0]}`} />
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Modifier groups section (inside ItemModal) ─────────────────────────────────

interface ModifierGroupsSectionProps {
  itemId: string
}

function ModifierGroupsSection({ itemId }: ModifierGroupsSectionProps) {
  const api = useApi()
  const { data: groups, reload } = useAsync(
    () => api.admin.listModifierGroups(itemId),
    [itemId],
  )

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupType, setNewGroupType] = useState<'single' | 'multi'>('single')
  const [newGroupRequired, setNewGroupRequired] = useState(false)
  const [savingGroup, setSavingGroup] = useState(false)
  const [addingOption, setAddingOption] = useState<string | null>(null)
  const [newOptionName, setNewOptionName] = useState('')
  const [newOptionDelta, setNewOptionDelta] = useState('0')

  const groupsArr: ModifierGroup[] = groups ?? []

  function toggleExpand(id: string) {
    setExpanded((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  async function createGroup() {
    if (!newGroupName.trim()) return
    setSavingGroup(true)
    try {
      await api.admin.createModifierGroup(itemId, {
        name: newGroupName.trim(),
        type: newGroupType,
        required: newGroupRequired,
      })
      setNewGroupName('')
      setNewGroupType('single')
      setNewGroupRequired(false)
      setAddingGroup(false)
      reload()
    } finally {
      setSavingGroup(false)
    }
  }

  async function deleteGroup(groupId: string) {
    await api.admin.deleteModifierGroup(itemId, groupId)
    reload()
  }

  async function addOption(groupId: string) {
    const delta = Math.round(parseFloat(newOptionDelta) * 100) || 0
    await api.admin.createModifierOption(itemId, groupId, {
      name: newOptionName.trim(),
      price_delta: delta,
      available: true,
    })
    setAddingOption(null)
    setNewOptionName('')
    setNewOptionDelta('0')
    reload()
  }

  return (
    <div className="border-t border-gray-200 pt-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">Modifier groups</p>
        <button
          type="button"
          onClick={() => setAddingGroup(true)}
          className="text-xs text-indigo-600 hover:text-indigo-800"
        >
          + Add group
        </button>
      </div>

      {groupsArr.length === 0 && !addingGroup && (
        <p className="text-xs text-gray-400">No modifier groups yet.</p>
      )}

      {groupsArr.map((group) => (
        <div key={group.id} className="mb-2 rounded-md border border-gray-200">
          <div className="flex items-center gap-2 px-3 py-2">
            <button
              type="button"
              aria-label={expanded.has(group.id) ? 'Collapse' : 'Expand'}
              onClick={() => toggleExpand(group.id)}
              className="text-xs text-gray-400"
            >
              {expanded.has(group.id) ? '▼' : '▶'}
            </button>
            <span className="flex-1 text-sm font-medium text-gray-800">{group.name}</span>
            {group.required && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600" aria-label="Required modifier group">
                Required
              </span>
            )}
            <span className="text-xs text-gray-400">{group.type === 'single' ? 'Single' : 'Multi'}</span>
            <button
              type="button"
              onClick={() => void deleteGroup(group.id)}
              className="text-xs text-gray-400 hover:text-red-500"
              title="Delete group"
            >✕</button>
          </div>

          {expanded.has(group.id) && (
            <div className="border-t border-gray-100 px-3 py-2 space-y-1">
              {(group.options ?? []).map((opt: ModifierOption) => (
                <div key={opt.id} className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="flex-1">{opt.name}</span>
                  <span className="text-xs text-gray-500">
                    {opt.price_delta !== 0 ? (opt.price_delta > 0 ? '+' : '') + formatPrice(opt.price_delta) : 'Free'}
                  </span>
                </div>
              ))}
              {addingOption === group.id ? (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="Option name"
                    value={newOptionName}
                    onChange={(e) => setNewOptionName(e.target.value)}
                    aria-label="New option name"
                  />
                  <input
                    type="number"
                    step="0.01"
                    className="w-20 rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="±price"
                    value={newOptionDelta}
                    onChange={(e) => setNewOptionDelta(e.target.value)}
                    aria-label="Price delta"
                  />
                  <button
                    type="button"
                    onClick={() => void addOption(group.id)}
                    className="text-xs text-indigo-600 hover:text-indigo-800"
                  >Save</button>
                  <button
                    type="button"
                    onClick={() => setAddingOption(null)}
                    className="text-xs text-gray-400"
                  >Cancel</button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setAddingOption(group.id); setNewOptionName(''); setNewOptionDelta('0') }}
                  className="text-xs text-indigo-600 hover:text-indigo-800"
                >
                  + Add option
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {addingGroup && (
        <div className="rounded-md border border-indigo-200 bg-indigo-50 p-3 space-y-2">
          <input
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="Group name (e.g. Size, Extras)"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            autoFocus
            aria-label="New modifier group name"
          />
          <div className="flex items-center gap-4 text-sm text-gray-700">
            <label className="flex items-center gap-1.5">
              <input type="radio" name="new-group-type" checked={newGroupType === 'single'} onChange={() => setNewGroupType('single')} />
              Single choice
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" name="new-group-type" checked={newGroupType === 'multi'} onChange={() => setNewGroupType('multi')} />
              Multiple choice
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={newGroupRequired} onChange={(e) => setNewGroupRequired(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-indigo-600" />
            Required
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={savingGroup || !newGroupName.trim()}
              onClick={() => void createGroup()}
              className="rounded bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-700 disabled:opacity-50"
            >Add group</button>
            <button
              type="button"
              onClick={() => { setAddingGroup(false); setNewGroupName('') }}
              className="text-xs text-gray-500 hover:text-gray-700"
            >Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Image upload zone ──────────────────────────────────────────────────────────

interface ImageUploadZoneProps {
  itemId: string
  existingKey: string | null
  onUploaded: (r2Key: string) => void
}

function ImageUploadZone({ itemId, existingKey, onUploaded }: ImageUploadZoneProps) {
  const api = useApi()
  const fileRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [preview, setPreview] = useState<string | null>(existingKey ? `/r2/${existingKey}` : null)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) { setError('Please select an image file.'); return }
    setError(null)
    setProgress(0)
    try {
      const { upload_url, r2_key } = await api.admin.getItemImageUrl(itemId)
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload = () => { xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)) }
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.open('PUT', upload_url)
        xhr.setRequestHeader('Content-Type', file.type)
        xhr.send(file)
      })
      setPreview(URL.createObjectURL(file))
      setProgress(null)
      onUploaded(r2_key)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
      setProgress(null)
    }
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">Image</label>
      <div
        className="relative flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 hover:border-indigo-400"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void handleFile(f) }}
        aria-label="Image upload zone"
      >
        {preview ? (
          <img src={preview} alt="Preview" className="max-h-32 rounded object-cover" />
        ) : (
          <p className="text-xs text-gray-400">Click or drag an image here</p>
        )}
        {progress !== null && (
          <div className="absolute inset-x-4 bottom-2">
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-1.5 rounded-full bg-indigo-500 transition-all"
                style={{ width: `${progress}%` }}
                data-testid="upload-progress"
              />
            </div>
          </div>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f) }} />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}

// ── Item modal ─────────────────────────────────────────────────────────────────

interface ItemModalProps {
  item: MenuItem | null
  categories: MenuCategory[]
  selectedCategoryId: string
  onClose: () => void
  onSave: (data: Record<string, unknown>) => Promise<void>
}

function ItemModal({ item, categories, selectedCategoryId, onClose, onSave }: ItemModalProps) {
  const [name, setName] = useState(item?.name ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [price, setPrice] = useState(item && !item.has_variants ? String(item.price / 100) : '')
  const [categoryId, setCategoryId] = useState(item?.category_id ?? selectedCategoryId)
  const [tags, setTags] = useState<string[]>(item?.tags ?? [])
  const [availability, setAvailability] = useState<AvailabilityState>(item?.availability_state ?? 'in_stock')
  const [restoreAt, setRestoreAt] = useState(item?.restore_at ?? '')
  const [hasVariants, setHasVariants] = useState(item?.has_variants ?? false)
  const [variants, setVariants] = useState<Array<{ name: string; price: number; is_default: boolean; available: boolean }>>(
    item?.variants?.map((v) => ({ name: v.name, price: v.price, is_default: v.is_default, available: v.available })) ?? [],
  )
  const [imageKey, setImageKey] = useState<string | null>(item?.image_r2_key ?? null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleTag(tag: string) {
    setTags((ts) => ts.includes(tag) ? ts.filter((t) => t !== tag) : [...ts, tag])
  }

  function toggleVariants(on: boolean) {
    if (!on && variants.length > 0) {
      if (!window.confirm('Remove all variants and set a single price?')) return
      setVariants([])
    }
    setHasVariants(on)
  }

  function addVariant() {
    setVariants((vs) => [...vs, { name: '', price: 0, is_default: vs.length === 0, available: true }])
  }

  function removeVariant(idx: number) {
    if (variants.length <= 1) return
    setVariants((vs) => vs.filter((_, i) => i !== idx))
  }

  async function submit() {
    if (!name.trim()) { setError('Name is required.'); return }
    const priceInt = Math.round(parseFloat(price) * 100)
    if (!hasVariants && (isNaN(priceInt) || priceInt <= 0)) { setError('Price must be greater than 0.'); return }
    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        description: description || undefined,
        price: hasVariants ? 0 : priceInt,
        category_id: categoryId,
        tags,
        availability_state: availability,
        restore_at: availability === 'out_of_stock' && restoreAt ? restoreAt : null,
        has_variants: hasVariants,
        image_r2_key: imageKey ?? undefined,
        ...(hasVariants ? { variants } : {}),
      })
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : 'Save failed.')
      setSaving(false)
    }
  }

  return (
    <Modal
      title={item ? 'Edit item' : 'Add item'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={() => void submit()}>
            {item ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
          <input
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            aria-label="Item name"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
          <textarea
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
          <select
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            aria-label="Category"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Variants toggle */}
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            checked={hasVariants}
            onChange={(e) => toggleVariants(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600"
          />
          This item has multiple sizes / variants
        </label>

        {!hasVariants && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Price</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              aria-label="Price"
            />
          </div>
        )}

        {hasVariants && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Variants</p>
            {variants.map((v, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Name (e.g. Small)"
                  value={v.name}
                  onChange={(e) => setVariants((vs) => vs.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                  aria-label={`Variant ${idx + 1} name`}
                />
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  className="w-24 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Price"
                  value={v.price > 0 ? String(v.price / 100) : ''}
                  onChange={(e) => setVariants((vs) => vs.map((x, i) => i === idx ? { ...x, price: Math.round(parseFloat(e.target.value) * 100) || 0 } : x))}
                  aria-label={`Variant ${idx + 1} price`}
                />
                <input
                  type="radio"
                  name="default-variant"
                  checked={!!v.is_default}
                  onChange={() => setVariants((vs) => vs.map((x, i) => ({ ...x, is_default: i === idx })))}
                  title="Default"
                  aria-label={`Set variant ${idx + 1} as default`}
                />
                <button
                  type="button"
                  disabled={variants.length <= 1}
                  onClick={() => removeVariant(idx)}
                  className="text-sm text-red-400 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                  title={variants.length <= 1 ? 'Cannot delete last variant' : 'Delete variant'}
                  aria-label={variants.length <= 1 ? 'Cannot delete last variant' : `Delete variant ${idx + 1}`}
                >
                  ✕
                </button>
              </div>
            ))}
            <button type="button" onClick={addVariant} className="text-sm text-indigo-600 hover:text-indigo-800">
              + Add variant
            </button>
          </div>
        )}

        {/* Dietary tags */}
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">Dietary tags</p>
          <div className="flex flex-wrap gap-2">
            {DIETARY_TAGS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => toggleTag(value)}
                className={[
                  'rounded-full border px-3 py-1 text-xs font-medium',
                  tags.includes(value)
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                    : 'border-gray-300 text-gray-600 hover:border-gray-400',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Availability */}
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">Availability</p>
          <div className="flex flex-wrap gap-2">
            {AVAILABILITY_OPTIONS.map(({ value, label }) => (
              <label key={value} className="flex cursor-pointer items-center gap-1.5 text-sm text-gray-700">
                <input
                  type="radio"
                  name="availability"
                  value={value}
                  checked={availability === value}
                  onChange={() => setAvailability(value)}
                />
                {label}
              </label>
            ))}
          </div>
          {availability === 'out_of_stock' && (
            <div className="mt-2">
              <label className="mb-1 block text-xs text-gray-500">Restore at (optional)</label>
              <input
                type="datetime-local"
                className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                value={restoreAt}
                onChange={(e) => setRestoreAt(e.target.value)}
                data-testid="restore-at-input"
              />
            </div>
          )}
        </div>

        {/* Image upload — only for existing items */}
        {item?.id && (
          <ImageUploadZone
            itemId={item.id}
            existingKey={item.image_r2_key}
            onUploaded={(key) => setImageKey(key)}
          />
        )}

        {/* Modifier groups — only for existing items */}
        {item?.id && <ModifierGroupsSection itemId={item.id} />}
      </div>
    </Modal>
  )
}

// ── Delete confirm modal ───────────────────────────────────────────────────────

function DeleteModal({ title, body, onClose, onConfirm, disabled, disabledReason }: {
  title: string
  body: string
  onClose: () => void
  onConfirm: () => Promise<void>
  disabled?: boolean
  disabledReason?: string
}) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setDeleting(true)
    try {
      await onConfirm()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : 'Delete failed.')
      setDeleting(false)
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={deleting} onClick={() => void confirm()} disabled={disabled}>
            Delete
          </Button>
        </>
      }
    >
      <div>
        {error && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
        <p className="text-sm text-gray-600">{body}</p>
        {disabled && disabledReason && (
          <p className="mt-2 text-sm text-amber-600">{disabledReason}</p>
        )}
      </div>
    </Modal>
  )
}

// ── Main Menu page ─────────────────────────────────────────────────────────────

export function Menu() {
  const api = useApi()
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [categoryModal, setCategoryModal] = useState<{ mode: 'add' | 'edit' | 'delete'; category?: MenuCategory } | null>(null)
  const [itemModal, setItemModal] = useState<{ mode: 'add' | 'edit'; item?: MenuItem } | null>(null)
  const [itemDeleteTarget, setItemDeleteTarget] = useState<MenuItem | null>(null)

  const { status: catStatus, data: categories, reload: reloadCategories } = useAsync(
    () => api.admin.listCategories(),
    [],
  )

  const cats: MenuCategory[] = (categories ?? []) as MenuCategory[]
  const activeCategoryId = selectedCategoryId ?? cats[0]?.id ?? null

  const { status: itemStatus, data: items, reload: reloadItems } = useAsync(
    () => activeCategoryId ? api.admin.listItems(activeCategoryId) : Promise.resolve([]),
    [activeCategoryId],
  )

  const itemsArr: MenuItem[] = (items ?? []) as MenuItem[]

  const saveCategory = useCallback(async (data: { name: string; active: boolean }) => {
    if (categoryModal?.mode === 'edit' && categoryModal.category) {
      await api.admin.updateCategory(categoryModal.category.id, data)
    } else {
      await api.admin.createCategory(data)
    }
    reloadCategories()
  }, [api, categoryModal, reloadCategories])

  const deleteCategory = useCallback(async () => {
    if (!categoryModal?.category) return
    await api.admin.deleteCategory(categoryModal.category.id)
    reloadCategories()
    if (selectedCategoryId === categoryModal.category.id) setSelectedCategoryId(null)
  }, [api, categoryModal, reloadCategories, selectedCategoryId])

  const toggleCategoryActive = useCallback(async (cat: MenuCategory) => {
    await api.admin.updateCategory(cat.id, { active: !cat.active })
    reloadCategories()
  }, [api, reloadCategories])

  const moveCategory = useCallback(async (index: number, direction: 'up' | 'down') => {
    const next = [...cats]
    const swap = direction === 'up' ? index - 1 : index + 1
    ;[next[index], next[swap]] = [next[swap], next[index]]
    const order = next.map((c, i) => ({ id: c.id, sort_order: i }))
    await api.admin.reorderCategories(order)
    reloadCategories()
  }, [api, cats, reloadCategories])

  const saveItem = useCallback(async (data: Record<string, unknown>) => {
    if (!activeCategoryId) return
    if (itemModal?.mode === 'edit' && itemModal.item) {
      await api.admin.updateItem(itemModal.item.id, data)
    } else {
      await api.admin.createItem({ ...data, category_id: activeCategoryId })
    }
    reloadItems()
  }, [api, activeCategoryId, itemModal, reloadItems])

  const deleteItem = useCallback(async () => {
    if (!itemDeleteTarget) return
    await api.admin.deleteItem(itemDeleteTarget.id)
    reloadItems()
  }, [api, itemDeleteTarget, reloadItems])

  const quickToggleAvailability = useCallback(async (item: MenuItem, newState: AvailabilityState) => {
    await api.admin.updateItem(item.id, { availability_state: newState })
    reloadItems()
  }, [api, reloadItems])

  if (catStatus === 'loading') {
    return <div className="p-4 text-sm text-gray-500">Loading menu…</div>
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Menu</h1>
        <div className="flex items-center gap-4">
          <PlanLimitBar label="Items" used={itemsArr.length} cap={150} />
          <PlanLimitBar label="Categories" used={cats.length} cap={20} />
        </div>
      </div>

      <div className="flex gap-6">
        {/* Category panel */}
        <div className="w-56 shrink-0">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Categories</p>
            <button
              type="button"
              onClick={() => setCategoryModal({ mode: 'add' })}
              className="text-xs text-indigo-600 hover:text-indigo-800"
              aria-label="Add category"
            >
              + Add
            </button>
          </div>
          <div className="space-y-0.5">
            {cats.length === 0 && (
              <p className="text-xs text-gray-400">No categories yet.</p>
            )}
            {cats.map((cat, idx) => (
              <CategoryRow
                key={cat.id}
                category={cat}
                selected={activeCategoryId === cat.id}
                isFirst={idx === 0}
                isLast={idx === cats.length - 1}
                onClick={() => setSelectedCategoryId(cat.id)}
                onEdit={() => setCategoryModal({ mode: 'edit', category: cat })}
                onDelete={() => setCategoryModal({ mode: 'delete', category: cat })}
                onToggleActive={() => void toggleCategoryActive(cat)}
                onMoveUp={() => void moveCategory(idx, 'up')}
                onMoveDown={() => void moveCategory(idx, 'down')}
              />
            ))}
          </div>
        </div>

        {/* Items grid */}
        <div className="flex-1">
          {activeCategoryId ? (
            <>
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">
                  {cats.find((c) => c.id === activeCategoryId)?.name ?? 'Items'}
                  <span className="ml-2 text-xs text-gray-400">({itemsArr.length} items)</span>
                </p>
                <Button onClick={() => setItemModal({ mode: 'add' })}>+ Add item</Button>
              </div>
              {itemStatus === 'loading' ? (
                <p className="text-sm text-gray-400">Loading items…</p>
              ) : itemsArr.length === 0 ? (
                <p className="text-sm text-gray-400">No items in this category yet.</p>
              ) : (
                <div className="grid grid-cols-3 gap-4" role="list" aria-label="Menu items">
                  {itemsArr.map((item) => (
                    <div key={item.id} role="listitem">
                      <ItemCard
                        item={item}
                        onClick={() => setItemModal({ mode: 'edit', item })}
                        onQuickToggle={(s) => void quickToggleAvailability(item, s)}
                      />
                      <button
                        type="button"
                        onClick={() => setItemDeleteTarget(item)}
                        className="mt-1 text-xs text-red-400 hover:text-red-600"
                        aria-label={`Delete ${item.name}`}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex h-48 items-center justify-center rounded-lg border-2 border-dashed border-gray-200">
              <p className="text-sm text-gray-400">Select a category to see its items.</p>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {(categoryModal?.mode === 'add' || categoryModal?.mode === 'edit') && (
        <CategoryModal
          category={categoryModal.category ?? null}
          onClose={() => setCategoryModal(null)}
          onSave={saveCategory}
        />
      )}
      {categoryModal?.mode === 'delete' && categoryModal.category && (
        <DeleteModal
          title="Delete category"
          body={`Delete "${categoryModal.category.name}"? This cannot be undone.`}
          onClose={() => setCategoryModal(null)}
          onConfirm={deleteCategory}
        />
      )}
      {(itemModal?.mode === 'add' || itemModal?.mode === 'edit') && activeCategoryId && (
        <ItemModal
          item={itemModal.item ?? null}
          categories={cats}
          selectedCategoryId={activeCategoryId}
          onClose={() => setItemModal(null)}
          onSave={saveItem}
        />
      )}
      {itemDeleteTarget && (
        <DeleteModal
          title="Delete item"
          body={`Delete "${itemDeleteTarget.name}"?`}
          onClose={() => setItemDeleteTarget(null)}
          onConfirm={deleteItem}
        />
      )}
    </div>
  )
}
