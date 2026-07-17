import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

export type Locale = 'zh-CN' | 'en-US'

const translations: Record<Locale, Record<string, string>> = {
  'zh-CN': {
    // App
    'app.name': 'Bamboo 监控',
    'app.loading': '加载中...',

    // Nav
    'nav.dashboard': '仪表盘',
    'nav.overview': '部署总览',
    'nav.settings': '设置',
    'nav.logs': '日志',
    'nav.health': '健康检查',

    // Login
    'login.title': 'Bamboo 监控',
    'login.subtitle': '连接到你的 Bamboo 服务器',
    'login.server': '服务器地址',
    'login.server.placeholder': 'http://192.168.30.59:8085',
    'login.username': '用户名',
    'login.username.placeholder': '请输入用户名',
    'login.password': '密码',
    'login.password.placeholder': '请输入密码',
    'login.connect': '连接',
    'login.connecting': '连接中...',
    'login.error.auth': '认证失败，请检查用户名和密码',
    'login.error.connection': '连接失败，请检查服务器地址',
    'login.allow_insecure_http': '允许不安全的 HTTP 连接（内网 Bamboo）',

    // Dashboard
    'dashboard.title': '构建记录',
    'dashboard.projects': '个项目已监控',
    'dashboard.no_projects': '未选择项目',
    'dashboard.no_projects.hint': '从左侧选择项目开始监控',
    'dashboard.select_project': '选择项目查看构建记录',
    'dashboard.projects_label': '项目',
    'dashboard.search_builds': '搜索构建...',
    'dashboard.tab.builds_all': '全部构建',
    'dashboard.tab.builds_favorites': '收藏',
    'dashboard.favorite_in_builds_hint': '选择左侧项目后，在构建卡片上点击星标收藏子项目',
    'dashboard.favorite': '收藏子项目',
    'dashboard.unfavorite': '取消收藏',
    'dashboard.favorites_polling': '个子项目已收藏并轮询',
    'dashboard.no_favorites': '暂无收藏',
    'dashboard.no_favorites.hint': '在「全部构建」中选择项目，在构建卡片上点击星标收藏',
    'dashboard.no_plans': '无子项目',
    'dashboard.deploy_load_error': '加载构建记录失败',
    'dashboard.deploy_latest_per_plan': '每个计划仅显示最新一条构建记录',
    'dashboard.git_auto_deployed': '已自动部署',
    'common.load_more': '加载更多',
    'common.loading_more': '加载中…',

    // Build detail
    'build.deploying': '部署进行中…',
    'build.deploy_done': '部署已完成',
    'build.stage_current': '当前阶段',
    'build.stage_progress': '阶段进度',
    'build.no_commit_message': '（无提交说明）',
    'build.delete_success': '构建记录已删除',
    'build.delete_failed': '删除构建记录失败',
    'build.delete_only_result': '无法删除唯一的构建记录',
    'build.delete_switching': '正在切换到其他构建记录后删除…',
    'build.queuing': '正在加载新构建…',

    // Deploy Card
    'deploy.triggeredBy': '触发者',
    'deploy.state': '状态',
    'deploy.started': '开始时间',
    'deploy.finished': '完成时间',
    'deploy.reason': '原因',

    // Deployments History (子项目详情 - 部署历史模块)
    'deploy.loading': '加载部署历史…',
    'deploy.no_history': '暂无部署历史',
    'deploy.history_title': '部署历史',
    'deploy.environment': '环境',
    'deploy.total': '总计',
    'deploy.stop': '中断',
    'deploy.stop_success': '部署已中断',
    'deploy.stop_failed': '中断部署失败，该部署可能已结束',
    'deploy.retry': '重试',
    'deploy.retry_success': '已发起重试部署',
    'deploy.retry_failed': '重试部署失败',
    'deploy.view_detail': '详情',

    // Status
    'status.success': '成功',
    'status.failed': '失败',
    'status.unknown': '未知',
    'status.in_progress': '进行中',
    'status.queued': '排队中',

    // Settings
    'settings.title': '设置',
    'settings.poll_interval': '轮询间隔（秒）',
    'settings.poll_interval.hint': '检查新构建的频率',
    'settings.auto_deploy_git': 'Git 有新提交时自动部署收藏计划',
    'settings.auto_deploy_git.hint': '轮询时对比远程仓库与最近构建的提交；若有新提交且当前无进行中构建，则自动触发 Bamboo 构建（需本机已安装 git）',
    'settings.auto_deploy_git.warning': '开启后将在检测到新提交时自动触发构建，请确认生产环境风险',
    'settings.allow_insecure_http': '允许 HTTP 连接 Bamboo',
    'settings.allow_insecure_http.hint': '默认仅允许 HTTPS；内网 HTTP Bamboo 需勾选此项',
    'settings.git_repo_mappings': 'Git 仓库地址映射',
    'settings.git_repo_mappings.placeholder': 'Insait-Joy-Web-Test=git@host:org/repo.git\nINTEST-JOYW=git@host:org/repo.git',
    'settings.git_repo_mappings.hint': 'Bamboo REST 无法读取仓库 clone 地址时，请按「仓库名」或「计划 Key」填写一行映射。仓库名可在构建详情的 vcsRevisions 中看到（如 Insait-Joy-Web-Test）。',
    'settings.notifications': '通知',
    'settings.notifications.hint': '每次新构建时显示 macOS 通知，点击通知可查看详情',
    'settings.save': '保存设置',
    'settings.saved': '已保存',
    'settings.section.appearance': '外观',
    'settings.section.polling': '轮询',
    'settings.section.deployment': '部署',
    'settings.section.notifications': '通知',
    'settings.language': '语言',
    'settings.theme': '主题',
    'settings.theme.dark': '深色',
    'settings.theme.light': '浅色',

    // Logs
    'logs.title': '日志',
    'logs.entries': '条记录',
    'logs.search': '搜索日志...',
    'logs.all_levels': '所有级别',
    'logs.all_categories': '所有分类',
    'logs.auto_refresh': '自动刷新',
    'logs.refresh': '刷新',
    'logs.export': '导出',
    'logs.clear': '清空',
    'logs.no_logs': '暂无日志',

    // Health
    'health.title': '系统健康',
    'health.ok': '所有系统正常',
    'health.issues': '检测到问题',
    'health.re_check': '重新检查',
    'health.checking': '检查中...',
    'health.connectivity': '服务器连接',
    'health.api': 'API 认证',
    'health.poller': '轮询服务',
    'health.logs': '日志系统',
    'health.status.ok': '正常',
    'health.status.active': '活跃',
    'health.status.degraded': '降级',
    'health.status.error': '错误',
    'health.status.auth_failed': '认证失败',
    'health.status.not_configured': '未配置',

    // Common
    'common.projects': '项目',
    'common.builds': '构建',
    'common.deployments': '部署',

    // Overview
    'overview.title': '部署总览',
    'overview.last_deploys': '最近部署',
    'overview.deploy_timeline': '部署时间线',
    'overview.metrics': '数据指标',
    'overview.status_dist': '构建状态分布',
    'overview.duration_trend': '构建耗时趋势',
    'overview.plan_build_count': '各计划构建次数',
    'overview.no_favorites': '暂无收藏计划',
    'overview.no_favorites.hint': '在仪表盘中收藏计划后，这里会展示其部署数据',
    'overview.pass_rate': '测试通过率',
    'overview.test_summary': '测试概况',

    // Build Detail Enhanced
    'build.plan_key': '计划 Key',
    'build.build_url': 'Bamboo 链接',
    'build.revision': '代码版本',
    'build.test_pass_rate': '测试通过率',
    'build.duration_chart': '耗时趋势',
    'build.job_name': 'Job 名称',
    'build.job_duration': '耗时',
    'build.branch': '分支',
    'build.commit_time': '提交时间',
    'build.artifact_download': '下载',
  },
  'en-US': {
    // App
    'app.name': 'Bamboo Monitor',
    'app.loading': 'Loading...',

    // Nav
    'nav.dashboard': 'Dashboard',
    'nav.overview': 'Deploy Overview',
    'nav.settings': 'Settings',
    'nav.logs': 'Logs',
    'nav.health': 'Health',

    // Login
    'login.title': 'Bamboo Monitor',
    'login.subtitle': 'Connect to your Bamboo server',
    'login.server': 'Server URL',
    'login.server.placeholder': 'http://192.168.30.59:8085',
    'login.username': 'Username',
    'login.username.placeholder': 'Enter username',
    'login.password': 'Password',
    'login.password.placeholder': 'Enter password',
    'login.connect': 'Connect',
    'login.connecting': 'Connecting...',
    'login.error.auth': 'Authentication failed. Check your credentials.',
    'login.error.connection': 'Connection failed. Check the server URL.',
    'login.allow_insecure_http': 'Allow insecure HTTP (on-prem Bamboo)',

    // Dashboard
    'dashboard.title': 'Build Results',
    'dashboard.projects': 'projects monitored',
    'dashboard.no_projects': 'No projects selected',
    'dashboard.no_projects.hint': 'Select projects from the left to start monitoring',
    'dashboard.select_project': 'Select a project to view builds',
    'dashboard.projects_label': 'Projects',
    'dashboard.search_builds': 'Search builds...',
    'dashboard.tab.builds_all': 'All Builds',
    'dashboard.tab.builds_favorites': 'Favorites',
    'dashboard.favorite_in_builds_hint': 'Select a project on the left, then star a build card to favorite its plan',
    'dashboard.favorite': 'Favorite plan',
    'dashboard.unfavorite': 'Remove favorite',
    'dashboard.favorites_polling': 'favorite plans polling',
    'dashboard.no_favorites': 'No favorites yet',
    'dashboard.no_favorites.hint': 'Under All Builds, select a project and star a build card',
    'dashboard.no_plans': 'No plans',
    'dashboard.deploy_load_error': 'Failed to load build results',
    'dashboard.deploy_latest_per_plan': 'Showing the latest build per plan only',
    'dashboard.git_auto_deployed': 'Auto-deployed',
    'common.load_more': 'Load more',
    'common.loading_more': 'Loading…',

    'build.deploying': 'Deployment in progress…',
    'build.deploy_done': 'Deployment finished',
    'build.stage_current': 'Current stage',
    'build.stage_progress': 'Stage progress',
    'build.no_commit_message': '(no commit message)',
    'build.delete_success': 'Build result removed',
    'build.delete_failed': 'Failed to remove build result',
    'build.delete_only_result': 'Cannot delete the only build result for this plan',
    'build.delete_switching': 'Switching to another build before delete…',
    'build.queuing': 'Loading new build…',

    // Deploy Card
    'deploy.triggeredBy': 'Triggered by',
    'deploy.state': 'State',
    'deploy.started': 'Started',
    'deploy.finished': 'Finished',
    'deploy.reason': 'Reason',

    // Deployments History
    'deploy.loading': 'Loading deployment history…',
    'deploy.no_history': 'No deployment history',
    'deploy.history_title': 'Deployment History',
    'deploy.environment': 'Environment',
    'deploy.total': 'Total',
    'deploy.stop': 'Abort',
    'deploy.stop_success': 'Deployment aborted',
    'deploy.stop_failed': 'Failed to abort — deployment may have already finished',
    'deploy.retry': 'Retry',
    'deploy.retry_success': 'Retry deployment triggered',
    'deploy.retry_failed': 'Failed to retry deployment',
    'deploy.view_detail': 'Details',

    // Status
    'status.success': 'Success',
    'status.failed': 'Failed',
    'status.unknown': 'Unknown',
    'status.in_progress': 'In Progress',
    'status.queued': 'Queued',

    // Settings
    'settings.title': 'Settings',
    'settings.poll_interval': 'Poll Interval (seconds)',
    'settings.poll_interval.hint': 'How often to check for new builds',
    'settings.auto_deploy_git': 'Auto-deploy favorites when Git has new commits',
    'settings.auto_deploy_git.hint': 'Each poll compares remote HEAD with the last build revision; queues a build when ahead (requires git on PATH)',
    'settings.auto_deploy_git.warning': 'When enabled, new commits automatically queue builds — confirm production risk',
    'settings.allow_insecure_http': 'Allow HTTP connections to Bamboo',
    'settings.allow_insecure_http.hint': 'HTTPS is required by default; enable for on-prem HTTP Bamboo servers',
    'settings.git_repo_mappings': 'Git repository URL mappings',
    'settings.git_repo_mappings.placeholder': 'Insait-Joy-Web-Test=git@host:org/repo.git\nINTEST-JOYW=git@host:org/repo.git',
    'settings.git_repo_mappings.hint': 'When Bamboo REST cannot expose clone URLs, map Bamboo repository name or plan key to a git remote (see repositoryName in build vcsRevisions).',
    'settings.notifications': 'Notifications',
    'settings.notifications.hint': 'macOS notifications for each new build. Click to view details.',
    'settings.save': 'Save Settings',
    'settings.saved': 'Saved',
    'settings.section.appearance': 'Appearance',
    'settings.section.polling': 'Polling',
    'settings.section.deployment': 'Deployment',
    'settings.section.notifications': 'Notifications',
    'settings.language': 'Language',
    'settings.theme': 'Theme',
    'settings.theme.dark': 'Dark',
    'settings.theme.light': 'Light',

    // Logs
    'logs.title': 'Logs',
    'logs.entries': 'entries',
    'logs.search': 'Search logs...',
    'logs.all_levels': 'All Levels',
    'logs.all_categories': 'All Categories',
    'logs.auto_refresh': 'Auto-refresh',
    'logs.refresh': 'Refresh',
    'logs.export': 'Export',
    'logs.clear': 'Clear',
    'logs.no_logs': 'No logs found',

    // Health
    'health.title': 'System Health',
    'health.ok': 'All systems operational',
    'health.issues': 'Issues detected',
    'health.re_check': 'Re-check',
    'health.checking': 'Running health checks...',
    'health.connectivity': 'Server Connectivity',
    'health.api': 'API Authentication',
    'health.poller': 'Poller Service',
    'health.logs': 'Logging System',
    'health.status.ok': 'Healthy',
    'health.status.active': 'Active',
    'health.status.degraded': 'Degraded',
    'health.status.error': 'Error',
    'health.status.auth_failed': 'Auth Failed',
    'health.status.not_configured': 'Not Configured',

    // Common
    'common.projects': 'Projects',
    'common.builds': 'Builds',
    'common.deployments': 'Deployments',

    // Overview
    'overview.title': 'Deploy Overview',
    'overview.last_deploys': 'Recent Deploys',
    'overview.deploy_timeline': 'Deploy Timeline',
    'overview.metrics': 'Metrics',
    'overview.status_dist': 'Build Status Distribution',
    'overview.duration_trend': 'Build Duration Trend',
    'overview.plan_build_count': 'Builds per Plan',
    'overview.no_favorites': 'No favorite plans',
    'overview.no_favorites.hint': 'Favorite plans in the dashboard to see their deploy data here',
    'overview.pass_rate': 'Test Pass Rate',
    'overview.test_summary': 'Test Summary',

    // Build Detail Enhanced
    'build.plan_key': 'Plan Key',
    'build.build_url': 'Bamboo URL',
    'build.revision': 'Revision',
    'build.test_pass_rate': 'Test Pass Rate',
    'build.duration_chart': 'Duration Trend',
    'build.job_name': 'Job Name',
    'build.job_duration': 'Duration',
    'build.branch': 'Branch',
    'build.commit_time': 'Commit Time',
    'build.artifact_download': 'Download',
  },
}

interface I18nContextValue {
  locale: Locale
  t: (key: string) => string
  setLocale: (locale: Locale) => void
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'zh-CN',
  t: (key) => key,
  setLocale: () => {},
})

export function I18nProvider({ children, initialLocale = 'zh-CN' }: { children: ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale)
    try { localStorage.setItem('bamboo-locale', newLocale) } catch {}
  }, [])

  const t = useCallback((key: string): string => {
    return translations[locale]?.[key] ?? key
  }, [locale])

  return (
    <I18nContext.Provider value={{ locale, t, setLocale }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  return useContext(I18nContext)
}

export function getSavedLocale(): Locale {
  try {
    const saved = localStorage.getItem('bamboo-locale')
    if (saved === 'zh-CN' || saved === 'en-US') return saved
  } catch {}
  return 'zh-CN'
}
