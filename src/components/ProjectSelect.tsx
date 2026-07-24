import { useState, useRef, useEffect, useMemo } from 'react'
import { useI18n } from '../lib/i18n'
import { Search, ChevronDown, Check, FolderGit2, X } from 'lucide-react'

export interface Project {
  key: string
  name: string
}

interface Props {
  projects: Project[]
  selectedProject: string | null
  onSelect: (key: string) => void
  showLabel?: boolean
}

export default function ProjectSelect({ projects, selectedProject, onSelect, showLabel = true }: Props) {
  const { t } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const activeProj = useMemo(() => {
    return projects.find((p) => p.key === selectedProject)
  }, [projects, selectedProject])

  const filteredProjects = useMemo(() => {
    if (!search.trim()) return projects
    const q = search.toLowerCase()
    return projects.filter(
      (p) => p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q)
    )
  }, [projects, search])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 50)
    } else {
      setSearch('')
    }
  }, [isOpen])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        zIndex: isOpen ? 100 : 1,
      }}
    >
      {showLabel && (
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--text-tertiary)',
            whiteSpace: 'nowrap',
          }}
        >
          {t('dashboard.projects_label')}：
        </span>
      )}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 12px',
          background: 'var(--bg-surface)',
          boxShadow: 'var(--ring-border)',
          border: 'none',
          borderRadius: 'var(--radius-md)',
          color: activeProj ? 'var(--text-primary)' : 'var(--text-tertiary)',
          fontSize: 13,
          fontFamily: 'inherit',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          minWidth: 180,
          maxWidth: 260,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--bg-elevated)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--bg-surface)'
        }}
      >
        <FolderGit2 size={15} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
        <span
          className="truncate"
          style={{ flex: 1, textAlign: 'left', fontWeight: activeProj ? 500 : 400 }}
        >
          {activeProj ? activeProj.name : t('dashboard.search_projects')}
        </span>
        <ChevronDown
          size={14}
          style={{
            color: 'var(--text-quaternary)',
            flexShrink: 0,
            transition: 'transform 0.2s ease',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: showLabel ? 42 : 0,
            zIndex: 1000,
            width: 280,
            background: 'var(--bg-surface)',
            boxShadow: 'rgba(0, 0, 0, 0.4) 0px 8px 24px, var(--ring-border)',
            borderRadius: 'var(--radius-lg)',
            padding: 8,
            animation: 'fadeSlideUp 0.15s ease',
          }}
        >
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-quaternary)',
                pointerEvents: 'none',
              }}
            />
            <input
              ref={searchInputRef}
              className="input-linear"
              placeholder={t('dashboard.search_projects')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                paddingLeft: 30,
                paddingRight: search ? 28 : 10,
                fontSize: 12,
                height: 32,
                borderRadius: 'var(--radius-sm)',
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-quaternary)',
                  cursor: 'pointer',
                  padding: 2,
                  display: 'flex',
                }}
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div
            style={{
              maxHeight: 220,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            {filteredProjects.length === 0 ? (
              <div
                style={{
                  padding: '16px 12px',
                  fontSize: 12,
                  color: 'var(--text-quaternary)',
                  textAlign: 'center',
                }}
              >
                {t('logs.no_logs')}
              </div>
            ) : (
              filteredProjects.map((p) => {
                const isSelected = p.key === selectedProject
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => {
                      onSelect(p.key)
                      setIsOpen(false)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      width: '100%',
                      textAlign: 'left',
                      padding: '7px 10px',
                      borderRadius: 'var(--radius-sm)',
                      background: isSelected ? 'rgba(94, 106, 210, 0.12)' : 'transparent',
                      border: 'none',
                      color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                      fontSize: 13,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      transition: 'background 0.1s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="truncate" style={{ fontWeight: isSelected ? 500 : 400 }}>
                        {p.name}
                      </div>
                      {p.key !== p.name && (
                        <div
                          className="truncate"
                          style={{ fontSize: 11, color: 'var(--text-quaternary)', marginTop: 1 }}
                        >
                          {p.key}
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <Check size={14} style={{ color: 'var(--text-primary)', flexShrink: 0 }} />
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
