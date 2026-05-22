import type { CSSProperties } from 'react'
import { useI18n } from '../lib/i18n'
import { Star } from 'lucide-react'

export interface FavoritePlan {
  planKey: string
  projectKey: string
  planName: string
  lastBuildResultKey?: string
}

export interface PlanLiveStatus {
  buildResultKey?: string
  buildNumber?: number
  buildState: string
  lifeCycleState: string
  isRunning: boolean
}

interface Props {
  favorites: FavoritePlan[]
  planStatus: Record<string, PlanLiveStatus>
  onToggleFavorite: (plan: FavoritePlan) => void
  onOpenFavorite: (plan: FavoritePlan) => void
  openingPlanKey?: string | null
}

const nowrapText: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
}

export default function FavoritePlanList({
  favorites,
  planStatus,
  onToggleFavorite,
  onOpenFavorite,
  openingPlanKey,
}: Props) {
  const { t } = useI18n()

  if (favorites.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 8px', color: 'var(--text-quaternary)' }}>
        <Star size={20} style={{ marginBottom: 8, opacity: 0.4 }} />
        <div style={{ fontSize: 14, ...nowrapText }}>{t('dashboard.no_favorites')}</div>
        <div style={{ fontSize: 13, marginTop: 6, ...nowrapText }}>{t('dashboard.no_favorites.hint')}</div>
      </div>
    )
  }

  return (
    <div style={{ minWidth: 0 }}>
      {favorites.map((fav) => {
        const opening = openingPlanKey === fav.planKey
        const live = planStatus[fav.planKey]
        const isRunning = live?.isRunning
        return (
          <div
            key={fav.planKey}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '6px 4px', borderRadius: 'var(--radius-sm)',
              background: opening ? 'rgba(94, 106, 210, 0.08)' : 'transparent',
              cursor: opening ? 'wait' : 'pointer', minWidth: 0,
              transition: 'background 0.15s ease', opacity: opening ? 0.7 : 1,
            }}
            onClick={() => !opening && onOpenFavorite(fav)}
          >
            <button
              onClick={(e) => { e.stopPropagation(); onToggleFavorite(fav) }}
              style={{
                width: 22, height: 22, flexShrink: 0,
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 0, color: '#f59e0b',
              }}
            >
              <Star size={13} fill="currentColor" />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', ...nowrapText }} title={fav.planName}>
                  {fav.planName}
                </div>
                {isRunning && (
                  <span style={{
                    flexShrink: 0, fontSize: 10, fontWeight: 510, color: 'var(--accent)',
                    padding: '1px 6px', borderRadius: 'var(--radius-pill)',
                    background: 'rgba(94, 106, 210, 0.15)',
                    animation: 'pulse 1.5s ease-in-out infinite',
                  }}>
                    {t('status.in_progress')}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-quaternary)', fontFamily: 'monospace', ...nowrapText }} title={fav.planKey}>
                {fav.planKey}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
