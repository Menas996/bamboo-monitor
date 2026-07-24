import fs from 'fs'
import path from 'path'
import { app, nativeImage, type NativeImage } from 'electron'

function resolveExisting(...candidates: string[]): string {
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return candidates[0]
}

export function getAppIconPath(): string {
  return resolveExisting(
    path.join(__dirname, '../build/icon.png'),
    path.join(process.cwd(), 'build/icon.png'),
    path.join(process.resourcesPath, 'build/icon.png'),
    path.join(process.resourcesPath, 'icon.png'),
  )
}

export function getAppIcon(): NativeImage {
  const img = nativeImage.createFromPath(getAppIconPath())
  return img.isEmpty() ? nativeImage.createEmpty() : img
}

export function getTrayIconPath(): string {
  return resolveExisting(
    path.join(__dirname, '../resources/trayIcon.png'),
    path.join(process.cwd(), 'resources/trayIcon.png'),
    path.join(process.resourcesPath, 'resources/trayIcon.png'),
  )
}

export function getTrayIcon(): NativeImage {
  const trayPath = getTrayIconPath()
  let img = nativeImage.createFromPath(trayPath)
  if (img.isEmpty()) {
    loggerFallback(`tray icon missing or empty: ${trayPath}`)
    img = getAppIcon()
  }
  if (img.isEmpty()) {
    // 1x1 透明图会导致 macOS 菜单栏“看不见”，用简易占位图兜底
    img = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAANElEQVRYR+3XMQoAIAwDwB7+/+eqg4uDoIVayF0IBJK0TQAAAAAAAAAAAAAAAAAAADwZ7gMAf1kQbQAAAABJRU5ErkJggg==',
    )
  }
  const sized = img.resize({ width: 18, height: 18 })
  if (process.platform === 'darwin') {
    sized.setTemplateImage(true)
  }
  return sized
}

function loggerFallback(message: string): void {
  try {
    // 避免 app-icon ↔ logger 循环依赖：直接打 stderr
    process.stderr.write(`[TRAY] ${message}\n`)
  } catch {
    /* ignore */
  }
}

export function setDockIcon(): void {
  if (process.platform !== 'darwin') return
  const icon = getAppIcon()
  if (!icon.isEmpty()) app.dock?.setIcon(icon)
}
