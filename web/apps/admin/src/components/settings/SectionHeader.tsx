export function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="mb-5 flex items-center gap-2">
      <Icon size={16} className="text-blue-600" />
      <span className="text-xs font-bold tracking-widest text-gray-700 uppercase">{label}</span>
    </div>
  )
}
