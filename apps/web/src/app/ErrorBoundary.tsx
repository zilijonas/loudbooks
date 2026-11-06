import { Component, type ReactNode } from 'react'
import { ErrorFallback } from './ErrorFallback'

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  override componentDidCatch(error: unknown) {
    console.error(error)
  }
  override render() {
    return this.state.failed ? <ErrorFallback /> : this.props.children
  }
}
