import { useState, useEffect, useRef } from 'react'
import { useI18n } from '../lib/i18n'
import { Search, RefreshCw, Download, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'

interface LogEntry {
  timestamp: string; level: string; category: string; message: string
  meta?: Record<string, unknown>; duration?: number
}

const LEVEL_COLORS: Record<string, string> = {
  DEBUG: 'var(--text-quaternary)', INFO: 'var(--accent)',
  WARN: 'var(--warning)', ERROR: 'var(--error)', FATAL: '#dc2626',
}
const CATEGORIES = ['SYSTEM', 'AUTH', 'API', 'POLL', 'NOTIFY', 'UI', 'IPC', 'CONFIG']
const LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']
const PAGE_SIZE = 50
const MAX_LOG_ENTRIES = PAGE_SIZE * 10 // Auto-clear after 10 pages

export default function Logs() {
  const { t } = useI18n()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [levelFilter, setLevelFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [search, setSearch] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [page, setPage] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  async function fetchLogs() {
    try {
      const filter: Record<string, string> = {}
      if (levelFilter) filter.level = levelFilter
      if (categoryFilter) filter.category = categoryFilter
      if (search) filter.search = search
      const data = await window.logs.get(Object.keys(filter).length ? filter : undefined)
      // Sort newest first
      const sorted = [...data].sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
      // Auto-clear if超过10页
      if (sorted.length > MAX_LOG_ENTRIES) {
        setLogs(sorted.slice(0, MAX_LOG_ENTRIES))
        await window.logs.clear()
      } else {
        setLogs(sorted)
      }
    } catch {}
  }

  useEffect(() => { fetchLogs() }, [levelFilter, categoryFilter, search])
  useEffect(() => {
    if (!autoRefresh) return
    const timer = setInterval(fetchLogs, 3000)
    return () => clearInterval(timer)
  }, [autoRefresh, levelFilter, categoryFilter, search])

  useEffect(() => { setPage(0) }, [levelFilter, categoryFilter, search])

  const totalPages = Math.ceil(logs.length / PAGE_SIZE)
  const paginatedLogs = logs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  async function handleExport() {
    const filter: Record<string, string> = {}
    if (levelFilter) filter.level = levelFilter
    if (categoryFilter) filter.category = categoryFilter
    const data = await window.logs.export(Object.keys(filter).length ? filter : undefined)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bamboo-logs-${new Date().toISOString().slice(0, 19)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleClear() {
    await window.logs.clear()
    setLogs([])
  }

  function formatTime(ts: string): string {
    try { return new Date(ts).toLocaleTimeString() } catch { return ts }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16, flexShrink: 0, gap: 12, minWidth: 0, flexWrap: 'wrap',
      }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 510, color: 'var(--text-primary)', letterSpacing: '-0.24px' }}>
            {t('logs.title')}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>
            {logs.length} {t('logs.entries')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer',
          }}>
            <input type="checkbox" checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              style={{ accentColor: 'var(--accent)' }} />
            {t('logs.auto_refresh')}
          </label>
          <button className="btn-ghost" onClick={fetchLogs} style={{ fontSize: 13, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
            <RefreshCw size={13} /> {t('logs.refresh')}
          </button>
          <button className="btn-ghost" onClick={handleExport} style={{ fontSize: 13, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Download size={13} /> {t('logs.export')}
          </button>
          <button className="btn-ghost" onClick={handleClear}
            style={{ fontSize: 13, padding: '6px 10px', color: 'var(--error)', borderColor: 'rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Trash2 size={13} /> {t('logs.clear')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 0 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-quaternary)' }} />
          <input className="input-linear" placeholder={t('logs.search')}
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 32, fontSize: 13, padding: '7px 12px 7px 32px' }} />
        </div>
        <select className="select-linear" value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
          <option value="">{t('logs.all_levels')}</option>
          {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <select className="select-linear" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">{t('logs.all_categories')}</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Log entries */}
      <div ref={scrollRef} style={{
        flex: 1, overflow: 'auto', background: 'var(--bg-panel)',
        border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)',
        fontFamily: 'monospace', fontSize: 12, lineHeight: '20px',
      }}>
        {paginatedLogs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-quaternary)' }}>
            {t('logs.no_logs')}
          </div>
        ) : (
          paginatedLogs.map((log, i) => (
            <div key={i} className="scroll-row" style={{
              gap: 8, padding: '4px 12px',
              borderBottom: '1px solid var(--border-subtle)', alignItems: 'flex-start',
            }}>
              <span style={{ color: 'var(--text-quaternary)', flexShrink: 0, width: 80 }}>
                {formatTime(log.timestamp)}
              </span>
              <span style={{ color: LEVEL_COLORS[log.level] ?? 'var(--text-tertiary)', fontWeight: 510, flexShrink: 0, width: 52 }}>
                {log.level}
              </span>
              <span style={{ color: 'var(--accent)', flexShrink: 0, width: 60, fontSize: 11 }}>
                {log.category}
              </span>
              {log.duration !== undefined && (
                <span style={{ color: 'var(--text-quaternary)', flexShrink: 0, width: 50, fontSize: 11 }}>
                  {log.duration}ms
                </span>
              )}
              <span style={{ color: 'var(--text-secondary)', flex: '1 1 0%', minWidth: 0, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 8, marginTop: 8, fontSize: 12, color: 'var(--text-quaternary)',
        }}>
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
            style={{ background: 'none', border: 'none', cursor: page === 0 ? 'default' : 'pointer', color: page === 0 ? 'var(--text-quaternary)' : 'var(--text-secondary)', padding: 4, display: 'flex' }}>
            <ChevronLeft size={14} />
          </button>
          <span>{page + 1} / {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
            style={{ background: 'none', border: 'none', cursor: page >= totalPages - 1 ? 'default' : 'pointer', color: page >= totalPages - 1 ? 'var(--text-quaternary)' : 'var(--text-secondary)', padding: 4, display: 'flex' }}>
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
