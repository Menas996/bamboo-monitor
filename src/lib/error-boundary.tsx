import { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.props.onError?.(error, errorInfo)

    // Log to main process
    window.logs?.get?.()
    console.error('[ErrorBoundary]', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div style={{
          padding: 40,
          textAlign: 'center',
          background: 'var(--bg-page)',
          color: 'var(--text-primary)',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
        }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
          }}>
            ⚠
          </div>
          <h2 style={{
            fontSize: 18,
            fontWeight: 510,
            color: 'var(--text-primary)',
          }}>
            Something went wrong
          </h2>
          <p style={{
            fontSize: 14,
            color: 'var(--text-tertiary)',
            maxWidth: 400,
          }}>
            {this.state.error?.message ?? 'An unexpected error occurred'}
          </p>
          <button
            className="btn-ghost"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try Again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
