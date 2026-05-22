import StatusBadge from './StatusBadge'
import { Star } from 'lucide-react'
import { useI18n } from '../lib/i18n'

interface DeployData {
  buildResultKey?: string
  project: { key: string; name: string }
  environment: { key: string; name: string }
  plan?: { key: string; name: string }
  deployment?: { id: number; deploymentState: string }
  deploymentResult: {
    deploymentState: string
    state: string
    startedDate?: number
    finishedDate?: number
    reason?: string
    initiator?: { name: string }
  } | null
}

interface Props {
  deploy: DeployData
  isFavorite?: boolean
  isDeploying?: boolean
  displayBuildNumber?: number
  onToggleFavorite?: () => void
  onOpenBuild?: (key: string) => void
}

export default function DeployCard({
  deploy, isFavorite, isDeploying, displayBuildNumber, onToggleFavorite, onOpenBuild,
}: Props) {
  const { t } = useI18n()
  const buildKey = deploy.buildResultKey ?? deploy.deployment?.id?.toString() ?? ''
  const result = deploy.deploymentResult
  const triggerBy = (result?.initiator?.name ?? result?.reason ?? '').trim()
  const timeMs = result?.startedDate ?? result?.finishedDate
  const timeLabel = timeMs ? new Date(timeMs).toLocaleString() : ''
  const planName = deploy.plan?.name ?? deploy.environment.name
  const planKey = deploy.plan?.key ?? deploy.environment.key
  const canFavorite = !!planKey && !!onToggleFavorite

  return (
    <div
      className="card-surface"
      style={{ cursor: buildKey ? 'pointer' : 'default' }}
      onClick={() => buildKey && onOpenBuild?.(buildKey)}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          {canFavorite && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleFavorite() }}
              title={isFavorite ? t('dashboard.unfavorite') : t('dashboard.favorite')}
              style={{
                width: 28, height: 28, flexShrink: 0,
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 0, color: isFavorite ? '#f59e0b' : 'var(--text-quaternary)',
                transition: 'color 0.15s ease, transform 0.15s ease',
              }}
            >
              <Star size={15} fill={isFavorite ? 'currentColor' : 'none'} />
            </button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
              <span style={{
                fontSize: 14, fontWeight: 510, color: 'var(--text-primary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }} title={planName}>
                {planName}
              </span>
              <span style={{
                fontSize: 12, color: 'var(--text-quaternary)', fontFamily: 'monospace',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }} title={planKey}>
                {planKey}
              </span>
              {buildKey && (
                <span style={{ fontSize: 11, color: 'var(--text-quaternary)', fontFamily: 'monospace', flexShrink: 0 }}>
                  #{displayBuildNumber ?? deploy.deployment?.id ?? ''}
                </span>
              )}
            </div>
            <div style={{
              fontSize: 13, color: 'var(--text-tertiary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {deploy.project.key}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--text-quaternary)', textAlign: 'right', maxWidth: 200 }}>
            {triggerBy && (
              <div
                title={triggerBy}
                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {triggerBy}
              </div>
            )}
            {timeLabel && <div>{timeLabel}</div>}
          </div>
          {isDeploying ? (
            <StatusBadge status="InProgress" />
          ) : (
            <StatusBadge status={result?.state ?? 'UNKNOWN'} />
          )}
        </div>
      </div>
    </div>
  )
}
