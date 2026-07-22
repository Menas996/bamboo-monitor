import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, FileText, RefreshCw } from 'lucide-react'
import { useI18n } from '../lib/i18n'

const LIVE_POLL_MS = 4000
const ERROR_RE = /ERROR|FAILURE|FAILED|Exception|BUILD FAILURE|exit code [1-9]/i
const WARN_RE = /WARN(?:ING)?[:\s]/i
const DEFAULT_PANEL_HEIGHT = 420

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
  const stickToBottomRef = useRef(true)
  const scrollBoxRef = useRef<HTMLDivElement>(null)

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
  const errorCount = lines.reduce((count, line) => count + (ERROR_RE.test(line) ? 1 : 0), 0)
  const warningCount = lines.reduce((count, line) => count + (WARN_RE.test(line) ? 1 : 0), 0)
  const errorPreview = lines.filter((line) => ERROR_RE.test(line)).slice(0, 5)

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
          {lines.length} {t('build.log_lines')}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
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
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexShrink: 0,
          }}>
            <span style={{
              fontSize: 11, fontWeight: 510, color: 'var(--text-quaternary)',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              {t('build.log_full')}
            </span>
            {fetchedAt && (
              <span className="truncate" style={{ fontSize: 11, color: 'var(--text-quaternary)' }}>
                {t('build.log_updated')}: {new Date(fetchedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
          <div
            ref={scrollBoxRef}
            onScroll={onScroll}
            onWheel={onWheel}
            style={{
              flex: 1, minHeight: 0, height: fill ? 0 : undefined, overflow: 'auto',
              overscrollBehavior: 'contain', padding: '10px 12px',
              fontSize: 11, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              lineHeight: 1.55, color: 'var(--text-secondary)',
            }}
          >
            <pre style={{
              margin: 0, font: 'inherit', whiteSpace: 'pre-wrap',
              wordBreak: 'break-word', overflowWrap: 'anywhere',
            }}>
              {fullLog}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
