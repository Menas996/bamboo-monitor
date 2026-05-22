// Renderer-side logging utility — sends structured logs to main process via IPC

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL'
export type LogCategory = 'UI' | 'AUTH' | 'API' | 'POLL' | 'CONFIG' | 'SYSTEM'

interface RendererLogEntry {
  timestamp: string
  level: LogLevel
  category: LogCategory
  message: string
  meta?: Record<string, unknown>
}

class RendererLogger {
  private buffer: RendererLogEntry[] = []
  private maxBuffer = 100

  private log(level: LogLevel, category: LogCategory, message: string, meta?: Record<string, unknown>) {
    const entry: RendererLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      meta,
    }

    this.buffer.push(entry)
    if (this.buffer.length > this.maxBuffer) {
      this.buffer.shift()
    }

    // Console output
    const line = `[${entry.timestamp}] [${level}] [${category}] ${message}`
    if (level === 'ERROR' || level === 'FATAL') {
      console.error(line, meta ?? '')
    } else if (level === 'WARN') {
      console.warn(line, meta ?? '')
    } else {
      console.log(line, meta ?? '')
    }
  }

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

  operation(action: string, meta?: Record<string, unknown>) {
    this.log('INFO', 'UI', `Operation: ${action}`, meta)
  }

  getBuffer(): RendererLogEntry[] {
    return [...this.buffer]
  }

  clearBuffer() {
    this.buffer = []
  }
}

export const rendererLog = new RendererLogger()

// Global error handlers for renderer process
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    rendererLog.error('SYSTEM', `Uncaught error: ${event.message}`, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack,
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    rendererLog.error('SYSTEM', `Unhandled promise rejection: ${event.reason}`, {
      reason: String(event.reason),
    })
  })
}
