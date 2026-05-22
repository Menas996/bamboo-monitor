import { Tray, Menu, BrowserWindow, app } from 'electron'
import { getTrayIcon } from './app-icon'

export function setupTray(mainWindow: BrowserWindow, onRefresh: () => void): Tray {
  const tray = new Tray(getTrayIcon())
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
