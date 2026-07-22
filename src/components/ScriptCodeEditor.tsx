import { useRef } from 'react'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function highlightShell(code: string): string {
  if (!code) return '&nbsp;'
  const escaped = escapeHtml(code)
  return escaped
    .replace(/(^|[\n])(#[^\n]*)/g, '$1<span style="color:var(--text-quaternary)">$2</span>')
    .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, (match) => `<span style="color:var(--success-emerald,#34d399)">${match}</span>`)
    .replace(
      /\b(if|then|else|elif|fi|for|while|do|done|case|esac|function|return|exit|export|local|readonly|source|true|false)\b/g,
      '<span style="color:var(--accent)">$1</span>',
    )
    .replace(
      /(\$[A-Za-z_][A-Za-z0-9_]*|\$\{[^}]+\})/g,
      '<span style="color:#f59e0b">$1</span>',
    )
}

const editorFont = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
const editorFontSize = 12
const editorLineHeight = 1.45
const editorPadding = '10px 12px'

export default function ScriptCodeEditor({
  value,
  onChange,
  rows = 12,
}: {
  value: string
  onChange: (value: string) => void
  rows?: number
}) {
  const preRef = useRef<HTMLPreElement>(null)
  const minHeight = Math.max(180, rows * editorFontSize * editorLineHeight + 24)

  return (
    <div style={{
      position: 'relative',
      minHeight,
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--ring-border)',
      background: 'var(--bg-page)',
      overflow: 'hidden',
    }}>
      <pre
        ref={preRef}
        aria-hidden
        style={{
          margin: 0,
          padding: editorPadding,
          minHeight,
          fontFamily: editorFont,
          fontSize: editorFontSize,
          lineHeight: editorLineHeight,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          color: 'var(--text-primary)',
          pointerEvents: 'none',
          overflow: 'auto',
        }}
        dangerouslySetInnerHTML={{ __html: highlightShell(value) + '\n' }}
      />
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          const target = e.currentTarget
          if (preRef.current) {
            preRef.current.scrollTop = target.scrollTop
            preRef.current.scrollLeft = target.scrollLeft
          }
        }}
        spellCheck={false}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          margin: 0,
          padding: editorPadding,
          border: 'none',
          outline: 'none',
          resize: 'none',
          background: 'transparent',
          color: 'transparent',
          caretColor: 'var(--text-primary)',
          fontFamily: editorFont,
          fontSize: editorFontSize,
          lineHeight: editorLineHeight,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflow: 'auto',
        }}
      />
    </div>
  )
}
