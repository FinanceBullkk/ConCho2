// Reusable error state for React Query failures
// Usage: {isError && <QueryError error={error} onRetry={refetch} />}
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function QueryError({ error, onRetry, className = '' }) {
  const message =
    error?.response?.data?.message ||
    error?.message ||
    'Failed to load data. Please try again.';

  return (
    <div className={`flex flex-col items-center justify-center py-16 gap-4 ${className}`}>
      <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20">
        <AlertCircle className="size-7 text-red-400" aria-hidden="true" />
      </div>
      <div className="text-center">
        <p className="text-slate-300 font-medium">Something went wrong</p>
        <p className="text-sm text-slate-500 mt-1 max-w-sm">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-all text-sm"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          Try again
        </button>
      )}
    </div>
  );
}
