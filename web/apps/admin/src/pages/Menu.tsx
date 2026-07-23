import { useState, useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ImageIcon, Layers, Clock, Utensils, X, Plus,
  Pencil, Trash2, GripVertical, ChevronRight,
} from 'lucide-react'
import type { AvailabilityState, MenuCategory, MenuItem, ModifierGroup } from '@wolfchow/types'
import { ApiError } from '@wolfchow/api-client'
import { useApi } from '../lib/api'
import { usePlan } from '../lib/usePlan'
import { PlanLocked, LockIcon, UpgradeModal } from '../components/UpgradeModal'
import type { UpgradeMessage } from '../components/UpgradeModal'
import { cn } from '../lib/utils'
import { formatCurrency } from '@wolfchow/utils'
import { AvailabilityBadge, AVAIL_OPTIONS } from '../components/menu/AvailabilityBadge'
import { CategoryModal } from '../components/menu/CategoryModal'

// ── Constants ──────────────────────────────────────────────────────────────────

const DIETARY_TAGS = [
  { value: 'vegan',         label: 'Vegan' },
  { value: 'vegetarian',   label: 'Vegetarian' },
  { value: 'spicy',        label: 'Spicy' },
  { value: 'gluten_free',  label: 'Gluten-Free' },
  { value: 'contains_nuts', label: 'Contains Nuts' },
  { value: 'halal',        label: 'Halal' },
  { value: 'dairy_free',   label: 'Dairy-Free' },
]

const FIELD = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400'

// ── Image upload zone ──────────────────────────────────────────────────────────

function ImageUploadZone({ itemId, existingKey, onUploaded, locked, upgradeMessage }: {
  itemId: string
  existingKey: string | null
  onUploaded: (r2Key: string) => void
  locked?: boolean
  upgradeMessage?: UpgradeMessage
}) {
  const api = useApi()
  const fileRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [preview, setPreview] = useState<string | null>(existingKey ? `/r2/${existingKey}` : null)
  const [error, setError] = useState<string | null>(null)
  const [showUpgrade, setShowUpgrade] = useState(false)

  async function handleFile(file: File) {
    if (locked) { setShowUpgrade(true); return }
    if (!file.type.startsWith('image/')) { setError('Please select an image file.'); return }
    setError(null)
    setProgress(0)
    try {
      const { upload_url, r2_key } = await api.admin.getItemImageUrl(itemId)
      await api.uploadFile(upload_url, file, setProgress)
      setPreview(URL.createObjectURL(file))
      setProgress(null)
      onUploaded(r2_key)
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'feature_locked' || err.status === 402)) {
        setShowUpgrade(true)
      } else {
        setError(err instanceof Error ? err.message : 'Upload failed.')
      }
      setProgress(null)
    }
  }

  function handleClick() {
    if (locked) { setShowUpgrade(true); return }
    fileRef.current?.click()
  }

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">Image</label>
      <div
        className={cn(
          'relative flex min-h-[96px] flex-col items-center justify-center rounded-xl border-2 border-dashed bg-gray-50',
          locked ? 'cursor-pointer border-gray-200 opacity-60' : 'cursor-pointer border-gray-200 hover:border-blue-400',
        )}
        onClick={handleClick}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void handleFile(f) }}
      >
        {preview && !locked ? (
          <img src={preview} alt="Preview" className="max-h-32 rounded-lg object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-400">
            <ImageIcon size={24} />
            <p className="text-xs">{locked ? 'Image upload locked' : 'Click or drag an image here'}</p>
          </div>
        )}
        {locked && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl">
            <div className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 shadow-sm">
              <svg className="h-3.5 w-3.5 text-gray-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
              </svg>
              <span className="text-xs font-semibold text-gray-600">Upgrade to unlock</span>
            </div>
          </div>
        )}
        {progress !== null && (
          <div className="absolute inset-x-4 bottom-2">
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
              <div className="h-1.5 rounded-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} data-testid="upload-progress" />
            </div>
          </div>
        )}
      </div>
      {!locked && <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f) }} />}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} upgradeMessage={upgradeMessage} />
    </div>
  )
}

// ── Edit Item Drawer — Modifiers sub-tab ──────────────────────────────────────

function DrawerModifiers({ itemId }: { itemId: string }) {
  const api = useApi()
  const qc = useQueryClient()

  const { data: allGroups } = useQuery({
    queryKey: ['global-modifier-groups'],
    queryFn: () => api.admin.listGlobalModifierGroups(),
  })

  const { data: assignedIds, refetch: refetchAssigned } = useQuery({
    queryKey: ['item-modifier-assignments', itemId],
    queryFn: () => api.admin.getItemModifierAssignments(itemId),
    enabled: !!itemId,
  })

  const groups: ModifierGroup[] = allGroups ?? []
  const assigned = new Set(assignedIds ?? [])

  async function toggleAssignment(groupId: string) {
    const next = new Set(assigned)
    if (next.has(groupId)) next.delete(groupId)
    else next.add(groupId)
    await api.admin.setItemModifierAssignments(itemId, [...next])
    void refetchAssigned()
    void qc.invalidateQueries({ queryKey: ['items'] })
  }

  if (groups.length === 0) {
    return (
      <div className="py-8 text-center">
        <Layers size={28} className="mx-auto mb-2 text-gray-300" />
        <p className="text-sm text-gray-500">No global modifier groups yet.</p>
        <p className="mt-1 text-xs text-gray-400">Create groups in the Modifiers tab first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Assign Modifier Groups</p>

      {groups.map((group) => (
        <label key={group.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 bg-white p-3 hover:border-blue-200">
          <input
            type="checkbox"
            checked={assigned.has(group.id)}
            onChange={() => void toggleAssignment(group.id)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-blue-500"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-800">{group.name}</span>
              <span className="rounded-full border border-gray-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                {group.type === 'single' ? 'Single' : 'Multiple'}
              </span>
              {group.required && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">Required</span>
              )}
            </div>
            {(group.options ?? []).length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {(group.options ?? []).map((opt) => (
                  <span key={opt.id} className="rounded-full border border-gray-100 bg-gray-50 px-2 py-0.5 text-xs text-gray-500">
                    {opt.name}{opt.price_delta !== 0 ? ` (${opt.price_delta > 0 ? '+' : ''}${formatCurrency(opt.price_delta / 100, 'USD')})` : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        </label>
      ))}
    </div>
  )
}

// ── Edit Item Drawer ───────────────────────────────────────────────────────────

type DrawerTab = 'details' | 'modifiers' | 'availability'

const DRAWER_TABS: Array<{ id: DrawerTab; label: string; icon: typeof Utensils }> = [
  { id: 'details',      label: 'Item Details', icon: Utensils },
  { id: 'modifiers',   label: 'Modifiers',    icon: Layers },
  { id: 'availability', label: 'Availability', icon: Clock },
]

function EditItemDrawer({ item, categories, selectedCategoryId, onClose, onSave, featureFlags, upgradeMessage }: {
  item: MenuItem | null
  categories: MenuCategory[]
  selectedCategoryId: string
  onClose: () => void
  onSave: (data: Record<string, unknown>) => Promise<void>
  featureFlags?: import('@wolfchow/types').FeatureFlags | null
  upgradeMessage?: import('../components/UpgradeModal').UpgradeMessage
}) {
  const canPhotos = featureFlags?.menu_photos !== false
  const canModifiers = featureFlags?.item_modifiers !== false
  const [activeTab, setActiveTab] = useState<DrawerTab>('details')
  const [name, setName] = useState(item?.name ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [price, setPrice] = useState(item && !item.has_variants ? String(item.price / 100) : '')
  const [categoryId, setCategoryId] = useState(item?.category_id ?? selectedCategoryId)
  const [tags, setTags] = useState<string[]>(item?.tags ?? [])
  const [availability, setAvailability] = useState<AvailabilityState>(item?.availability_state ?? 'available')
  const [restoreAt, setRestoreAt] = useState(item?.restore_at ?? '')
  const [hasVariants, setHasVariants] = useState(item?.has_variants ?? false)
  const [variants, setVariants] = useState<Array<{ name: string; price: number; is_default: boolean; available: boolean }>>(
    item?.variants?.map((v) => ({ name: v.name, price: v.price, is_default: v.is_default, available: v.available })) ?? []
  )
  const [imageKey, setImageKey] = useState<string | null>(item?.image_r2_key ?? null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleTag(tag: string) {
    setTags((ts) => ts.includes(tag) ? ts.filter((t) => t !== tag) : [...ts, tag])
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
      if (err instanceof ApiError && err.status === 402) {
        const body = err.body as { error?: string; limit?: number }
        setError(body?.error === 'plan_limit_reached'
          ? `Item limit reached (${body.limit ?? 0}). Upgrade your plan to add more.`
          : 'This feature is not available on your current plan.')
      } else {
        setError(err instanceof ApiError ? String(err.message) : 'Save failed.')
      }
      setSaving(false)
    }
  }

  const showFooterSave = activeTab === 'details' || activeTab === 'availability'

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/20" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-40 flex w-[480px] flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-5">
          <h2 className="text-lg font-bold text-gray-900">{item ? 'Edit Item' : 'Add Item'}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {/* Sub-tabs */}
        <div className="flex shrink-0 border-b border-gray-100 px-6">
          {DRAWER_TABS.map(({ id, label, icon: Icon }) => {
            const isModifiersLocked = id === 'modifiers' && !canModifiers
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={cn(
                  'flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                  activeTab === id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                )}
              >
                <Icon size={14} />
                {label}
                {isModifiersLocked && (
                  <LockIcon upgradeMessage={upgradeMessage} />
                )}
              </button>
            )
          })}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}

          {activeTab === 'details' && (
            <div className="space-y-5">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Name</label>
                <input className={FIELD} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Description</label>
                <textarea className={cn(FIELD, 'resize-none')} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Category</label>
                <select className={FIELD} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={hasVariants}
                  onChange={(e) => {
                    if (!e.target.checked && variants.length > 0) {
                      if (!window.confirm('Remove all variants and set a single price?')) return
                      setVariants([])
                    }
                    setHasVariants(e.target.checked)
                  }}
                  className="h-4 w-4 rounded border-gray-300 accent-blue-500"
                />
                This item has multiple sizes / variants
              </label>
              {!hasVariants && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Price</label>
                  <input type="number" min="0.01" step="0.01" className={FIELD} value={price} onChange={(e) => setPrice(e.target.value)} />
                </div>
              )}
              {hasVariants && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">Variants</p>
                  {variants.map((v, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                        placeholder="Name (e.g. Small)"
                        value={v.name}
                        onChange={(e) => setVariants((vs) => vs.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                      />
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        className="w-24 rounded-lg border border-gray-200 px-2 py-2 text-sm focus:border-blue-400 focus:outline-none"
                        placeholder="Price"
                        value={v.price > 0 ? String(v.price / 100) : ''}
                        onChange={(e) => setVariants((vs) => vs.map((x, i) => i === idx ? { ...x, price: Math.round(parseFloat(e.target.value) * 100) || 0 } : x))}
                      />
                      <input
                        type="radio"
                        name="default-variant"
                        checked={!!v.is_default}
                        onChange={() => setVariants((vs) => vs.map((x, i) => ({ ...x, is_default: i === idx })))}
                        title="Set as default"
                      />
                      <button
                        type="button"
                        disabled={variants.length <= 1}
                        onClick={() => setVariants((vs) => vs.filter((_, i) => i !== idx))}
                        className="text-gray-300 hover:text-red-400 disabled:opacity-30"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setVariants((vs) => [...vs, { name: '', price: 0, is_default: vs.length === 0, available: true }])}
                    className="text-sm font-semibold text-blue-600 hover:text-blue-700"
                  >
                    + Add variant
                  </button>
                </div>
              )}
              <div>
                <p className="mb-2 text-sm font-medium text-gray-700">Dietary tags</p>
                <div className="flex flex-wrap gap-2">
                  {DIETARY_TAGS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => toggleTag(value)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                        tags.includes(value)
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {item?.id && (
                <ImageUploadZone
                  itemId={item.id}
                  existingKey={item.image_r2_key}
                  onUploaded={(key) => setImageKey(key)}
                  locked={!canPhotos}
                  upgradeMessage={upgradeMessage}
                />
              )}
            </div>
          )}

          {activeTab === 'modifiers' && (
            !canModifiers ? (
              <PlanLocked locked upgradeMessage={upgradeMessage} label="Item modifiers require a higher plan">
                <DrawerModifiers itemId={item?.id ?? ''} />
              </PlanLocked>
            ) : item?.id ? (
              <DrawerModifiers itemId={item.id} />
            ) : (
              <p className="text-sm text-gray-400">Save the item first to manage modifiers.</p>
            )
          )}

          {activeTab === 'availability' && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-gray-700">Availability status</p>
              <div className="space-y-2">
                {AVAIL_OPTIONS.map(({ value, label, dot }) => (
                  <label
                    key={value}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-colors',
                      availability === value ? 'border-blue-200 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                    )}
                  >
                    <input type="radio" name="availability" value={value} checked={availability === value} onChange={() => setAvailability(value)} className="sr-only" />
                    <span className={cn('h-3 w-3 shrink-0 rounded-full', dot)} />
                    <span className="flex-1 text-sm font-medium text-gray-800">{label}</span>
                    {availability === value && <ChevronRight size={16} className="text-blue-400" />}
                  </label>
                ))}
              </div>
              {availability === 'out_of_stock' && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Restore at (optional)</label>
                  <input type="datetime-local" className={FIELD} value={restoreAt} onChange={(e) => setRestoreAt(e.target.value)} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:border-gray-300">
            Cancel
          </button>
          {showFooterSave && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void submit()}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : item ? 'Save Changes' : 'Create Item'}
            </button>
          )}
        </div>
      </div>
    </>
  )
}

// ── Delete confirm ─────────────────────────────────────────────────────────────

function DeleteConfirm({ title, body, onClose, onConfirm }: {
  title: string
  body: string
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setDeleting(true)
    try { await onConfirm(); onClose() }
    catch (err) { setError(err instanceof ApiError ? String(err.message) : 'Delete failed.'); setDeleting(false) }
  }

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/20" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-40 w-96 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={16} /></button>
        </div>
        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <p className="mb-5 text-sm text-gray-600">{body}</p>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:border-gray-300">Cancel</button>
          <button
            type="button"
            disabled={deleting}
            onClick={() => void confirm()}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Modifiers top-level tab ────────────────────────────────────────────────────

function ModifiersTab() {
  const api = useApi()
  const qc = useQueryClient()
  const { plan, usage, upgradeMessage } = usePlan()

  const { data: groups, isLoading } = useQuery({
    queryKey: ['global-modifier-groups'],
    queryFn: () => api.admin.listGlobalModifierGroups(),
  })

  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupType, setNewGroupType] = useState<'single' | 'multi'>('single')
  const [newGroupRequired, setNewGroupRequired] = useState(false)
  const [savingGroup, setSavingGroup] = useState(false)
  const [groupError, setGroupError] = useState('')
  const [showModCapModal, setShowModCapModal] = useState(false)
  const [addingOption, setAddingOption] = useState<string | null>(null)
  const [newOptionName, setNewOptionName] = useState('')
  const [newOptionDelta, setNewOptionDelta] = useState('0')

  const groupsArr: ModifierGroup[] = groups ?? []
  const modifierCount = usage?.modifiers ?? groupsArr.length
  const modifierAtCap = plan != null && modifierCount >= plan.modifier_cap

  async function createGroup() {
    if (!newGroupName.trim()) return
    setSavingGroup(true)
    setGroupError('')
    try {
      await api.admin.createGlobalModifierGroup({
        name: newGroupName.trim(),
        type: newGroupType,
        required: newGroupRequired,
      })
      setNewGroupName('')
      setNewGroupType('single')
      setNewGroupRequired(false)
      setAddingGroup(false)
      void qc.invalidateQueries({ queryKey: ['global-modifier-groups'] })
      void qc.invalidateQueries({ queryKey: ['admin-plan'] })
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        const body = err.body as { error?: string; limit?: number }
        setGroupError(body?.error === 'plan_limit_reached'
          ? `Modifier group limit reached (${body.limit ?? 0}). Upgrade your plan.`
          : 'Item modifiers are not available on your current plan.')
      } else {
        setGroupError('Failed to create group.')
      }
    } finally {
      setSavingGroup(false)
    }
  }

  async function deleteGroup(groupId: string) {
    if (!window.confirm('Delete this modifier group? Items assigned to it will lose this modifier.')) return
    await api.admin.deleteModifierGroup(groupId)
    void qc.invalidateQueries({ queryKey: ['global-modifier-groups'] })
    void qc.invalidateQueries({ queryKey: ['admin-plan'] })
  }

  async function addOption(groupId: string) {
    const trimmed = newOptionName.trim()
    if (!trimmed) return
    const delta = Math.round((parseFloat(newOptionDelta) || 0) * 100)
    await api.admin.createModifierOption(groupId, { name: trimmed, price_delta: delta, available: true })
    setAddingOption(null)
    setNewOptionName('')
    setNewOptionDelta('0')
    void qc.invalidateQueries({ queryKey: ['global-modifier-groups'] })
  }

  async function deleteOption(optionId: string) {
    await api.admin.deleteModifierOption(optionId)
    void qc.invalidateQueries({ queryKey: ['global-modifier-groups'] })
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Modifiers</h1>
          <p className="mt-1 text-sm text-gray-500">Manage modifier groups that can be attached to menu items.</p>
        </div>
        <button
          type="button"
          onClick={() => modifierAtCap ? setShowModCapModal(true) : setAddingGroup(true)}
          className={cn(
            'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white',
            modifierAtCap ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700',
          )}
          title={modifierAtCap ? `Modifier group limit reached (${plan?.modifier_cap})` : 'Add modifier group'}
        >
          <Plus size={15} />
          ADD GROUP
        </button>
      </div>
      <UpgradeModal
        open={showModCapModal}
        onClose={() => setShowModCapModal(false)}
        upgradeMessage={{ title: 'Modifier group limit reached', html: `<p>Your plan allows up to ${plan?.modifier_cap ?? 0} modifier groups. Upgrade to add more.</p>` }}
      />

      <div className="space-y-3">
        {!isLoading && groupsArr.length === 0 && !addingGroup && (
          <div className="flex h-48 items-center justify-center rounded-2xl border-2 border-dashed border-gray-200">
            <div className="text-center">
              <Layers size={32} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm font-medium text-gray-500">No modifier groups yet</p>
              <p className="mt-0.5 text-xs text-gray-400">Create groups like Size, Extras, or Sauces</p>
            </div>
          </div>
        )}

        {groupsArr.map((group) => (
          <div key={group.id} className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex-1 text-base font-bold text-gray-900">{group.name}</span>
              <span className="rounded-full border border-gray-200 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                {group.type === 'single' ? 'Single' : 'Multiple'}
              </span>
              {group.required && (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-700">Required</span>
              )}
              <button type="button" onClick={() => void deleteGroup(group.id)} className="ml-1 rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500">
                <Trash2 size={14} />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(group.options ?? []).map((opt) => (
                <div key={opt.id} className="group/opt flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-3 py-1">
                  <span className="text-xs text-gray-600">
                    {opt.name}{opt.price_delta !== 0 ? ` (${opt.price_delta > 0 ? '+' : ''}${formatCurrency(opt.price_delta / 100, 'USD')})` : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => void deleteOption(opt.id)}
                    className="hidden text-gray-300 hover:text-red-400 group-hover/opt:block"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
              {addingOption === group.id ? (
                <div className="flex items-center gap-1">
                  <input
                    className="w-24 rounded-lg border border-gray-200 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none"
                    placeholder="Name"
                    value={newOptionName}
                    onChange={(e) => setNewOptionName(e.target.value)}
                    autoFocus
                  />
                  <input
                    type="number"
                    step="0.01"
                    className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none"
                    placeholder="±$"
                    value={newOptionDelta}
                    onChange={(e) => setNewOptionDelta(e.target.value)}
                  />
                  <button type="button" onClick={() => void addOption(group.id)} className="text-xs font-semibold text-blue-600 hover:text-blue-700">Save</button>
                  <button type="button" onClick={() => setAddingOption(null)} className="text-xs text-gray-400">Cancel</button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setAddingOption(group.id); setNewOptionName(''); setNewOptionDelta('0') }}
                  className="rounded-full border border-dashed border-gray-300 px-3 py-1 text-xs font-semibold text-blue-600 hover:border-blue-300 hover:bg-blue-50"
                >
                  + Add option
                </button>
              )}
            </div>
          </div>
        ))}

        {addingGroup && (
          <div className="space-y-4 rounded-2xl border border-blue-200 bg-blue-50 p-5">
            <h3 className="text-sm font-semibold text-gray-800">New modifier group</h3>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Group name</label>
              <input
                className={FIELD}
                placeholder="e.g. Size, Spice Level, Extras"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-700">
              <label className="flex cursor-pointer items-center gap-1.5">
                <input type="radio" name="group-type" checked={newGroupType === 'single'} onChange={() => setNewGroupType('single')} />
                Single choice
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input type="radio" name="group-type" checked={newGroupType === 'multi'} onChange={() => setNewGroupType('multi')} />
                Multiple choice
              </label>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={newGroupRequired} onChange={(e) => setNewGroupRequired(e.target.checked)} className="h-4 w-4 rounded border-gray-300 accent-blue-500" />
              Required
            </label>
            {groupError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{groupError}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                disabled={savingGroup || !newGroupName.trim()}
                onClick={() => void createGroup()}
                className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {savingGroup ? 'Creating…' : 'Create Group'}
              </button>
              <button type="button" onClick={() => { setAddingGroup(false); setNewGroupName(''); setGroupError('') }} className="text-sm text-gray-500 hover:text-gray-700">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Menu page ─────────────────────────────────────────────────────────────

type TopTab = 'builder' | 'modifiers'

export function Menu() {
  const api = useApi()
  const qc = useQueryClient()
  const { plan, usage, upgradeMessage } = usePlan()

  const [topTab, setTopTab] = useState<TopTab>('builder')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [categoryModal, setCategoryModal] = useState<{ mode: 'add' | 'edit'; category?: MenuCategory } | null>(null)
  const [deleteCat, setDeleteCat] = useState<MenuCategory | null>(null)
  const [editItem, setEditItem] = useState<{ mode: 'add' | 'edit'; item?: MenuItem } | null>(null)
  const [showCatCapModal, setShowCatCapModal] = useState(false)
  const [showItemCapModal, setShowItemCapModal] = useState(false)

  const dragCatId = useRef<string | null>(null)
  const dragOverCatId = useRef<string | null>(null)
  const dragItemId = useRef<string | null>(null)
  const dragOverItemId = useRef<string | null>(null)

  const { data: categories, isLoading: catsLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.admin.listCategories(),
  })

  const cats: MenuCategory[] = (categories ?? []) as MenuCategory[]
  const activeCategoryId = selectedCategoryId ?? cats[0]?.id ?? null
  const activeCategory = cats.find((c) => c.id === activeCategoryId)

  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ['items', activeCategoryId],
    queryFn: () => activeCategoryId ? api.admin.listItems(activeCategoryId) : Promise.resolve([]),
    enabled: !!activeCategoryId,
  })

  const itemsArr: MenuItem[] = (items ?? []) as MenuItem[]

  const catCount = usage?.categories ?? cats.length
  const itemCount = usage?.items ?? itemsArr.length
  const modifierCount = usage?.modifiers ?? 0
  const catAtCap = plan != null && catCount >= plan.category_cap
  const itemAtCap = plan != null && itemCount >= plan.item_cap
  const modifierAtCap = plan != null && modifierCount >= plan.modifier_cap

  const saveCategory = useCallback(async (data: { name: string; active: boolean }) => {
    if (categoryModal?.mode === 'edit' && categoryModal.category) {
      await api.admin.updateCategory(categoryModal.category.id, data)
    } else {
      await api.admin.createCategory(data)
    }
    void qc.invalidateQueries({ queryKey: ['categories'] })
    void qc.invalidateQueries({ queryKey: ['admin-plan'] })
  }, [api, categoryModal, qc])

  const confirmDeleteCat = useCallback(async () => {
    if (!deleteCat) return
    await api.admin.deleteCategory(deleteCat.id)
    if (selectedCategoryId === deleteCat.id) setSelectedCategoryId(null)
    void qc.invalidateQueries({ queryKey: ['categories'] })
    void qc.invalidateQueries({ queryKey: ['admin-plan'] })
  }, [api, deleteCat, selectedCategoryId, qc])

  const saveItem = useCallback(async (data: Record<string, unknown>) => {
    if (!activeCategoryId) return
    if (editItem?.mode === 'edit' && editItem.item) {
      await api.admin.updateItem(editItem.item.id, data)
    } else {
      await api.admin.createItem({ ...data, category_id: activeCategoryId })
    }
    void qc.invalidateQueries({ queryKey: ['items', activeCategoryId] })
    void qc.invalidateQueries({ queryKey: ['admin-plan'] })
  }, [api, activeCategoryId, editItem, qc])

  const handleCatDrop = useCallback(async () => {
    const from = dragCatId.current
    const to = dragOverCatId.current
    dragCatId.current = null
    dragOverCatId.current = null
    if (!from || !to || from === to) return
    const reordered = [...cats]
    const fromIdx = reordered.findIndex((c) => c.id === from)
    const toIdx = reordered.findIndex((c) => c.id === to)
    if (fromIdx === -1 || toIdx === -1) return
    const moved = reordered.splice(fromIdx, 1)[0]
    if (!moved) return
    reordered.splice(toIdx, 0, moved)
    const order = reordered.map((c, i) => ({ id: c.id, sort_order: i }))
    try {
      await api.admin.reorderCategories(order)
      void qc.invalidateQueries({ queryKey: ['categories'] })
    } catch { /* ignore — next query refresh will correct order */ }
  }, [api, cats, qc])

  const handleItemDrop = useCallback(async () => {
    const from = dragItemId.current
    const to = dragOverItemId.current
    dragItemId.current = null
    dragOverItemId.current = null
    if (!from || !to || from === to || !activeCategoryId) return
    const reordered = [...itemsArr]
    const fromIdx = reordered.findIndex((i) => i.id === from)
    const toIdx = reordered.findIndex((i) => i.id === to)
    if (fromIdx === -1 || toIdx === -1) return
    const moved = reordered.splice(fromIdx, 1)[0]
    if (!moved) return
    reordered.splice(toIdx, 0, moved)
    const order = reordered.map((item, i) => ({ id: item.id, sort_order: i }))
    try {
      await api.admin.reorderItems(order)
      void qc.invalidateQueries({ queryKey: ['items', activeCategoryId] })
    } catch { /* ignore */ }
  }, [api, itemsArr, activeCategoryId, qc])

  if (catsLoading) {
    return <div className="py-16 text-center text-sm text-gray-400">Loading menu…</div>
  }

  return (
    <div>
      {/* Page header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold text-gray-900">Menu Management</h1>
          <div className="flex rounded-xl border border-gray-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setTopTab('builder')}
              className={cn(
                'rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors',
                topTab === 'builder' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'
              )}
            >
              Menu Builder
            </button>
            <button
              type="button"
              onClick={() => setTopTab('modifiers')}
              className={cn(
                'rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors',
                topTab === 'modifiers' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'
              )}
            >
              Modifiers
            </button>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Categories</p>
            <p className="text-sm font-bold text-gray-800">
              {catCount}
              <span className="font-normal text-gray-400">/{plan?.category_cap ?? 999}</span>
            </p>
          </div>
          <div className="h-7 w-px bg-gray-200" />
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Items</p>
            <p className="text-sm font-bold text-gray-800">
              {itemCount}
              <span className="font-normal text-gray-400">/{plan?.item_cap ?? 999}</span>
            </p>
          </div>
          {plan?.modifier_cap != null && (
            <>
              <div className="h-7 w-px bg-gray-200" />
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Modifiers</p>
                <p className="text-sm font-bold text-gray-800">
                  {modifierCount}
                  <span className="font-normal text-gray-400">/{plan.modifier_cap}</span>
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {topTab === 'modifiers' ? (
        <ModifiersTab />
      ) : (
        /* ── Menu Builder ── */
        <div className="flex gap-5">

          {/* Column 1: Categories */}
          <div className="w-56 shrink-0">
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3.5">
                <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Categories</span>
                <button
                  type="button"
                  onClick={() => catAtCap ? setShowCatCapModal(true) : setCategoryModal({ mode: 'add' })}
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-lg text-white',
                    catAtCap ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700',
                  )}
                  aria-label="Add category"
                  title={catAtCap ? `Category limit reached (${plan?.category_cap})` : 'Add category'}
                >
                  <Plus size={13} />
                </button>
              </div>
              <div className="space-y-0.5 p-2">
                {cats.length === 0 && (
                  <p className="px-3 py-4 text-center text-xs text-gray-400">No categories yet.</p>
                )}
                {cats.map((cat) => (
                  <div
                    key={cat.id}
                    draggable
                    onDragStart={() => { dragCatId.current = cat.id }}
                    onDragOver={(e) => { e.preventDefault(); dragOverCatId.current = cat.id }}
                    onDrop={() => void handleCatDrop()}
                    className="group relative"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedCategoryId(cat.id)}
                      className={cn(
                        'flex w-full items-start gap-2 rounded-xl px-2.5 py-2.5 text-left transition-colors',
                        activeCategoryId === cat.id ? 'bg-blue-50' : 'hover:bg-gray-50'
                      )}
                    >
                      <GripVertical size={14} className="mt-0.5 shrink-0 cursor-grab text-gray-300 active:cursor-grabbing" />
                      <div className="min-w-0 flex-1">
                        <p className={cn(
                          'truncate text-sm font-semibold leading-tight',
                          activeCategoryId === cat.id ? 'text-blue-600' : 'text-gray-700'
                        )}>
                          {cat.name}
                        </p>
                        <p className="mt-0.5 text-[11px] text-gray-400">
                          {activeCategoryId === cat.id
                            ? `${itemsArr.length} ITEMS`
                            : cat.active ? '' : 'HIDDEN'}
                        </p>
                      </div>
                    </button>
                    <div className="absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 group-hover:flex">
                      <button type="button" onClick={() => setCategoryModal({ mode: 'edit', category: cat })} className="rounded p-1 text-gray-300 hover:bg-gray-100 hover:text-gray-600">
                        <Pencil size={12} />
                      </button>
                      <button type="button" onClick={() => setDeleteCat(cat)} className="rounded p-1 text-gray-300 hover:bg-gray-100 hover:text-red-500">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Column 2: Items */}
          <div className="min-w-0 flex-1">
            {activeCategoryId ? (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-bold text-gray-900">{activeCategory?.name ?? 'Items'}</h2>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-600 hover:border-gray-300"
                    >
                      Bulk Availability
                    </button>
                    <button
                      type="button"
                      onClick={() => itemAtCap ? setShowItemCapModal(true) : setEditItem({ mode: 'add' })}
                      className={cn(
                        'flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider text-white',
                        itemAtCap ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700',
                      )}
                      title={itemAtCap ? `Item limit reached (${plan?.item_cap})` : 'Add item'}
                    >
                      <Plus size={14} />
                      Add Item
                    </button>
                  </div>
                </div>

                {itemsLoading ? (
                  <p className="text-sm text-gray-400">Loading items…</p>
                ) : itemsArr.length === 0 ? (
                  <div className="flex h-48 items-center justify-center rounded-2xl border-2 border-dashed border-gray-200">
                    <div className="text-center">
                      <ImageIcon size={28} className="mx-auto mb-2 text-gray-300" />
                      <p className="text-sm font-medium text-gray-500">No items in this category</p>
                      <button type="button" onClick={() => itemAtCap ? setShowItemCapModal(true) : setEditItem({ mode: 'add' })} className="mt-1 text-sm font-semibold text-blue-600 hover:text-blue-700">
                        + Add your first item
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-4 xl:grid-cols-4" role="list">
                    {itemsArr.map((item) => {
                      const avail = (AVAIL_OPTIONS.find((o) => o.value === item.availability_state) ?? AVAIL_OPTIONS[0])!
                      const hasVariants = item.has_variants && item.variants && item.variants.length > 0
                      const minPrice = hasVariants
                        ? Math.min(...(item.variants ?? []).map((v) => v.price))
                        : item.price

                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="listitem"
                          draggable
                          onDragStart={(e) => { e.stopPropagation(); dragItemId.current = item.id }}
                          onDragOver={(e) => { e.preventDefault(); dragOverItemId.current = item.id }}
                          onDrop={(e) => { e.preventDefault(); void handleItemDrop() }}
                          onClick={() => setEditItem({ mode: 'edit', item })}
                          className="group overflow-hidden rounded-2xl border border-gray-200 bg-white text-left transition-all hover:border-blue-200 hover:shadow-md"
                        >
                          {item.image_r2_key && (
                            <div className="relative bg-gray-100" style={{ paddingBottom: '65%' }}>
                              <img
                                src={`/r2/${item.image_r2_key}`}
                                alt={item.name}
                                className="absolute inset-0 h-full w-full object-cover"
                              />
                              <span className={cn('absolute left-2 top-2 h-2.5 w-2.5 rounded-full shadow', avail.dot)} />
                            </div>
                          )}
                          <div className="p-3">
                            <div className="flex items-start gap-2">
                              {!item.image_r2_key && (
                                <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', avail.dot)} />
                              )}
                              <p className="truncate text-sm font-semibold text-gray-900">{item.name}</p>
                            </div>
                            <p className="mt-0.5 text-sm font-bold text-gray-700">
                              {hasVariants ? `From ${formatCurrency(minPrice / 100, 'USD')}` : formatCurrency(minPrice / 100, 'USD')}
                            </p>
                            <div className="mt-2">
                              <AvailabilityBadge state={item.availability_state} />
                            </div>
                            {(item.modifier_groups ?? []).length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {(item.modifier_groups ?? []).map((g) => (
                                  <span key={g.id} className="rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600">
                                    {g.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="flex h-48 items-center justify-center rounded-2xl border-2 border-dashed border-gray-200">
                <p className="text-sm text-gray-400">Select a category to see its items.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Category modal */}
      {categoryModal && (
        <CategoryModal
          category={categoryModal.category ?? null}
          onClose={() => setCategoryModal(null)}
          onSave={saveCategory}
        />
      )}

      {/* Delete category */}
      {deleteCat && (
        <DeleteConfirm
          title="Delete category"
          body={`Delete "${deleteCat.name}"? All items in this category will also be removed. This cannot be undone.`}
          onClose={() => setDeleteCat(null)}
          onConfirm={confirmDeleteCat}
        />
      )}

      {/* Edit / Add item drawer */}
      {editItem && activeCategoryId && (
        <EditItemDrawer
          item={editItem.item ?? null}
          categories={cats}
          selectedCategoryId={activeCategoryId}
          onClose={() => setEditItem(null)}
          onSave={saveItem}
          featureFlags={plan?.feature_flags}
          upgradeMessage={upgradeMessage}
        />
      )}

      {/* Cap-reached upgrade modals */}
      <UpgradeModal
        open={showCatCapModal}
        onClose={() => setShowCatCapModal(false)}
        upgradeMessage={{ title: 'Category limit reached', html: `<p>Your plan allows up to ${plan?.category_cap ?? 0} categories. Upgrade to add more.</p>` }}
      />
      <UpgradeModal
        open={showItemCapModal}
        onClose={() => setShowItemCapModal(false)}
        upgradeMessage={{ title: 'Item limit reached', html: `<p>Your plan allows up to ${plan?.item_cap ?? 0} items. Upgrade to add more.</p>` }}
      />
    </div>
  )
}
