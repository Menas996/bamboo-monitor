# Bamboo 功能全量梳理 — 增删改查操作矩阵

> 基于 Atlassian Bamboo 6.10.4 REST API（`/rest/api/latest/`），结合 bamboo-monitor 项目当前实现状态。
> 更新日期：2026-07-15

---

## 目录

| # | 功能模块 | 当前覆盖度 |
|---|---------|-----------|
| 1 | [项目与计划管理](#1-项目与计划管理) | 查 ✅ / 增删改 ❌ |
| 2 | [构建任务触发与配置](#2-构建任务触发与配置) | 触发/停止/删除 ✅ / 队列管理 ❌ |
| 3 | [构建结果查看与分析](#3-构建结果查看与分析) | 查 ✅ / 评论标签 ❌ |
| 4 | [部署流程管理与执行](#4-部署流程管理与执行) | 映射查看 ✅ / 原生部署 ⚠️ |
| 5 | [分支与仓库关联管理](#6-分支与仓库关联管理) | 查 ✅ / 增删改 ❌ |
| 6 | [用户权限与角色分配](#7-用户权限与角色分配) | ❌ 全未实现 |
| 7 | [Agent 与能力管理](#8-agent-与能力管理) | ❌ 全未实现 |
| 8 | [环境变量与变量管理](#9-环境变量与变量管理) | ❌ 全未实现 |
| 9 | [通知与告警规则设置](#10-通知与告警规则设置) | ❌ 全未实现 |
| 10 | [服务器与系统管理](#11-服务器与系统管理) | 健康检查 ✅ / 管控 ❌ |
| 11 | [搜索与过滤](#12-搜索与过滤) | 本地搜索 ✅ / API搜索 ❌ |
| 12 | [导出与导入](#13-导出与导入) | ❌ 全未实现 |

---

## 1. 项目与计划管理

### 1.1 项目（Project）

| 操作 | HTTP 方法 | API 端点 | 前置条件 / 约束 | 当前状态 |
|------|-----------|---------|----------------|---------|
| 列出所有项目 | GET | `/rest/api/latest/project` | READ 权限；无 plan 的项目不返回 | ✅ 已实现 |
| 获取项目详情 | GET | `/rest/api/latest/project/{projectKey}?expand=plans` | READ 权限 | ✅ 已实现 |
| 列出项目计划 | GET | `/rest/api/latest/project/{projectKey}?expand=plans.plan` | READ 权限 | ✅ 已实现 |
| **创建项目** | — | **REST API 不直接支持** | 需通过 [Bamboo Specs](https://docs.atlassian.com/bamboo-specs-docs/)（YAML/Java）推送 | ❌ |
| **删除项目** | — | **REST API 不直接支持** | 需 Bamboo Specs 或管理后台操作 | ❌ |
| **编辑项目** | — | **REST API 不直接支持** | 需 Bamboo Specs 或管理后台操作 | ❌ |

**项目权限管理**

| 操作 | HTTP 方法 | API 端点 | 约束 |
|------|-----------|---------|------|
| 授予用户权限 | PUT | `/permissions/project/{key}/users/{name}` | Body: `["READ","CREATE","ADMINISTRATION"]`；需 ADMINISTRATION 权限 |
| 撤销用户权限 | DELETE | `/permissions/project/{key}/users/{name}` | 同上 |
| 授予组权限 | PUT | `/permissions/project/{key}/groups/{name}` | 同上 |
| 撤销组权限 | DELETE | `/permissions/project/{key}/groups/{name}` | 同上 |
| 授予角色权限 | PUT | `/permissions/project/{key}/roles/{name}` | 角色仅限 `LOGGED_IN` / `ANONYMOUS` |
| 撤销角色权限 | DELETE | `/permissions/project/{key}/roles/{name}` | 同上 |
| 查可用用户 | GET | `/permissions/project/{key}/available-users?name=X` | 分页返回 |
| 查可用组 | GET | `/permissions/project/{key}/available-groups?name=X` | 分页返回 |

### 1.2 计划（Plan）

| 操作 | HTTP 方法 | API 端点 | 前置条件 / 约束 | 当前状态 |
|------|-----------|---------|----------------|---------|
| 列出所有计划 | GET | `/rest/api/latest/plan` | READ 权限 | ✅ 间接实现（通过项目） |
| 获取计划详情 | GET | `/rest/api/latest/plan/{planKey}?expand=stages,branches` | READ 权限 | ✅ 已实现 |
| **克隆计划** | PUT | `/rest/api/latest/clone/{fromKey}:{toKey}` | 需 CREATE 权限；目标 key 不存在 | ❌ |
| **启用计划** | POST | `/rest/api/latest/plan/{planKey}/enable` | 需 EDIT/ADMINISTRATION 权限 | ❌ |
| **禁用计划** | DELETE | `/rest/api/latest/plan/{planKey}/enable` | 同上 | ❌ |
| **添加收藏** | POST | `/rest/api/latest/plan/{planKey}/favourite` | 已登录 | ✅ 本地实现 |
| **取消收藏** | DELETE | `/rest/api/latest/plan/{planKey}/favourite` | 已登录 | ✅ 本地实现 |
| **创建计划** | — | **REST API 不直接支持** | 需 Bamboo Specs | ❌ |
| **删除计划** | — | **REST API 不直接支持** | 需 Bamboo Specs 或管理后台 | ❌ |
| **编辑计划配置** | — | **REST API 不直接支持** | 需 Bamboo Specs 或 Struts action（非公开 API） | ❌ |
| 获取计划图标 | GET | `/rest/api/latest/plan/{planKey}/favicon` | READ 权限 | ❌ |

**计划标签管理**

| 操作 | HTTP 方法 | API 端点 |
|------|-----------|---------|
| 列出标签 | GET | `/rest/api/latest/plan/{planKey}/label` |
| 添加标签 | POST | `/rest/api/latest/plan/{planKey}/label` |
| 删除标签 | DELETE | `/rest/api/latest/plan/{planKey}/label/{labelName}` |

**计划权限管理**

| 操作 | HTTP 方法 | API 端点 |
|------|-----------|---------|
| 授予/撤销用户权限 | PUT / DELETE | `/permissions/plan/{key}/users/{name}` |
| 授予/撤销组权限 | PUT / DELETE | `/permissions/plan/{key}/groups/{name}` |
| 授予/撤销角色权限 | PUT / DELETE | `/permissions/plan/{key}/roles/{name}` |
| 查可用用户/组 | GET | `/permissions/plan/{key}/available-users` · `available-groups` |

**计划依赖管理**

| 操作 | HTTP 方法 | API 端点 | 说明 |
|------|-----------|---------|------|
| 查子依赖 | GET | `/rest/api/latest/dependency/{planKey}/child` | 依赖此计划的其他计划 |
| 查父依赖 | GET | `/rest/api/latest/dependency/{planKey}/parent` | 此计划依赖的计划 |
| 搜索子依赖 | GET | `/rest/api/latest/dependency/search/{planKey}/child` | 模糊搜索 |
| 搜索父依赖 | GET | `/rest/api/latest/dependency/search/{planKey}/parent` | 模糊搜索 |

### 1.3 计划分支（Plan Branch）

| 操作 | HTTP 方法 | API 端点 | 前置条件 / 约束 | 当前状态 |
|------|-----------|---------|----------------|---------|
| 列出计划分支 | GET | `/rest/api/latest/plan/{planKey}/branch` | READ 权限 | ❌ |
| **创建/更新分支** | PUT | `/rest/api/latest/plan/{planKey}/branch/{branchName}?vcsBranch=X` | 需 EDIT 权限；可指定 VCS 分支 | ❌ |
| 获取 VCS 分支 | GET | `/rest/api/latest/plan/{planKey}/vcsBranches` | READ 权限 | ✅ 已实现 |
| 关联 Jira Issue | GET | `/rest/api/latest/plan/{planKey}/issue/{issueKey}` | READ 权限 | ❌ |

---

## 2. 构建任务触发与配置

### 2.1 构建队列管理

| 操作 | HTTP 方法 | API 端点 | 前置条件 / 约束 | 当前状态 |
|------|-----------|---------|----------------|---------|
| 查看构建队列 | GET | `/rest/api/latest/queue` | READ 权限 | ✅ 间接（getQueuedBuildsForPlan） |
| **触发构建** | POST | `/rest/api/latest/queue/{planKey}` | BUILD 权限；可传 `bamboo.variable.X=Y` 覆盖变量 | ✅ 已实现 |
| 触发（带变量） | POST | `/rest/api/latest/queue/{planKey}?bamboo.variable.X=Y&executeAllStages=true` | 同上 | ✅ 已实现 |
| **取消排队构建** | DELETE | `/rest/api/latest/queue/{buildResultKey}` | 仅 QUEUED 状态有效 | ✅ 已实现（stopBuild 内部覆盖） |
| **重跑失败 Jobs** | POST | `/rest/api/latest/queue/{planKey}/rerunFailedJobs` | 构建已结束且存在失败 Job | ❌ |
| **继续手动阶段** | POST | `/rest/api/latest/queue/{planKey}/continue?stage=X&executeAllStages=true` | 构建停在手动阶段 | ❌ |
| **指定阶段执行** | POST | `/rest/api/latest/queue/{planKey}?stage=X&executeAllStages=true` | BUILD 权限 | ❌ |
| **停止运行中构建** | POST (Struts) | `/build/admin/stopPlan.action` | 需 ADMINISTRATION 权限；Body: `planKey` + `buildNumber`；Header: `X-Atlassian-Token: no-check` | ✅ 已实现 |
| 停止运行中构建 | DELETE | `/rest/api/latest/queue/deployment/{deploymentResultId}` | 部署专用（Bamboo 6.8+） | ⚠️ Deploy API 不可用 |

### 2.2 构建配置

> **重要约束**：Bamboo REST API **不直接支持**通过标准端点创建/编辑/删除计划的 Stage、Job、Task 配置。配置变更需通过：
> 1. **Bamboo Specs**（YAML/Java，推荐）
> 2. **Struts action**（非公开 API，UI 内部使用）
> 3. **管理后台**手动操作

| 能力 | 实现方式 | 约束 |
|------|---------|------|
| 创建/编辑/删除 Stage | Bamboo Specs | 需 CREATE / EDIT / ADMINISTRATION 权限 |
| 创建/编辑/删除 Job | Bamboo Specs | 同上 |
| 创建/编辑/删除 Task | Bamboo Specs | 同上 |
| 配置触发器 | Bamboo Specs | 支持定时、仓库变更、远程、轮询 |
| 配置 Artifact | Bamboo Specs | — |

---

## 3. 构建结果查看与分析

### 3.1 构建结果查询

| 操作 | HTTP 方法 | API 端点 | 前置条件 / 约束 | 当前状态 |
|------|-----------|---------|----------------|---------|
| 所有构建结果 | GET | `/rest/api/latest/result` | READ 权限；默认 25 条 | ✅ 间接实现 |
| 计划构建结果 | GET | `/rest/api/latest/result/{planKey}` | READ 权限；支持 `max-results` / `start-index` | ✅ 已实现 |
| 指定编号结果 | GET | `/rest/api/latest/result/{planKey}-{buildNumber}` | READ 权限 | ✅ 间接实现 |
| 构建结果详情 | GET | `/rest/api/latest/result/{buildResultKey}?expand=vcsRevisions,changes,stages,artifacts,variables,jiraIssues` | READ 权限 | ✅ 已实现 |
| 构建状态 | GET | `/rest/api/latest/result/status/{planKey}-{buildNumber}` | 轻量查询，仅返回状态 | ❌ |
| 按变更集查 | GET | `/rest/api/latest/result/byChangeset/{csid}` | READ 权限 | ❌ |
| 按检出变更集查 | GET | `/rest/api/latest/result/byCheckoutChangeset/{csid}` | READ 权限 | ❌ |

### 3.2 构建日志

| 操作 | HTTP 方法 | API 端点 | 约束 | 当前状态 |
|------|-----------|---------|------|---------|
| 获取构建日志 | GET | `/rest/api/latest/result/{buildResultKey}/log` | 返回 text/plain；大日志需分段 | ✅ 已实现 |

### 3.3 构建结果操作

| 操作 | HTTP 方法 | API 端点 | 前置条件 / 约束 | 当前状态 |
|------|-----------|---------|----------------|---------|
| **删除构建结果** | POST (Struts) | `/build/admin/deletePlanResults.action` | ADMINISTRATION 权限；Body: `buildKey` + `buildNumber`；Header: `X-Atlassian-Token: no-check` | ✅ 已实现 |
| **添加评论** | POST | `/rest/api/latest/result/{buildResultKey}/comment` | WRITE 权限 | ❌ |
| 删除评论 | DELETE | `/rest/api/latest/result/{buildResultKey}/comment/{commentId}` | 作者或 ADMINISTRATION | ❌ |
| 查看评论 | GET | `/rest/api/latest/result/{buildResultKey}/comment` | READ 权限 | ❌ |
| **添加标签** | POST | `/rest/api/latest/result/{buildResultKey}/label` | WRITE 权限 | ❌ |
| 删除标签 | DELETE | `/rest/api/latest/result/{buildResultKey}/label/{labelName}` | WRITE 权限 | ❌ |
| 查看标签 | GET | `/rest/api/latest/result/{buildResultKey}/label` | READ 权限 | ❌ |

### 3.4 图表与报告

| 操作 | HTTP 方法 | API 端点 | 说明 | 当前状态 |
|------|-----------|---------|------|---------|
| 生成图表 | GET | `/rest/api/latest/chart?reportKey=X&buildKey=Y` | 返回图表数据 | ❌ |
| 报告类型列表 | GET | `/rest/api/latest/chart/reports` | 所有可用报告类型 | ❌ |
| 计划摘要图表 | GET | `/rest/api/latest/chart/planSummary?planKey=X` | 计划构建摘要 | ❌ |

### 3.5 Artifact 管理

| 操作 | HTTP 方法 | API 端点 | 约束 | 当前状态 |
|------|-----------|---------|------|---------|
| 获取 Artifact 列表 | GET | `/rest/api/latest/result/{buildResultKey}?expand=artifacts` | 随构建详情返回 | ✅ 间接实现 |
| 下载 Artifact | GET | 构建详情中的 `link.href` | 需拼接完整 URL | ❌ |

---

## 4. 部署流程管理与执行

> **当前项目约束**：目标服务器 Bamboo 6.10.4 的 Deploy API（`/rest/api/latest/deploy/*`）不可用。
> 项目通过 `buildResultToDeploy()` 将 build results 映射为部署结构，以"部署"视角展示构建历史。
> 以下原生 Deploy API 端点列出供参考，标注服务器可用性。

### 4.1 部署项目管理

| 操作 | HTTP 方法 | API 端点 | 前置条件 / 约束 | 服务器可用 |
|------|-----------|---------|----------------|-----------|
| 列出所有部署项目 | GET | `/rest/api/latest/deploy/project/all` | READ 权限 | ⚠️ 不可用 |
| 获取部署项目详情 | GET | `/rest/api/latest/deploy/project/{id}` | READ 权限 | ⚠️ 不可用 |
| **创建部署项目** | PUT | `/rest/api/latest/deploy/project` | CREATE 权限；Body 含 name + planKey | ⚠️ 不可用 |
| **编辑部署项目** | POST | `/rest/api/latest/deploy/project/{id}` | EDIT 权限 | ⚠️ 不可用 |
| **删除部署项目** | DELETE | `/rest/api/latest/deploy/project/{id}` | ADMINISTRATION 权限 | ⚠️ 不可用 |
| 获取部署版本列表 | GET | `/rest/api/latest/deploy/project/{id}/versions` | READ 权限 | ⚠️ 不可用 |
| 按计划查部署项目 | GET | `/rest/api/latest/deploy/project/forPlan?planKey=X` | READ 权限 | ⚠️ 不可用 |
| 部署仪表盘 | GET | `/rest/api/latest/deploy/dashboard` | READ 权限 | ⚠️ 不可用 |

### 4.2 部署环境管理

| 操作 | HTTP 方法 | API 端点 | 约束 | 服务器可用 |
|------|-----------|---------|------|-----------|
| 获取环境详情 | GET | `/rest/api/latest/deploy/environment/{id}` | READ 权限 | ⚠️ 不可用 |
| 获取环境部署结果 | GET | `/rest/api/latest/deploy/environment/{id}/results` | READ 权限 | ⚠️ 不可用 |
| **调整环境顺序** | POST | `/rest/api/latest/deploy/environment/{id}/move/{position}/{relativeId}` | EDIT 权限；position: BEFORE/AFTER | ⚠️ 不可用 |
| **Agent 分配** | GET / POST | `/rest/api/latest/deploy/environment/{id}/agent-assignment` | EDIT 权限 | ⚠️ 不可用 |
| 移除 Agent 分配 | DELETE | `/rest/api/latest/deploy/environment/{id}/agent-assignment/{executorKey}` | EDIT 权限 | ⚠️ 不可用 |
| 可用 Agent 列表 | GET | `/rest/api/latest/deploy/environment/{id}/possible-agent-assignment` | READ 权限 | ⚠️ 不可用 |
| **Docker 配置** | GET / PUT | `/rest/api/latest/deploy/environment/{id}/docker` | EDIT 权限 | ⚠️ 不可用 |
| **环境需求管理** | GET / POST | `/rest/api/latest/deploy/environment/{id}/requirement` | EDIT 权限 | ⚠️ 不可用 |
| 更新/删除需求 | PUT / DELETE | `/rest/api/latest/deploy/environment/{id}/requirement/{id}` | EDIT 权限 | ⚠️ 不可用 |

### 4.3 部署执行

| 操作 | HTTP 方法 | API 端点 | 前置条件 / 约束 | 当前状态 |
|------|-----------|---------|----------------|---------|
| **触发部署** | POST | `/rest/api/latest/queue/deployment/?environmentId=X&versionId=Y` | BUILD 权限；返回 deploymentResultId | ⚠️ 不可用 |
| **取消部署** | DELETE | `/rest/api/latest/queue/deployment/{deploymentResultId}` | 仅进行中的部署 | ⚠️ 不可用 |
| 部署结果详情 | GET | `/rest/api/latest/deploy/result/{id}` | READ 权限 | ⚠️ 不可用 |
| 部署结果列表 | GET | `/rest/api/latest/deploy/result` | READ 权限 | ⚠️ 不可用 |
| Issue 部署状态 | GET | `/rest/api/latest/deploy/issue-status/{key}` | READ 权限 | ⚠️ 不可用 |

### 4.4 部署预览与版本管理

| 操作 | HTTP 方法 | API 端点 | 说明 |
|------|-----------|---------|------|
| 部署结果预览 | GET | `/rest/api/latest/deploy/preview/result` | 预览部署到某环境的结果 |
| 版本预览 | GET | `/rest/api/latest/deploy/preview/version` | 预览版本信息 |
| 可能结果列表 | GET | `/rest/api/latest/deploy/preview/possibleResults` | 可部署的结果列表 |
| 版本名预览 | GET | `/rest/api/latest/deploy/preview/versionName` | 版本命名预览 |
| 版本变量 | GET | `/rest/api/latest/deploy/projectVersioning/{id}/variables` | 版本变量 |
| 命名预览 | GET | `/rest/api/latest/deploy/projectVersioning/{id}/namingPreview` | 版本命名规则预览 |

### 4.5 部署权限管理

| 操作 | HTTP 方法 | API 端点 | 约束 |
|------|-----------|---------|------|
| 授予/撤销用户环境权限 | PUT / DELETE | `/permissions/environment/{id}/users/{name}` | 权限: READ/WRITE/BUILD |
| 授予/撤销组环境权限 | PUT / DELETE | `/permissions/environment/{id}/groups/{name}` | 同上 |
| 授予/撤销角色环境权限 | PUT / DELETE | `/permissions/environment/{id}/roles/{name}` | 同上 |
| 授予/撤销用户部署项目权限 | PUT / DELETE | `/permissions/deployment/{id}/users/{name}` | 同上 |
| 授予/撤销组部署项目权限 | PUT / DELETE | `/permissions/deployment/{id}/groups/{name}` | 同上 |

---

## 6. 分支与仓库关联管理

### 6.1 仓库管理

| 操作 | HTTP 方法 | API 端点 | 前置条件 / 约束 | 当前状态 |
|------|-----------|---------|----------------|---------|
| 列出所有仓库 | GET | `/rest/api/latest/repository?max-result=50` | READ 权限 | ✅ 已实现 |
| 搜索仓库 | GET | `/rest/api/latest/repository?searchTerm=X` | READ 权限 | ✅ 已实现 |
| 获取仓库详情 | GET | `/rest/api/latest/repository/{id}` | READ 权限 | ✅ 已实现 |
| 按项目搜索仓库 | GET | `/rest/api/latest/project/{projectKey}/repository/search?searchTerm=X` | READ 权限 | ✅ 已实现 |
| **创建关联仓库** | — | **REST API 不直接支持** | 需 Bamboo Specs 或管理后台 | ❌ |
| **编辑关联仓库** | — | **REST API 不直接支持** | 同上 | ❌ |
| **删除关联仓库** | — | **REST API 不直接支持** | 同上 | ❌ |

### 6.2 分支管理

| 操作 | HTTP 方法 | API 端点 | 前置条件 / 约束 | 当前状态 |
|------|-----------|---------|----------------|---------|
| 列出计划分支 | GET | `/rest/api/latest/plan/{planKey}/branch` | READ 权限 | ❌ |
| **创建/更新计划分支** | PUT | `/rest/api/latest/plan/{planKey}/branch/{branchName}?vcsBranch=X` | EDIT 权限 | ❌ |
| 获取 VCS 分支列表 | GET | `/rest/api/latest/plan/{planKey}/vcsBranches` | READ 权限 | ✅ 已实现 |
| 搜索分支 | GET | `/rest/api/latest/search/branches?searchTerm=X` | READ 权限 | ❌ |
| 从构建结果获取仓库 | GET | `/rest/api/latest/result/{buildResultKey}?expand=vcsRevisions` | READ 权限 | ✅ 已实现 |

### 6.3 构建结果中的变更信息

| 操作 | HTTP 方法 | API 端点 | 说明 | 当前状态 |
|------|-----------|---------|------|---------|
| 获取变更详情 | GET | `/rest/api/latest/result/{buildResultKey}?expand=changes.change` | 提交记录、作者、消息 | ✅ 已实现 |
| 获取 VCS 修订版 | GET | `/rest/api/latest/result/{buildResultKey}?expand=vcsRevisions` | 仓库、分支、revision | ✅ 已实现 |
| 获取 Jira 关联 | GET | `/rest/api/latest/result/{buildResultKey}?expand=jiraIssues` | 关联的 Jira Issue | ✅ 间接实现 |

---

## 7. 用户权限与角色分配

### 7.1 用户管理

| 操作 | HTTP 方法 | API 端点 | 前置条件 / 约束 | 当前状态 |
|------|-----------|---------|----------------|---------|
| 获取当前用户 | GET | `/rest/api/latest/currentUser` | 已登录 | ❌ |
| 搜索用户 | GET | `/rest/api/latest/search/users?searchTerm=X` | READ 权限 | ❌ |
| 搜索作者 | GET | `/rest/api/latest/search/authors?searchTerm=X` | READ 权限 | ❌ |
| 获取用户详情 | GET | `/rest/api/latest/admin/users/{name}` | ADMIN 权限 | ❌ |
| **删除用户** | DELETE | `/rest/api/latest/admin/users/{name}` | 系统管理员 | ❌ |
| **添加用户到组** | POST | `/rest/api/latest/admin/users/{name}/groups` | ADMIN 权限 | ❌ |
| **从组移除用户** | DELETE | `/rest/api/latest/admin/users/{name}/groups` | ADMIN 权限 | ❌ |
| 查已分配组 | GET | `/rest/api/latest/admin/users/{name}/assigned-groups` | ADMIN 权限 | ❌ |
| 查未分配组 | GET | `/rest/api/latest/admin/users/{name}/unassigned-groups` | ADMIN 权限 | ❌ |
| **管理用户别名** | GET / POST / DELETE | `/rest/api/latest/admin/users/{name}/alias` | ADMIN 权限 | ❌ |
| 获取 Access Token | GET | `/rest/api/latest/admin/users/{name}/access-token` | ADMIN 权限 | ❌ |
| **删除 Access Token** | DELETE | `/rest/api/latest/admin/users/{name}/access-token/{tokenId}` | ADMIN 权限 | ❌ |

### 7.2 全局权限管理

| 操作 | HTTP 方法 | API 端点 | 权限值 | 当前状态 |
|------|-----------|---------|--------|---------|
| **授予用户全局权限** | PUT | `/permissions/global/users/{name}` | `READ`, `CREATE`, `ADMINISTRATION` | ❌ |
| **撤销用户全局权限** | DELETE | `/permissions/global/users/{name}` | 同上 | ❌ |
| **授予组全局权限** | PUT | `/permissions/global/groups/{name}` | 同上 | ❌ |
| **撤销组全局权限** | DELETE | `/permissions/global/groups/{name}` | 同上 | ❌ |
| **授予角色全局权限** | PUT | `/permissions/global/roles/{name}` | 同上；角色: LOGGED_IN/ANONYMOUS | ❌ |
| **撤销角色全局权限** | DELETE | `/permissions/global/roles/{name}` | 同上 | ❌ |
| 查可用用户 | GET | `/permissions/global/available-users` | — | ❌ |
| 查可用组 | GET | `/permissions/global/available-groups` | — | ❌ |

### 7.3 权限层级汇总

| 权限层级 | API 前缀 | 支持的操作 | 权限值 |
|---------|---------|-----------|--------|
| 全局 | `/permissions/global/` | 用户 / 组 / 角色的 PUT + DELETE | READ, CREATE, ADMINISTRATION |
| 项目 | `/permissions/project/` | 同上 | READ, CREATE, ADMINISTRATION |
| 计划 | `/permissions/plan/` | 同上 | READ, WRITE, BUILD, CLONE, ADMINISTRATION |
| 部署项目 | `/permissions/deployment/` | 同上 | READ, WRITE, BUILD, ADMINISTRATION |
| 部署环境 | `/permissions/environment/` | 同上 | READ, WRITE, BUILD |

---

## 8. Agent 与能力管理

### 8.1 Agent 管理

| 操作 | HTTP 方法 | API 端点 | 前置条件 / 约束 | 当前状态 |
|------|-----------|---------|----------------|---------|
| 列出所有 Agent | GET | `/rest/api/latest/agent` | READ 权限；`?online=true` 过滤在线 | ❌ |
| 获取 Agent 详情 | GET | `/rest/api/latest/agent/{id}` | READ 权限 | ❌ |
| 获取 Agent 状态 | GET | `/rest/api/latest/agent/{id}/status` | READ 权限 | ❌ |
| **启用 Agent** | PUT | `/rest/api/latest/agent/{id}/enable` | ADMIN 权限 | ❌ |
| **禁用 Agent** | PUT | `/rest/api/latest/agent/{id}/disable` | ADMIN 权限 | ❌ |
| **删除 Agent** | DELETE | `/rest/api/latest/agent/{id}` | ADMIN 权限 | ❌ |
| 获取远程 Agent | GET | `/rest/api/latest/agent/remote` | ADMIN 权限 | ❌ |
| **认证 Agent** | PUT | `/rest/api/latest/agent/authentication/{agentUuid}` | ADMIN 权限 | ❌ |

### 8.2 Agent 能力管理

| 操作 | HTTP 方法 | API 端点 | 约束 | 当前状态 |
|------|-----------|---------|------|---------|
| 获取能力列表 | GET | `/rest/api/latest/agent/{id}/capability?includeShared=true` | READ 权限 | ❌ |
| **创建能力** | POST | `/rest/api/latest/agent/{id}/capability` | 系统管理员 | ❌ |
| **更新能力** | PUT | `/rest/api/latest/agent/{id}/capability/{key}` | 系统管理员 | ❌ |
| **删除能力** | DELETE | `/rest/api/latest/agent/{id}/capability/{key}` | 系统管理员 | ❌ |
| **删除所有能力** | DELETE | `/rest/api/latest/agent/{id}/capability` | 系统管理员 | ❌ |
| 能力分组列表 | GET | `/rest/api/latest/capability/groupedListing` | READ 权限 | ❌ |

### 8.3 弹性 Agent 配置

| 操作 | HTTP 方法 | API 端点 | 当前状态 |
|------|-----------|---------|---------|
| 列出弹性配置 | GET | `/rest/api/latest/elasticConfiguration` | ❌ |
| 创建弹性配置 | POST | `/rest/api/latest/elasticConfiguration` | ❌ |
| 获取/更新/删除 | GET / PUT / DELETE | `/rest/api/latest/elasticConfiguration/{id}` | ❌ |
| 弹性实例日志 | GET | `/rest/api/latest/elasticInstances/instance/{id}/logs` | ❌ |

---

## 9. 环境变量与变量管理

### 9.1 构建变量（Plan Variables）

| 操作 | HTTP 方法 | API 端点 | 约束 | 当前状态 |
|------|-----------|---------|------|---------|
| 获取计划变量 | GET | `/rest/api/latest/plan/{planKey}?expand=variables` | 随计划详情返回 | ✅ 间接实现 |
| **触发时覆盖变量** | POST | `/rest/api/latest/queue/{planKey}?bamboo.variable.X=Y` | 仅触发时生效，不持久化 | ✅ 已实现 |
| **创建/编辑/删除变量** | — | **REST API 不直接支持** | 需 Bamboo Specs 或管理后台 | ❌ |

### 9.2 部署环境变量

| 操作 | HTTP 方法 | API 端点 | 约束 | 当前状态 |
|------|-----------|---------|------|---------|
| 获取环境变量列表 | GET | `/rest/api/latest/deploy/environment/{id}/variables` | READ 权限 | ⚠️ 不可用 |
| **创建环境变量** | POST | `/rest/api/latest/deploy/environment/{id}/variable` | WRITE 权限 | ⚠️ 不可用 |
| 部署版本变量 | GET | `/rest/api/latest/deploy/projectVersioning/{id}/variables` | READ 权限 | ⚠️ 不可用 |

### 9.3 全局变量

| 操作 | 实现方式 | 约束 | 当前状态 |
|------|---------|------|---------|
| 获取全局变量 | 管理后台 / Bamboo Specs | 需 ADMIN 权限 | ❌ |
| 创建/编辑/删除 | 管理后台 / Bamboo Specs | 同上 | ❌ |

---

## 10. 通知与告警规则设置

### 10.1 构建通知

> **重要约束**：Bamboo REST API **不直接支持**通过标准端点管理通知规则。通知配置需通过：
> 1. **Bamboo Specs**（计划级通知）
> 2. **管理后台**（用户个人通知偏好）
> 3. **Struts action**（非公开 API）

| 能力 | 实现方式 | 约束 | 当前状态 |
|------|---------|------|---------|
| 配置计划通知 | Bamboo Specs | 支持邮件、IM（HipChat/Slack）、自定义 | ❌ |
| 配置用户通知偏好 | 管理后台 | 每用户独立配置 | ❌ |
| 构建状态 IM 通知 | Bamboo 插件 / Webhook | 需安装 IM 插件 | ✅ 本地 macOS 通知 |

### 10.2 Webhook 触发

| 操作 | HTTP 方法 | API 端点 | 说明 | 当前状态 |
|------|-----------|---------|------|---------|
| GitHub Webhook | POST | `/rest/git/latest/gh/webhook/invoke` | GitHub → Bamboo 触发构建 | ❌ |
| Bitbucket Webhook | POST | `/rest/bitbucket-cloud/latest/webhooks` | Bitbucket → Bamboo 触发构建 | ❌ |
| 远程触发 | POST | `/rest/triggers/1.0/remote/changeDetection?planKey=X` | 通用远程触发；需 IP 白名单 | ❌ |

---

## 11. 服务器与系统管理

### 11.1 服务器状态

| 操作 | HTTP 方法 | API 端点 | 说明 | 当前状态 |
|------|-----------|---------|------|---------|
| 获取服务器信息 | GET | `/rest/api/latest/server` | 版本、运行状态 | ❌ |
| 获取系统信息 | GET | `/rest/api/latest/info` | 同上（别名） | ❌ |
| 获取计划目录信息 | GET | `/rest/api/latest/planDirectoryInfo/{planKey}` | 计划存储路径 | ❌ |

### 11.2 服务器管控

| 操作 | HTTP 方法 | API 端点 | 前置条件 / 约束 | 当前状态 |
|------|-----------|---------|----------------|---------|
| **暂停服务器** | POST | `/rest/api/latest/server/pause` | 系统管理员；暂停后不执行新构建 | ❌ |
| **恢复服务器** | POST | `/rest/api/latest/server/resume` | 系统管理员 | ❌ |
| **准备重启** | PUT | `/rest/api/latest/server/prepareForRestart` | 系统管理员；优雅停机 | ❌ |
| **重建索引** | POST / GET | `/rest/api/latest/reindex` | 系统管理员 | ❌ |

### 11.3 数据保留

| 操作 | HTTP 方法 | API 端点 | 约束 | 当前状态 |
|------|-----------|---------|------|---------|
| **删除计划过期数据** | DELETE | `/rest/api/latest/admin/expiry/custom/plan/{planKey}` | ADMIN 权限 | ❌ |

---

## 12. 搜索与过滤

### 12.1 搜索

| 操作 | HTTP 方法 | API 端点 | 说明 | 当前状态 |
|------|-----------|---------|------|---------|
| 通用搜索 | GET | `/rest/api/latest/search?searchTerm=X` | 全局搜索 | ❌ |
| 搜索用户 | GET | `/rest/api/latest/search/users?searchTerm=X` | — | ❌ |
| 搜索作者 | GET | `/rest/api/latest/search/authors?searchTerm=X` | — | ❌ |
| 搜索计划 | GET | `/rest/api/latest/search/plans?searchTerm=X` | — | ❌ |
| 搜索 Jobs | GET | `/rest/api/latest/search/jobs/{planKey}` | 计划内 Job | ❌ |
| 搜索分支 | GET | `/rest/api/latest/search/branches?searchTerm=X` | — | ❌ |
| 搜索项目 | GET | `/rest/api/latest/search/projects?searchTerm=X` | — | ❌ |
| 搜索版本 | GET | `/rest/api/latest/search/versions?searchTerm=X` | 部署版本 | ❌ |

### 12.2 快速过滤器

| 操作 | HTTP 方法 | API 端点 | 说明 | 当前状态 |
|------|-----------|---------|------|---------|
| 列出过滤器 | GET | `/rest/api/latest/quickFilter` | — | ❌ |
| 创建过滤器 | POST | `/rest/api/latest/quickFilter` | — | ❌ |
| 获取/更新/删除 | GET / PUT / DELETE | `/rest/api/latest/quickFilter/{id}` | — | ❌ |
| 获取活动过滤器 | GET | `/rest/api/latest/quickFilter/active` | — | ❌ |
| **激活过滤器** | PUT | `/rest/api/latest/quickFilter/{id}/activate` | — | ❌ |
| **停用过滤器** | PUT | `/rest/api/latest/quickFilter/{id}/deactivate` | — | ❌ |
| 停用所有过滤器 | PUT | `/rest/api/latest/quickFilter/deactivate` | — | ❌ |

---

## 13. 导出与导入

| 操作 | HTTP 方法 | API 端点 | 说明 | 当前状态 |
|------|-----------|---------|------|---------|
| 导出计划 | GET | `/rest/api/latest/export/{planKey}` | 导出计划配置 | ❌ |
| 导出（Alt 路径） | GET | `/rest/api/latest/export/{projectKey}/{buildKey}` | 同上 | ❌ |

> **注意**：导入需通过 **Bamboo Specs**（YAML/Java）推送，无独立 REST 导入端点。

---

## 附录 A：认证方式

| 方式 | Header | 说明 | 当前状态 |
|------|--------|------|---------|
| Personal Access Token（推荐） | `Authorization: Bearer {token}` | 最安全，Bamboo 6.2+ 支持 | ❌ 未实现 |
| HTTP Basic Auth（已废弃） | `Authorization: Basic {base64}` | 需附加 `?os_authType=basic` | ✅ 已实现 |
| Session Login（表单） | `Cookie: JSESSIONID=X; atl_token=X` | 模拟浏览器登录，获取 session cookie | ✅ 已实现 |

## 附录 B：Struts Action 调用模式

部分操作（停止构建、删除构建结果）不走标准 REST API，而是通过 Struts action：

```
POST {baseUrl}/build/admin/{action}.action
Headers:
  X-Atlassian-Token: no-check      # 绕过 CSRF
  X-Requested-With: XMLHttpRequest  # 标记 AJAX 请求
  Content-Type: application/x-www-form-urlencoded
Body: planKey=XXX&buildNumber=YYY
```

成功判定：HTTP 302（重定向）/ 200 / 204

## 附录 C：Bamboo Specs 说明

> Bamboo Specs 是 Atlassian 推荐的"配置即代码"方案，用于创建/编辑项目和计划。
> REST API 不直接支持这些操作，必须通过 Specs 推送。

**YAML 示例**：
```yaml
version: 2
plan:
  project-key: PROJ
  key: PLAN
  name: My Plan
stages:
  - Build:
      jobs:
        - Build Job
build-job:
  key: BUILD
  tasks:
    - script:
        - echo "Hello"
```

**推送方式**：
```bash
curl -X POST -u user:pass -H "Content-Type: application/yaml" \
  --data-binary @bamboo-specs.yaml \
  http://bamboo/rest/specs/1.0/import
```

## 附录 D：分页约定

所有列表 API 支持分页：
- `start-index`：起始位置（从 0 开始）
- `max-results`：每页大小（**最大 25**，即使指定更大值）
- 响应中包含 `size`（总量）、`start-index`、`max-result`

## 附录 E：响应格式

| 格式 | 请求方式 | 说明 |
|------|---------|------|
| JSON | `Accept: application/json` 或 URL 加 `.json` | 默认推荐 |
| XML | `Accept: application/xml` 或 URL 加 `.xml` | 备选 |

---

## 实现优先级建议

基于功能价值与实现难度，建议按以下优先级补齐：

| 优先级 | 功能模块 | 理由 |
|--------|---------|------|
| P0 | 计划启用/禁用 | 高频管理操作，API 简单 |
| P0 | 构建队列管理（查看/取消） | 运维必需 |
| P0 | 构建结果评论/标签 | 协作必需 |
| P1 | 计划分支管理 | 分支构建是常见场景 |
| P1 | 计划克隆 | 快速创建计划 |
| P1 | 权限管理（查看/授予/撤销） | 安全管理 |
| P1 | Agent 状态查看 | 运维监控 |
| P2 | 搜索功能 | 提升查找效率 |
| P2 | 服务器管控（暂停/恢复） | 运维管理 |
| P2 | 导出功能 | 配置备份 |
| P3 | 变量管理 | 配置管理 |
| P3 | 快速过滤器 | 列表过滤 |
| P3 | 通知规则配置 | 需 Specs，较复杂 |
