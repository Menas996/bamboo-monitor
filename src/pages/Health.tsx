import { useState, useEffect } from 'react'
import { useI18n } from '../lib/i18n'
import LoadingSpinner from '../components/LoadingSpinner'
import { RefreshCw, Wifi, Key, Activity, ScrollText } from 'lucide-react'

interface HealthCheck {
  status: string; detail?: string; latency?: number
}

interface HealthReport {
  overall: boolean
  checks: Record<string, HealthCheck>
}

const STATUS_CONFIG: Record<string, { bg: string; color: string; labelKey: string }> = {
  ok: { bg: 'rgba(39, 166, 68, 0.15)', color: 'var(--success)', labelKey: 'health.status.ok' },
  active: { bg: 'rgba(94, 106, 210, 0.15)', color: 'var(--accent)', labelKey: 'health.status.active' },
  degraded: { bg: 'rgba(245, 158, 11, 0.15)', color: 'var(--warning)', labelKey: 'health.status.degraded' },
  error: { bg: 'rgba(239, 68, 68, 0.15)', color: 'var(--error)', labelKey: 'health.status.error' },
  'auth-failed': { bg: 'rgba(239, 68, 68, 0.15)', color: 'var(--error)', labelKey: 'health.status.auth_failed' },
  'not-configured': { bg: 'rgba(138, 143, 152, 0.15)', color: 'var(--text-tertiary)', labelKey: 'health.status.not_configured' },
}

const CHECK_ICONS: Record<string, any> = {
  connectivity: Wifi, api: Key, poller: Activity, logs: ScrollText,
}

export default function Health() {
  const { t } = useI18n()
  const [report, setReport] = useState<HealthReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)

  async function runCheck() {
    setChecking(true)
    try {
      const data = await window.health.check()
      setReport(data)
    } catch {
      setReport({ overall: false, checks: {} })
    } finally {
      setChecking(false)
      setLoading(false)
    }
  }

  useEffect(() => {
    runCheck()
    const timer = setInterval(runCheck, 30000)
    return () => clearInterval(timer)
  }, [])

  if (loading) {
    return <LoadingSpinner text={t('health.checking')} />
  }

  const checks = report?.checks ?? {}
  const checkNames: Record<string, string> = {
    connectivity: t('health.connectivity'),
    api: t('health.api'),
    poller: t('health.poller'),
    logs: t('health.logs'),
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24,
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 510, color: 'var(--text-primary)', letterSpacing: '-0.24px' }}>
            {t('health.title')}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>
            {report?.overall ? t('health.ok') : t('health.issues')}
          </p>
        </div>
        <button className="btn-ghost" onClick={runCheck} disabled={checking}
          style={{ fontSize: 13, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={13} className={checking ? 'animate-spin' : ''} />
          {checking ? t('health.checking') : t('health.re_check')}
        </button>
      </div>

      {/* Overall status */}
      <div className="card-surface" style={{
        marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12,
        borderColor: report?.overall ? 'rgba(39, 166, 68, 0.2)' : 'rgba(239, 68, 68, 0.2)',
      }}>
        <div style={{
          width: 10, height: 10, borderRadius: '50%',
          background: report?.overall ? 'var(--success)' : 'var(--error)',
        }} />
        <span style={{ fontSize: 14, fontWeight: 510, color: 'var(--text-primary)' }}>
          {report?.overall ? t('health.ok') : t('health.issues')}
        </span>
      </div>

      {/* Individual checks */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Object.entries(checks).map(([key, check]) => {
          const cfg = STATUS_CONFIG[check.status] ?? STATUS_CONFIG.error
          const Icon = CHECK_ICONS[key]
          return (
            <div key={key} className="card-surface" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {Icon && <Icon size={14} color="var(--text-tertiary)" />}
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: cfg.color,
                  }} />
                  <span style={{ fontSize: 14, fontWeight: 510, color: 'var(--text-primary)' }}>
                    {checkNames[key] ?? key}
                  </span>
                </div>
                <span style={{
                  padding: '2px 8px', borderRadius: 'var(--radius-pill)',
                  background: cfg.bg, color: cfg.color,
                  fontSize: 12, fontWeight: 510,
                }}>
                  {t(cfg.labelKey)}
                </span>
              </div>
              {check.detail && (
                <div style={{
                  marginTop: 8, paddingLeft: 18, fontSize: 12, color: 'var(--text-tertiary)',
                  display: 'flex', gap: 12,
                }}>
                  <span>{check.detail}</span>
                  {check.latency !== undefined && (
                    <span style={{ color: 'var(--text-quaternary)' }}>{check.latency}ms</span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
