import { useState, useEffect } from 'react'
import { Minus, Square, X, Maximize2 } from 'lucide-react'

export default function TitleBar() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    window.win?.isMaximized().then(setMaximized)
    const handler = (e: Event) => setMaximized((e as CustomEvent).detail)
    window.addEventListener('maximized-changed', handler)
    return () => window.removeEventListener('maximized-changed', handler)
  }, [])

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, height: 38,
      background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-subtle)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      zIndex: 999, userSelect: 'none',
      WebkitAppRegion: 'drag',
      transition: 'background 0.2s ease',
    } as any}>
      <div style={{ paddingLeft: 80, fontSize: 12, color: 'var(--text-quaternary)' }}>
        Bamboo Monitor
      </div>
      <div style={{
        display: 'flex',
      } as any}>
        <WinBtn onClick={() => window.win?.minimize()} title="Minimize">
          <Minus size={12} />
        </WinBtn>
        <WinBtn onClick={() => window.win?.maximize()} title={maximized ? 'Restore' : 'Maximize'}>
          {maximized ? <Maximize2 size={11} /> : <Square size={10} />}
        </WinBtn>
        <WinBtn onClick={() => window.win?.close()} title="Close" hoverBg="rgba(239,68,68,0.9)" hoverColor="#fff">
          <X size={12} />
        </WinBtn>
      </div>
    </div>
  )
}

function WinBtn({ onClick, title, children, hoverBg, hoverColor }: {
  onClick: () => void; title: string; children: React.ReactNode
  hoverBg?: string; hoverColor?: string
}) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 46, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: hover ? (hoverBg ?? 'rgba(255,255,255,0.08)') : 'transparent',
        border: 'none', color: hover ? (hoverColor ?? 'var(--text-primary)') : 'var(--text-tertiary)',
        cursor: 'pointer', transition: 'all 0.1s ease',
        WebkitAppRegion: 'no-drag',
      } as any}
    >
      {children}
    </button>
  )
}
