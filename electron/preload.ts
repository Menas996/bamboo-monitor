import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('bamboo', {
  login: (server: string, username: string, password: string) =>
    ipcRenderer.invoke('bamboo:login', server, username, password),

  getProjects: () => ipcRenderer.invoke('bamboo:getProjects'),

  getDeployments: (projectKey: string) =>
    ipcRenderer.invoke('bamboo:getDeployments', projectKey),

  getDeploymentsPage: (projectKey: string, startIndex: number, pageSize: number) =>
    ipcRenderer.invoke('bamboo:getDeploymentsPage', projectKey, startIndex, pageSize),

  enrichDeployments: (projectKey: string, buildResultKeys: string[]) =>
    ipcRenderer.invoke('bamboo:enrichDeployments', projectKey, buildResultKeys),

  getBuildLog: (buildResultKey: string) =>
    ipcRenderer.invoke('bamboo:getBuildLog', buildResultKey),

  getFullBuildLog: (buildResultKey: string) =>
    ipcRenderer.invoke('bamboo:getFullBuildLog', buildResultKey),

  getBuildDetail: (buildResultKey: string) =>
    ipcRenderer.invoke('bamboo:getBuildDetail', buildResultKey),

  getPlanDetail: (planKey: string) =>
    ipcRenderer.invoke('bamboo:getPlanDetail', planKey),

  getPlanResults: (planKey: string) =>
    ipcRenderer.invoke('bamboo:getPlanResults', planKey),

  getPlanResultsEnriched: (planKey: string) =>
    ipcRenderer.invoke('bamboo:getPlanResultsEnriched', planKey),

  getPlanResultsHistoryPage: (planKey: string, startIndex: number, pageSize: number) =>
    ipcRenderer.invoke('bamboo:getPlanResultsHistoryPage', planKey, startIndex, pageSize),

  getProjectPlans: (projectKey: string) =>
    ipcRenderer.invoke('bamboo:getProjectPlans', projectKey),
})

contextBridge.exposeInMainWorld('config', {
  get: (key: string) => ipcRenderer.invoke('config:get', key),
  set: (key: string, value: unknown) => ipcRenderer.invoke('config:set', key, value),
})

contextBridge.exposeInMainWorld('poll', {
  start: (interval: number, favoritePlans: { planKey: string; projectKey: string; planName: string }[]) =>
    ipcRenderer.invoke('poll:start', interval, favoritePlans),
  stop: () => ipcRenderer.invoke('poll:stop'),
})

contextBridge.exposeInMainWorld('win', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
})

ipcRenderer.on('window:maximized-changed', (_event, maximized) => {
  window.dispatchEvent(new CustomEvent('maximized-changed', { detail: maximized }))
})

contextBridge.exposeInMainWorld('logs', {
  get: (filter?: { level?: string; category?: string; search?: string }) =>
    ipcRenderer.invoke('logs:get', filter),

  export: (filter?: { level?: string; category?: string }) =>
    ipcRenderer.invoke('logs:export', filter),

  clear: () => ipcRenderer.invoke('logs:clear'),

  listFiles: () => ipcRenderer.invoke('logs:list-files'),

  readFile: (filename: string) => ipcRenderer.invoke('logs:read-file', filename),
})

contextBridge.exposeInMainWorld('health', {
  check: () => ipcRenderer.invoke('health:check'),
})

contextBridge.exposeInMainWorld('actions', {
  queueBuild: (planKey: string, variables?: Record<string, string>) =>
    ipcRenderer.invoke('bamboo:queueBuild', planKey, variables),
  deleteBuildResult: (buildResultKey: string) =>
    ipcRenderer.invoke('bamboo:deleteBuildResult', buildResultKey),
  openUrl: (path: string) => ipcRenderer.invoke('bamboo:openUrl', path),
})

ipcRenderer.on('new-deploys', (_event, deploys) => {
  window.dispatchEvent(new CustomEvent('new-deploys', { detail: deploys }))
})

ipcRenderer.on('navigate-to-deploy', (_event, deploy) => {
  window.dispatchEvent(new CustomEvent('navigate-to-deploy', { detail: deploy }))
})
