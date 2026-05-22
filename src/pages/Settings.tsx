import { useState, useEffect } from 'react'
import { useI18n, Locale } from '../lib/i18n'
import { useTheme } from '../lib/theme'
import { Globe, Moon, Sun, Save, Check } from 'lucide-react'

export default function Settings() {
  const { t, locale, setLocale } = useI18n()
  const { theme, setTheme } = useTheme()
  const [pollInterval, setPollInterval] = useState(30)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.config.get('pollInterval').then((v) => { if (v) setPollInterval(v) })
  }, [])

  async function handleSave() {
    await window.config.set('pollInterval', pollInterval)
    const favorites = await window.config.get('favoritePlans') as { planKey: string; projectKey: string; planName: string }[] | undefined
    if (favorites?.length) await window.poll.start(pollInterval, favorites)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <h1 style={{
        fontSize: 20, fontWeight: 510, color: 'var(--text-primary)',
        letterSpacing: '-0.24px', marginBottom: 24,
      }}>
        {t('settings.title')}
      </h1>

      <div className="card-surface" style={{ marginBottom: 16 }}>
        {/* Language */}
        <div style={{ marginBottom: 24 }}>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 13, fontWeight: 510, color: 'var(--text-secondary)', marginBottom: 8,
          }}>
            <Globe size={14} />
            {t('settings.language')}
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['zh-CN', 'en-US'] as Locale[]).map((l) => (
              <button
                key={l}
                onClick={() => setLocale(l)}
                style={{
                  padding: '6px 16px', borderRadius: 'var(--radius-md)',
                  border: `1px solid ${locale === l ? 'var(--accent)' : 'var(--border-default)'}`,
                  background: locale === l ? 'rgba(94, 106, 210, 0.1)' : 'var(--bg-surface)',
                  color: locale === l ? 'var(--accent)' : 'var(--text-secondary)',
                  fontSize: 13, fontWeight: 510, fontFamily: 'inherit',
                  fontFeatureSettings: '"cv01", "ss03"', cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {l === 'zh-CN' ? '中文' : 'English'}
              </button>
            ))}
          </div>
        </div>

        {/* Theme */}
        <div style={{ marginBottom: 24 }}>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 13, fontWeight: 510, color: 'var(--text-secondary)', marginBottom: 8,
          }}>
            {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
            {t('settings.theme')}
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['dark', 'light'] as const).map((th) => (
              <button
                key={th}
                onClick={() => setTheme(th)}
                style={{
                  padding: '6px 16px', borderRadius: 'var(--radius-md)',
                  border: `1px solid ${theme === th ? 'var(--accent)' : 'var(--border-default)'}`,
                  background: theme === th ? 'rgba(94, 106, 210, 0.1)' : 'var(--bg-surface)',
                  color: theme === th ? 'var(--accent)' : 'var(--text-secondary)',
                  fontSize: 13, fontWeight: 510, fontFamily: 'inherit',
                  fontFeatureSettings: '"cv01", "ss03"', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                  transition: 'all 0.15s ease',
                }}
              >
                {th === 'dark' ? <Moon size={12} /> : <Sun size={12} />}
                {t(`settings.theme.${th}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Poll interval */}
        <div style={{ marginBottom: 24 }}>
          <label style={{
            display: 'block', fontSize: 13, fontWeight: 510,
            color: 'var(--text-secondary)', marginBottom: 8,
          }}>
            {t('settings.poll_interval')}
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="range" min={10} max={120} step={5}
              value={pollInterval}
              onChange={(e) => setPollInterval(Number(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--accent)' }}
            />
            <span style={{
              fontSize: 14, fontWeight: 510, color: 'var(--text-primary)',
              minWidth: 40, textAlign: 'right', fontFamily: 'monospace',
            }}>
              {pollInterval}s
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-quaternary)', marginTop: 6 }}>
            {t('settings.poll_interval.hint')}
          </div>
        </div>

        {/* Notifications */}
        <div style={{ marginBottom: 24 }}>
          <label style={{
            display: 'block', fontSize: 13, fontWeight: 510,
            color: 'var(--text-secondary)', marginBottom: 8,
          }}>
            {t('settings.notifications')}
          </label>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
            {t('settings.notifications.hint')}
          </div>
        </div>

        {/* Save */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn-primary" onClick={handleSave} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Save size={14} />
            {t('settings.save')}
          </button>
          {saved && (
            <span style={{ fontSize: 13, color: 'var(--success-emerald)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Check size={14} />
              {t('settings.saved')}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
