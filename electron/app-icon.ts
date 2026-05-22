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
  const img = nativeImage.createFromPath(getTrayIconPath())
  const source = img.isEmpty() ? getAppIcon() : img
  return source.isEmpty() ? source : source.resize({ width: 18, height: 18 })
}

export function setDockIcon(): void {
  if (process.platform !== 'darwin') return
  const icon = getAppIcon()
  if (!icon.isEmpty()) app.dock?.setIcon(icon)
}
