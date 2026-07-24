import type { CSSProperties } from 'react'
import { useI18n } from '../lib/i18n'
import { Star } from 'lucide-react'
import StatusBadge from './StatusBadge'
import { statusBadgeKey } from '../lib/bamboo-build'

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
  gitDeployFlash?: Record<string, number>
  viewMode?: 'grid' | 'compact'
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
  gitDeployFlash = {},
  viewMode = 'grid',
  onToggleFavorite,
  onOpenFavorite,
  openingPlanKey,
}: Props) {
  const { t } = useI18n()

  if (favorites.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '36px 8px', color: 'var(--text-quaternary)' }}>
        <Star size={20} style={{ marginBottom: 8, opacity: 0.4 }} />
        <div style={{ fontSize: 14, ...nowrapText }}>{t('dashboard.no_favorites')}</div>
        <div style={{ fontSize: 13, marginTop: 6, ...nowrapText }}>{t('dashboard.no_favorites.hint')}</div>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: viewMode === 'compact' ? 6 : 10,
      minWidth: 0,
    }}>
      {favorites.map((fav) => {
        const opening = openingPlanKey === fav.planKey
        const live = planStatus[fav.planKey]
        const isRunning = live?.isRunning
        const gitTriggered = !!gitDeployFlash[fav.planKey]

        if (viewMode === 'compact') {
          return (
            <div
              key={fav.planKey}
              className="geist-card"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', borderRadius: 'var(--radius-md)',
                cursor: opening ? 'wait' : 'pointer', opacity: opening ? 0.7 : 1,
              }}
              onClick={() => !opening && onOpenFavorite(fav)}
            >
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleFavorite(fav) }}
                  title={t('dashboard.unfavorite')}
                  style={{
                    width: 24, height: 24, flexShrink: 0,
                    background: 'none', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: 0, color: '#f59e0b',
                  }}
                >
                  <Star size={14} fill="currentColor" />
                </button>
                <span className="truncate" style={{ fontSize: 13, fontWeight: 550, color: 'var(--text-primary)', flex: '0 1 220px' }} title={fav.planName}>
                  {fav.planName}
                </span>
                <span className="truncate" style={{
                  fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'monospace',
                  background: 'rgba(255, 255, 255, 0.04)', padding: '1px 5px', borderRadius: 'var(--radius-sm)',
                  boxShadow: 'var(--ring-border)', flexShrink: 0,
                }} title={fav.planKey}>
                  {fav.planKey}
                </span>
                {live?.buildNumber && (
                  <span style={{ fontSize: 11, color: 'var(--text-quaternary)', fontFamily: 'monospace', flexShrink: 0 }}>
                    #{live.buildNumber}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                {gitTriggered && !isRunning && (
                  <span style={{
                    fontSize: 10, fontWeight: 510, color: 'var(--success)',
                    padding: '1px 6px', borderRadius: 'var(--radius-pill)',
                    background: 'rgba(39, 166, 68, 0.15)',
                  }}>
                    {t('dashboard.git_auto_deployed')}
                  </span>
                )}
                {isRunning ? (
                  <StatusBadge status="InProgress" />
                ) : live ? (
                  <StatusBadge status={statusBadgeKey({ buildState: live.buildState, lifeCycleState: live.lifeCycleState })} />
                ) : (
                  <StatusBadge status="Unknown" />
                )}
              </div>
            </div>
          )
        }

        return (
          <div
            key={fav.planKey}
            className="geist-card"
            style={{
              padding: '14px 16px', borderRadius: 'var(--radius-lg)',
              cursor: opening ? 'wait' : 'pointer', opacity: opening ? 0.7 : 1,
            }}
            onClick={() => !opening && onOpenFavorite(fav)}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleFavorite(fav) }}
                  title={t('dashboard.unfavorite')}
                  style={{
                    width: 28, height: 28, flexShrink: 0,
                    background: 'none', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: 0, color: '#f59e0b',
                  }}
                >
                  <Star size={15} fill="currentColor" />
                </button>
                <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, minWidth: 0 }}>
                    <span className="truncate" style={{
                      fontSize: 14, fontWeight: 550, color: 'var(--text-primary)', flex: '1 1 auto',
                    }} title={fav.planName}>
                      {fav.planName}
                    </span>
                    <span className="truncate" style={{
                      fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'monospace',
                      background: 'rgba(255, 255, 255, 0.04)', padding: '2px 6px', borderRadius: 'var(--radius-sm)',
                      boxShadow: 'var(--ring-border)', flex: '0 1 auto', maxWidth: '40%',
                    }} title={fav.planKey}>
                      {fav.planKey}
                    </span>
                    {live?.buildNumber && (
                      <span style={{ fontSize: 11, color: 'var(--text-quaternary)', fontFamily: 'monospace', flexShrink: 0 }}>
                        #{live.buildNumber}
                      </span>
                    )}
                  </div>
                  <div className="truncate" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    {fav.projectKey}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                {gitTriggered && !isRunning && (
                  <span style={{
                    fontSize: 11, fontWeight: 510, color: 'var(--success)',
                    padding: '2px 8px', borderRadius: 'var(--radius-pill)',
                    background: 'rgba(39, 166, 68, 0.15)',
                  }}>
                    {t('dashboard.git_auto_deployed')}
                  </span>
                )}
                {isRunning ? (
                  <StatusBadge status="InProgress" />
                ) : live ? (
                  <StatusBadge status={statusBadgeKey({ buildState: live.buildState, lifeCycleState: live.lifeCycleState })} />
                ) : (
                  <StatusBadge status="Unknown" />
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

