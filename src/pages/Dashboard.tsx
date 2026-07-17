import { useState, useEffect, useMemo, useRef } from 'react'
import { useI18n } from '../lib/i18n'
import { useNavigate } from './routes'
import DeployCard from '../components/DeployCard'
import ProjectTree from '../components/ProjectTree'
import FavoritePlanList, { type FavoritePlan, type PlanLiveStatus } from '../components/FavoritePlanList'
import LoadingSpinner from '../components/LoadingSpinner'
import {
  normalizePlanResults, pickPlanBuildResult, isBuildRunning, dedupeDeploysByPlan,
  buildNumberFromResultKey,
} from '../lib/bamboo-build'
import { Search, ChevronLeft, ChevronRight, Star, List } from 'lucide-react'

interface DeployProject {
  key: string
  name: string
}

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

const PAGE_SIZE = 20
const DEPLOY_FETCH_PAGE = 50

function deployNeedsEnrich(d: DeployData): boolean {
  const r = d.deploymentResult
  if (!d.buildResultKey || !r) return false
  return !(r.reason?.trim() || r.initiator?.name?.trim() || r.startedDate || r.finishedDate)
}

function mergeEnrichedDeploys(prev: DeployData[], patches: DeployData[]): DeployData[] {
  if (!patches.length) return prev
  const byKey = new Map(patches.map((p) => {
    const planKey = p.plan?.key ?? p.environment.key
    return [planKey, p]
  }))
  return prev.map((d) => {
    const planKey = d.plan?.key ?? d.environment.key
    const patch = byKey.get(planKey)
    if (!patch) return d
    return {
      ...d,
      ...patch,
      deploymentResult: patch.deploymentResult ?? d.deploymentResult,
      buildResultKey: patch.buildResultKey ?? d.buildResultKey,
    }
  })
}

function deployToFavorite(deploy: DeployData, projectKey: string): FavoritePlan | null {
  const planKey = deploy.plan?.key ?? deploy.environment.key
  if (!planKey || planKey === projectKey) return null
  return {
    planKey,
    projectKey,
    planName: deploy.plan?.name ?? deploy.environment.name ?? planKey,
    lastBuildResultKey: deploy.buildResultKey,
  }
}

export default function Dashboard() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [projects, setProjects] = useState<DeployProject[]>([])
  const [favorites, setFavorites] = useState<FavoritePlan[]>([])
  const [buildTab, setBuildTab] = useState<'all' | 'favorites'>('all')
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [deploys, setDeploys] = useState<DeployData[]>([])
  const [loading, setLoading] = useState(true)
  const [deployLoading, setDeployLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [projectPage, setProjectPage] = useState(0)
  const [deployPage, setDeployPage] = useState(0)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [buildSearch, setBuildSearch] = useState('')
  const [openingFavoriteKey, setOpeningFavoriteKey] = useState<string | null>(null)
  const [planStatus, setPlanStatus] = useState<Record<string, PlanLiveStatus>>({})
  const [gitDeployFlash, setGitDeployFlash] = useState<Record<string, number>>({})
  const [deployHasMore, setDeployHasMore] = useState(false)
  const [deployFetchOffset, setDeployFetchOffset] = useState(0)
  const [deployLoadingMore, setDeployLoadingMore] = useState(false)
  const [deployError, setDeployError] = useState<string | null>(null)
  const enrichedKeysRef = useRef(new Set<string>())

  useEffect(() => {
    async function load() {
      const projs = await window.bamboo.getProjects()
      setProjects(projs)
      const savedFav = await window.config.get('favoritePlans') as FavoritePlan[] | undefined
      const favs = savedFav ?? []
      setFavorites(favs)
      const interval = (await window.config.get('pollInterval')) ?? 30
      if (favs.length > 0) {
        await window.poll.start(interval, favs)
      }
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (!selectedProject) {
      setDeploys([])
      setDeployLoading(false)
      setDeployHasMore(false)
      setDeployFetchOffset(0)
      setDeployError(null)
      enrichedKeysRef.current.clear()
      return
    }
    let cancelled = false
    enrichedKeysRef.current.clear()

    async function load() {
      setDeploys([])
      setDeployLoading(true)
      setDeployHasMore(false)
      setDeployFetchOffset(0)
      setDeployError(null)
      try {
        const result = await window.bamboo.getDeploymentsPage(
          selectedProject!,
          0,
          DEPLOY_FETCH_PAGE
        )
        if (cancelled) return
        if (!result.ok) {
          setDeployError(result.error)
          setDeploys([])
          setDeployHasMore(false)
          return
        }
        setDeploys(dedupeDeploysByPlan(result.deploys ?? []))
        setDeployHasMore(result.hasMore)
        setDeployFetchOffset(DEPLOY_FETCH_PAGE)
        setDeployPage(0)
      } finally {
        if (!cancelled) setDeployLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [selectedProject])

  async function loadMoreDeploys() {
    if (!selectedProject || deployLoadingMore || !deployHasMore) return
    setDeployLoadingMore(true)
    const startIndex = deployFetchOffset
    try {
      const result = await window.bamboo.getDeploymentsPage(
        selectedProject,
        startIndex,
        DEPLOY_FETCH_PAGE
      )
      if (!result.ok) {
        setDeployError(result.error)
        return
      }
      setDeploys((prev) => dedupeDeploysByPlan([...prev, ...(result.deploys ?? [])]))
      setDeployHasMore(result.hasMore)
      setDeployFetchOffset(startIndex + DEPLOY_FETCH_PAGE)
    } finally {
      setDeployLoadingMore(false)
    }
  }

  useEffect(() => {
    const handler = (e: Event) => {
      const custom = e as CustomEvent
      setDeploys((prev) => dedupeDeploysByPlan([...(custom.detail ?? []), ...prev]))
    }
    window.addEventListener('new-deploys', handler)
    return () => window.removeEventListener('new-deploys', handler)
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const { fav, queue } = (e as CustomEvent).detail ?? {}
      if (!fav?.planKey || !queue?.success) return
      setGitDeployFlash((prev) => ({ ...prev, [fav.planKey]: Date.now() }))
      const key = fav.planKey as string
      setTimeout(() => {
        setGitDeployFlash((prev) => {
          const next = { ...prev }
          delete next[key]
          return next
        })
      }, 4000)
    }
    window.addEventListener('git-auto-deploy', handler)
    return () => window.removeEventListener('git-auto-deploy', handler)
  }, [])

  useEffect(() => {
    if (favorites.length === 0) {
      setPlanStatus({})
      return
    }
    let cancelled = false

    async function refreshLive() {
      const next: Record<string, PlanLiveStatus> = {}
      for (const fav of favorites) {
        try {
          const raw = await window.bamboo.getPlanResults(fav.planKey)
          const list = normalizePlanResults(raw, fav.planKey)
          const pick = pickPlanBuildResult(list)
          if (!pick) continue
          next[fav.planKey] = {
            buildResultKey: pick.buildResultKey,
            buildNumber: pick.buildNumber ?? buildNumberFromResultKey(pick.buildResultKey, fav.planKey),
            buildState: pick.buildState,
            lifeCycleState: pick.lifeCycleState,
            isRunning: isBuildRunning(pick),
          }
        } catch {
          /* ignore */
        }
      }
      if (!cancelled) setPlanStatus(next)
    }

    refreshLive()
    const timer = setInterval(refreshLive, 3000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [favorites])

  async function restartPoll(nextFavorites: FavoritePlan[]) {
    const interval = (await window.config.get('pollInterval')) ?? 30
    if (nextFavorites.length === 0) {
      await window.poll.stop()
    } else {
      await window.poll.start(interval, nextFavorites)
    }
  }

  async function resolveFavoriteBuildKey(fav: FavoritePlan): Promise<string | null> {
    const raw = await window.bamboo.getPlanResults(fav.planKey)
    const pick = pickPlanBuildResult(normalizePlanResults(raw, fav.planKey))
    if (pick?.buildResultKey) return pick.buildResultKey

    try {
      const result = await window.bamboo.getDeployments(fav.projectKey)
      if (!result.ok) return fav.lastBuildResultKey ?? null
      const matches = dedupeDeploysByPlan(result.deploys ?? []).filter(
        (d: DeployData) => (d.plan?.key ?? d.environment.key) === fav.planKey && d.buildResultKey
      )
      if (matches[0]?.buildResultKey) return matches[0].buildResultKey!
    } catch {
      /* ignore */
    }

    return fav.lastBuildResultKey ?? null
  }

  async function openFavoriteDetail(fav: FavoritePlan) {
    setOpeningFavoriteKey(fav.planKey)
    try {
      const targetKey = await resolveFavoriteBuildKey(fav)
      if (!targetKey) return

      const updated: FavoritePlan = { ...fav, lastBuildResultKey: targetKey }
      setFavorites((prev) => {
        const next = prev.map((f) => (f.planKey === fav.planKey ? updated : f))
        window.config.set('favoritePlans', next)
        return next
      })

      navigate({ page: 'build', buildResultKey: targetKey })
    } finally {
      setOpeningFavoriteKey(null)
    }
  }

  function toggleFavorite(plan: FavoritePlan) {
    setFavorites((prev) => {
      const exists = prev.some((f) => f.planKey === plan.planKey)
      const next = exists
        ? prev.filter((f) => f.planKey !== plan.planKey)
        : [...prev.filter((f) => f.planKey !== plan.planKey), plan]
      window.config.set('favoritePlans', next)
      restartPoll(next)
      return next
    })
  }

  const favoriteKeys = useMemo(() => new Set(favorites.map((f) => f.planKey)), [favorites])

  const filteredProjects = useMemo(() => {
    if (!searchQuery) return projects
    const q = searchQuery.toLowerCase()
    return projects.filter((p) =>
      p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q)
    )
  }, [projects, searchQuery])

  const totalPages = Math.ceil(filteredProjects.length / PAGE_SIZE)
  const paginatedProjects = filteredProjects.slice(projectPage * PAGE_SIZE, (projectPage + 1) * PAGE_SIZE)

  const filteredDeploys = useMemo(() => {
    let result = deploys
    if (statusFilter) {
      result = result.filter((d) => d.deploymentResult?.state === statusFilter)
    }
    if (buildSearch) {
      const q = buildSearch.toLowerCase()
      result = result.filter((d) =>
        (d.plan?.name ?? d.environment.name).toLowerCase().includes(q) ||
        (d.plan?.key ?? d.environment.key).toLowerCase().includes(q) ||
        d.project.key.toLowerCase().includes(q)
      )
    }
    return result
  }, [deploys, statusFilter, buildSearch])

  const deployTotalPages = Math.ceil(filteredDeploys.length / PAGE_SIZE)
  const paginatedDeploys = filteredDeploys.slice(deployPage * PAGE_SIZE, (deployPage + 1) * PAGE_SIZE)

  useEffect(() => {
    if (!selectedProject || deployLoading || buildTab !== 'all') return
    const keys = paginatedDeploys
      .filter(deployNeedsEnrich)
      .map((d) => d.buildResultKey!)
      .filter((k) => !enrichedKeysRef.current.has(k))
    if (!keys.length) return
    keys.forEach((k) => enrichedKeysRef.current.add(k))
    let cancelled = false
    void window.bamboo.enrichDeployments(selectedProject, keys).then((patches) => {
      if (cancelled || !patches?.length) return
      setDeploys((prev) => mergeEnrichedDeploys(prev, patches))
    })
    return () => { cancelled = true }
  }, [selectedProject, deployLoading, buildTab, deployPage, paginatedDeploys])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: deploys.length }
    for (const d of deploys) {
      const s = d.deploymentResult?.state ?? 'UNKNOWN'
      counts[s] = (counts[s] || 0) + 1
    }
    return counts
  }, [deploys])

  if (loading) {
    return <LoadingSpinner text={t('app.loading')} />
  }

  return (
    <div style={{ display: 'flex', gap: 24, height: '100%', overflow: 'hidden' }}>
      <div style={{
        width: 260, flexShrink: 0, overflow: 'auto',
        borderRight: '1px solid var(--border-subtle)', paddingRight: 16,
        minWidth: 0,
      }}>
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <Search size={14} style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-quaternary)',
          }} />
          <input
            className="input-linear"
            placeholder={t('logs.search')}
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setProjectPage(0) }}
            style={{ paddingLeft: 32, fontSize: 13, padding: '7px 12px 7px 32px' }}
          />
        </div>

        <ProjectTree
          projects={paginatedProjects}
          activeProject={selectedProject}
          onSelect={setSelectedProject}
        />

        {totalPages > 1 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 8, marginTop: 12, fontSize: 12, color: 'var(--text-quaternary)',
          }}>
            <button
              onClick={() => setProjectPage((p) => Math.max(0, p - 1))}
              disabled={projectPage === 0}
              style={{
                background: 'none', border: 'none', cursor: projectPage === 0 ? 'default' : 'pointer',
                color: projectPage === 0 ? 'var(--text-quaternary)' : 'var(--text-secondary)',
                padding: 4, display: 'flex',
              }}
            >
              <ChevronLeft size={14} />
            </button>
            <span style={{ whiteSpace: 'nowrap' }}>{projectPage + 1} / {totalPages}</span>
            <button
              onClick={() => setProjectPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={projectPage >= totalPages - 1}
              style={{
                background: 'none', border: 'none',
                cursor: projectPage >= totalPages - 1 ? 'default' : 'pointer',
                color: projectPage >= totalPages - 1 ? 'var(--text-quaternary)' : 'var(--text-secondary)',
                padding: 4, display: 'flex',
              }}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          marginBottom: 16, gap: 16, flexWrap: 'wrap',
        }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{
              fontSize: 20, fontWeight: 510, color: 'var(--text-primary)',
              letterSpacing: '-0.24px',
            }}>
              {t('dashboard.title')}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4, whiteSpace: 'nowrap' }}>
              {favorites.length} {t('dashboard.favorites_polling')}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <BuildTab
              active={buildTab === 'all'}
              icon={List}
              label={t('dashboard.tab.builds_all')}
              onClick={() => setBuildTab('all')}
            />
            <BuildTab
              active={buildTab === 'favorites'}
              icon={Star}
              label={t('dashboard.tab.builds_favorites')}
              count={favorites.length}
              onClick={() => setBuildTab('favorites')}
            />
          </div>
        </div>

        {buildTab === 'favorites' ? (
          <FavoritePlanList
            favorites={favorites}
            planStatus={planStatus}
            gitDeployFlash={gitDeployFlash}
            onToggleFavorite={toggleFavorite}
            onOpenFavorite={openFavoriteDetail}
            openingPlanKey={openingFavoriteKey}
          />
        ) : (
          <>
            {deploys.length > 0 && (
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <Search size={14} style={{
                  position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--text-quaternary)',
                }} />
                <input
                  className="input-linear"
                  placeholder={t('dashboard.search_builds')}
                  value={buildSearch}
                  onChange={(e) => { setBuildSearch(e.target.value); setDeployPage(0) }}
                  style={{ paddingLeft: 32, fontSize: 13, padding: '7px 12px 7px 32px' }}
                />
              </div>
            )}

            {deploys.length > 0 && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                <StatusPill
                  label={`${t('logs.all_levels')} (${statusCounts.all})`}
                  active={!statusFilter}
                  onClick={() => { setStatusFilter(''); setDeployPage(0) }}
                />
                {Object.entries(statusCounts).filter(([k]) => k !== 'all').map(([status, count]) => (
                  <StatusPill
                    key={status}
                    label={`${status} (${count})`}
                    active={statusFilter === status}
                    onClick={() => { setStatusFilter(status === statusFilter ? '' : status); setDeployPage(0) }}
                    status={status}
                  />
                ))}
              </div>
            )}

            {deployLoading ? (
              <LoadingSpinner text={t('app.loading')} />
            ) : deployError ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--error)' }}>
                <div style={{ fontSize: 14 }}>{t('dashboard.deploy_load_error')}</div>
                <div style={{ fontSize: 12, marginTop: 8, color: 'var(--text-quaternary)' }}>{deployError}</div>
              </div>
            ) : !selectedProject ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-quaternary)' }}>
                <div style={{ fontSize: 14 }}>{t('dashboard.select_project')}</div>
                <div style={{ fontSize: 13, marginTop: 8 }}>{t('dashboard.favorite_in_builds_hint')}</div>
              </div>
            ) : paginatedDeploys.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-quaternary)' }}>
                <div style={{ fontSize: 14 }}>{t('logs.no_logs')}</div>
              </div>
            ) : (
              <>
                <p style={{ fontSize: 12, color: 'var(--text-quaternary)', marginBottom: 12 }}>
                  {t('dashboard.deploy_latest_per_plan')}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {paginatedDeploys.map((d, i) => {
                    const fav = selectedProject ? deployToFavorite(d, selectedProject) : null
                    const planKey = fav?.planKey ?? d.plan?.key ?? d.environment.key
                    const live = planKey ? planStatus[planKey] : undefined
                    return (
                      <DeployCard
                        key={`${planKey}-${live?.buildResultKey ?? d.buildResultKey ?? i}`}
                        deploy={d}
                        isFavorite={planKey ? favoriteKeys.has(planKey) : false}
                        isDeploying={!!live?.isRunning}
                        displayBuildNumber={live?.buildNumber ?? d.deployment?.id}
                        onToggleFavorite={fav ? () => toggleFavorite(fav) : undefined}
                        onOpenBuild={(key) => {
                          const openKey = live?.isRunning && live.buildResultKey ? live.buildResultKey : key
                          navigate({ page: 'build', buildResultKey: openKey })
                        }}
                      />
                    )
                  })}
                </div>

                {(deployTotalPages > 1 || deployHasMore) && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: 8, marginTop: 16, fontSize: 12, color: 'var(--text-quaternary)',
                    flexWrap: 'wrap',
                  }}>
                    {deployTotalPages > 1 && (
                      <>
                        <button
                          onClick={() => setDeployPage((p) => Math.max(0, p - 1))}
                          disabled={deployPage === 0}
                          style={{
                            background: 'none', border: 'none', cursor: deployPage === 0 ? 'default' : 'pointer',
                            color: deployPage === 0 ? 'var(--text-quaternary)' : 'var(--text-secondary)',
                            padding: 4, display: 'flex',
                          }}
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <span style={{ whiteSpace: 'nowrap' }}>{deployPage + 1} / {deployTotalPages}</span>
                        <button
                          onClick={() => setDeployPage((p) => Math.min(deployTotalPages - 1, p + 1))}
                          disabled={deployPage >= deployTotalPages - 1}
                          style={{
                            background: 'none', border: 'none',
                            cursor: deployPage >= deployTotalPages - 1 ? 'default' : 'pointer',
                            color: deployPage >= deployTotalPages - 1 ? 'var(--text-quaternary)' : 'var(--text-secondary)',
                            padding: 4, display: 'flex',
                          }}
                        >
                          <ChevronRight size={14} />
                        </button>
                      </>
                    )}
                    {deployHasMore && (
                      <button
                        type="button"
                        onClick={() => void loadMoreDeploys()}
                        disabled={deployLoadingMore}
                        className="btn-ghost"
                        style={{
                          fontSize: 12, fontWeight: 510, padding: '6px 14px',
                          opacity: deployLoadingMore ? 0.6 : 1,
                          transition: 'opacity 0.15s ease',
                        }}
                      >
                        {deployLoadingMore ? t('common.loading_more') : t('common.load_more')}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function BuildTab({ active, icon: Icon, label, count, onClick }: {
  active: boolean
  icon: typeof List
  label: string
  count?: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '6px 12px', borderRadius: 'var(--radius-md)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border-default)'}`,
        background: active ? 'rgba(94, 106, 210, 0.1)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
        fontSize: 12, fontWeight: 510, fontFamily: 'inherit',
        fontFeatureSettings: '"cv01", "ss03"', cursor: 'pointer',
        transition: 'all 0.15s ease', whiteSpace: 'nowrap',
      }}
    >
      <Icon size={13} style={{ flexShrink: 0 }} />
      <span>{label}{count !== undefined && count > 0 ? ` (${count})` : ''}</span>
    </button>
  )
}

function StatusPill({ label, active, onClick, status }: {
  label: string; active: boolean; onClick: () => void; status?: string
}) {
  const colorMap: Record<string, string> = {
    SUCCESS: 'var(--success)', Successful: 'var(--success)',
    FAILED: 'var(--error)', Failed: 'var(--error)',
    UNKNOWN: 'var(--text-tertiary)',
  }
  const dotColor = status ? (colorMap[status] ?? 'var(--text-quaternary)') : 'var(--accent)'

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '3px 10px', borderRadius: 'var(--radius-pill)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border-default)'}`,
        background: active ? 'rgba(94, 106, 210, 0.1)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
        fontSize: 12, fontWeight: 510, fontFamily: 'inherit',
        fontFeatureSettings: '"cv01", "ss03"', cursor: 'pointer',
        transition: 'all 0.15s ease', whiteSpace: 'nowrap',
      }}
    >
      {status && <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor }} />}
      {label}
    </button>
  )
}
