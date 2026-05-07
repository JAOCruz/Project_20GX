import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  tabName: string
}

interface State {
  hasError: boolean
  error: string
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: '' }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message + '\n' + (error.stack || '') }
  }

  componentDidCatch(error: Error, info: any) {
    console.error(`[${this.props.tabName}] Render crash:`, error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex flex-col items-center justify-center text-slate-500 p-8">
          <div className="w-16 h-16 rounded-2xl bg-red-950/20 border border-red-500/20 flex items-center justify-center mb-4">
            <span className="text-2xl">💥</span>
          </div>
          <p className="font-orbitron text-base font-bold text-red-400 tracking-wide mb-2">
            {this.props.tabName} CRASHED
          </p>
          <p className="text-sm text-slate-600 font-mono-data mb-4 max-w-lg text-center">
            Something went wrong rendering this tab. Copy the error below and report it.
          </p>
          <pre className="bg-slate-950 border border-slate-800 rounded-lg p-4 text-xs font-mono-data text-red-300 overflow-auto max-w-2xl max-h-80 w-full">
            {this.state.error}
          </pre>
          <button
            onClick={() => this.setState({ hasError: false, error: '' })}
            className="mt-4 h-10 px-6 btn-primary rounded-lg text-xs"
          >
            TRY AGAIN
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
