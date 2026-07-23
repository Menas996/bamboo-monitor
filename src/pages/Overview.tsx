import { useState, useEffect, useMemo, useRef, type CSSProperties } from 'react'
import { useI18n } from '../lib/i18n'
import { useNavigate } from './routes'
import StatusBadge from '../components/StatusBadge'
import LoadingSpinner from '../components/LoadingSpinner'
import { normalizePlanResults, pickPlanBuildResult, isBuildRunning, buildNumberFromResultKey, statusBadgeKey, classifyBuildStatus } from '../lib/bamboo-build'
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
  buildNumber: number; buildState: string; lifeCycleState?: string
  startTime?: number; duration?: number
}

const CHART_COLORS = {
  success: '#4ade80',
  failed: '#f87171',
  muted: '#a1a1aa',
  blue: '#60a5fa',
  purple: '#a78bfa',
  amber: '#fbbf24',
}

const STATUS_COLORS: Record<string, string> = {
  Successful: CHART_COLORS.success,
  Failed: CHART_COLORS.failed,
  Unknown: CHART_COLORS.muted,
  'In Progress': CHART_COLORS.blue,
  Stopped: CHART_COLORS.muted,
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

function resolveDurationSeconds(raw: {
  buildDurationInSeconds?: number
  buildDuration?: number
  startTime?: number
  finishedDate?: number
}): number | undefined {
  if (typeof raw.buildDurationInSeconds === 'number' && raw.buildDurationInSeconds > 0) {
    return raw.buildDurationInSeconds
  }
  if (typeof raw.buildDuration === 'number' && raw.buildDuration > 0) {
    return Math.round(raw.buildDuration / 1000)
  }
  const { startTime, finishedDate } = raw
  if (startTime && finishedDate && finishedDate > startTime) {
    return Math.round((finishedDate - startTime) / 1000)
  }
  return undefined
}

function formatDurationSeconds(seconds: number): string {
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${seconds}s`
}

function statusLabel(kind: string): string {
  if (kind === 'Successful' || kind === 'SUCCESS' || kind === 'SUCCESSFUL') return 'Successful'
  if (kind === 'Failed' || kind === 'FAILED' || kind === 'FAILURE') return 'Failed'
  if (kind === 'InProgress' || kind === 'Queued') return 'In Progress'
  if (kind === 'Cancelled') return 'Stopped'
  return 'Unknown'
}

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
            const durationSeconds = resolveDurationSeconds(rawPick)
            snaps.push({
              planKey: fav.planKey, planName: fav.planName,
              buildResultKey: pick.buildResultKey,
              buildNumber: pick.buildNumber ?? buildNumberFromResultKey(pick.buildResultKey, fav.planKey),
              buildState: pick.buildState ?? 'Unknown',
              lifeCycleState: pick.lifeCycleState ?? '',
              isRunning: isBuildRunning(pick),
              startTime: rawPick.startTime, buildDuration: rawPick.buildDuration,
              buildDurationInSeconds: durationSeconds,
              buildReason: rawPick.buildReason ?? rawPick.reason,
            })
          }
          for (const r of list.slice(0, 10)) {
            const rawItem = raw.find((x: any) => x.buildResultKey === r.buildResultKey) ?? {}
            events.push({
              key: r.buildResultKey, planName: fav.planName, planKey: fav.planKey,
              buildNumber: r.buildNumber ?? buildNumberFromResultKey(r.buildResultKey, fav.planKey),
              buildState: r.buildState ?? 'Unknown',
              lifeCycleState: r.lifeCycleState ?? '',
              startTime: rawItem.startTime,
              duration: resolveDurationSeconds(rawItem),
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
      const label = statusLabel(statusBadgeKey(s))
      counts[label] = (counts[label] || 0) + 1
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value }))
  }, [snapshots])

  const healthKpis = useMemo(() => {
    const finished = timeline.filter((e) => {
      const kind = classifyBuildStatus(e)
      return kind === 'success' || kind === 'failed' || kind === 'cancelled'
    })
    const successCount = finished.filter((e) => classifyBuildStatus(e) === 'success').length
    const failedCount = finished.filter((e) => classifyBuildStatus(e) === 'failed').length
    const runningCount = snapshots.filter((s) => s.isRunning).length
    const durations = timeline.map((e) => e.duration).filter((d): d is number => typeof d === 'number' && d > 0)
    const avgDuration = durations.length
      ? Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length)
      : undefined
    return {
      sampleSize: finished.length,
      successRate: finished.length ? Math.round((successCount / finished.length) * 100) : undefined,
      failedCount,
      runningCount,
      avgDuration,
    }
  }, [timeline, snapshots])

  const durationData = useMemo(() => {
    return timeline
      .filter((e) => e.duration && e.duration > 0)
      .slice(0, 20)
      .reverse()
      .map((e) => ({
        name: `#${e.buildNumber}`,
        planName: e.planName,
        duration: e.duration as number,
        state: e.buildState,
      }))
  }, [timeline])

  const planSuccessData = useMemo(() => {
    const byPlan = new Map<string, { planName: string; success: number; total: number }>()
    for (const e of timeline) {
      const kind = classifyBuildStatus(e)
      if (kind !== 'success' && kind !== 'failed' && kind !== 'cancelled') continue
      const row = byPlan.get(e.planKey) ?? { planName: e.planName, success: 0, total: 0 }
      row.total += 1
      if (kind === 'success') row.success += 1
      byPlan.set(e.planKey, row)
    }
    return [...byPlan.entries()]
      .map(([planKey, row]) => ({
        planKey,
        planName: row.planName,
        rate: row.total ? Math.round((row.success / row.total) * 100) : 0,
        success: row.success,
        total: row.total,
      }))
      .sort((a, b) => a.rate - b.rate || b.total - a.total)
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
    <div style={{ height: '100%', overflow: 'auto', scrollBehavior: 'smooth', padding: '4px' }}>
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
                    <StatusBadge status={statusBadgeKey(s)} />
                  </div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-tertiary)', minWidth: 0, overflow: 'hidden' }}>
                    <span style={{ fontFamily: 'monospace', flexShrink: 0 }}>#{s.buildNumber}</span>
                    {s.buildDurationInSeconds && <span style={{ flexShrink: 0 }}>{formatDurationSeconds(s.buildDurationInSeconds)}</span>}
                    {s.startTime && <span className="truncate" style={{ flex: '1 1 auto', textAlign: 'right' }}>{new Date(s.startTime).toLocaleString()}</span>}
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
            <div className="card-surface" style={{ padding: 0, borderRadius: 'var(--radius-lg)' }}>
              {timeline.slice(0, 20).map((e, i) => (
                <div
                  key={`${e.key}-${i}`}
                  className="scroll-row"
                  style={{
                    gap: 12, padding: '8px 16px',
                    borderRadius: i === 0 ? 'var(--radius-lg) var(--radius-lg) 0 0' : i === Math.min(timeline.length, 20) - 1 ? '0 0 var(--radius-lg) var(--radius-lg)' : 0,
                    borderBottom: i < Math.min(timeline.length, 20) - 1 ? '1px solid var(--border-subtle)' : 'none',
                    cursor: 'pointer', transition: 'background 0.15s ease',
                    opacity: 1, animation: `fadeSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) ${i * 30}ms both`,
                  }}
                  onClick={() => navigate({ page: 'build', buildResultKey: e.key })}
                  onMouseEnter={(ev) => { ev.currentTarget.style.background = 'var(--bg-elevated)' }}
                  onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent' }}
                >
                  <span className="scroll-row__meta" style={{ fontSize: 11, color: 'var(--text-quaternary)', flex: '0 1 140px', maxWidth: 160, fontFamily: 'monospace' }}>
                    {e.startTime ? new Date(e.startTime).toLocaleString() : '—'}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.planName}>
                    {e.planName}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-quaternary)', fontFamily: 'monospace', flexShrink: 0 }}>
                    #{e.buildNumber}
                  </span>
                  <span style={{ flexShrink: 0 }}><StatusBadge status={statusBadgeKey(e)} /></span>
                  {e.duration && (
                    <span style={{ fontSize: 11, color: 'var(--text-quaternary)', width: 50, textAlign: 'right', flexShrink: 0 }}>
                      {formatDurationSeconds(e.duration)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        </RevealSection>

        {/* Section 3: Metrics */}
        <RevealSection delay={180}>
          <section>
            <SectionTitle>{t('overview.metrics')}</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
              <KpiCard
                label={t('overview.kpi_success_rate')}
                value={healthKpis.successRate != null ? `${healthKpis.successRate}%` : '—'}
                hint={healthKpis.sampleSize ? t('overview.kpi_sample').replace('{count}', String(healthKpis.sampleSize)) : t('overview.chart_empty')}
              />
              <KpiCard
                label={t('overview.kpi_avg_duration')}
                value={healthKpis.avgDuration != null ? formatDurationSeconds(healthKpis.avgDuration) : '—'}
                hint={t('overview.kpi_avg_duration_hint')}
              />
              <KpiCard
                label={t('overview.kpi_failed')}
                value={String(healthKpis.failedCount)}
                hint={t('overview.kpi_failed_hint')}
                accent={healthKpis.failedCount > 0 ? CHART_COLORS.failed : undefined}
              />
              <KpiCard
                label={t('overview.kpi_running')}
                value={String(healthKpis.runningCount)}
                hint={t('overview.kpi_running_hint')}
                accent={healthKpis.runningCount > 0 ? CHART_COLORS.blue : undefined}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
              <div className="card-surface" style={{ padding: '20px 20px 16px' }}>
                <ChartTitle title={t('overview.status_dist')} hint={t('overview.status_dist_hint')} />
                {statusData.length === 0 ? (
                  <EmptyChart />
                ) : (
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
                )}
              </div>

              <div className="card-surface" style={{ padding: '20px 20px 12px' }}>
                <ChartTitle title={t('overview.duration_trend')} hint={t('overview.duration_trend_hint')} />
                {durationData.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={durationData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                      <XAxis dataKey="name" tick={axisTick} interval="preserveStartEnd" axisLine={false} tickLine={false} />
                      <YAxis tick={axisTick} unit="s" width={36} axisLine={false} tickLine={false} />
                      <Tooltip
                        cursor={{ fill: 'var(--bg-elevated)', radius: 4 }}
                        contentStyle={tooltipStyle}
                        formatter={(v) => [`${v}s`, t('build.duration')]}
                        labelFormatter={(_, payload) => {
                          const row = payload?.[0]?.payload as { planName?: string; name?: string } | undefined
                          return row?.planName ? `${row.planName} ${row.name ?? ''}` : String(payload?.[0]?.payload?.name ?? '')
                        }}
                      />
                      <Bar dataKey="duration" radius={[4, 4, 0, 0]} maxBarSize={24}>
                        {durationData.map((entry, i) => {
                          const kind = classifyBuildStatus({ buildState: entry.state })
                          const fill = kind === 'failed' ? CHART_COLORS.failed : kind === 'success' ? CHART_COLORS.success : CHART_COLORS.blue
                          return <Cell key={i} fill={fill} opacity={0.85} />
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="card-surface" style={{ padding: '20px 20px 16px' }}>
                <ChartTitle title={t('overview.plan_success_rate')} hint={t('overview.plan_success_rate_hint')} />
                {planSuccessData.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {planSuccessData.map((row) => (
                      <div key={row.planKey} style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                          <span
                            style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            title={row.planName}
                          >
                            {row.planName}
                          </span>
                          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                            {row.rate}% · {row.success}/{row.total}
                          </span>
                        </div>
                        <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${row.rate}%`,
                              height: '100%',
                              borderRadius: 999,
                              background: row.rate >= 80 ? CHART_COLORS.success : row.rate >= 50 ? CHART_COLORS.amber : CHART_COLORS.failed,
                              transition: 'width 0.35s ease',
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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

function ChartTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>{title}</div>
      <div style={{ fontSize: 11, color: 'var(--text-quaternary)', marginTop: 4, lineHeight: 1.4 }}>{hint}</div>
    </div>
  )
}

function EmptyChart() {
  const { t } = useI18n()
  return (
    <div style={{
      height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, color: 'var(--text-quaternary)',
    }}>
      {t('overview.chart_empty')}
    </div>
  )
}

function KpiCard({ label, value, hint, accent }: {
  label: string; value: string; hint: string; accent?: string
}) {
  return (
    <div className="card-surface" style={{ padding: '14px 16px', minWidth: 0 }}>
      <div style={{ fontSize: 11, color: 'var(--text-quaternary)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 560, letterSpacing: '-0.4px', color: accent ?? 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-quaternary)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {hint}
      </div>
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
        padding: '12px 16px', cursor: onClick ? 'pointer' : 'default',
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
