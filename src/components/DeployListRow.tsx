import StatusBadge from './StatusBadge'
import { Star } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { statusBadgeKey } from '../lib/bamboo-build'

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

export default function DeployListRow({
  deploy, isFavorite, isDeploying, displayBuildNumber, onToggleFavorite, onOpenBuild,
}: Props) {
  const { t } = useI18n()
  const buildKey = deploy.buildResultKey ?? deploy.deployment?.id?.toString() ?? ''
  const result = deploy.deploymentResult
  const triggerBy = (result?.initiator?.name ?? result?.reason ?? '').trim()
  const timeMs = result?.startedDate ?? result?.finishedDate
  const timeLabel = timeMs ? new Date(timeMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
  const rawPlanName = deploy.plan?.name ?? deploy.environment.name ?? ''
  const projName = deploy.project.name || ''
  const projKey = deploy.project.key || ''

  let planName = rawPlanName
  if (projName && planName.startsWith(`${projName} - `)) {
    planName = planName.slice(projName.length + 3)
  } else if (projKey && planName.startsWith(`${projKey} - `)) {
    planName = planName.slice(projKey.length + 3)
  }

  const planKey = deploy.plan?.key ?? deploy.environment.key
  const canFavorite = !!planKey && !!onToggleFavorite

  let triggerText = triggerBy
  if (triggerText.startsWith('Manual run by ')) {
    triggerText = triggerText.slice('Manual run by '.length)
  }

  return (
    <div
      className="geist-card"
      style={{
        cursor: buildKey ? 'pointer' : 'default',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        borderRadius: 'var(--radius-md)',
      }}
      onClick={() => buildKey && onOpenBuild?.(buildKey)}
    >
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
        {canFavorite && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite() }}
            title={isFavorite ? t('dashboard.unfavorite') : t('dashboard.favorite')}
            style={{
              width: 24, height: 24, flexShrink: 0,
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0, color: isFavorite ? '#f59e0b' : 'var(--text-quaternary)',
              transition: 'color 0.15s ease',
            }}
          >
            <Star size={14} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
        )}
        <span className="truncate" style={{ fontSize: 13, fontWeight: 550, color: 'var(--text-primary)', flex: '0 1 220px' }} title={rawPlanName}>
          {planName}
        </span>
        <span className="truncate" style={{
          fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'monospace',
          background: 'rgba(255, 255, 255, 0.04)', padding: '1px 5px', borderRadius: 'var(--radius-sm)',
          boxShadow: 'var(--ring-border)', flexShrink: 0,
        }} title={planKey}>
          {planKey}
        </span>
        {buildKey && (
          <span style={{ fontSize: 11, color: 'var(--text-quaternary)', fontFamily: 'monospace', flexShrink: 0 }}>
            #{displayBuildNumber ?? deploy.deployment?.id ?? ''}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        {triggerText && (
          <span className="truncate" style={{ fontSize: 12, color: 'var(--text-tertiary)', maxWidth: 140 }} title={triggerBy}>
            {triggerText}
          </span>
        )}
        {timeLabel && (
          <span style={{ fontSize: 12, color: 'var(--text-quaternary)' }}>
            {timeLabel}
          </span>
        )}
        {isDeploying ? (
          <StatusBadge status="InProgress" />
        ) : (
          <StatusBadge status={statusBadgeKey({
            buildState: result?.state ?? result?.deploymentState,
            lifeCycleState: result?.state,
          })} />
        )}
      </div>
    </div>
  )
}

