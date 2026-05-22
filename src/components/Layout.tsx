import { useState, ReactNode } from 'react'
import { useI18n } from '../lib/i18n'
import { useNavigate, useRoute, type Route } from '../pages/routes'
import { LayoutDashboard, Settings as SettingsIcon, ScrollText, HeartPulse, PanelLeftClose, PanelLeft } from 'lucide-react'

interface Props {
  children: ReactNode
}

const NAV_ITEMS = [
  { key: 'dashboard' as const, icon: LayoutDashboard, labelKey: 'nav.dashboard' },
  { key: 'settings' as const, icon: SettingsIcon, labelKey: 'nav.settings' },
]

const TOOL_ITEMS = [
  { key: 'logs' as const, icon: ScrollText, labelKey: 'nav.logs' },
  { key: 'health' as const, icon: HeartPulse, labelKey: 'nav.health' },
]

export default function Layout({ children }: Props) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const route = useRoute()
  const [collapsed, setCollapsed] = useState(false)

  // Determine sidebar active page. For build pages, highlight dashboard.
  const page: Route['page'] = route.page === 'build' ? 'dashboard' : route.page

  return (
    <div style={{ height: '100%', display: 'flex', background: 'var(--bg-page)' }}>
      {/* Sidebar */}
      <div style={{
        width: collapsed ? 56 : 220,
        background: 'var(--bg-panel)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex', flexDirection: 'column',
        flexShrink: 0, transition: 'width 0.2s ease',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: collapsed ? '16px 0' : '16px',
          marginBottom: 8, display: 'flex', alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
        }}>
          {!collapsed && (
            <div style={{
              fontSize: 15, fontWeight: 510, color: 'var(--text-primary)', letterSpacing: '-0.165px',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1,
            }}>
              {t('app.name')}
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{
              background: 'none', border: 'none', color: 'var(--text-tertiary)',
              cursor: 'pointer', padding: 6, display: 'flex', borderRadius: 'var(--radius-sm)',
              transition: 'color 0.15s ease',
            }}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        <nav style={{ padding: collapsed ? '0 4px' : '0 8px', flex: 1 }}>
          {NAV_ITEMS.map((item) => (
            <NavItem
              key={item.key}
              icon={item.icon}
              label={collapsed ? '' : t(item.labelKey)}
              active={page === item.key}
              onClick={() => navigate({ page: item.key })}
              collapsed={collapsed}
            />
          ))}

          <div style={{
            margin: collapsed ? '12px 4px 8px' : '12px 0 8px',
            borderTop: '1px solid var(--border-subtle)', paddingTop: 12,
          }} />

          {TOOL_ITEMS.map((item) => (
            <NavItem
              key={item.key}
              icon={item.icon}
              label={collapsed ? '' : t(item.labelKey)}
              active={page === item.key}
              onClick={() => navigate({ page: item.key })}
              collapsed={collapsed}
            />
          ))}
        </nav>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflow: 'auto', padding: collapsed ? '16px 20px' : '16px 32px' }}>
        {children}
      </div>
    </div>
  )
}

function NavItem({ icon: Icon, label, active, onClick, collapsed }: {
  icon: any; label: string; active: boolean; onClick: () => void; collapsed: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        width: '100%', minWidth: 0, padding: collapsed ? '8px' : '8px 12px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        background: active ? 'rgba(94, 106, 210, 0.08)' : 'transparent',
        border: 'none', borderRadius: 'var(--radius-md)',
        color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
        fontSize: 14, fontWeight: 510,
        fontFamily: 'inherit', fontFeatureSettings: '"cv01", "ss03"',
        cursor: 'pointer', textAlign: 'left',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => {
        if (!active) { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)'; e.currentTarget.style.color = 'var(--text-secondary)' }
      }}
      onMouseLeave={(e) => {
        if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-tertiary)' }
      }}
    >
      <Icon size={16} />
      {label && (
        <span style={{
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          minWidth: 0, flex: collapsed ? undefined : 1,
        }}>
          {label}
        </span>
      )}
    </button>
  )
}
