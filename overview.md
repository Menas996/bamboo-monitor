# Bamboo 部署历史模块 — 实现概览

## 完成内容

在子项目详情页面（BuildDetail）中新增 **Deployments（部署历史）** 模块，完整对接 Bamboo 部署功能，实现部署历史展示与流程控制（中断/重试）。

## 改动文件清单

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `electron/bamboo-client.ts` | 新增方法 | `stopBuild()` — 停止运行中构建 + 取消排队构建 |
| `electron/main.ts` | 新增 handler | `bamboo:stopBuild` IPC handler |
| `electron/preload.ts` | 新增暴露 | `window.actions.stopBuild` |
| `src/App.tsx` | 修改类型 | window.actions 类型声明新增 stopBuild、queueBuild 返回加 errorMessage |
| `src/pages/BuildDetail.tsx` | 新增组件 | DeploymentsTab — 部署历史模块（核心） |
| `src/lib/i18n.tsx` | 新增翻译 | 14 个部署历史相关键（中英文） |

## 功能实现

### 1. 部署历史记录展示
- 每条记录展示：**部署状态**（StatusBadge）、**构建编号**（#N）、**执行人/触发原因**（reason）、**部署时长**、**触发时间**
- 顶部显示**环境信息**（planName）+ **统计摘要**（总数/成功/失败/运行中）
- 支持**分页加载**（每页 20 条，加载更多按钮）
- 支持**查看详情**（跳转到对应构建详情页）

### 2. 部署流程控制 — 中断
- 对**运行中**（InProgress/Queued）的部署显示「中断」按钮
- 调用 Bamboo 原生中断能力，两种途径自动覆盖：
  - `POST /build/admin/stopPlan.action`（停止运行中构建，Struts action）
  - `DELETE /rest/api/latest/queue/{buildResultKey}`（取消排队构建，REST API）
- 前端无需判断状态，Bamboo 服务器根据实际状态处理

### 3. 部署流程控制 — 重试
- 对**失败/中断**（Failed/Cancelled）的部署显示「重试」按钮
- 复用已有 `queueBuild` 重新触发构建（Bamboo 构建重试的标准方式）
- 重试成功后自动刷新列表并可选跳转到新构建

### 4. 实时状态反馈
- 操作后立即显示 toast 反馈（成功/失败）
- 操作后立即刷新部署历史列表
- **5 秒轮询**：当列表中存在运行中的部署时自动启动，状态全部终态后自动停止
- 轮询合并策略：更新已有记录状态 + 插入新触发的部署

## 验证结果
- `tsc --noEmit`：零类型错误 ✅
- `vite build`：renderer + main + preload 三个产物全部构建成功 ✅
