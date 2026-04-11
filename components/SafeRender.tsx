import React, { Component, ReactNode } from 'react';

/**
 * SafeRender — Silent error boundary for decorative components.
 *
 * Wraps GPU-intensive or unstable components (Three.js scenes, WebGL)
 * so a context loss or shader failure doesn't crash the whole app.
 * Falls back to null — purely decorative, no UI impact.
 */
interface Props { children: ReactNode; }
interface State { crashed: boolean; }

export class SafeRender extends Component<Props, State> {
  state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  componentDidCatch(err: Error) {
    if (import.meta.env.DEV) {
      console.warn('[SafeRender] Decorative component crashed silently:', err.message);
    }
  }

  render() {
    return this.state.crashed ? null : this.props.children;
  }
}
