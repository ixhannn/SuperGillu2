import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Heart, RefreshCw } from 'lucide-react';

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

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('App crashed:', error, info.componentStack);
    }

    private handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (!this.state.hasError) return this.props.children;

        return (
            <div
                className="min-h-screen flex flex-col items-center justify-center p-8 text-center"
                style={{ background: 'var(--theme-bg-main, #fdf4f8)', color: 'var(--color-text-primary, #1e293b)' }}
            >
                <div className="relative mb-6">
                    <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
                        style={{ background: 'rgba(236,72,153,0.1)' }}>
                        <Heart size={36} style={{ color: '#ec4899' }} />
                    </div>
                </div>

                <h2 className="text-xl font-serif font-bold mb-2">Something went wrong</h2>
                <p className="text-sm mb-8 max-w-xs leading-relaxed" style={{ color: 'var(--color-text-secondary, #64748b)' }}>
                    Don't worry — your memories are safe. Tap below to restart the app.
                </p>

                <button
                    onClick={this.handleReset}
                    className="flex items-center gap-2 px-6 py-3 rounded-full font-bold text-white text-sm"
                    style={{ background: 'linear-gradient(135deg, #ec4899, #be185d)' }}
                >
                    <RefreshCw size={16} />
                    Restart App
                </button>

                {this.state.error && (
                    <p className="mt-6 text-[10px] font-mono opacity-30 max-w-xs break-all">
                        {this.state.error.message}
                    </p>
                )}
            </div>
        );
    }
}
