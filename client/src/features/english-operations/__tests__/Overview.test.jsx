import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Overview } from '../EnglishOperationsPage';

// Identity translator so assertions read against i18n keys.
const t = (key) => key;

describe('English Operations Overview', () => {
  it('shows start-here actions and operational data-status counts', () => {
    render(<Overview
      data={{ managedPeople: 12, linkedPeople: 8, unlinkedPeople: 4, archivePeople: 300 }}
      onNavigate={vi.fn()}
      t={t}
    />);
    expect(screen.getByText('englishOperations.overview.startHere')).toBeInTheDocument();
    expect(screen.getByText('englishOperations.overview.dataStatus')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });
});
