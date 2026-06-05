import { useState, useEffect, useMemo, useRef, type CSSProperties } from 'react'
import { useI18n } from '../lib/i18n'
import { useNavigate } from './routes'
import StatusBadge from '../components/StatusBadge'
import LoadingSpinner from '../components/LoadingSpinner'
import { normalizePlanResults, pickPlanBuildResult, isBuildRunning, buildNumberFromResultKey } from '../lib/bamboo-build'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { BarChart3 } from 'lucide-react'

interface FavoritePlan {
  planKey: string; projectKey: string; planName: string
}

interface PlanSnapshot {
  planKey: string; planName: string
  buildResultKey: string; buildNumber: number
  buildState: string; lifeCycleState: string
  isRunning: boolean
  startTime?: number; buildDuration?: number; buildDurationInSeconds?: number
  buildReason?: string
}

interface TimelineEvent {
  key: string; planName: string; planKey: string
  buildNumber: number; buildState: string
  startTime?: number; duration?: number
}

const CHART_COLORS = {
  success: '#4ade80',
  failed: '#f87171',
  muted: '#a1a1aa',
  blue: '#60a5fa',
  purple: '#a78bfa',
  amber: '#fbbf24',
  palette: ['#60a5fa', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#818cf8', '#fb923c', '#2dd4bf'],
}

const STATUS_COLORS: Record<string, string> = {
  Successful: CHART_COLORS.success,
  Failed: CHART_COLORS.failed,
  Unknown: CHART_COLORS.muted,
  'In Progress': CHART_COLORS.blue,
}

const tooltipStyle = {
  background: 'var(--bg-elevated)',
  border: 'none',
  borderRadius: 8,
  fontSize: 12,
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  padding: '8px 12px',
}

const axisTick = { fontSize: 11, fill: 'var(--text-quaternary)' }

function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return { ref, visible }
}

function RevealSection({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const { ref, visible } = useScrollReveal()
  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(24px)',
        transition: `opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  )
}

export default function Overview() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [favorites, setFavorites] = useState<FavoritePlan[]>([])
  const [snapshots, setSnapshots] = useState<PlanSnapshot[]>([])
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const favs = (await window.config.get('favoritePlans') as FavoritePlan[]) ?? []
      if (cancelled) return
      setFavorites(favs)
      if (favs.length === 0) { setLoading(false); return }

      const snaps: PlanSnapshot[] = []
      const events: TimelineEvent[] = []

      await Promise.all(favs.map(async (fav) => {
        try {
          const raw = await window.bamboo.getPlanResults(fav.planKey)
          const list = normalizePlanResults(raw, fav.planKey)
          const pick = pickPlanBuildResult(list)
          if (pick) {
            const rawPick = raw.find((r: any) => r.buildResultKey === pick.buildResultKey) ?? {}
            snaps.push({
              planKey: fav.planKey, planName: fav.planName,
              buildResultKey: pick.buildResultKey,
              buildNumber: pick.buildNumber ?? buildNumberFromResultKey(pick.buildResultKey, fav.planKey),
              buildState: pick.buildState ?? 'Unknown',
              lifeCycleState: pick.lifeCycleState ?? '',
              isRunning: isBuildRunning(pick),
              startTime: rawPick.startTime, buildDuration: rawPick.buildDuration,
              buildDurationInSeconds: rawPick.buildDurationInSeconds,
              buildReason: rawPick.buildReason ?? rawPick.reason,
            })
          }
          for (const r of list.slice(0, 10)) {
            const rawItem = raw.find((x: any) => x.buildResultKey === r.buildResultKey) ?? {}
            events.push({
              key: r.buildResultKey, planName: fav.planName, planKey: fav.planKey,
              buildNumber: r.buildNumber ?? buildNumberFromResultKey(r.buildResultKey, fav.planKey),
              buildState: r.buildState ?? 'Unknown',
              startTime: rawItem.startTime,
              duration: rawItem.buildDurationInSeconds ?? (rawItem.buildDuration ? Math.round(rawItem.buildDuration / 1000) : undefined),
            })
          }
        } catch { /* ignore */ }
      }))

      if (cancelled) return
      snaps.sort((a, b) => (b.startTime ?? 0) - (a.startTime ?? 0))
      events.sort((a, b) => (b.startTime ?? 0) - (a.startTime ?? 0))
      setSnapshots(snaps)
      setTimeline(events.slice(0, 30))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of snapshots) {
      const label = s.buildState === 'Successful' ? 'Successful'
        : s.buildState === 'Failed' ? 'Failed'
        : s.isRunning ? 'In Progress' : 'Unknown'
      counts[label] = (counts[label] || 0) + 1
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value }))
  }, [snapshots])

  const durationData = useMemo(() => {
    return timeline
      .filter((e) => e.duration && e.duration > 0)
      .slice(0, 20)
      .reverse()
      .map((e) => ({
        name: `${e.planKey}-${e.buildNumber}`,
        duration: e.duration,
        state: e.buildState,
      }))
  }, [timeline])

  const planCountData = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const e of timeline) {
      counts[e.planName] = (counts[e.planName] || 0) + 1
    }
    return Object.entries(counts)
      .map(([name, value]) => ({ name: name.length > 16 ? name.slice(0, 14) + '…' : name, builds: value }))
      .sort((a, b) => b.builds - a.builds)
      .slice(0, 10)
  }, [timeline])

  if (loading) return <LoadingSpinner text={t('app.loading')} />

  if (favorites.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-quaternary)' }}>
        <div style={{ textAlign: 'center' }}>
          <BarChart3 size={40} style={{ marginBottom: 16, opacity: 0.4 }} />
          <div style={{ fontSize: 14, marginBottom: 8 }}>{t('overview.no_favorites')}</div>
          <div style={{ fontSize: 13 }}>{t('overview.no_favorites.hint')}</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', scrollBehavior: 'smooth' }}>
      <div style={{ maxWidth: 960, paddingBottom: 48 }}>
        <RevealSection>
          <h1 style={{ fontSize: 20, fontWeight: 510, color: 'var(--text-primary)', letterSpacing: '-0.24px', marginBottom: 24 }}>
            {t('overview.title')}
          </h1>
        </RevealSection>

        {/* Section 1: Recent Deploys */}
        <RevealSection delay={60}>
          <section style={{ marginBottom: 40 }}>
            <SectionTitle>{t('overview.last_deploys')}</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
              {snapshots.map((s, i) => (
                <HoverCard
                  key={s.buildResultKey}
                  delay={i * 40}
                  onClick={() => navigate({ page: 'build', buildResultKey: s.buildResultKey })}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                    <span style={{
                      fontSize: 13, fontWeight: 510, color: 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1,
                    }} title={s.planName}>{s.planName}</span>
                    <StatusBadge status={s.isRunning ? 'InProgress' : s.buildState} />
                  </div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>
                    <span style={{ fontFamily: 'monospace' }}>#{s.buildNumber}</span>
                    {s.buildDurationInSeconds && <span>{s.buildDurationInSeconds > 60 ? `${Math.floor(s.buildDurationInSeconds / 60)}m ${s.buildDurationInSeconds % 60}s` : `${s.buildDurationInSeconds}s`}</span>}
                    {s.startTime && <span>{new Date(s.startTime).toLocaleString()}</span>}
                  </div>
                </HoverCard>
              ))}
            </div>
          </section>
        </RevealSection>

        {/* Section 2: Timeline */}
        <RevealSection delay={120}>
          <section style={{ marginBottom: 40 }}>
            <SectionTitle>{t('overview.deploy_timeline')}</SectionTitle>
            <div className="card-surface" style={{ padding: 0, overflow: 'hidden' }}>
              {timeline.slice(0, 20).map((e, i) => (
                <div
                  key={`${e.key}-${i}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px',
                    borderBottom: i < Math.min(timeline.length, 20) - 1 ? '1px solid var(--border-subtle)' : 'none',
                    cursor: 'pointer', transition: 'background 0.15s ease',
                    opacity: 1, animation: `fadeSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) ${i * 30}ms both`,
                  }}
                  onClick={() => navigate({ page: 'build', buildResultKey: e.key })}
                  onMouseEnter={(ev) => { ev.currentTarget.style.background = 'var(--bg-elevated)' }}
                  onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent' }}
                >
                  <span style={{ fontSize: 11, color: 'var(--text-quaternary)', width: 140, flexShrink: 0, fontFamily: 'monospace' }}>
                    {e.startTime ? new Date(e.startTime).toLocaleString() : '—'}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.planName}>
                    {e.planName}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-quaternary)', fontFamily: 'monospace', flexShrink: 0 }}>
                    #{e.buildNumber}
                  </span>
                  <StatusBadge status={e.buildState === 'Successful' ? 'SUCCESS' : e.buildState === 'Failed' ? 'FAILED' : e.buildState} />
                  {e.duration && (
                    <span style={{ fontSize: 11, color: 'var(--text-quaternary)', width: 50, textAlign: 'right', flexShrink: 0 }}>
                      {e.duration > 60 ? `${Math.floor(e.duration / 60)}m${e.duration % 60}s` : `${e.duration}s`}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        </RevealSection>

        {/* Section 3: Charts */}
        <RevealSection delay={180}>
          <section>
            <SectionTitle>{t('overview.metrics')}</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>

              {/* Pie Chart — Status Distribution */}
              <div className="card-surface" style={{ padding: '20px 20px 16px' }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 16 }}>
                  {t('overview.status_dist')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                  <div style={{ width: 140, height: 140, flexShrink: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={statusData} dataKey="value"
                          cx="50%" cy="50%"
                          innerRadius={38} outerRadius={60}
                          paddingAngle={4} strokeWidth={0}
                        >
                          {statusData.map((entry) => (
                            <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? CHART_COLORS.muted} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [`${v}`, name]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minWidth: 0 }}>
                    {statusData.map((entry) => (
                      <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[entry.name] ?? CHART_COLORS.muted, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: 'var(--text-tertiary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{entry.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bar Chart — Duration Trend */}
              <div className="card-surface" style={{ padding: '20px 20px 12px' }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 16 }}>
                  {t('overview.duration_trend')}
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={durationData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                    <XAxis dataKey="name" tick={axisTick} interval="preserveStartEnd" axisLine={false} tickLine={false} />
                    <YAxis tick={axisTick} unit="s" width={36} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: 'var(--bg-elevated)', radius: 4 }} contentStyle={tooltipStyle} formatter={(v) => [`${v}s`, 'Duration']} />
                    <Bar dataKey="duration" radius={[4, 4, 0, 0]} maxBarSize={24}>
                      {durationData.map((entry, i) => (
                        <Cell key={i} fill={entry.state === 'Failed' ? CHART_COLORS.failed : entry.state === 'Successful' ? CHART_COLORS.success : CHART_COLORS.blue} opacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Bar Chart — Builds per Plan */}
              <div className="card-surface" style={{ padding: '20px 20px 12px' }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 16 }}>
                  {t('overview.plan_build_count')}
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={planCountData} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
                    <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} />
                    <YAxis
                      type="category" dataKey="name" width={80} axisLine={false} tickLine={false}
                      tick={{ ...axisTick, width: 72 }}
                    />
                    <Tooltip cursor={{ fill: 'var(--bg-elevated)', radius: 4 }} contentStyle={tooltipStyle} formatter={(v) => [`${v}`, 'Builds']} />
                    <Bar dataKey="builds" radius={[0, 4, 4, 0]} maxBarSize={16}>
                      {planCountData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS.palette[i % CHART_COLORS.palette.length]} opacity={0.8} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        </RevealSection>
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 14, fontWeight: 500, color: 'var(--text-primary)',
      letterSpacing: '-0.28px', marginBottom: 12,
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      {children}
    </div>
  )
}

function HoverCard({ onClick, delay = 0, children, style }: {
  onClick?: () => void; delay?: number; children: React.ReactNode; style?: CSSProperties
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      className="card-surface"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '12px 16px', cursor: onClick ? 'pointer' : 'default', overflow: 'hidden',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hovered
          ? '0 4px 16px rgba(0,0,0,0.12), var(--shadow-card)'
          : 'var(--shadow-card)',
        transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1), background 0.15s ease',
        animation: `fadeSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms both`,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
