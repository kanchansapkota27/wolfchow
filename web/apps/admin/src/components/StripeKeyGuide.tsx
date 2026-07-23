export function StripeKeyGuide({ onClose, buttonClassName }: { onClose: () => void; buttonClassName: string }) {
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Stripe restricted key setup guide"
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[88vh] overflow-y-auto p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-gray-900">How to create a restricted Stripe key</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none flex-shrink-0"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p className="text-sm text-gray-600">
          Use a <strong>restricted key</strong> instead of your full secret key.
        </p>

        <div>
          <h4 className="text-sm font-medium text-gray-800 mb-2">Steps</h4>
          <ol className="space-y-1.5 text-sm text-gray-700 list-decimal list-inside">
            <li>Open <strong>Stripe Dashboard → Developers → API keys</strong></li>
            <li>Click <strong>+ Create restricted key</strong></li>
            <li>Name it something like <em>"WolfChow POS"</em></li>
            <li>Set only the permissions listed below — leave everything else as <em>None</em></li>
            <li>Click <strong>Create key</strong> and paste it here</li>
          </ol>
        </div>

        <div>
          <h4 className="text-sm font-medium text-gray-800 mb-2">Required permissions</h4>
          <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Resource</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Level</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="px-3 py-2 text-gray-800 font-medium">Payment Intents</td>
                <td className="px-3 py-2"><span className="text-amber-700 font-semibold">Write</span></td>
                <td className="px-3 py-2 text-gray-500">Create &amp; capture card payments</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-gray-800 font-medium">Charges</td>
                <td className="px-3 py-2"><span className="text-blue-700 font-semibold">Read</span></td>
                <td className="px-3 py-2 text-gray-500">Verify charge status on orders</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-gray-800 font-medium">Refunds</td>
                <td className="px-3 py-2"><span className="text-amber-700 font-semibold">Write</span></td>
                <td className="px-3 py-2 text-gray-500">Refund card on rejected orders</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm font-medium text-red-800 mb-1.5">Leave all of these as None:</p>
          <ul className="text-sm text-red-700 grid grid-cols-2 gap-x-4 gap-y-0.5 list-disc list-inside">
            <li>Payouts</li>
            <li>Balance</li>
            <li>Account settings</li>
            <li>Connected accounts</li>
            <li>Customers</li>
            <li>Products &amp; Prices</li>
            <li>Webhook endpoints</li>
            <li>Disputes</li>
          </ul>
        </div>


        <button
          onClick={onClose}
          className={`w-full text-sm text-white rounded-lg px-4 py-2 ${buttonClassName}`}
        >
          Got it
        </button>
      </div>
    </div>
  )
}
