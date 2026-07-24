import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AlertTriangle, FileText, RefreshCw, Search, Copy, Download, Hash } from 'lucide-react'
import { useI18n } from '../lib/i18n'


const LIVE_POLL_MS = 4000
const ERROR_RE = /ERROR|FAILURE|FAILED|Exception|BUILD FAILURE|exit code [1-9]/i
const WARN_RE = /WARN(?:ING)?[:\s]/i
const DEFAULT_PANEL_HEIGHT = 420

function logLineKind(line: string): 'error' | 'warning' | 'normal' {
  if (ERROR_RE.test(line)) return 'error'
  if (WARN_RE.test(line)) return 'warning'
  return 'normal'
}

const LOG_LINE_STYLE: Record<'error' | 'warning' | 'normal', CSSProperties> = {
  error: {
    color: 'var(--error)',
    background: 'rgba(239, 68, 68, 0.08)',
    boxShadow: 'inset 2px 0 0 var(--error)',
  },
  warning: {
    color: 'var(--warning)',
    background: 'rgba(245, 158, 11, 0.08)',
    boxShadow: 'inset 2px 0 0 var(--warning)',
  },
  normal: {},
}

interface Props {
  buildResultKey: string
  live?: boolean
  defaultExpanded?: boolean
  fill?: boolean
}

export default function BuildLogViewer({
  buildResultKey,
  live = false,
  defaultExpanded = true,
  fill = false,
}: Props) {
  const { t } = useI18n()
  const [fullLog, setFullLog] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)
  const [logFilter, setLogFilter] = useState<'all' | 'error' | 'warning'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showLineNumbers, setShowLineNumbers] = useState(true)
  const [copied, setCopied] = useState(false)
  const stickToBottomRef = useRef(true)
  const scrollBoxRef = useRef<HTMLDivElement>(null)

  function handleCopy() {
    if (!fullLog) return
    navigator.clipboard.writeText(fullLog)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleDownload() {
    if (!fullLog) return
    const blob = new Blob([fullLog], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `build-${buildResultKey}-log.txt`
    a.click()
    URL.revokeObjectURL(url)
  }


  async function fetchLog(isRefresh = false) {
    if (isRefresh) setRefreshing(true)
    try {
      const log = await window.bamboo.getFullBuildLog(buildResultKey)
      setFullLog(log ?? '')
      setFetchedAt(Date.now())
    } catch {
      if (!isRefresh) setFullLog('')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    setFullLog('')
    stickToBottomRef.current = true
    void fetchLog()
  }, [buildResultKey])

  useEffect(() => {
    if (!live) return
    const timer = window.setInterval(() => { void fetchLog(true) }, LIVE_POLL_MS)
    return () => window.clearInterval(timer)
  }, [live, buildResultKey])

  useEffect(() => {
    const el = scrollBoxRef.current
    if (!expanded || !el || !stickToBottomRef.current) return
    el.scrollTop = el.scrollHeight
  }, [fullLog, expanded, fill])

  function onScroll() {
    const el = scrollBoxRef.current
    if (!el) return
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  }

  function onWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.stopPropagation()
  }

  if (loading) {
    return (
      <div style={{ color: 'var(--text-tertiary)', fontSize: 12, padding: '8px 0' }}>
        {t('build.log_loading')}
      </div>
    )
  }

  if (!fullLog) {
    return (
      <div style={{
        color: 'var(--text-quaternary)', fontSize: 12, padding: '12px 14px',
        background: 'var(--bg-page)', borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)',
      }}>
        {live ? t('build.log_waiting') : t('build.log_empty')}
      </div>
    )
  }

  const lines = fullLog.split('\n')
  const lineKinds = lines.map(logLineKind)
  const errorCount = lineKinds.reduce((count, kind) => count + (kind === 'error' ? 1 : 0), 0)
  const warningCount = lineKinds.reduce((count, kind) => count + (kind === 'warning' ? 1 : 0), 0)
  const errorPreview = lines.filter((_, index) => lineKinds[index] === 'error').slice(0, 5)

  const filteredLinesCount = lines.filter((line, index) => {
    const kind = lineKinds[index]
    if (logFilter === 'error' && kind !== 'error') return false
    if (logFilter === 'warning' && kind !== 'warning') return false
    if (searchQuery && !line.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  }).length


  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      minWidth: 0, minHeight: 0,
      ...(fill ? { flex: 1, height: '100%' } : {}),
    }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 12, fontWeight: 510, color: 'var(--text-secondary)',
        }}>
          <FileText size={13} />
          {live ? t('build.log_live') : t('build.log_title')}
          {live && (
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)',
              boxShadow: '0 0 0 3px rgba(94,106,210,0.25)',
            }} />
          )}
        </span>
        {errorCount > 0 && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 11, fontWeight: 510, color: 'var(--error)',
            background: 'rgba(239,68,68,0.1)', padding: '3px 8px', borderRadius: 'var(--radius-pill)',
          }}>
            <AlertTriangle size={11} /> {errorCount} {t('build.log_errors')}
          </span>
        )}
        {warningCount > 0 && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 11, fontWeight: 510, color: 'var(--warning)',
            background: 'rgba(245,158,11,0.1)', padding: '3px 8px', borderRadius: 'var(--radius-pill)',
          }}>
            <AlertTriangle size={11} /> {warningCount} {t('build.log_warnings')}
          </span>
        )}
        <span style={{ fontSize: 11, color: 'var(--text-quaternary)' }}>
          {filteredLinesCount < lines.length ? `${filteredLinesCount} / ${lines.length} lines` : `${lines.length} lines`}
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            type="button"
            onClick={handleCopy}
            title={t('common.copy')}
            className="btn-ghost"
            style={{ fontSize: 12, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Copy size={12} />
            {copied ? t('common.copied') : t('common.copy')}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            title={t('common.download')}
            className="btn-ghost"
            style={{ fontSize: 12, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Download size={12} />
            {t('common.download')}
          </button>
          <button
            type="button"
            onClick={() => void fetchLog(true)}
            disabled={refreshing}
            className="btn-ghost"
            style={{ fontSize: 12, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : undefined} />
            {t('build.log_refresh')}
          </button>
          {!fill && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="btn-ghost"
              style={{ fontSize: 12, padding: '4px 10px' }}
            >
              {expanded ? t('build.log_collapse') : t('build.log_expand')}
            </button>
          )}
        </div>
      </div>

      {expanded && errorPreview.length > 0 && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.15)',
          borderRadius: 'var(--radius-md)', padding: '8px 12px', minWidth: 0, flexShrink: 0,
          maxHeight: 88, overflow: 'auto',
        }}>
          <div style={{
            fontSize: 11, fontWeight: 510, color: 'var(--error)', marginBottom: 4,
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            {t('build.log_error_summary')}
          </div>
          {errorPreview.map((line, index) => (
            <div key={index} style={{
              fontSize: 12, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              color: 'var(--error)', lineHeight: 1.5,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {line}
            </div>
          ))}
          {errorCount > 5 && (
            <div style={{ fontSize: 11, color: 'var(--text-quaternary)', marginTop: 4 }}>
              {t('build.log_more_errors').replace('{count}', String(errorCount - 5))}
            </div>
          )}
        </div>
      )}

      {expanded && (
        <div style={{
          background: 'var(--bg-page)', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)', overflow: 'hidden', minWidth: 0, minHeight: 0,
          display: 'flex', flexDirection: 'column',
          ...(fill
            ? { flex: 1 }
            : { height: DEFAULT_PANEL_HEIGHT, maxHeight: DEFAULT_PANEL_HEIGHT, flexShrink: 0 }),
        }}>
          <div style={{
            padding: '6px 12px', borderBottom: '1px solid var(--border-subtle)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0,
            background: 'var(--bg-surface)', flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                className={`filter-pill ${logFilter === 'all' ? 'active' : ''}`}
                onClick={() => setLogFilter('all')}
                style={{ padding: '3px 8px', fontSize: 11 }}
              >
                {t('logs.filter_all')}
              </button>
              <button
                className={`filter-pill ${logFilter === 'error' ? 'active' : ''}`}
                onClick={() => setLogFilter('error')}
                style={{ padding: '3px 8px', fontSize: 11, color: logFilter === 'error' ? 'var(--error)' : undefined }}
              >
                {t('logs.filter_errors').replace('{count}', String(errorCount))}
              </button>
              <button
                className={`filter-pill ${logFilter === 'warning' ? 'active' : ''}`}
                onClick={() => setLogFilter('warning')}
                style={{ padding: '3px 8px', fontSize: 11, color: logFilter === 'warning' ? 'var(--warning)' : undefined }}
              >
                {t('logs.filter_warnings').replace('{count}', String(warningCount))}
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ position: 'relative' }}>
                <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                <input
                  className="input-linear"
                  placeholder={t('logs.search')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ fontSize: 11, padding: '3px 8px 3px 26px', width: 140 }}
                />
              </div>

              <button
                onClick={() => setShowLineNumbers(!showLineNumbers)}
                title={t('logs.toggle_line_numbers')}
                className={`view-toggle-btn ${showLineNumbers ? 'active' : ''}`}
                style={{ width: 26, height: 26 }}
              >
                <Hash size={13} />
              </button>


              {fetchedAt && (
                <span className="truncate" style={{ fontSize: 11, color: 'var(--text-quaternary)' }}>
                  {new Date(fetchedAt).toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
          <div
            ref={scrollBoxRef}
            onScroll={onScroll}
            onWheel={onWheel}
            style={{
              flex: 1, minHeight: 0, height: fill ? 0 : undefined, overflow: 'auto',
              overscrollBehavior: 'contain', padding: '6px 0',
              fontSize: 11, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              lineHeight: 1.55, color: 'var(--text-secondary)',
            }}
          >
            {lines.map((line, index) => {
              const kind = lineKinds[index]
              if (logFilter === 'error' && kind !== 'error') return null
              if (logFilter === 'warning' && kind !== 'warning') return null
              if (searchQuery && !line.toLowerCase().includes(searchQuery.toLowerCase())) return null

              return (
                <div
                  key={index}
                  style={{
                    padding: '1px 12px',
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 12,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    overflowWrap: 'anywhere',
                    ...LOG_LINE_STYLE[kind],
                  }}
                >
                  {showLineNumbers && (
                    <span style={{
                      display: 'inline-block', width: 36, flexShrink: 0, textAlign: 'right',
                      color: 'var(--text-quaternary)', userSelect: 'none', fontSize: 10,
                    }}>
                      {index + 1}
                    </span>
                  )}
                  <span style={{ flex: 1 }}>{line || '\u00A0'}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

    </div>
  )
}
