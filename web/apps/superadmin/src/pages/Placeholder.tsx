export interface PlaceholderProps {
  title: string
  story: string
}

/** Stand-in for a section whose UI lands in a later story. */
export function Placeholder({ title, story }: PlaceholderProps) {
  return (
    <div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-gray-400">Coming in {story}.</p>
    </div>
  )
}
