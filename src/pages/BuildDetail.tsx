import { useState, useEffect, useRef } from 'react'
import { useI18n } from '../lib/i18n'
import { useNavigate, useGoBack } from './routes'
import {
  collectChanges, isBuildRunning, shouldShowDeployProgress, computeDeployProgress, asArray,
  normalizePlanResults, pickPlanBuildResult, pickFallbackBuildForDelete,
  buildNumberFromResultKey, statusBadgeKey, isCancelledOrStopped,
  planKeyFromBuildResultKey, resolveActiveBuildKey,
  type NormalizedChange, type PlanBuildSnapshot,
} from '../lib/bamboo-build'
import StatusBadge from '../components/StatusBadge'
import BuildHistoryStrip from '../components/BuildHistoryStrip'
import LoadingSpinner from '../components/LoadingSpinner'
import {
  ArrowLeft, GitCommit, Clock, User, Layers, AlertTriangle,
  FileText, Box, List, MoreVertical, RefreshCw, Play, Trash2,
  Bug, ToggleLeft, Star, Settings, Tag, Check, X, ExternalLink, GitBranch,
  Ban, RotateCw, Activity,
} from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { isSafeHttpUrl } from '../lib/safe-url'

function openValidatedLink(href: string) {
  if (isSafeHttpUrl(href)) {
    window.open(href, '_blank', 'noopener,noreferrer')
    return
  }
  if (href.startsWith('/')) {
    void window.actions.openUrl(href)
  }
}

const DETAIL_POLL_MS_RUNNING = 5000
const LIVE_DETAIL_TABS = new Set(['summary', 'stages', 'tests'])

function formatDuration(ms?: number): string {
  if (!ms) return '-'
  const sec = Math.floor(ms / 1000)
  const min = Math.floor(sec / 60)
  return min > 0 ? `${min}m ${sec % 60}s` : `${sec}s`
}

function extractText(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim() || '-'
}

interface JiraIssue {
  key: string
  summary?: string
  url?: string
  issueStatus?: { name: string }
}

interface BuildDetailData {
  buildResultKey: string
  buildState: string
  buildNumber: number
  buildCompletedDate?: number
  buildDuration?: number
  startTime?: number
  lifeCycleState: string
  buildReason: string
  planName?: string
  plan?: {
    key: string
    name: string
    description?: string
    stages?: { stage: any[] }
  }
  stages?: { stage: any[] }
  projectName: string
  changes?: { change: any[] }
  vcsRevisions?: { vcsRevision: any[] }
  variables?: { variable: any[] }
  artifacts?: { artifact: any[] }
  jiraIssues?: { jiraIssue: JiraIssue[] }
  successfulTestCount?: number
  failedTestCount?: number
  skippedTestCount?: number
  [key: string]: any
}

interface BuildDetailProps {
  buildResultKey: string
}

export default function BuildDetail({ buildResultKey }: BuildDetailProps) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const goBack = useGoBack()
  const [detail, setDetail] = useState<BuildDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'summary' | 'stages' | 'changes' | 'variables' | 'tests' | 'history' | 'jira' | 'deployments'>('summary')
  const [planResults, setPlanResults] = useState<any[]>([])
  const [planResultsLoading, setPlanResultsLoading] = useState(false)
  const [planHistoryHasMore, setPlanHistoryHasMore] = useState(false)
  const [planHistoryLoadingMore, setPlanHistoryLoadingMore] = useState(false)
  const [planHistoryOffset, setPlanHistoryOffset] = useState(0)
  const HISTORY_PAGE_SIZE = 20
  const [actionsOpen, setActionsOpen] = useState(false)
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [customVars, setCustomVars] = useState<{ key: string; value: string }[]>([{ key: '', value: '' }])
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [liveSnapshot, setLiveSnapshot] = useState<PlanBuildSnapshot | null>(null)
  const [stripBuilds, setStripBuilds] = useState<PlanBuildSnapshot[]>([])
  const [stopping, setStopping] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)
  const [transitioning, setTransitioning] = useState(false)
  const pendingDeleteRef = useRef<string | null>(null)
  const deletedBuildKeysRef = useRef<Set<string>>(new Set())
  const seamlessNavRef = useRef(false)
  const prevBuildKeyRef = useRef<string | null>(null)
  const prevPickRunningRef = useRef(false)
  const detailRef = useRef<BuildDetailData | null>(null)
  detailRef.current = detail
  const liveSnapshotRef = useRef<PlanBuildSnapshot | null>(null)
  liveSnapshotRef.current = liveSnapshot
  const activeTabRef = useRef(activeTab)
  activeTabRef.current = activeTab
  const detailPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const actionsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setActionsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function showMsg(type: 'success' | 'error', text: string) {
    setActionMsg({ type, text })
    setTimeout(() => setActionMsg(null), 4000)
  }

  async function handleStopCurrent() {
    setStopping(true)
    setActionsOpen(false)
    try {
      const result = await window.actions.stopBuild(buildResultKey)
      if (result.success) {
        showMsg('success', t('deploy.stop_success'))
        setHistoryRefreshKey((k) => k + 1)
        try {
          const raw = await window.bamboo.getPlanResults(planKeyFromBuildResultKey(buildResultKey))
          setStripBuilds(normalizePlanResults(raw, planKeyFromBuildResultKey(buildResultKey)))
          const fresh = await window.bamboo.getBuildDetail(buildResultKey)
          if (fresh) setDetail(fresh)
        } catch {
          /* refresh on next poll */
        }
      } else {
        showMsg('error', result.errorMessage || t('deploy.stop_failed'))
      }
    } catch {
      showMsg('error', t('deploy.stop_failed'))
    } finally {
      setStopping(false)
    }
  }

  async function handleQueueBuild(variables?: Record<string, string>) {
    const planKey = detail?.plan?.key ?? planKeyFromBuildResultKey(buildResultKey)
    if (!planKey) return
    const result = await window.actions.queueBuild(planKey, variables)
    if (result.success) {
      showMsg('success', `Build queued for ${planKey}`)
      let targetKey = result.buildResultKey ?? null
      if (!targetKey) {
        try {
          const raw = await window.bamboo.getPlanResults(planKey)
          const pick = pickPlanBuildResult(normalizePlanResults(raw, planKey))
          targetKey = resolveActiveBuildKey(buildResultKey, planKey, pick)
        } catch {
          /* poll on next tick */
        }
      }
      if (targetKey && targetKey !== buildResultKey) {
        seamlessNavRef.current = true
        setLiveSnapshot({
          buildResultKey: targetKey,
          buildState: 'Unknown',
          lifeCycleState: 'Queued',
          buildNumber: buildNumberFromResultKey(targetKey, planKey),
        })
        navigate({ page: 'build', buildResultKey: targetKey })
      }
    } else {
      showMsg('error', `Failed to queue build for ${planKey}`)
    }
    setActionsOpen(false)
    setCustomizeOpen(false)
  }

  async function executeDelete(keyToDelete: string) {
    setDeleting(true)
    const ok = await window.actions.deleteBuildResult(keyToDelete)
    setDeleting(false)
    if (ok) {
      deletedBuildKeysRef.current.add(keyToDelete)
      showMsg('success', t('build.delete_success'))
      setHistoryRefreshKey((k) => k + 1)
      try {
        const d = await window.bamboo.getBuildDetail(buildResultKey)
        setDetail(d)
        setLoading(false)
        setTransitioning(false)
      } catch {
        /* keep current view; poll will retry */
      }
    } else {
      showMsg('error', t('build.delete_failed'))
    }
  }

  useEffect(() => {
    const pending = pendingDeleteRef.current
    if (!pending || buildResultKey === pending) return

    void (async () => {
      await executeDelete(pending)
      pendingDeleteRef.current = null
    })()
  }, [buildResultKey])

  async function handleRemoveResult() {
    setConfirmRemove(false)
    setActionsOpen(false)

    const keyToDelete = buildResultKey
    const planKey = detail?.plan?.key ?? planKeyFromBuildResultKey(buildResultKey)

    let fallback: PlanBuildSnapshot | null = null
    try {
      const raw = await window.bamboo.getPlanResults(planKey)
      fallback = pickFallbackBuildForDelete(normalizePlanResults(raw, planKey), keyToDelete)
    } catch {
      /* ignore */
    }

    if (fallback?.buildResultKey) {
      deletedBuildKeysRef.current.add(keyToDelete)
      const fbNum = fallback.buildNumber ?? buildNumberFromResultKey(fallback.buildResultKey, planKey)
      setLiveSnapshot({
        buildResultKey: fallback.buildResultKey,
        buildNumber: fbNum,
        buildState: fallback.buildState,
        lifeCycleState: fallback.lifeCycleState,
      })
      showMsg('success', t('build.delete_switching'))
      seamlessNavRef.current = true
      pendingDeleteRef.current = keyToDelete
      navigate({ page: 'build', buildResultKey: fallback.buildResultKey })
      return
    }

    showMsg('error', t('build.delete_only_result'))
  }

  function handleOpenBamboo(path: string) {
    window.actions.openUrl(path)
    setActionsOpen(false)
  }

  function openCustomize() {
    setActionsOpen(false)
    setCustomizeOpen(true)
  }

  function addCustomVar() {
    setCustomVars((prev) => [...prev, { key: '', value: '' }])
  }

  function updateCustomVar(i: number, field: 'key' | 'value', val: string) {
    setCustomVars((prev) => prev.map((v, idx) => idx === i ? { ...v, [field]: val } : v))
  }

  function removeCustomVar(i: number) {
    setCustomVars((prev) => prev.filter((_, idx) => idx !== i))
  }

  function submitCustomized() {
    const vars: Record<string, string> = {}
    for (const v of customVars) {
      if (v.key.trim()) vars[v.key.trim()] = v.value
    }
    handleQueueBuild(Object.keys(vars).length ? vars : undefined)
  }

  useEffect(() => {
    prevPickRunningRef.current = false
  }, [buildResultKey])

  useEffect(() => {
    let cancelled = false
    const routePlanKey = planKeyFromBuildResultKey(buildResultKey)

    function clearDetailPoll() {
      if (detailPollTimerRef.current) {
        clearInterval(detailPollTimerRef.current)
        detailPollTimerRef.current = null
      }
    }

    function shouldPollRunning(): boolean {
      const d = detailRef.current
      const snap = liveSnapshotRef.current
      return !!(d && (isBuildRunning(d) || (snap && isBuildRunning(snap))))
    }

    function syncDetailPoll() {
      clearDetailPoll()
      if (!shouldPollRunning()) return
      detailPollTimerRef.current = setInterval(() => {
        void refresh(false)
      }, DETAIL_POLL_MS_RUNNING)
    }

    async function refresh(isInitial: boolean) {
      const planKey = routePlanKey
      const prevKey = prevBuildKeyRef.current
      const samePlanSwitch = prevKey != null
        && prevKey !== buildResultKey
        && planKeyFromBuildResultKey(prevKey) === planKey
      const seamless = seamlessNavRef.current || (samePlanSwitch && detailRef.current != null)
      const tab = activeTabRef.current
      let fetchDetail = isInitial || LIVE_DETAIL_TABS.has(tab)

      if (isInitial) {
        if (seamless) {
          setTransitioning(true)
          seamlessNavRef.current = false
        } else if (prevKey === null) {
          setLoading(true)
          setDetail(null)
        } else {
          setTransitioning(true)
        }
      }

      let activeKey = buildResultKey

      try {
        const raw = await window.bamboo.getPlanResults(planKey)
        const pendingDelete = pendingDeleteRef.current
        const fullList = normalizePlanResults(raw, planKey)
        for (const k of [...deletedBuildKeysRef.current]) {
          if (!fullList.some((r) => r.buildResultKey === k)) {
            deletedBuildKeysRef.current.delete(k)
          }
        }
        const skipKeys = new Set(deletedBuildKeysRef.current)
        if (pendingDelete) skipKeys.add(pendingDelete)
        const list = fullList.filter((r) => !skipKeys.has(r.buildResultKey))
        if (!cancelled) setStripBuilds(list)
        const pick = pickPlanBuildResult(list)
        const pickRunning = !!(pick && isBuildRunning(pick))
        if (!fetchDetail && prevPickRunningRef.current && !pickRunning && pick?.buildResultKey === buildResultKey) {
          fetchDetail = true
        }
        prevPickRunningRef.current = pickRunning
        if (pendingDelete) {
          activeKey = buildResultKey
        } else {
          const currentInList = list.find((r) => r.buildResultKey === buildResultKey)
          const viewingRunning = currentInList
            ? isBuildRunning(currentInList)
            : !!(detailRef.current && isBuildRunning(detailRef.current))
          const shouldFollowActive = viewingRunning && !!pick && isBuildRunning(pick)

          if (shouldFollowActive) {
            activeKey = resolveActiveBuildKey(buildResultKey, planKey, pick, skipKeys)
            if (!cancelled) setLiveSnapshot(pick.buildResultKey === activeKey ? pick : null)
            if (!cancelled && activeKey !== buildResultKey && !skipKeys.has(activeKey)) {
              seamlessNavRef.current = true
              navigate({ page: 'build', buildResultKey: activeKey })
              return
            }
          } else {
            activeKey = buildResultKey
            if (!cancelled) {
              setLiveSnapshot(
                pick?.buildResultKey === buildResultKey && isBuildRunning(pick) ? pick : null
              )
            }
          }
        }
      } catch {
        /* use route key */
      }

      if (!fetchDetail) {
        if (!cancelled) syncDetailPoll()
        return
      }

      try {
        const d = await window.bamboo.getBuildDetail(activeKey)
        if (cancelled) return
        setDetail(d)
        if (!cancelled) {
          setLoading(false)
          setTransitioning(false)
          prevBuildKeyRef.current = buildResultKey
          syncDetailPoll()
        }
      } catch {
        if (!cancelled) {
          setLoading(false)
          setTransitioning(false)
          syncDetailPoll()
        }
      }
    }

    void refresh(true)

    return () => {
      cancelled = true
      clearDetailPoll()
    }
  }, [buildResultKey, navigate])

  useEffect(() => {
    const planKey = detail?.plan?.key ?? planKeyFromBuildResultKey(buildResultKey)
    if (!planKey) return
    if (activeTab !== 'history' && historyRefreshKey === 0) return

    let cancelled = false

    async function loadHistory() {
      setPlanResultsLoading(true)
      setPlanHistoryOffset(0)
      try {
        const { rows, hasMore } = await window.bamboo.getPlanResultsHistoryPage(
          planKey,
          0,
          HISTORY_PAGE_SIZE
        )
        if (!cancelled) {
          setPlanResults(rows)
          setPlanHistoryHasMore(hasMore)
          setPlanHistoryOffset(HISTORY_PAGE_SIZE)
        }
      } catch {
        if (!cancelled) {
          setPlanResults([])
          setPlanHistoryHasMore(false)
        }
      } finally {
        if (!cancelled) setPlanResultsLoading(false)
      }
    }

    void loadHistory()
    return () => {
      cancelled = true
    }
  }, [activeTab, buildResultKey, detail?.plan?.key, historyRefreshKey])

  async function loadMorePlanHistory() {
    const planKey = detail?.plan?.key ?? planKeyFromBuildResultKey(buildResultKey)
    if (!planKey || planHistoryLoadingMore || !planHistoryHasMore) return
    setPlanHistoryLoadingMore(true)
    const start = planHistoryOffset
    try {
      const { rows, hasMore } = await window.bamboo.getPlanResultsHistoryPage(
        planKey,
        start,
        HISTORY_PAGE_SIZE
      )
      setPlanResults((prev) => {
        const seen = new Set(prev.map((r) => r.buildResultKey))
        const merged = [...prev]
        for (const row of rows) {
          if (row.buildResultKey && !seen.has(row.buildResultKey)) {
            seen.add(row.buildResultKey)
            merged.push(row)
          }
        }
        return merged
      })
      setPlanHistoryHasMore(hasMore)
      setPlanHistoryOffset(start + HISTORY_PAGE_SIZE)
    } finally {
      setPlanHistoryLoadingMore(false)
    }
  }

  const prevTabRef = useRef(activeTab)
  useEffect(() => {
    const prev = prevTabRef.current
    prevTabRef.current = activeTab
    if (prev === activeTab) return
    if (!LIVE_DETAIL_TABS.has(activeTab)) return

    const d = detailRef.current
    const snap = liveSnapshotRef.current
    if (!d || (!isBuildRunning(d) && !(snap && isBuildRunning(snap)))) return

    let cancelled = false
    void (async () => {
      try {
        const fresh = await window.bamboo.getBuildDetail(buildResultKey)
        if (!cancelled) setDetail(fresh)
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeTab, buildResultKey])

  if (loading && !detail) {
    return <LoadingSpinner text={t('app.loading')} />
  }

  if (!detail) {
    return (
      <div style={{ padding: 32 }}>
        <button className="btn-ghost" onClick={goBack} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
          <ArrowLeft size={14} /> Back
        </button>
        <div style={{ color: 'var(--text-tertiary)' }}>Build not found</div>
      </div>
    )
  }

  const routePlanKey = planKeyFromBuildResultKey(buildResultKey)
  const displayDetail: BuildDetailData = (() => {
    const planKey = detail.plan?.key ?? routePlanKey
    if (detail.buildResultKey !== buildResultKey) {
      const snap = liveSnapshot?.buildResultKey === buildResultKey ? liveSnapshot : null
      return {
        ...detail,
        buildResultKey,
        buildNumber: buildNumberFromResultKey(buildResultKey, planKey),
        buildState: snap?.buildState ?? detail.buildState,
        lifeCycleState: snap?.lifeCycleState ?? detail.lifeCycleState,
      }
    }
    if (
      transitioning
      && liveSnapshot?.buildResultKey === buildResultKey
    ) {
      const overlayStatus = isBuildRunning(liveSnapshot) && isBuildRunning(detail)
      return {
        ...detail,
        buildResultKey: liveSnapshot.buildResultKey,
        ...(overlayStatus
          ? { buildState: liveSnapshot.buildState, lifeCycleState: liveSnapshot.lifeCycleState }
          : {}),
        buildNumber: liveSnapshot.buildNumber ?? buildNumberFromResultKey(buildResultKey, planKey),
      }
    }
    return detail
  })()

  const stages = asArray(displayDetail.stages?.stage ?? displayDetail.plan?.stages?.stage)
  const normalizedChanges = collectChanges(displayDetail as unknown as Record<string, unknown>)
  const deploying = (transitioning && liveSnapshot?.buildResultKey === buildResultKey)
    ? isBuildRunning(liveSnapshot)
    : shouldShowDeployProgress(displayDetail)
  const displayBuildNumber = buildNumberFromResultKey(buildResultKey, routePlanKey)
    || (detail.buildResultKey === buildResultKey ? detail.buildNumber : 0)
  const jiraCount = detail.jiraIssues?.jiraIssue?.length ?? 0
  const tabs = [
    { key: 'summary', label: 'Summary' },
    { key: 'stages', label: `Stages (${stages.length})` },
    { key: 'jira', label: `Jira (${jiraCount})` },
    { key: 'changes', label: `Changes (${normalizedChanges.length})` },
    { key: 'variables', label: `Config (${detail.variables?.variable?.length ?? 0})` },
    { key: 'tests', label: 'Tests' },
    { key: 'deployments', label: `Deployments` },
    { key: 'history', label: `History` },
  ] as const

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column', position: 'relative',
      opacity: transitioning ? 0.92 : 1,
      transition: 'opacity 0.28s ease',
      minWidth: 0,
    }}>
      {transitioning && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2, overflow: 'hidden', zIndex: 20,
          background: 'var(--border-subtle)',
        }}>
          <div style={{
            height: '100%', width: '35%', background: 'linear-gradient(90deg, transparent, var(--accent), transparent)',
            animation: 'detailBar 1.1s ease-in-out infinite',
          }} />
        </div>
      )}
      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <button
          onClick={goBack}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
            color: 'var(--text-tertiary)', fontSize: 13, cursor: 'pointer', marginBottom: 12,
            fontFamily: 'inherit', fontFeatureSettings: '"cv01", "ss03"', padding: 0,
          }}
        >
          <ArrowLeft size={14} /> {t('nav.dashboard')}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', minWidth: 0 }}>
          <div style={{ minWidth: 0, flex: '1 1 200px' }}>
            <h1 className="truncate" style={{ fontSize: 20, fontWeight: 510, color: 'var(--text-primary)', letterSpacing: '-0.24px' }} title={detail.planName ?? detail.plan?.name ?? buildResultKey}>
              {detail.planName ?? detail.plan?.name ?? buildResultKey}
            </h1>
            <p className="truncate" style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>
              {displayDetail.projectName} — #{displayBuildNumber}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
            {actionMsg && (
              <span style={{
                fontSize: 12, padding: '4px 10px', borderRadius: 'var(--radius-pill)',
                background: actionMsg.type === 'success' ? 'rgba(39,166,68,0.15)' : 'rgba(239,68,68,0.15)',
                color: actionMsg.type === 'success' ? 'var(--success)' : 'var(--error)',
                display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
              }}>
                {actionMsg.type === 'success' ? <Check size={11} /> : <X size={11} />}
                {actionMsg.text}
              </span>
            )}
            <StatusBadge status={statusBadgeKey(displayDetail)} />
            {deploying && (
              <button
                onClick={() => void handleStopCurrent()}
                disabled={stopping}
                className="btn-ghost"
                style={{
                  padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13,
                  color: 'var(--error)', opacity: stopping ? 0.6 : 1,
                }}
              >
                <Ban size={14} /> {stopping ? '…' : t('deploy.stop')}
              </button>
            )}
            <div ref={actionsRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setActionsOpen(!actionsOpen)}
                className="btn-ghost"
                style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}
              >
                <MoreVertical size={14} /> Actions
              </button>
              {actionsOpen && (
                <div style={{
                  position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 50,
                  minWidth: 220, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-lg)', padding: '6px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                }}>
                  <DropdownLabel>Build</DropdownLabel>
                  {deploying && (
                    <DropdownItem
                      icon={Ban}
                      label={t('deploy.stop')}
                      onClick={() => void handleStopCurrent()}
                      danger
                    />
                  )}
                  <DropdownItem icon={RefreshCw} label="Rerun this build" onClick={() => handleQueueBuild()} />
                  <DropdownItem icon={Play} label="Run plan" onClick={() => handleQueueBuild()} />
                  <DropdownItem icon={Settings} label="Run customized..." onClick={openCustomize} />
                  <DropdownDivider />
                  <DropdownItem icon={Trash2} label="Remove this result" onClick={() => setConfirmRemove(true)} danger />
                  <DropdownItem icon={Bug} label="Create issue" onClick={() => handleOpenBamboo(`/browse/${buildResultKey}`)} />
                  <DropdownDivider />
                  <DropdownLabel>Plan</DropdownLabel>
                  <DropdownItem icon={ToggleLeft} label="Disable plan" onClick={() => handleOpenBamboo(`/browse/${detail.plan?.key ?? ''}`)} />
                  <DropdownItem icon={Star} label="Favourite plan" onClick={() => handleOpenBamboo(`/browse/${detail.plan?.key ?? ''}`)} />
                  <DropdownItem icon={Settings} label="Configure plan" onClick={() => handleOpenBamboo(`/browse/${detail.plan?.key ?? ''}`)} />
                  <DropdownItem icon={Tag} label="Modify plan label" onClick={() => handleOpenBamboo(`/browse/${detail.plan?.key ?? ''}`)} />
                  <DropdownDivider />
                  <DropdownItem icon={ExternalLink} label="Open in Bamboo" onClick={() => handleOpenBamboo(`/browse/${buildResultKey}`)} />
                </div>
              )}
            </div>
          </div>
        </div>

        <BuildHistoryStrip
          builds={stripBuilds}
          currentKey={buildResultKey}
          planKey={routePlanKey}
          onSelect={(key) => navigate({ page: 'build', buildResultKey: key })}
        />

        {deploying && (
          <BuildDeployProgress detail={displayDetail} />
        )}

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: 0, marginTop: 16, borderBottom: '1px solid var(--border-subtle)',
          overflowX: 'auto', minWidth: 0, scrollbarWidth: 'none',
        }}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '8px 16px', background: 'none', border: 'none', borderBottom: `2px solid ${activeTab === tab.key ? 'var(--accent)' : 'transparent'}`,
                color: activeTab === tab.key ? 'var(--text-primary)' : 'var(--text-tertiary)',
                fontSize: 13, fontWeight: 510, fontFamily: 'inherit', fontFeatureSettings: '"cv01", "ss03"',
                cursor: 'pointer', transition: 'all 0.15s ease', flexShrink: 0, whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 24, minWidth: 0, minHeight: 0 }}>
        {activeTab === 'summary' && <SummaryTab detail={detail} />}
        {activeTab === 'stages' && <StagesTab stages={stages} buildResultKey={detail.buildResultKey} isFailed={detail.buildState === 'Failed'} />}
        {activeTab === 'jira' && <JiraTab jiraIssues={detail.jiraIssues?.jiraIssue ?? []} />}
        {activeTab === 'changes' && (
          <ChangesTab changes={normalizedChanges} vcs={detail.vcsRevisions?.vcsRevision ?? []} />
        )}
        {activeTab === 'variables' && <VariablesTab variables={detail.variables?.variable ?? []} artifacts={detail.artifacts?.artifact ?? []} />}
        {activeTab === 'tests' && <TestsTab detail={detail} />}
        {activeTab === 'deployments' && (
          <DeploymentsTab
            planKey={detail.plan?.key ?? routePlanKey}
            planName={detail.planName ?? detail.plan?.name ?? routePlanKey}
            currentBuildResultKey={buildResultKey}
            onNavigate={(key) => navigate({ page: 'build', buildResultKey: key })}
          />
        )}
        {activeTab === 'history' && (
          <HistoryTab
            results={planResults}
            loading={planResultsLoading}
            currentKey={buildResultKey}
            hasMore={planHistoryHasMore}
            loadingMore={planHistoryLoadingMore}
            onLoadMore={() => void loadMorePlanHistory()}
            onNavigate={(key) => navigate({ page: 'build', buildResultKey: key })}
          />
        )}
      </div>

      {/* Run Customized Modal */}
      {customizeOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.5)',
        }} onClick={() => setCustomizeOpen(false)}>
          <div className="card-surface" style={{
            width: 480, maxHeight: '80vh', overflow: 'auto', padding: 24,
          }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 16, fontWeight: 510, color: 'var(--text-primary)', marginBottom: 16 }}>
              Run Customized — {detail.plan?.key}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>
              Set custom build variables for this run.
            </p>
            {customVars.map((v, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <input
                  className="input-linear"
                  placeholder="Variable name"
                  value={v.key}
                  onChange={(e) => updateCustomVar(i, 'key', e.target.value)}
                  style={{ flex: 1, fontSize: 13, padding: '6px 10px' }}
                />
                <input
                  className="input-linear"
                  placeholder="Value"
                  value={v.value}
                  onChange={(e) => updateCustomVar(i, 'value', e.target.value)}
                  style={{ flex: 1, fontSize: 13, padding: '6px 10px' }}
                />
                <button onClick={() => removeCustomVar(i)} style={{
                  background: 'none', border: 'none', color: 'var(--text-quaternary)', cursor: 'pointer', padding: 4,
                }}>
                  <X size={14} />
                </button>
              </div>
            ))}
            <button onClick={addCustomVar} className="btn-ghost" style={{ fontSize: 12, padding: '4px 12px', marginBottom: 16 }}>
              + Add variable
            </button>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setCustomizeOpen(false)} style={{ fontSize: 13 }}>Cancel</button>
              <button className="btn-primary" onClick={submitCustomized} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <Play size={12} /> Run Build
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Remove */}
      {confirmRemove && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.5)',
        }} onClick={() => setConfirmRemove(false)}>
          <div className="card-surface" style={{ width: 380, padding: 24 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 16, fontWeight: 510, color: 'var(--text-primary)', marginBottom: 8 }}>
              Remove build result?
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 20 }}>
              This will permanently delete build result <strong>{buildResultKey}</strong>. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setConfirmRemove(false)} style={{ fontSize: 13 }}>Cancel</button>
              <button
                onClick={handleRemoveResult}
                disabled={deleting}
                style={{
                  background: 'var(--error)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)',
                  padding: '8px 16px', fontSize: 13, fontWeight: 510, fontFamily: 'inherit',
                  cursor: deleting ? 'wait' : 'pointer', opacity: deleting ? 0.7 : 1,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <Trash2 size={12} /> {deleting ? '…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function BuildDeployProgress({ detail }: { detail: BuildDetailData }) {
  const { t } = useI18n()
  const { percent, currentStage, completedStages, totalStages } = computeDeployProgress(
    detail as unknown as Record<string, unknown>
  )
  const running = shouldShowDeployProgress(detail)

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8, fontSize: 13, color: 'var(--text-secondary)',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {running && (
            <span className="animate-spin" style={{
              width: 14, height: 14, border: '2px solid var(--border-strong)',
              borderTopColor: 'var(--accent)', borderRadius: '50%', display: 'inline-block',
            }} />
          )}
          {running ? t('build.deploying') : t('build.deploy_done')}
        </span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{percent}%</span>
      </div>
      <div style={{
        height: 8, borderRadius: 'var(--radius-pill)', background: 'var(--bg-surface)',
        overflow: 'hidden', border: '1px solid var(--border-subtle)',
      }}>
        <div style={{
          height: '100%', width: `${percent}%`,
          background: running
            ? 'linear-gradient(90deg, var(--accent), var(--accent-light))'
            : 'var(--success)',
          borderRadius: 'var(--radius-pill)',
          transition: 'width 0.4s ease',
        }} />
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-tertiary)' }}>
        {currentStage
          ? `${t('build.stage_current')}: ${currentStage}`
          : totalStages > 0
            ? `${t('build.stage_progress')}: ${completedStages}/${totalStages}`
            : detail.lifeCycleState}
      </div>
    </div>
  )
}

function SummaryTab({ detail }: { detail: BuildDetailData }) {
  const { t } = useI18n()
  const vcsList = asArray(detail.vcsRevisions?.vcsRevision)
  const revision = vcsList[0]?.vcsRevisionKey?.slice(0, 12) ?? '-'
  const branch = vcsList[0]?.branch ?? vcsList[0]?.vcsBranch ?? ''
  const totalTests = (detail.successfulTestCount ?? 0) + (detail.failedTestCount ?? 0) + (detail.skippedTestCount ?? 0)
  const testSummary = totalTests > 0
    ? `${detail.successfulTestCount ?? 0} / ${totalTests} (${Math.round(((detail.successfulTestCount ?? 0) / totalTests) * 100)}%)`
    : '-'

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
      <InfoCard icon={User} label="Triggered By" value={extractText(detail.buildReason)} />
      <InfoCard icon={Clock} label="Started" value={detail.startTime ? new Date(detail.startTime).toLocaleString() : '-'} />
      <InfoCard icon={Clock} label="Completed" value={detail.buildCompletedDate ? new Date(detail.buildCompletedDate).toLocaleString() : '-'} />
      <InfoCard icon={Clock} label="Duration" value={formatDuration(detail.buildDuration)} />
      <InfoCard icon={Layers} label="Lifecycle" value={detail.lifeCycleState} />
      <InfoCard icon={Box} label="Build" value={`#${detail.buildNumber}`} />
      <InfoCard icon={Tag} label={t('build.plan_key')} value={detail.plan?.key ?? '-'} />
      <InfoCard icon={GitCommit} label={t('build.revision')} value={revision} />
      {branch && <InfoCard icon={GitCommit} label={t('build.branch')} value={branch} />}
      {totalTests > 0 && <InfoCard icon={Bug} label={t('build.test_pass_rate')} value={testSummary} />}
      {detail.plan?.description && (
        <div style={{ gridColumn: '1 / -1' }}>
          <InfoCard icon={FileText} label="Description" value={detail.plan.description} />
        </div>
      )}
    </div>
  )
}

function StagesTab({ stages, buildResultKey, isFailed }: { stages: any[]; buildResultKey: string; isFailed: boolean }) {
  const { t } = useI18n()
  const [expandedStage, setExpandedStage] = useState<number | null>(null)

  function getJobs(stage: any): any[] {
    const jobs = stage.jobs?.job ?? stage.results?.result ?? []
    return asArray(jobs)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {stages.map((s, i) => {
        const jobs = getJobs(s)
        const isExpanded = expandedStage === i
        return (
          <div key={i} className="card-surface" style={{ padding: '14px 18px' }}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: jobs.length ? 'pointer' : 'default' }}
              onClick={() => { if (jobs.length) setExpandedStage(isExpanded ? null : i) }}
            >
              <span style={{
                width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-page)', color: 'var(--text-primary)',
                boxShadow: 'var(--ring-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 510, flexShrink: 0,
              }}>
                {i + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="truncate" style={{ fontSize: 14, fontWeight: 510, color: 'var(--text-primary)' }} title={s.name}>{s.name}</div>
                {jobs.length > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-quaternary)', marginTop: 2 }}>
                    {jobs.length} job{jobs.length !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
              {s.state && <span style={{ flexShrink: 0 }}><StatusBadge status={s.state} /></span>}
              {jobs.length > 0 && (
                <span style={{ fontSize: 11, color: 'var(--text-quaternary)', flexShrink: 0, transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
              )}
            </div>
            {isExpanded && jobs.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: 8, fontSize: 11, fontWeight: 500, color: 'var(--text-quaternary)', padding: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  <span>{t('build.job_name')}</span>
                  <span>Status</span>
                  <span style={{ textAlign: 'right' }}>{t('build.job_duration')}</span>
                </div>
                {jobs.map((job: any, j: number) => {
                  const duration = job.buildDurationInSeconds ?? (job.buildDuration ? Math.round(job.buildDuration / 1000) : undefined)
                  return (
                    <div key={j} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: 8, padding: '5px 0', borderTop: j > 0 ? '1px solid var(--border-subtle)' : 'none', alignItems: 'center' }}>
                      <span className="truncate" style={{ fontSize: 12, color: 'var(--text-secondary)' }} title={job.name}>
                        {job.name ?? `Job ${j + 1}`}
                      </span>
                      <span style={{ flexShrink: 0 }}><StatusBadge status={job.state ?? job.lifeCycleState ?? 'Unknown'} /></span>
                      <span style={{ fontSize: 11, color: 'var(--text-quaternary)', textAlign: 'right', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        {duration != null ? (duration > 60 ? `${Math.floor(duration / 60)}m${duration % 60}s` : `${duration}s`) : '-'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
      {isFailed && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 510, color: 'var(--error)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={12} /> Error Details
          </div>
          <ErrorLogViewer buildResultKey={buildResultKey} />
        </div>
      )}
    </div>
  )
}

function ChangesTab({ changes, vcs }: { changes: NormalizedChange[]; vcs: any[] }) {
  const { t } = useI18n()
  const vcsList = asArray(vcs)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {vcsList.length > 0 && (
        <div>
          <SectionTitle><GitCommit size={12} /> Git Repositories ({vcsList.length})</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {vcsList.map((v, i) => (
              <div key={i} className="card-surface" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 510, color: 'var(--accent)' }}>{v.repositoryName ?? 'Repository'}</span>
                <code style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace', background: 'var(--bg-page)', padding: '2px 8px', borderRadius: 3 }}>
                  {v.vcsRevisionKey?.slice(0, 12) ?? '-'}
                </code>
                {(v.branch ?? v.vcsBranch) && (
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <GitBranch size={10} /> {v.branch ?? v.vcsBranch}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {changes.length > 0 && (
        <div>
          <SectionTitle><GitCommit size={12} /> Commits ({changes.length})</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {changes.map((c, i) => (
              <div key={i} className="card-surface" style={{ padding: '10px 14px' }}>
                <div className="scroll-row" style={{ gap: 12 }}>
                  <span className="scroll-row__meta" style={{
                    fontSize: 12, fontWeight: 510, color: 'var(--accent)', flex: '0 1 120px', maxWidth: 160,
                  }} title={c.author ?? 'unknown'}>
                    {c.author ?? 'unknown'}
                  </span>
                  <span className="scroll-row__grow" style={{ fontSize: 13, color: 'var(--text-secondary)' }} title={c.message}>
                    {c.message || t('build.no_commit_message')}
                  </span>
                  {c.vcsRevisionKey && (
                    <code style={{ fontSize: 10, color: 'var(--text-quaternary)', fontFamily: 'monospace', background: 'var(--bg-page)', padding: '1px 6px', borderRadius: 2, flexShrink: 0 }}>
                      {c.vcsRevisionKey.slice(0, 8)}
                    </code>
                  )}
                </div>
                {c.repositoryName && (
                  <div style={{ fontSize: 11, color: 'var(--text-quaternary)', marginTop: 4 }}>
                    {c.repositoryName}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {changes.length === 0 && vcsList.length === 0 && (
        <div style={{ color: 'var(--text-quaternary)', padding: 32, textAlign: 'center' }}>No changes recorded</div>
      )}
    </div>
  )
}

function JiraTab({ jiraIssues }: { jiraIssues: any[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {jiraIssues.length > 0 && (
        <div>
          <SectionTitle><ExternalLink size={12} /> Jira Issues ({jiraIssues.length})</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {jiraIssues.map((issue: any, i: number) => (
              <div key={i} className="card-surface scroll-row" style={{ padding: '10px 14px', gap: 12 }}>
                <span className="scroll-row__meta" style={{ fontSize: 12, fontWeight: 510, color: 'var(--accent)', flex: '0 1 140px', maxWidth: 160 }} title={issue.key}>{issue.key}</span>
                <span className="scroll-row__grow" style={{ fontSize: 13, color: 'var(--text-secondary)' }} title={issue.summary}>
                  {issue.summary}
                </span>
                {issue.issueStatus?.name && (
                  <span style={{
                    fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 'var(--radius-pill)',
                    background: issue.issueStatus.name === 'Done' ? 'rgba(39,166,68,0.15)' : 'rgba(94,106,210,0.12)',
                    color: issue.issueStatus.name === 'Done' ? 'var(--success)' : 'var(--text-secondary)',
                    flexShrink: 0,
                  }}>
                    {issue.issueStatus.name}
                  </span>
                )}
                {issue.url && (isSafeHttpUrl(issue.url) || issue.url.startsWith('/')) && (
                  <button
                    type="button"
                    onClick={() => openValidatedLink(issue.url)}
                    style={{
                      fontSize: 11, color: 'var(--text-quaternary)', textDecoration: 'none',
                      display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    }}
                    title={issue.url}
                  >
                    <ExternalLink size={11} /> Open
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {jiraIssues.length === 0 && (
        <div style={{ color: 'var(--text-quaternary)', padding: 32, textAlign: 'center' }}>No Jira issues linked</div>
      )}
    </div>
  )
}

function VariablesTab({ variables, artifacts }: { variables: any[]; artifacts: any[] }) {
  const { t } = useI18n()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {variables.length > 0 && (
        <div>
          <SectionTitle><FileText size={12} /> Deployment Configuration ({variables.length})</SectionTitle>
          <div className="card-surface" style={{ padding: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 180px) minmax(0, 1fr)', fontSize: 11, fontWeight: 500, color: 'var(--text-quaternary)', textTransform: 'uppercase', letterSpacing: '0.03em', padding: '8px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
              <span>Name</span><span>Value</span>
            </div>
            {variables.map((v, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 180px) minmax(0, 1fr)', padding: '7px 16px', borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none', fontSize: 13 }}>
                <span className="truncate" style={{ color: 'var(--text-quaternary)', fontWeight: 500 }} title={v.name}>{v.name}</span>
                <span style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', wordBreak: 'break-word', overflowWrap: 'anywhere', fontSize: 12, minWidth: 0 }}>{v.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {artifacts.length > 0 && (
        <div>
          <SectionTitle><Box size={12} /> Artifacts ({artifacts.length})</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {artifacts.map((a, i) => (
              <div key={i} className="card-surface scroll-row" style={{ padding: '10px 14px', gap: 12 }}>
                <Box size={14} style={{ color: 'var(--text-quaternary)', flexShrink: 0 }} />
                <span className="scroll-row__grow" style={{ fontSize: 13, color: 'var(--text-secondary)' }} title={a.name}>{a.name}</span>
                <span style={{ fontSize: 11, color: 'var(--text-quaternary)', flexShrink: 0, fontFamily: 'monospace' }}>
                  {a.size != null ? `${(a.size / 1024).toFixed(1)} KB` : ''}
                </span>
                {a.link?.href && (isSafeHttpUrl(a.link.href) || a.link.href.startsWith('/')) && (
                  <button
                    type="button"
                    onClick={() => openValidatedLink(a.link.href)}
                    style={{
                      fontSize: 11, color: 'var(--accent)', textDecoration: 'none', flexShrink: 0,
                      display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none',
                      cursor: 'pointer', padding: 0,
                    }}
                    title={t('build.artifact_download')}
                  >
                    {t('build.artifact_download')}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {variables.length === 0 && artifacts.length === 0 && (
        <div style={{ color: 'var(--text-quaternary)', padding: 32, textAlign: 'center' }}>No configuration data</div>
      )}
    </div>
  )
}

function TestsTab({ detail }: { detail: BuildDetailData }) {
  const { t } = useI18n()
  const passed = detail.successfulTestCount ?? 0
  const failed = detail.failedTestCount ?? 0
  const skipped = detail.skippedTestCount ?? 0
  const total = passed + failed + skipped

  if (total === 0) {
    return <div style={{ color: 'var(--text-quaternary)', padding: 32, textAlign: 'center' }}>No test data</div>
  }

  const passRate = Math.round((passed / total) * 100)
  const pieData = [
    ...(passed > 0 ? [{ name: 'Passed', value: passed, color: '#22c55e' }] : []),
    ...(failed > 0 ? [{ name: 'Failed', value: failed, color: '#ef4444' }] : []),
    ...(skipped > 0 ? [{ name: 'Skipped', value: skipped, color: '#737373' }] : []),
  ]

  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <TestStat label="Passed" count={passed} color="var(--success)" />
        <TestStat label="Failed" count={failed} color="var(--error)" />
        <TestStat label="Skipped" count={skipped} color="var(--text-quaternary)" />
        <TestStat label="Total" count={total} color="var(--accent)" />
      </div>
      {total > 0 && (
        <div className="card-surface" style={{ padding: 16, minWidth: 200 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8, textAlign: 'center' }}>
            {t('overview.pass_rate')}
          </div>
          <div style={{ position: 'relative', width: 140, height: 140, margin: '0 auto' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={42} outerRadius={60} paddingAngle={2} dataKey="value" startAngle={90} endAngle={-270}>
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, fontWeight: 510, color: failed > 0 ? 'var(--error)' : 'var(--success)',
              letterSpacing: '-0.5px',
            }}>
              {passRate}%
            </div>
          </div>
          {failed > 0 && (
            <div style={{
              marginTop: 8, textAlign: 'center', fontSize: 11, fontWeight: 500, color: 'var(--error)',
              background: 'rgba(239,68,68,0.1)', padding: '3px 8px', borderRadius: 'var(--radius-pill)',
            }}>
              {failed} test{failed !== 1 ? 's' : ''} failed
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ErrorLogViewer({ buildResultKey }: { buildResultKey: string }) {
  const [fullLog, setFullLog] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [showLog, setShowLog] = useState(false)
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.bamboo.getFullBuildLog(buildResultKey).then((log) => {
      setFullLog(log ?? '')
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [buildResultKey])

  useEffect(() => {
    if (showLog && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [showLog, fullLog])

  if (loading) return <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Loading build log...</div>
  if (!fullLog) return <div style={{ color: 'var(--text-quaternary)', fontSize: 12 }}>No log data available</div>

  const lines = fullLog.split('\n')
  const errorLines = lines.filter((l) => /ERROR|FAILURE|FAILED|Exception|BUILD FAILURE|exit code [1-9]/i.test(l))
  const warningLines = lines.filter((l) => /WARN(?:ING)?[:\s]/i.test(l))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 12, fontWeight: 510, color: 'var(--error)',
          background: 'rgba(239,68,68,0.1)', padding: '4px 10px', borderRadius: 'var(--radius-pill)',
        }}>
          <AlertTriangle size={12} /> {errorLines.length} error{errorLines.length !== 1 ? 's' : ''}
        </span>
        {warningLines.length > 0 && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12, fontWeight: 510, color: 'var(--warning)',
            background: 'rgba(245,158,11,0.1)', padding: '4px 10px', borderRadius: 'var(--radius-pill)',
          }}>
            <AlertTriangle size={12} /> {warningLines.length} warning{warningLines.length !== 1 ? 's' : ''}
          </span>
        )}
        <span style={{ fontSize: 11, color: 'var(--text-quaternary)' }}>
          {lines.length} lines total
        </span>
        <button
          onClick={() => setShowLog(!showLog)}
          className="btn-ghost"
          style={{ fontSize: 12, padding: '4px 10px', marginLeft: 'auto' }}
        >
          {showLog ? 'Collapse' : 'Show full log'}
        </button>
      </div>

      {errorLines.length > 0 && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.15)',
          borderRadius: 'var(--radius-md)', padding: '12px 16px', minWidth: 0,
        }}>
          <div style={{ fontSize: 11, fontWeight: 510, color: 'var(--error)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Error Summary
          </div>
          {errorLines.slice(0, 5).map((line, i) => (
            <div key={i} style={{
              fontSize: 12, fontFamily: 'monospace', color: 'var(--error)', lineHeight: 1.7,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere',
            }}>
              {line}
            </div>
          ))}
          {errorLines.length > 5 && (
            <div style={{ fontSize: 11, color: 'var(--text-quaternary)', marginTop: 4 }}>
              ...and {errorLines.length - 5} more error lines
            </div>
          )}
        </div>
      )}

      {showLog && (
        <div style={{
          background: 'var(--bg-page)', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)', padding: 0, overflow: 'hidden', minWidth: 0,
        }}>
          <div style={{
            padding: '8px 16px', borderBottom: '1px solid var(--border-subtle)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 0,
          }}>
            <span style={{ fontSize: 11, fontWeight: 510, color: 'var(--text-quaternary)', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
              Full Build Log
            </span>
            <span className="truncate" style={{ fontSize: 11, color: 'var(--text-quaternary)', textAlign: 'right' }}>
              Last updated: {new Date().toLocaleString()}
            </span>
          </div>
          <div style={{
            padding: '12px 16px', fontSize: 11, fontFamily: 'monospace',
            lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere',
            color: 'var(--text-secondary)', overscrollBehavior: 'contain',
          }}>
            {lines.map((line, i) => {
              let bgColor = 'transparent'
              let color = 'var(--text-secondary)'
              if (/ERROR|FAILURE|FAILED|Exception|BUILD FAILURE|exit code [1-9]/i.test(line)) {
                color = 'var(--error)'
                bgColor = 'rgba(239,68,68,0.08)'
              } else if (/WARN(?:ING)?[:\s]/i.test(line)) {
                color = 'var(--warning)'
                bgColor = 'rgba(245,158,11,0.06)'
              } else if (/SUCCESS|PASSED|BUILD SUCCEEDED|Completed/i.test(line)) {
                color = 'var(--success)'
                bgColor = 'rgba(39,166,68,0.06)'
              }
              return (
                <div key={i} style={{ color, background: bgColor, padding: '0 4px', borderRadius: 2, minHeight: '1.6em' }}>
                  {line || ' '}
                </div>
              )
            })}
            <div ref={logEndRef} />
          </div>
        </div>
      )}
    </div>
  )
}

function InfoCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="card-surface" style={{ padding: '12px 16px' }}>
      <div style={{ fontSize: 11, color: 'var(--text-quaternary)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
        <Icon size={10} /> {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 510, color: 'var(--text-primary)', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{value}</div>
    </div>
  )
}

function TestStat({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="card-surface" style={{ padding: '16px 24px', textAlign: 'center', minWidth: 120 }}>
      <div style={{ fontSize: 28, fontWeight: 510, color, letterSpacing: '-0.5px' }}>{count}</div>
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>{label}</div>
    </div>
  )
}

function HistoryTab({
  results, loading, currentKey, hasMore, loadingMore, onLoadMore, onNavigate,
}: {
  results: any[]
  loading: boolean
  currentKey: string
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
  onNavigate?: (buildResultKey: string) => void
}) {
  const { t } = useI18n()
  if (loading) return <LoadingSpinner text="Loading plan history..." />
  if (!results.length) return <div style={{ color: 'var(--text-quaternary)', padding: 32, textAlign: 'center' }}>No build history available</div>

  const chartData = results
    .filter((r) => r.buildDurationInSeconds && r.buildDurationInSeconds > 0)
    .slice(0, 20)
    .reverse()
    .map((r) => ({
      name: `#${r.buildNumber ?? '?'}`,
      duration: r.buildDurationInSeconds,
      state: r.buildState ?? 'Unknown',
    }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Duration trend chart */}
      {chartData.length > 2 && (
        <div className="card-surface" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 12 }}>
            {t('build.duration_chart')}
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-quaternary)' }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-quaternary)' }} unit="s" width={40} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, fontSize: 12 }}
                formatter={(v) => [`${v}s`, 'Duration']}
              />
              <Line type="monotone" dataKey="duration" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: '#3b82f6' }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <SectionTitle><List size={12} /> Plan Results ({results.length})</SectionTitle>
      {results.map((r, i) => {
        const isCurrent = r.buildResultKey === currentKey
        const running = isBuildRunning(r)
        const duration = r.buildDurationInSeconds
          ? r.buildDurationInSeconds > 60
            ? `${Math.floor(r.buildDurationInSeconds / 60)}m ${r.buildDurationInSeconds % 60}s`
            : `${r.buildDurationInSeconds}s`
          : r.buildDuration
            ? formatDuration(r.buildDuration)
            : '-'
        return (
          <div
            key={r.buildResultKey ?? i}
            className="card-surface"
            onClick={() => !isCurrent && onNavigate?.(r.buildResultKey)}
            style={{
              padding: '10px 14px',
              borderColor: isCurrent ? 'var(--accent)' : undefined,
              cursor: isCurrent ? 'default' : onNavigate ? 'pointer' : 'default',
              transition: 'background 0.15s ease, transform 0.15s ease',
            }}
            onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = 'var(--bg-elevated)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }} className="scroll-row">
              <StatusBadge status={statusBadgeKey(r)} />
              {running && (
                <span style={{
                  fontSize: 10, fontWeight: 510, color: 'var(--accent)',
                  padding: '1px 6px', borderRadius: 'var(--radius-pill)',
                  background: 'rgba(94, 106, 210, 0.15)',
                  animation: 'pulse 1.5s ease-in-out infinite',
                  flexShrink: 0,
                }}>
                  {t('status.in_progress')}
                </span>
              )}
              <span
                className="scroll-row__meta"
                style={{
                  fontSize: 13, fontWeight: 510, color: 'var(--accent)',
                  fontFamily: 'monospace', flex: '0 1 auto', maxWidth: '40%',
                }}
                title={r.buildResultKey}
              >
                {r.buildResultKey}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                {duration}
              </span>
              <span
                className="scroll-row__grow"
                style={{ fontSize: 12, color: 'var(--text-quaternary)' }}
                title={r.reason}
              >
                {r.reason || '—'}
              </span>
              <span
                className="scroll-row__meta"
                style={{ fontSize: 11, color: 'var(--text-quaternary)', textAlign: 'right', flex: '0 1 140px', maxWidth: 160 }}
              >
                {r.startTime ? new Date(r.startTime).toLocaleString() : '—'}
              </span>
            </div>
          </div>
        )
      })}
      {hasMore && onLoadMore && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12 }}>
          <button
            type="button"
            className="btn-ghost"
            onClick={onLoadMore}
            disabled={loadingMore}
            style={{
              fontSize: 12, fontWeight: 510, padding: '8px 18px',
              opacity: loadingMore ? 0.6 : 1,
              transition: 'opacity 0.15s ease',
            }}
          >
            {loadingMore ? t('common.loading_more') : t('common.load_more')}
          </button>
        </div>
      )}
    </div>
  )
}

interface DeployHistoryRow {
  buildResultKey: string
  buildState?: string
  lifeCycleState?: string
  buildNumber?: number
  reason?: string
  startTime?: number
  buildDuration?: number
  buildDurationInSeconds?: number
}

function DeploymentsTab({
  planKey,
  planName,
  currentBuildResultKey,
  onNavigate,
}: {
  planKey: string
  planName: string
  currentBuildResultKey: string
  onNavigate: (key: string) => void
}) {
  const { t } = useI18n()
  const [deploys, setDeploys] = useState<DeployHistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [actingKey, setActingKey] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const PAGE_SIZE = 20
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function showMsg(type: 'success' | 'error', text: string) {
    setActionMsg({ type, text })
    setTimeout(() => setActionMsg(null), 4000)
  }

  function isFailedOrCancelled(row: DeployHistoryRow): boolean {
    if (isCancelledOrStopped(row)) return true
    const st = (row.buildState ?? '').toUpperCase()
    return st === 'FAILED' || st === 'FAILURE'
  }

  function isSuccess(row: DeployHistoryRow): boolean {
    const st = (row.buildState ?? '').toUpperCase()
    return st === 'SUCCESS' || st === 'SUCCESSFUL'
  }

  // 加载部署历史（首次 + 手动刷新）
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const { rows, hasMore: more } = await window.bamboo.getPlanResultsHistoryPage(
          planKey, 0, PAGE_SIZE
        )
        if (!cancelled) {
          setDeploys(rows ?? [])
          setHasMore(more)
          setOffset(PAGE_SIZE)
        }
      } catch {
        if (!cancelled) { setDeploys([]); setHasMore(false) }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [planKey, refreshKey])

  // 实时轮询：当存在运行中的部署时，5s 刷新以同步 Bamboo 状态变更
  useEffect(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
    const hasRunning = deploys.some((r) => isBuildRunning(r))
    if (!hasRunning) return

    pollTimerRef.current = setInterval(async () => {
      try {
        const { rows } = await window.bamboo.getPlanResultsHistoryPage(planKey, 0, PAGE_SIZE)
        setDeploys((prev) => {
          const freshMap = new Map((rows ?? []).map((r: DeployHistoryRow) => [r.buildResultKey, r]))
          const merged = prev.map((r) => freshMap.get(r.buildResultKey) ?? r)
          // 新触发的部署（prev 中不存在）插入到列表头部
          const prevKeys = new Set(prev.map((r) => r.buildResultKey))
          for (const r of rows ?? []) {
            if (r.buildResultKey && !prevKeys.has(r.buildResultKey)) merged.unshift(r)
          }
          return merged
        })
      } catch { /* ignore poll errors */ }
    }, 5000)

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [deploys, planKey])

  async function loadMore() {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    const start = offset
    try {
      const { rows, hasMore: more } = await window.bamboo.getPlanResultsHistoryPage(planKey, start, PAGE_SIZE)
      setDeploys((prev) => {
        const seen = new Set(prev.map((r) => r.buildResultKey))
        const merged = [...prev]
        for (const row of rows ?? []) {
          if (row.buildResultKey && !seen.has(row.buildResultKey)) {
            seen.add(row.buildResultKey)
            merged.push(row)
          }
        }
        return merged
      })
      setHasMore(more)
      setOffset(start + PAGE_SIZE)
    } finally {
      setLoadingMore(false)
    }
  }

  // 中断部署：调用 Bamboo 原生中断能力（停止运行中 / 取消排队）
  async function handleStop(buildResultKey: string) {
    setActingKey(buildResultKey)
    try {
      const result = await window.actions.stopBuild(buildResultKey)
      if (result.success) {
        showMsg('success', t('deploy.stop_success'))
        setRefreshKey((k) => k + 1)
      } else {
        showMsg('error', result.errorMessage || t('deploy.stop_failed'))
      }
    } catch {
      showMsg('error', t('deploy.stop_failed'))
    } finally {
      setActingKey(null)
    }
  }

  // 重试部署：重新触发 Bamboo 构建（对失败/中断的部署记录发起重试）
  async function handleRetry() {
    if (!planKey) return
    setActingKey('retry')
    try {
      const result = await window.actions.queueBuild(planKey)
      if (result.success) {
        showMsg('success', t('deploy.retry_success'))
        setRefreshKey((k) => k + 1)
        if (result.buildResultKey) onNavigate(result.buildResultKey)
      } else {
        showMsg('error', result.errorMessage || t('deploy.retry_failed'))
      }
    } catch {
      showMsg('error', t('deploy.retry_failed'))
    } finally {
      setActingKey(null)
    }
  }

  if (loading) return <LoadingSpinner text={t('deploy.loading')} />

  // 统计摘要
  let successCount = 0, failedCount = 0, runningCount = 0
  for (const r of deploys) {
    if (isBuildRunning(r)) runningCount++
    else if (isFailedOrCancelled(r)) failedCount++
    else if (isSuccess(r)) successCount++
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 环境信息 + 统计摘要 */}
      <div className="card-surface" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={14} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: 11, color: 'var(--text-quaternary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            {t('deploy.environment')}
          </span>
          <span style={{ fontSize: 14, fontWeight: 510, color: 'var(--text-primary)' }}>{planName}</span>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--text-tertiary)', alignItems: 'center' }}>
          <span>{t('deploy.total')}: <strong style={{ color: 'var(--text-primary)' }}>{deploys.length}</strong></span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--success)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} />
            {successCount}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--error)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--error)' }} />
            {failedCount}
          </span>
          {runningCount > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--accent)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1.5s ease-in-out infinite' }} />
              {runningCount}
            </span>
          )}
        </div>
      </div>

      {/* 操作反馈消息 */}
      {actionMsg && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 14px', borderRadius: 'var(--radius-md)',
          background: actionMsg.type === 'success' ? 'rgba(39,166,68,0.1)' : 'rgba(239,68,68,0.1)',
          color: actionMsg.type === 'success' ? 'var(--success)' : 'var(--error)',
          fontSize: 13, fontWeight: 510,
        }}>
          {actionMsg.type === 'success' ? <Check size={13} /> : <X size={13} />}
          {actionMsg.text}
        </div>
      )}

      {/* 部署历史列表 */}
      {!deploys.length ? (
        <div style={{ color: 'var(--text-quaternary)', padding: 32, textAlign: 'center' }}>
          {t('deploy.no_history')}
        </div>
      ) : (
        <>
          <SectionTitle><Activity size={12} /> {t('deploy.history_title')} ({deploys.length})</SectionTitle>
          {deploys.map((r, i) => {
            const isCurrent = r.buildResultKey === currentBuildResultKey
            const running = isBuildRunning(r)
            const canRetry = isFailedOrCancelled(r)
            const duration = r.buildDurationInSeconds
              ? r.buildDurationInSeconds > 60
                ? `${Math.floor(r.buildDurationInSeconds / 60)}m ${r.buildDurationInSeconds % 60}s`
                : `${r.buildDurationInSeconds}s`
              : r.buildDuration
                ? formatDuration(r.buildDuration)
                : '-'
            return (
              <div
                key={r.buildResultKey ?? i}
                className="card-surface"
                style={{
                  padding: '12px 16px',
                  borderColor: isCurrent ? 'var(--accent)' : undefined,
                  transition: 'background 0.15s ease',
                }}
              >
                <div className="scroll-row" style={{ gap: 10, flexWrap: 'wrap', overflow: 'visible' }}>
                  <StatusBadge status={statusBadgeKey(r)} />
                  {running && (
                    <span style={{
                      fontSize: 10, fontWeight: 510, color: 'var(--accent)',
                      padding: '1px 6px', borderRadius: 'var(--radius-pill)',
                      background: 'rgba(94, 106, 210, 0.15)',
                      animation: 'pulse 1.5s ease-in-out infinite',
                      flexShrink: 0,
                    }}>
                      {t('status.in_progress')}
                    </span>
                  )}
                  <span style={{
                    fontSize: 13, fontWeight: 510, color: 'var(--accent)',
                    fontFamily: 'monospace', flexShrink: 0,
                  }}>
                    #{r.buildNumber ?? '?'}
                  </span>
                  <span
                    className="scroll-row__grow"
                    style={{ fontSize: 12, color: 'var(--text-secondary)', flex: '1 1 120px' }}
                    title={r.reason}
                  >
                    {r.reason || '—'}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0, fontFamily: 'monospace' }}>
                    {duration}
                  </span>
                  <span
                    className="scroll-row__meta"
                    style={{ fontSize: 11, color: 'var(--text-quaternary)', textAlign: 'right', flex: '0 1 130px', maxWidth: 150 }}
                  >
                    {r.startTime ? new Date(r.startTime).toLocaleString() : '—'}
                  </span>
                  {running && (
                    <button
                      onClick={() => void handleStop(r.buildResultKey)}
                      disabled={actingKey !== null}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '4px 10px', fontSize: 12, fontWeight: 510,
                        borderRadius: 'var(--radius-md)', fontFamily: 'inherit',
                        background: 'rgba(239,68,68,0.1)', color: 'var(--error)',
                        border: '1px solid rgba(239,68,68,0.25)',
                        cursor: actingKey ? 'wait' : 'pointer',
                        opacity: actingKey ? 0.6 : 1,
                        transition: 'all 0.15s ease', flexShrink: 0,
                      }}
                    >
                      <Ban size={11} /> {actingKey === r.buildResultKey ? '…' : t('deploy.stop')}
                    </button>
                  )}
                  {canRetry && !running && (
                    <button
                      onClick={() => void handleRetry()}
                      disabled={actingKey !== null}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '4px 10px', fontSize: 12, fontWeight: 510,
                        borderRadius: 'var(--radius-md)', fontFamily: 'inherit',
                        background: 'rgba(94,106,210,0.1)', color: 'var(--accent)',
                        border: '1px solid rgba(94,106,210,0.25)',
                        cursor: actingKey ? 'wait' : 'pointer',
                        opacity: actingKey ? 0.6 : 1,
                        transition: 'all 0.15s ease', flexShrink: 0,
                      }}
                    >
                      <RotateCw size={11} /> {actingKey === 'retry' ? '…' : t('deploy.retry')}
                    </button>
                  )}
                  <button
                    onClick={() => !isCurrent && onNavigate(r.buildResultKey)}
                    disabled={isCurrent}
                    className="btn-ghost"
                    style={{
                      fontSize: 12, padding: '4px 10px', flexShrink: 0,
                      cursor: isCurrent ? 'default' : 'pointer',
                      opacity: isCurrent ? 0.4 : 1,
                    }}
                  >
                    {t('deploy.view_detail')}
                  </button>
                </div>
              </div>
            )
          })}

          {hasMore && (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12 }}>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                style={{
                  fontSize: 12, fontWeight: 510, padding: '8px 18px',
                  opacity: loadingMore ? 0.6 : 1, transition: 'opacity 0.15s ease',
                }}
              >
                {loadingMore ? t('common.loading_more') : t('common.load_more')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function DropdownItem({ icon: Icon, label, onClick, danger }: { icon: any; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px',
        background: 'none', border: 'none', borderRadius: 'var(--radius-sm)',
        color: danger ? 'var(--error)' : 'var(--text-secondary)', fontSize: 13, fontWeight: 400,
        fontFamily: 'inherit', fontFeatureSettings: '"cv01", "ss03"', cursor: 'pointer', textAlign: 'left',
        transition: 'all 0.1s ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = danger ? 'var(--error)' : 'var(--text-primary)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = danger ? 'var(--error)' : 'var(--text-secondary)' }}
    >
      <Icon size={14} />
      {label}
    </button>
  )
}

function DropdownLabel({ children }: { children: string }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, color: 'var(--text-quaternary)',
      textTransform: 'uppercase', letterSpacing: '0.06em', padding: '6px 10px 4px',
    }}>
      {children}
    </div>
  )
}

function DropdownDivider() {
  return <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 510, color: 'var(--text-quaternary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
      {children}
    </div>
  )
}
