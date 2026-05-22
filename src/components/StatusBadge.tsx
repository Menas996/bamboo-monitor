import { useI18n } from '../lib/i18n'

interface Props {
  status: string
}

export default function StatusBadge({ status }: Props) {
  const { t } = useI18n()

  const STATUS_MAP: Record<string, { bg: string; color: string; labelKey: string }> = {
    SUCCESS: { bg: 'rgba(39, 166, 68, 0.15)', color: 'var(--success)', labelKey: 'status.success' },
    Successful: { bg: 'rgba(39, 166, 68, 0.15)', color: 'var(--success)', labelKey: 'status.success' },
    FAILED: { bg: 'rgba(239, 68, 68, 0.15)', color: 'var(--error)', labelKey: 'status.failed' },
    Failed: { bg: 'rgba(239, 68, 68, 0.15)', color: 'var(--error)', labelKey: 'status.failed' },
    UNKNOWN: { bg: 'rgba(138, 143, 152, 0.15)', color: 'var(--text-tertiary)', labelKey: 'status.unknown' },
    IN_PROGRESS: { bg: 'rgba(94, 106, 210, 0.15)', color: 'var(--accent)', labelKey: 'status.in_progress' },
    InProgress: { bg: 'rgba(94, 106, 210, 0.15)', color: 'var(--accent)', labelKey: 'status.in_progress' },
    QUEUED: { bg: 'rgba(245, 158, 11, 0.15)', color: 'var(--warning)', labelKey: 'status.queued' },
    Queued: { bg: 'rgba(245, 158, 11, 0.15)', color: 'var(--warning)', labelKey: 'status.queued' },
  }

  const style = STATUS_MAP[status] ?? STATUS_MAP.UNKNOWN

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
