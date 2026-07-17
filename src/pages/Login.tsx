import { useState, useEffect } from 'react'
import { useI18n } from '../lib/i18n'
import { useTheme } from '../lib/theme'
import { Globe, Moon, Sun, Loader2 } from 'lucide-react'

interface Props {
  onLogin: () => void
}

export default function Login({ onLogin }: Props) {
  const { t, locale, setLocale } = useI18n()
  const { theme, toggleTheme } = useTheme()
  const [server, setServer] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [allowInsecureHttp, setAllowInsecureHttp] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    window.config.get('allowInsecureHttp').then((value) => {
      if (typeof value === 'boolean') setAllowInsecureHttp(value)
    })
    window.config.get('server').then((value) => {
      if (typeof value === 'string' && value) setServer(value)
    })
  }, [])

  useEffect(() => {
    if (server.trim().toLowerCase().startsWith('http://')) {
      setAllowInsecureHttp(true)
    }
  }, [server])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await window.config.set('allowInsecureHttp', allowInsecureHttp)
      const ok = await window.bamboo.login(server, username, password)
      if (ok) {
        onLogin()
      } else {
        setError(t('login.error.auth'))
      }
    } catch {
      setError(t('login.error.connection'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-page)',
      position: 'relative',
    }}>
      {/* Top-right controls */}
      <div style={{
        position: 'absolute',
        top: 16,
        right: 16,
        display: 'flex',
        gap: 8,
      }}>
        <button
          onClick={toggleTheme}
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-tertiary)',
            padding: 6,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
          title={theme === 'dark' ? t('settings.theme.light') : t('settings.theme.dark')}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button
          onClick={() => setLocale(locale === 'zh-CN' ? 'en-US' : 'zh-CN')}
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-tertiary)',
            padding: 6,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 510,
            fontFamily: 'inherit',
            transition: 'all 0.15s ease',
          }}
          title="Switch language"
        >
          <Globe size={16} />
        </button>
      </div>

      <div style={{
        width: 380,
        padding: 40,
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-xl)',
      }}>
        <div style={{ marginBottom: 32, textAlign: 'center' }}>
          <div style={{
            fontSize: 24,
            fontWeight: 510,
            color: 'var(--text-primary)',
            letterSpacing: '-0.288px',
            marginBottom: 8,
          }}>
            {t('login.title')}
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>
            {t('login.subtitle')}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{
              display: 'block', fontSize: 13, fontWeight: 510,
              color: 'var(--text-secondary)', marginBottom: 6,
            }}>
              {t('login.server')}
            </label>
            <input
              className="input-linear"
              type="url"
              placeholder={t('login.server.placeholder')}
              value={server}
              onChange={(e) => setServer(e.target.value)}
              required
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{
              display: 'block', fontSize: 13, fontWeight: 510,
              color: 'var(--text-secondary)', marginBottom: 6,
            }}>
              {t('login.username')}
            </label>
            <input
              className="input-linear"
              type="text"
              placeholder={t('login.username.placeholder')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{
              display: 'block', fontSize: 13, fontWeight: 510,
              color: 'var(--text-secondary)', marginBottom: 6,
            }}>
              {t('login.password')}
            </label>
            <input
              className="input-linear"
              type="password"
              placeholder={t('login.password.placeholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <label style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24,
            fontSize: 12, color: 'var(--text-tertiary)', cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={allowInsecureHttp}
              onChange={(e) => setAllowInsecureHttp(e.target.checked)}
              style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
            />
            {t('login.allow_insecure_http')}
          </label>

          {error && (
            <div style={{
              marginBottom: 16,
              padding: '10px 14px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--error)',
              fontSize: 13,
            }}>
              {error}
            </div>
          )}

          <button
            className="btn-primary"
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? t('login.connecting') : t('login.connect')}
          </button>
        </form>
      </div>
    </div>
  )
}
