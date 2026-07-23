import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Overview } from '../EnglishOperationsPage';

// Identity translator so assertions read against i18n keys.
const t = (key) => key;

describe('English Operations Overview', () => {
  it('Admin/Coordinator sees start-here actions and operational data-status counts', () => {
    render(<Overview
      data={{ managedPeople: 12, linkedPeople: 8, unlinkedPeople: 4, archivePeople: 300 }}
      isTeacher={false}
      onNavigate={vi.fn()}
      t={t}
    />);
    expect(screen.getByText('englishOperations.overview.startHere')).toBeInTheDocument();
    expect(screen.getByText('englishOperations.overview.dataStatus')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.queryByText('englishOperations.overview.teacherTitle')).not.toBeInTheDocument();
  });

  it('Teacher sees an honest not-available notice, not management actions or ops counts', () => {
    render(<Overview
      data={{ managedPeople: 12, linkedPeople: 8, unlinkedPeople: 4, archivePeople: 300 }}
      isTeacher
      onNavigate={vi.fn()}
      t={t}
    />);
    expect(screen.getByText('englishOperations.overview.teacherTitle')).toBeInTheDocument();
    expect(screen.getByText('englishOperations.overview.teacherPlaceholder')).toBeInTheDocument();
    // No management action cards or operational data counts leak to the Teacher.
    expect(screen.queryByText('englishOperations.overview.startHere')).not.toBeInTheDocument();
    expect(screen.queryByText('englishOperations.overview.dataStatus')).not.toBeInTheDocument();
    expect(screen.queryByText('12')).not.toBeInTheDocument();
  });
});
