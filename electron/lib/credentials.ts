import { safeStorage } from 'electron'
import Store from 'electron-store'
import { logger } from './logger'

type CredentialStore = Store<{
  password?: string
  passwordEncrypted?: string
}>

export function readStoredPassword(store: CredentialStore): string | undefined {
  const encrypted = store.get('passwordEncrypted')
  if (encrypted && safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('AUTH', `Failed to decrypt stored password: ${message}`)
    }
  }
  const legacy = store.get('password')
  return typeof legacy === 'string' && legacy.length > 0 ? legacy : undefined
}

export function writeStoredPassword(store: CredentialStore, password: string): void {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(password).toString('base64')
    store.set('passwordEncrypted', encrypted)
    store.delete('password')
    return
  }
  logger.warn('AUTH', 'safeStorage unavailable; password stored without OS encryption')
  store.set('password', password)
  store.delete('passwordEncrypted')
}

export function clearStoredPassword(store: CredentialStore): void {
  store.delete('password')
  store.delete('passwordEncrypted')
}
