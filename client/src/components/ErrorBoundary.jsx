import { Component } from 'react';
import { useTranslation } from 'react-i18next';
import { Sentry } from '../lib/sentry';

// ──────────────────────────────────────────────────────────
// Audit PR P (FE-009): ErrorBoundary used to hard-code Vietnamese
// copy (title, body, button labels). Class components can't call
// hooks directly, so the visible UI is extracted into a function
// component that calls useTranslation(). The class shell stays in
// place because that's what `static getDerivedStateFromError` +
// `componentDidCatch` require.
// Translation keys live under `errorBoundary.*` in both EN + VI
// dictionaries (see client/src/i18n/locales).
// ──────────────────────────────────────────────────────────

function ErrorFallback({ error, onRetry }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-lg p-8 text-center max-w-md">
        <h2 className="text-h3 text-foreground mb-2">{t('errorBoundary.title')}</h2>
        <p className="text-body text-muted-foreground mb-6">{t('errorBoundary.body')}</p>
        <div className="flex gap-3 justify-center">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
          >
            {t('errorBoundary.reload')}
          </button>
          <button
            type="button"
            onClick={onRetry}
            className="px-6 py-2.5 rounded-md border border-border text-muted-foreground hover:bg-accent transition-colors"
          >
            {t('errorBoundary.retry')}
          </button>
        </div>
        {import.meta.env.DEV && error && (
          <pre className="mt-4 text-xs text-left text-destructive/80 bg-destructive/10 rounded-lg p-3 overflow-auto max-h-40">
            {error.toString()}
          </pre>
        )}
      </div>
    </div>
  );
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.handleRetry = () => this.setState({ hasError: false, error: null });
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
      return <ErrorFallback error={this.state.error} onRetry={this.handleRetry} />;
    }
    return this.props.children;
  }
}
