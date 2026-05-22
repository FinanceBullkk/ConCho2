import { ErrorState } from './ErrorState';

/**
 * Backwards-compat adapter. Existing callers use:
 *   <QueryError error={error} onRetry={refetch} />
 *
 * New code should import <ErrorState /> directly with the right variant.
 */
export default function QueryError({ error, onRetry, className }) {
  const fallback = 'Failed to load data. Please try again.';
  const errMsg = error?.response?.data?.message || error?.message;
  return (
    <ErrorState
      variant="network"
      title="Something went wrong"
      description={errMsg ?? fallback}
      onRetry={onRetry}
      className={className}
    />
  );
}
