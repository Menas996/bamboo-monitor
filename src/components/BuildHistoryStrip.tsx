import { Check, X, Ban, Loader2, Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import { useRef, useState, useEffect } from 'react'
import {
  buildNumberFromResultKey,
  classifyBuildStatus,
  type BuildStatusKind,
  type PlanBuildSnapshot,
} from '../lib/bamboo-build'

interface Props {
  builds: PlanBuildSnapshot[]
  currentKey: string
  planKey: string
  onSelect: (buildResultKey: string) => void
}

const KIND_STYLE: Record<BuildStatusKind, { bg: string; color: string; title: string }> = {
  success: { bg: '#22c55e', color: '#fff', title: 'Successful' },
  failed: { bg: '#ef4444', color: '#fff', title: 'Failed' },
  cancelled: { bg: '#94a3b8', color: '#fff', title: 'Stopped / Not built' },
  queued: { bg: '#f59e0b', color: '#fff', title: 'Queued' },
  running: { bg: '#5e6ad2', color: '#fff', title: 'In progress' },
  unknown: { bg: '#64748b', color: '#fff', title: 'Unknown' },
}

function StatusIcon({ kind }: { kind: BuildStatusKind }) {
  const size = 11
  if (kind === 'success') return <Check size={size} strokeWidth={3} />
  if (kind === 'failed') return <X size={size} strokeWidth={3} />
  if (kind === 'cancelled') return <Ban size={size} strokeWidth={2.5} />
  if (kind === 'queued') return <Clock size={size} strokeWidth={2.5} />
  if (kind === 'running') return <Loader2 size={size} strokeWidth={2.5} className="animate-spin" />
  return <Ban size={size} strokeWidth={2.5} />
}

export default function BuildHistoryStrip({ builds, currentKey, planKey, onSelect }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const items = [...builds]
    .filter((b) => b.buildResultKey)
    .sort((a, b) =>
      (b.buildNumber ?? buildNumberFromResultKey(b.buildResultKey, planKey)) -
      (a.buildNumber ?? buildNumberFromResultKey(a.buildResultKey, planKey))
    )
    .slice(0, 40)

  function updateScrollHints() {
    const el = scrollerRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }

  useEffect(() => {
    updateScrollHints()
    const el = scrollerRef.current
    if (!el) return
    el.addEventListener('scroll', updateScrollHints)
    const observer = new ResizeObserver(updateScrollHints)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', updateScrollHints)
      observer.disconnect()
    }
  }, [items.length])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const active = el.querySelector('[data-current="true"]') as HTMLElement | null
    active?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
  }, [currentKey, items.length])

  if (items.length === 0) return null

  function scrollBy(delta: number) {
    scrollerRef.current?.scrollBy({ left: delta, behavior: 'smooth' })
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      marginTop: 12, padding: '6px 4px',
      background: 'var(--bg-surface)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--ring-border)',
      minWidth: 0,
    }}>
      <button
        type="button"
        onClick={() => scrollBy(-120)}
        disabled={!canScrollLeft}
        style={{
          width: 24, height: 24, flexShrink: 0, border: 'none', borderRadius: 6,
          background: 'transparent', color: canScrollLeft ? 'var(--text-tertiary)' : 'var(--text-quaternary)',
          cursor: canScrollLeft ? 'pointer' : 'default', opacity: canScrollLeft ? 1 : 0.35,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
        }}
        aria-label="Scroll left"
      >
        <ChevronLeft size={14} />
      </button>

      <div
        ref={scrollerRef}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto',
          flex: 1, minWidth: 0, scrollbarWidth: 'none', padding: '2px 0',
        }}
      >
        {items.map((build) => {
          const kind = classifyBuildStatus(build)
          const style = KIND_STYLE[kind]
          const isCurrent = build.buildResultKey === currentKey
          const number = build.buildNumber ?? buildNumberFromResultKey(build.buildResultKey, planKey)
          return (
            <button
              key={build.buildResultKey}
              type="button"
              data-current={isCurrent ? 'true' : 'false'}
              title={`#${number} · ${style.title}`}
              onClick={() => !isCurrent && onSelect(build.buildResultKey)}
              style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                border: isCurrent ? '2px solid var(--accent)' : '2px solid transparent',
                outline: isCurrent ? '2px solid rgba(94,106,210,0.35)' : 'none',
                outlineOffset: 1,
                background: style.bg, color: style.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: isCurrent ? 'default' : 'pointer', padding: 0,
                boxShadow: isCurrent ? '0 0 0 1px var(--bg-surface)' : 'none',
                transition: 'transform 0.12s ease',
              }}
            >
              <StatusIcon kind={kind} />
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => scrollBy(120)}
        disabled={!canScrollRight}
        style={{
          width: 24, height: 24, flexShrink: 0, border: 'none', borderRadius: 6,
          background: 'transparent', color: canScrollRight ? 'var(--text-tertiary)' : 'var(--text-quaternary)',
          cursor: canScrollRight ? 'pointer' : 'default', opacity: canScrollRight ? 1 : 0.35,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
        }}
        aria-label="Scroll right"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  )
}
