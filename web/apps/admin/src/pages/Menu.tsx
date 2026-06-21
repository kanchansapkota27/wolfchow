import { useState, useCallback } from 'react'
import { Button, Modal } from '@wolfchow/ui'
import { ApiError } from '@wolfchow/api-client'
import type { MenuCategory, MenuItem, ItemVariant, ModifierGroup, ModifierOption } from '@wolfchow/types'
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

const AVAILABILITY_OPTIONS = [
  { value: 'in_stock', label: 'In Stock', color: 'bg-green-100 text-green-800' },
  { value: 'out_of_stock', label: 'Out of Stock', color: 'bg-red-100 text-red-800' },
  { value: 'limited', label: 'Limited', color: 'bg-amber-100 text-amber-800' },
  { value: 'hidden', label: 'Hidden', color: 'bg-gray-100 text-gray-600' },
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

// ── Category panel ─────────────────────────────────────────────────────────────

interface CategoryRowProps {
  category: MenuCategory
  selected: boolean
  onClick: () => void
  onEdit: () => void
  onDelete: () => void
  onToggleActive: () => void
  dragHandleProps?: React.HTMLAttributes<HTMLSpanElement>
}

function CategoryRow({ category, selected, onClick, onEdit, onDelete, onToggleActive, dragHandleProps }: CategoryRowProps) {
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
      <span {...dragHandleProps} className="cursor-grab text-gray-300 select-none" title="Drag to reorder">⠿</span>
      <span className="flex-1 truncate font-medium">{category.name}</span>
      {!category.active && (
        <span className="text-xs text-gray-400">Off</span>
      )}
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
        >
          ✎
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="rounded p-0.5 text-xs text-gray-400 hover:text-red-500"
          title="Delete"
        >
          ✕
        </button>
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

function ItemCard({ item, onClick }: { item: MenuItem; onClick: () => void }) {
  const hasVariants = item.has_variants && item.variants && item.variants.length > 0
  const minPrice = hasVariants
    ? Math.min(...(item.variants ?? []).map((v) => v.price))
    : item.price

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      className="group cursor-pointer rounded-lg border border-gray-200 bg-white p-3 hover:border-indigo-300 hover:shadow-sm"
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
      <div className="mt-2">
        <AvailabilityBadge state={item.availability_state} />
      </div>
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
  const api = useApi()
  const [name, setName] = useState(item?.name ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [price, setPrice] = useState(item ? String(item.price / 100) : '')
  const [categoryId, setCategoryId] = useState(item?.category_id ?? selectedCategoryId)
  const [tags, setTags] = useState<string[]>(item?.tags ?? [])
  const [availability, setAvailability] = useState(item?.availability_state ?? 'in_stock')
  const [restoreAt, setRestoreAt] = useState(item?.restore_at ?? '')
  const [hasVariants, setHasVariants] = useState(item?.has_variants ?? false)
  const [variants, setVariants] = useState<Partial<ItemVariant>[]>(item?.variants ?? [])
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
      })
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : 'Save failed.')
      setSaving(false)
    }
  }

  function addVariant() {
    setVariants((vs) => [...vs, { name: '', price: 0, is_default: vs.length === 0, available: true }])
  }

  function removeVariant(idx: number) {
    if (variants.length <= 1) return
    setVariants((vs) => vs.filter((_, i) => i !== idx))
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
      <div className="space-y-4">
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
            onChange={(e) => setHasVariants(e.target.checked)}
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
                  value={v.name ?? ''}
                  onChange={(e) => setVariants((vs) => vs.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                  aria-label={`Variant ${idx + 1} name`}
                />
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  className="w-24 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Price"
                  value={v.price !== undefined ? String((v.price) / 100) : ''}
                  onChange={(e) => setVariants((vs) => vs.map((x, i) => i === idx ? { ...x, price: Math.round(parseFloat(e.target.value) * 100) } : x))}
                  aria-label={`Variant ${idx + 1} price`}
                />
                <input
                  type="radio"
                  name="default-variant"
                  checked={!!v.is_default}
                  onChange={() => setVariants((vs) => vs.map((x, i) => ({ ...x, is_default: i === idx })))}
                  title="Default"
                />
                <button
                  type="button"
                  disabled={variants.length <= 1}
                  onClick={() => removeVariant(idx)}
                  className="text-sm text-red-400 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                  title={variants.length <= 1 ? 'Cannot delete last variant' : 'Delete variant'}
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
              />
            </div>
          )}
        </div>
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
          <Button
            variant="danger"
            loading={deleting}
            onClick={() => void confirm()}
            disabled={disabled}
          >
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

// ── Plan limit bar ────────────────────────────────────────────────────────────

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

// ── Main Menu page ────────────────────────────────────────────────────────────

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

  const cats = (categories ?? []) as MenuCategory[]
  const activeCategoryId = selectedCategoryId ?? cats[0]?.id ?? null

  const { status: itemStatus, data: items, reload: reloadItems } = useAsync(
    () => activeCategoryId ? api.admin.listItems(activeCategoryId) : Promise.resolve([]),
    [activeCategoryId],
  )

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

  if (catStatus === 'loading') {
    return <div className="p-4 text-sm text-gray-500">Loading menu…</div>
  }

  const itemsArr = (items ?? []) as MenuItem[]
  const activeItemCount = itemsArr.filter((i) => i.availability_state !== 'hidden').length

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
            {cats.map((cat) => (
              <CategoryRow
                key={cat.id}
                category={cat}
                selected={activeCategoryId === cat.id}
                onClick={() => setSelectedCategoryId(cat.id)}
                onEdit={() => setCategoryModal({ mode: 'edit', category: cat })}
                onDelete={() => setCategoryModal({ mode: 'delete', category: cat })}
                onToggleActive={() => void toggleCategoryActive(cat)}
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
                  <span className="ml-2 text-xs text-gray-400">({activeItemCount} active)</span>
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
