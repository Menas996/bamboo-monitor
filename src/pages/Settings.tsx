import { useState, useEffect, useRef, useCallback } from 'react'
import { useI18n, Locale } from '../lib/i18n'
import { useTheme } from '../lib/theme'
import { Globe, Moon, Sun, Save, Check, Bell, GitBranch, Timer, Palette } from 'lucide-react'

const SECTIONS = ['appearance', 'polling', 'deployment', 'notifications'] as const
type Section = typeof SECTIONS[number]

const styles = {
  layout: { display: 'flex', height: '100%', gap: 0, overflow: 'hidden' } as React.CSSProperties,

  sidebar: {
    width: 180, flexShrink: 0, padding: '24px 0',
    borderRight: '1px solid var(--border-default)',
    display: 'flex', flexDirection: 'column', gap: 2,
  } as React.CSSProperties,

  sidebarLabel: {
    fontSize: 11, fontWeight: 600, color: 'var(--text-quaternary)',
    textTransform: 'uppercase' as const, letterSpacing: '0.5px',
    padding: '0 16px', marginBottom: 8,
  } as React.CSSProperties,

  navItem: (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '7px 12px', margin: '0 8px',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    background: active ? 'var(--bg-elevated)' : 'transparent',
    boxShadow: active ? 'var(--ring-border)' : 'none',
    color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
    fontSize: 13, fontWeight: active ? 500 : 400, fontFamily: 'inherit',
    cursor: 'pointer', textAlign: 'left' as const,
    transition: 'all 0.15s ease',
  }),

  content: {
    flex: 1, overflow: 'auto', scrollBehavior: 'smooth', minWidth: 0,
  } as React.CSSProperties,

  saveBar: {
    position: 'sticky' as const, top: 0, zIndex: 10,
    padding: '12px 32px',
    boxShadow: '0 1px 0 0 var(--border-default)',
    background: 'var(--bg-page)',
    display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12,
  } as React.CSSProperties,

  contentInner: { padding: '24px 32px 48px' } as React.CSSProperties,

  sectionWrap: { marginBottom: 48, scrollMarginTop: 24 } as React.CSSProperties,

  sectionTitle: {
    display: 'flex', alignItems: 'center', gap: 8,
    fontSize: 14, fontWeight: 500, color: 'var(--text-primary)',
    letterSpacing: '-0.28px', marginBottom: 16,
  } as React.CSSProperties,

  card: {
    background: 'var(--bg-surface)',
    boxShadow: 'var(--shadow-card)',
    borderRadius: 'var(--radius-lg)',
    padding: 16,
  } as React.CSSProperties,

  labelRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8,
  } as React.CSSProperties,

  hint: {
    fontSize: 12, color: 'var(--text-quaternary)', marginTop: 6,
  } as React.CSSProperties,

  segBtn: (active: boolean): React.CSSProperties => ({
    padding: '6px 14px', borderRadius: 'var(--radius-md)',
    border: 'none',
    boxShadow: active ? 'var(--ring-border)' : '0 0 0 1px transparent',
    background: active ? 'var(--bg-elevated)' : 'transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
    fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
    fontFeatureSettings: '"cv01", "ss03"', cursor: 'pointer',
    transition: 'all 0.15s ease',
  }),
}

export default function Settings() {
  const { t, locale, setLocale } = useI18n()
  const { theme, setTheme } = useTheme()
  const [pollInterval, setPollInterval] = useState(30)
  const [autoDeployOnGitChange, setAutoDeployOnGitChange] = useState(true)
  const [gitRepoMappingsText, setGitRepoMappingsText] = useState('')
  const [saved, setSaved] = useState(false)
  const [activeSection, setActiveSection] = useState<Section>('appearance')

  const sectionRefs = {
    appearance: useRef<HTMLDivElement>(null),
    polling: useRef<HTMLDivElement>(null),
    deployment: useRef<HTMLDivElement>(null),
    notifications: useRef<HTMLDivElement>(null),
  }

  useEffect(() => {
    window.config.get('pollInterval').then((v) => { if (v) setPollInterval(v) })
    window.config.get('autoDeployOnGitChange').then((v) => {
      if (typeof v === 'boolean') setAutoDeployOnGitChange(v)
    })
    window.config.get('gitRepositoryUrls').then((v) => {
      if (v && typeof v === 'object') {
        const lines = Object.entries(v as Record<string, string>)
          .map(([k, url]) => `${k}=${url}`)
        setGitRepoMappingsText(lines.join('\n'))
      }
    })
  }, [])

  useEffect(() => {
    const observers: IntersectionObserver[] = []
    const barH = saveBarRef.current?.offsetHeight ?? 48
    const options = { rootMargin: `-${barH + 8}px 0px -60% 0px`, threshold: 0 }

    SECTIONS.forEach((key) => {
      const el = sectionRefs[key].current
      if (!el) return
      const obs = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) setActiveSection(key)
      }, options)
      obs.observe(el)
      observers.push(obs)
    })

    return () => observers.forEach((obs) => obs.disconnect())
  }, [])

  const saveBarRef = useRef<HTMLDivElement>(null)

  const scrollTo = useCallback((key: Section) => {
    const el = sectionRefs[key].current
    const container = document.querySelector('[data-scroll-container]') as HTMLElement | null
    if (!el || !container) return
    const barH = saveBarRef.current?.offsetHeight ?? 48
    const elRect = el.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const target = container.scrollTop + (elRect.top - containerRect.top) - barH - 8
    container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  }, [])

  function parseGitRepoMappings(text: string): Record<string, string> {
    const out: Record<string, string> = {}
    for (const line of text.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq <= 0) continue
      const key = t.slice(0, eq).trim()
      const url = t.slice(eq + 1).trim()
      if (key && url) out[key] = url
    }
    return out
  }

  async function handleSave() {
    await window.config.set('pollInterval', pollInterval)
    await window.config.set('autoDeployOnGitChange', autoDeployOnGitChange)
    await window.config.set('gitRepositoryUrls', parseGitRepoMappings(gitRepoMappingsText))
    const favorites = await window.config.get('favoritePlans') as { planKey: string; projectKey: string; planName: string }[] | undefined
    if (favorites?.length) await window.poll.start(pollInterval, favorites)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const sectionMeta: Record<Section, { icon: React.ReactNode; label: string }> = {
    appearance: { icon: <Palette size={14} />, label: t('settings.section.appearance') },
    polling: { icon: <Timer size={14} />, label: t('settings.section.polling') },
    deployment: { icon: <GitBranch size={14} />, label: t('settings.section.deployment') },
    notifications: { icon: <Bell size={14} />, label: t('settings.section.notifications') },
  }

  return (
    <div style={styles.layout}>
      {/* Sidebar nav */}
      <nav style={styles.sidebar}>
        <div style={styles.sidebarLabel}>{t('settings.title')}</div>
        {SECTIONS.map((key) => {
          const meta = sectionMeta[key]
          const active = activeSection === key
          return (
            <button key={key} onClick={() => scrollTo(key)} style={styles.navItem(active)}>
              {meta.icon}
              {meta.label}
            </button>
          )
        })}
      </nav>

      {/* Content */}
      <div style={styles.content} data-scroll-container>
        <div ref={saveBarRef} style={styles.saveBar}>
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

        <div style={styles.contentInner}>
          {/* Appearance */}
          <div ref={sectionRefs.appearance} style={styles.sectionWrap}>
            <div style={styles.sectionTitle}><Palette size={16} />{t('settings.section.appearance')}</div>
            <div style={styles.card}>
              {/* Language */}
              <div style={{ marginBottom: 24 }}>
                <label style={styles.labelRow}>
                  <Globe size={14} />{t('settings.language')}
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['zh-CN', 'en-US'] as Locale[]).map((l) => (
                    <button key={l} onClick={() => setLocale(l)} style={styles.segBtn(locale === l)}>
                      {l === 'zh-CN' ? '中文' : 'English'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Theme */}
              <div>
                <label style={styles.labelRow}>
                  {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
                  {t('settings.theme')}
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['dark', 'light'] as const).map((th) => (
                    <button key={th} onClick={() => setTheme(th)} style={{
                      ...styles.segBtn(theme === th),
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      {th === 'dark' ? <Moon size={12} /> : <Sun size={12} />}
                      {t(`settings.theme.${th}`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Polling */}
          <div ref={sectionRefs.polling} style={styles.sectionWrap}>
            <div style={styles.sectionTitle}><Timer size={16} />{t('settings.section.polling')}</div>
            <div style={styles.card}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
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
                  fontSize: 14, fontWeight: 500, color: 'var(--text-primary)',
                  minWidth: 40, textAlign: 'right', fontFamily: 'ui-monospace, monospace',
                }}>
                  {pollInterval}s
                </span>
              </div>
              <div style={styles.hint}>{t('settings.poll_interval.hint')}</div>
            </div>
          </div>

          {/* Deployment */}
          <div ref={sectionRefs.deployment} style={styles.sectionWrap}>
            <div style={styles.sectionTitle}><GitBranch size={16} />{t('settings.section.deployment')}</div>
            <div style={styles.card}>
              <div style={{ marginBottom: 24 }}>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', cursor: 'pointer',
                }}>
                  <input
                    type="checkbox"
                    checked={autoDeployOnGitChange}
                    onChange={(e) => setAutoDeployOnGitChange(e.target.checked)}
                    style={{ accentColor: 'var(--accent)', width: 16, height: 16 }}
                  />
                  {t('settings.auto_deploy_git')}
                </label>
                <div style={{ ...styles.hint, marginLeft: 26 }}>
                  {t('settings.auto_deploy_git.hint')}
                </div>
              </div>

              {autoDeployOnGitChange && (
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    {t('settings.git_repo_mappings')}
                  </label>
                  <textarea
                    value={gitRepoMappingsText}
                    onChange={(e) => setGitRepoMappingsText(e.target.value)}
                    placeholder={t('settings.git_repo_mappings.placeholder')}
                    rows={5}
                    style={{
                      width: '100%', boxSizing: 'border-box', padding: '10px 12px',
                      borderRadius: 'var(--radius-md)', border: 'none',
                      boxShadow: 'var(--ring-border)',
                      background: 'var(--bg-surface)', color: 'var(--text-primary)',
                      fontSize: 12, fontFamily: 'ui-monospace, monospace', resize: 'vertical',
                      lineHeight: 1.5, outline: 'none',
                      transition: 'box-shadow 0.15s ease',
                    }}
                    onFocus={(e) => { e.target.style.boxShadow = 'var(--focus-ring), var(--shadow-subtle)' }}
                    onBlur={(e) => { e.target.style.boxShadow = 'var(--ring-border)' }}
                  />
                  <div style={styles.hint}>{t('settings.git_repo_mappings.hint')}</div>
                </div>
              )}
            </div>
          </div>

          {/* Notifications */}
          <div ref={sectionRefs.notifications} style={styles.sectionWrap}>
            <div style={styles.sectionTitle}><Bell size={16} />{t('settings.section.notifications')}</div>
            <div style={styles.card}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
                {t('settings.notifications')}
              </label>
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                {t('settings.notifications.hint')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
