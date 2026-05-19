import { Component } from 'react';
import { Sentry } from '../lib/sentry';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    // Forward to Sentry with the React component stack as additional context.
    // No-op when Sentry wasn't initialized (no DSN in this environment).
    Sentry.withScope((scope) => {
      scope.setExtras({ componentStack: errorInfo?.componentStack });
      Sentry.captureException(error);
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-lg p-8 text-center max-w-md">
            <h2 className="text-h3 text-foreground mb-2">Đã xảy ra lỗi</h2>
            <p className="text-body text-muted-foreground mb-6">
              Ứng dụng gặp lỗi không mong muốn. Vui lòng tải lại trang.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-2.5 rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
              >
                Tải lại trang
              </button>
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="px-6 py-2.5 rounded-md border border-border text-muted-foreground hover:bg-accent transition-colors"
              >
                Thử lại
              </button>
            </div>
            {process.env.NODE_ENV !== 'production' && this.state.error && (
              <pre className="mt-4 text-xs text-left text-destructive/80 bg-destructive/10 rounded-lg p-3 overflow-auto max-h-40">
                {this.state.error.toString()}
              </pre>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
