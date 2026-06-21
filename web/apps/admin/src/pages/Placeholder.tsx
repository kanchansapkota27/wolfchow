export function Placeholder({ title, story }: { title: string; story: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600">
        Coming in {story}.
      </div>
    </div>
  )
}
