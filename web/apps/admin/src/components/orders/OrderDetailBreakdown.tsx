import type { Order } from '@wolfchow/types'

/**
 * Full order detail — contact, notes, itemized modifiers, and the cost
 * breakdown (subtotal → discount → tax → tip → total). Shared between the
 * live order feed's expandable card and the transaction history detail
 * panel so both surfaces show the same level of detail.
 */
export function OrderDetailBreakdown({ order }: { order: Order }) {
  return (
    <div className="space-y-3">
      {/* Contact & order notes */}
      <div className="space-y-0.5 text-xs text-gray-500">
        <p>{order.customer_email}{order.customer_phone ? ` · ${order.customer_phone}` : ''}</p>
        {order.notes && <p className="italic text-gray-400">Note: {order.notes}</p>}
      </div>

      {/* Items */}
      <div className="space-y-2">
        {(order.items ?? []).map((item, i) => {
          const itemName = item.item_name ?? item.variant_name ?? item.item_id
          const displayName = item.variant_name && item.variant_name !== item.item_name
            ? `${itemName} — ${item.variant_name}`
            : itemName
          const mods = Array.isArray(item.modifiers) ? item.modifiers : []
          return (
            <div key={i} className="text-sm">
              <div className="flex justify-between">
                <span className="font-medium text-gray-800">{item.quantity}× {displayName}</span>
                <span className="text-gray-500">${Number(item.unit_price * item.quantity).toFixed(2)}</span>
              </div>
              {mods.length > 0 && (
                <div className="pl-3 mt-0.5 space-y-0.5">
                  {mods.map((m, j) => (
                    <div key={j} className="text-xs text-gray-400">
                      + {m.name}{Number(m.price_delta) !== 0 ? ` (+$${Number(m.price_delta).toFixed(2)})` : ''}
                    </div>
                  ))}
                </div>
              )}
              {item.notes && <p className="pl-3 mt-0.5 text-xs italic text-gray-400">{item.notes}</p>}
            </div>
          )
        })}
      </div>

      {/* Price breakdown */}
      <div className="border-t border-gray-50 pt-2 space-y-1 text-xs text-gray-500">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>${Number(order.subtotal).toFixed(2)}</span>
        </div>
        {Number(order.promo_discount) > 0 && (
          <div className="flex justify-between text-green-600">
            <span>Discount</span>
            <span>-${Number(order.promo_discount).toFixed(2)}</span>
          </div>
        )}
        {Number(order.tax_amount) > 0 && (
          <div className="flex justify-between">
            <span>Tax {order.tax_rate > 0 ? `(${order.tax_rate}%)` : ''}{order.tax_inclusive ? ' incl.' : ''}</span>
            <span>${Number(order.tax_amount).toFixed(2)}</span>
          </div>
        )}
        {Number(order.tip_amount) > 0 && (
          <div className="flex justify-between">
            <span>Tip</span>
            <span>${Number(order.tip_amount).toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold text-gray-800 border-t border-gray-100 pt-1 mt-1">
          <span>Total</span>
          <span>${Number(order.total).toFixed(2)}</span>
        </div>
      </div>
    </div>
  )
}
