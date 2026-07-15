# bamboo-monitor 项目长期记忆

## 项目架构
- Electron + React + TypeScript + Tailwind CSS，对接 Atlassian Bamboo 6.10.4 REST API
- 主进程 (electron/) 通过 BambooClient 调用 API，IPC 暴露给渲染进程 (src/)
- 自定义路由系统（routes.tsx），页面：dashboard/build/settings/logs/health/overview
- "子项目" = Bamboo Plan；"子项目详情页" = BuildDetail.tsx
- 服务器 Bamboo Deploy API 不可用，部署概念基于 build results 映射（buildResultToDeploy）

## 设计系统
- Vercel Geist 设计系统：shadow-as-border、三字重(400/500/600)、负字距
- 详见 DESIGN.md；CSS 变量在 globals.css，支持 light/dark 主题
- 组件类：card-surface, btn-ghost, btn-primary, input-linear, ring-border

## Bamboo API 对接模式
- 认证：Basic Auth 优先，失败回退 form-based session login（CSRF token atl_token）
- Struts action 调用（deleteBuildResult/stopBuild）：POST + X-Atlassian-Token: no-check + X-Requested-With: XMLHttpRequest，成功判定 302/200/204
- buildResultKey 解析：最后一个 `-` 后为 buildNumber，前面为 planKey
- 轮询：EventEmitter-based poller.ts，渲染进程 usePoll hook

## 关键文件
- electron/bamboo-client.ts：BambooClient 类，所有 API 调用
- electron/main.ts：IPC handlers 注册
- electron/preload.ts：contextBridge 暴露 window.bamboo/actions/config/poll/logs/health/win
- src/App.tsx：window 全局类型声明（declare global interface Window）
- src/pages/BuildDetail.tsx：子项目详情页，tabs: summary/stages/jira/changes/variables/tests/deployments/history
- src/lib/bamboo-build.ts：构建结果工具函数（isBuildRunning, normalizePlanResults 等）
- src/lib/i18n.tsx：国际化，zh-CN / en-US
