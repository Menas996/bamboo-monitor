import type { CSSProperties } from 'react'
import { useI18n } from '../lib/i18n'

interface Project {
  key: string
  name: string
}

interface Props {
  projects: Project[]
  activeProject: string | null
  onSelect: (key: string | null) => void
}

const nowrapText: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
}

export default function ProjectTree({ projects, activeProject, onSelect }: Props) {
  const { t } = useI18n()

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        fontSize: 12, fontWeight: 510, color: 'var(--text-quaternary)',
        textTransform: 'uppercase', letterSpacing: '0.05em',
        padding: '0 12px', marginBottom: 8,
        ...nowrapText,
      }}>
        {t('dashboard.projects_label')}
      </div>
      {projects.map((p) => {
        const isActive = activeProject === p.key
        return (
          <button
            key={p.key}
            onClick={() => onSelect(isActive ? null : p.key)}
            title={p.name}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '8px 12px', borderRadius: 'var(--radius-sm)',
              background: isActive ? 'rgba(94, 106, 210, 0.08)' : 'transparent',
              border: 'none',
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontSize: 13, fontFamily: 'inherit', fontFeatureSettings: '"cv01", "ss03"',
              cursor: 'pointer', transition: 'all 0.1s ease',
              ...nowrapText,
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)'
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.background = 'transparent'
            }}
          >
            {p.name}
          </button>
        )
      })}
    </div>
  )
}
