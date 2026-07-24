import { Tray, Menu, BrowserWindow, app, nativeImage, type MenuItemConstructorOptions } from 'electron'
import { getTrayIcon } from './app-icon'

export interface TrayFavorite {
  planKey: string
  planName: string
}

export interface TrayQuickActions {
  enabled: boolean
  favorites: TrayFavorite[]
  onDeploy: (planKey: string) => void
  onStop: (planKey: string) => void
  onRetry: (planKey: string) => void
}

export function setupTray(mainWindow: BrowserWindow, onRefresh: () => void): Tray {
  const icon = getTrayIcon()
  const tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
  tray.setToolTip('Bamboo Monitor')
  tray.setIgnoreDoubleClickEvents(true)
  tray.setContextMenu(Menu.buildFromTemplate(baseMenuTemplate(mainWindow, onRefresh)))
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })
  tray.on('right-click', () => {
    tray.popUpContextMenu()
  })
  return tray
}

export function updateTrayMenu(
  tray: Tray,
  mainWindow: BrowserWindow,
  onRefresh: () => void,
  quick?: TrayQuickActions | null,
): void {
  const template: MenuItemConstructorOptions[] = [
    ...baseMenuTemplate(mainWindow, onRefresh),
  ]

  if (quick?.enabled) {
    template.splice(2, 0, { type: 'separator' }, ...buildQuickActionItems(quick))
  }

  tray.setContextMenu(Menu.buildFromTemplate(template))
}

function baseMenuTemplate(mainWindow: BrowserWindow, onRefresh: () => void): MenuItemConstructorOptions[] {
  return [
    {
      label: '显示窗口',
      click: () => {
        mainWindow.show()
        mainWindow.focus()
      },
    },
    {
      label: '立即刷新',
      click: () => onRefresh(),
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit()
      },
    },
  ]
}

function buildQuickActionItems(quick: TrayQuickActions): MenuItemConstructorOptions[] {
  if (quick.favorites.length === 0) {
    return [{
      label: '收藏快捷操作',
      submenu: [{ label: '暂无收藏计划', enabled: false }],
    }]
  }

  return [{
    label: '收藏快捷操作',
    submenu: quick.favorites.map((fav) => ({
      label: fav.planName || fav.planKey,
      submenu: [
        {
          label: '部署',
          click: () => quick.onDeploy(fav.planKey),
        },
        {
          label: '中断',
          click: () => quick.onStop(fav.planKey),
        },
        {
          label: '重试',
          click: () => quick.onRetry(fav.planKey),
        },
      ],
    })),
  }]
}
