import { Check, X, Ban, Loader2, Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import { useRef, useState, useEffect } from 'react'
import {
  buildNumberFromResultKey,
  classifyBuildStatus,
  type BuildStatusKind,
  type PlanBuildSnapshot,
} from '../lib/bamboo-build'
import { useI18n } from '../lib/i18n'

interface Props {
  builds: PlanBuildSnapshot[]
  currentKey: string
  planKey: string
  onSelect: (buildResultKey: string) => void
}

const KIND_STYLE: Record<BuildStatusKind, { bg: string; glow: string; titleKey: string }> = {
  success: { bg: 'linear-gradient(145deg, #34d399 0%, #16a34a 100%)', glow: 'rgba(34,197,94,0.35)', titleKey: 'status.success' },
  failed: { bg: 'linear-gradient(145deg, #f87171 0%, #dc2626 100%)', glow: 'rgba(239,68,68,0.35)', titleKey: 'status.failed' },
  cancelled: { bg: 'linear-gradient(145deg, #cbd5e1 0%, #94a3b8 100%)', glow: 'rgba(148,163,184,0.3)', titleKey: 'status.cancelled' },
  queued: { bg: 'linear-gradient(145deg, #fbbf24 0%, #d97706 100%)', glow: 'rgba(245,158,11,0.35)', titleKey: 'status.queued' },
  running: { bg: 'linear-gradient(145deg, #818cf8 0%, #4f46e5 100%)', glow: 'rgba(94,106,210,0.4)', titleKey: 'status.in_progress' },
  unknown: { bg: 'linear-gradient(145deg, #94a3b8 0%, #64748b 100%)', glow: 'rgba(100,116,139,0.3)', titleKey: 'status.unknown' },
}

function StatusIcon({ kind }: { kind: BuildStatusKind }) {
  const size = 12
  if (kind === 'success') return <Check size={size} strokeWidth={2.75} />
  if (kind === 'failed') return <X size={size} strokeWidth={2.75} />
  if (kind === 'cancelled') return <Ban size={size} strokeWidth={2.25} />
  if (kind === 'queued') return <Clock size={size} strokeWidth={2.25} />
  if (kind === 'running') return <Loader2 size={size} strokeWidth={2.25} className="animate-spin" />
  return <Ban size={size} strokeWidth={2.25} />
}

export default function BuildHistoryStrip({ builds, currentKey, planKey, onSelect }: Props) {
  const { t } = useI18n()
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
      display: 'flex', alignItems: 'center', gap: 2,
      marginTop: 12, padding: '4px 6px',
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
          width: 28, height: 28, flexShrink: 0, border: 'none', borderRadius: 8,
          background: 'transparent', color: canScrollLeft ? 'var(--text-tertiary)' : 'var(--text-quaternary)',
          cursor: canScrollLeft ? 'pointer' : 'default', opacity: canScrollLeft ? 1 : 0.35,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
        }}
        aria-label={t('common.scroll_left')}
      >
        <ChevronLeft size={15} />
      </button>

      <div
        ref={scrollerRef}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto',
          flex: 1, minWidth: 0, scrollbarWidth: 'none',
          padding: '10px 4px',
          WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 8px, #000 calc(100% - 8px), transparent)',
          maskImage: 'linear-gradient(90deg, transparent, #000 8px, #000 calc(100% - 8px), transparent)',
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
              title={`#${number} · ${t(style.titleKey)}`}
              onClick={() => !isCurrent && onSelect(build.buildResultKey)}
              style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                border: 'none',
                background: style.bg,
                color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: isCurrent ? 'default' : 'pointer',
                padding: 0,
                boxShadow: isCurrent
                  ? `0 0 0 2px var(--bg-surface), 0 0 0 4px var(--accent), 0 2px 8px ${style.glow}`
                  : `inset 0 1px 0 rgba(255,255,255,0.28), 0 1px 3px ${style.glow}`,
                transform: isCurrent ? 'scale(1.08)' : 'scale(1)',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
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
          width: 28, height: 28, flexShrink: 0, border: 'none', borderRadius: 8,
          background: 'transparent', color: canScrollRight ? 'var(--text-tertiary)' : 'var(--text-quaternary)',
          cursor: canScrollRight ? 'pointer' : 'default', opacity: canScrollRight ? 1 : 0.35,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
        }}
        aria-label={t('common.scroll_right')}
      >
        <ChevronRight size={15} />
      </button>
    </div>
  )
}
