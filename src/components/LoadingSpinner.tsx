import { Loader2 } from 'lucide-react'

export default function LoadingSpinner({ text }: { text?: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '40px 0', gap: 12,
    }}>
      <Loader2 size={24} className="animate-spin" color="var(--accent)" />
      {text && <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{text}</div>}
    </div>
  )
}
