import { Tray, Menu, BrowserWindow, nativeImage, NativeImage, app } from 'electron'
import path from 'path'

export function setupTray(mainWindow: BrowserWindow, onRefresh: () => void): Tray {
  const iconPath = path.join(__dirname, '../resources/trayIcon.png')
  let trayIcon: NativeImage

  try {
    trayIcon = nativeImage.createFromPath(iconPath)
  } catch {
    trayIcon = nativeImage.createEmpty()
  }

  if (trayIcon.isEmpty()) {
    trayIcon = nativeImage.createEmpty()
  }

  const tray = new Tray(trayIcon.resize({ width: 18, height: 18 }))
  tray.setToolTip('Bamboo Monitor')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show',
      click: () => {
        mainWindow.show()
        mainWindow.focus()
      },
    },
    { type: 'separator' },
    {
      label: 'Refresh Now',
      click: () => onRefresh(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  return tray
}
