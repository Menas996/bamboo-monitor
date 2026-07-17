import fs from 'fs'
import path from 'path'
import { app } from 'electron'

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL'

export type LogCategory =
  | 'SYSTEM'
  | 'AUTH'
  | 'API'
  | 'POLL'
  | 'NOTIFY'
  | 'UI'
  | 'IPC'
  | 'CONFIG'

export interface LogEntry {
  timestamp: string
  level: LogLevel
  category: LogCategory
  message: string
  meta?: Record<string, unknown>
  duration?: number
}

interface LoggerConfig {
  minLevel: LogLevel
  maxFileSize: number // bytes
  maxFiles: number
  persistToDisk: boolean
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4,
}

const DEFAULT_CONFIG: LoggerConfig = {
  minLevel: 'DEBUG',
  maxFileSize: 5 * 1024 * 1024, // 5MB
  maxFiles: 5,
  persistToDisk: true,
}

class Logger {
  private config: LoggerConfig
  private logDir: string
  private logs: LogEntry[] = []
  private maxInMemory = 500
  private listeners: ((entry: LogEntry) => void)[] = []

  constructor(config?: Partial<LoggerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.logDir = this.getLogDir()
    this.ensureLogDir()
  }

  private getLogDir(): string {
    try {
      return path.join(app.getPath('userData'), 'logs')
    } catch {
      return path.join(process.cwd(), 'logs')
    }
  }

  private ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true })
    }
  }

  private getLogFilePath(index = 0): string {
    const name = index === 0 ? 'current.log' : `archive-${index}.log`
    return path.join(this.logDir, name)
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[this.config.minLevel]
  }

  private formatEntry(entry: LogEntry): string {
    const meta = entry.meta ? ` ${JSON.stringify(entry.meta)}` : ''
    const duration = entry.duration !== undefined ? ` [${entry.duration}ms]` : ''
    return `[${entry.timestamp}] [${entry.level}] [${entry.category}] ${entry.message}${duration}${meta}`
  }

  private persist(entry: LogEntry) {
    if (!this.config.persistToDisk) return

    try {
      const line = this.formatEntry(entry) + '\n'
      const filePath = this.getLogFilePath()

      // Rotate if file too large
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath)
        if (stat.size >= this.config.maxFileSize) {
          this.rotateFiles()
        }
      }

      fs.appendFileSync(filePath, line, 'utf-8')
    } catch {
      // Silently fail — don't crash app over logging
    }
  }

  private rotateFiles() {
    for (let i = this.config.maxFiles - 1; i >= 1; i--) {
      const from = this.getLogFilePath(i - 1)
      const to = this.getLogFilePath(i)
      if (fs.existsSync(from)) {
        if (fs.existsSync(to)) fs.unlinkSync(to)
        fs.renameSync(from, to)
      }
    }
  }

  private log(level: LogLevel, category: LogCategory, message: string, meta?: Record<string, unknown>, duration?: number) {
    if (!this.shouldLog(level)) return

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      meta,
      duration,
    }

    // In-memory ring buffer
    this.logs.push(entry)
    if (this.logs.length > this.maxInMemory) {
      this.logs.shift()
    }

    // Persist to disk
    this.persist(entry)

    // Notify live listeners
    for (const fn of this.listeners) {
      try { fn(entry) } catch { /* ignore */ }
    }

    // Console output in dev
    if (process.env.VITE_DEV_SERVER_URL) {
      const line = this.formatEntry(entry)
      if (level === 'ERROR' || level === 'FATAL') {
        console.error(line)
      } else if (level === 'WARN') {
        console.warn(line)
      } else {
        console.log(line)
      }
    }
  }

  // --- Public API ---

  debug(category: LogCategory, message: string, meta?: Record<string, unknown>) {
    this.log('DEBUG', category, message, meta)
  }

  info(category: LogCategory, message: string, meta?: Record<string, unknown>) {
    this.log('INFO', category, message, meta)
  }

  warn(category: LogCategory, message: string, meta?: Record<string, unknown>) {
    this.log('WARN', category, message, meta)
  }

  error(category: LogCategory, message: string, meta?: Record<string, unknown>) {
    this.log('ERROR', category, message, meta)
  }

  fatal(category: LogCategory, message: string, meta?: Record<string, unknown>) {
    this.log('FATAL', category, message, meta)
  }

  // Timed operation helper
  time(category: LogCategory, message: string): () => void {
    const start = performance.now()
    return () => {
      const duration = Math.round(performance.now() - start)
      this.log('INFO', category, message, undefined, duration)
    }
  }

  // API call logger
  apiRequest(method: string, url: string, meta?: Record<string, unknown>) {
    this.info('API', `${method} ${url}`, meta)
  }

  apiResponse(method: string, url: string, status: number, duration: number, meta?: Record<string, unknown>) {
    const level: LogLevel = status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'INFO'
    this.log(level, 'API', `${method} ${url} → ${status}`, meta, duration)
  }

  apiError(method: string, url: string, error: Error, duration?: number) {
    this.error('API', `${method} ${url} → ${error.message}`, {
      stack: error.stack,
      name: error.name,
    }, duration)
  }

  // Operation logger
  operation(action: string, meta?: Record<string, unknown>) {
    this.info('UI', `Operation: ${action}`, meta)
  }

  // Get logs with optional filters
  getLogs(filter?: { level?: LogLevel; category?: LogCategory; search?: string }): LogEntry[] {
    let result = this.logs

    if (filter?.level) {
      result = result.filter((e) => e.level === filter.level)
    }
    if (filter?.category) {
      result = result.filter((e) => e.category === filter.category)
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase()
      result = result.filter((e) => e.message.toLowerCase().includes(q))
    }

    return result
  }

  // Export logs as JSON string
  exportLogs(filter?: { level?: LogLevel; category?: LogCategory }): string {
    return JSON.stringify(this.getLogs(filter), null, 2)
  }

  // Live listener for real-time log streaming
  onLog(fn: (entry: LogEntry) => void): () => void {
    this.listeners.push(fn)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn)
    }
  }

  // Read archived log files
  readLogFile(filename: string): string {
    if (typeof filename !== 'string' || !/^[a-zA-Z0-9._-]+\.log$/.test(filename)) return ''
    const base = path.resolve(this.logDir)
    const target = path.resolve(this.logDir, path.basename(filename))
    if (!target.startsWith(base + path.sep)) return ''
    if (!fs.existsSync(target)) return ''
    return fs.readFileSync(target, 'utf-8')
  }

  listLogFiles(): string[] {
    if (!fs.existsSync(this.logDir)) return []
    return fs.readdirSync(this.logDir).filter((f) => f.endsWith('.log'))
  }

  clearLogs() {
    this.logs = []
    const files = this.listLogFiles()
    for (const f of files) {
      fs.unlinkSync(path.join(this.logDir, f))
    }
  }
}

// Singleton
export const logger = new Logger()
