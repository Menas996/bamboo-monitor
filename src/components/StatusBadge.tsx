import { useI18n } from '../lib/i18n'

interface Props {
  status: string
}

export default function StatusBadge({ status }: Props) {
  const { t } = useI18n()
  const normalized = (status ?? '').toUpperCase().replace(/[\s_-]+/g, '')

  const STATUS_MAP: Record<string, { bg: string; color: string; labelKey: string }> = {
    SUCCESS: { bg: 'rgba(39, 166, 68, 0.15)', color: 'var(--success)', labelKey: 'status.success' },
    SUCCESSFUL: { bg: 'rgba(39, 166, 68, 0.15)', color: 'var(--success)', labelKey: 'status.success' },
    FAILED: { bg: 'rgba(239, 68, 68, 0.15)', color: 'var(--error)', labelKey: 'status.failed' },
    FAILURE: { bg: 'rgba(239, 68, 68, 0.15)', color: 'var(--error)', labelKey: 'status.failed' },
    CANCELLED: { bg: 'rgba(148, 163, 184, 0.2)', color: '#94a3b8', labelKey: 'status.cancelled' },
    CANCELED: { bg: 'rgba(148, 163, 184, 0.2)', color: '#94a3b8', labelKey: 'status.cancelled' },
    NOTBUILT: { bg: 'rgba(148, 163, 184, 0.2)', color: '#94a3b8', labelKey: 'status.cancelled' },
    INCOMPLETE: { bg: 'rgba(148, 163, 184, 0.2)', color: '#94a3b8', labelKey: 'status.cancelled' },
    STOPPED: { bg: 'rgba(148, 163, 184, 0.2)', color: '#94a3b8', labelKey: 'status.cancelled' },
    UNKNOWN: { bg: 'rgba(138, 143, 152, 0.15)', color: 'var(--text-tertiary)', labelKey: 'status.unknown' },
    INPROGRESS: { bg: 'rgba(94, 106, 210, 0.15)', color: 'var(--accent)', labelKey: 'status.in_progress' },
    RUNNING: { bg: 'rgba(94, 106, 210, 0.15)', color: 'var(--accent)', labelKey: 'status.in_progress' },
    QUEUED: { bg: 'rgba(245, 158, 11, 0.15)', color: 'var(--warning)', labelKey: 'status.queued' },
    PENDING: { bg: 'rgba(245, 158, 11, 0.15)', color: 'var(--warning)', labelKey: 'status.queued' },
  }

  const style = STATUS_MAP[normalized] ?? STATUS_MAP.UNKNOWN

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '2px 8px',
      background: style.bg,
      color: style.color,
      borderRadius: 'var(--radius-pill)',
      fontSize: 12,
      fontWeight: 510,
      lineHeight: '20px',
      whiteSpace: 'nowrap',
    }}>
      <span style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: 'currentColor',
      }} />
      {t(style.labelKey)}
    </span>
  )
}
