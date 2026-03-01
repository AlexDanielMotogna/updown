'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            backgroundColor: '#0B0F14',
            color: '#FFFFFF',
            padding: 32,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '2rem', fontWeight: 300, marginBottom: 12 }}>
            Something went wrong
          </div>
          <div style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.5)', marginBottom: 24, maxWidth: 480 }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </div>
          <button
            onClick={this.handleRetry}
            style={{
              padding: '10px 24px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.15)',
              backgroundColor: 'transparent',
              color: '#FFFFFF',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
