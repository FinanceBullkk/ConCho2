import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CohortsTab from '../CohortsTab';

// Converge Phase 4: the unified catalog (mode="all") lists BOTH scheduling
// worlds with a deliveryType column + world filter, and gates cohort-enroll
// per-row (team rows enrol via team membership, not here).
const h = vi.hoisted(() => ({ cohorts: {}, can: vi.fn() }));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }));
vi.mock('../../../hooks/useLearning', () => ({ useLearningCohorts: () => h.cohorts }));
vi.mock('../../../hooks/useRole', () => ({ useRole: () => ({ can: h.can }) }));
vi.mock('../CohortFormModal', () => ({ default: () => <div /> }));
vi.mock('../CohortEditModal', () => ({ default: () => <div /> }));
vi.mock('../ArchivedCohortsPanel', () => ({ default: () => <div /> }));
vi.mock('../EnrollLearnersModal', () => ({ default: () => <div /> }));
vi.mock('../CreateSessionModal', () => ({ default: () => <div /> }));
vi.mock('../CohortSessionsPanel', () => ({ default: () => <div /> }));

const renderTab = (mode = 'all') =>
  render(<MemoryRouter><CohortsTab mode={mode} /></MemoryRouter>);

beforeEach(() => {
  h.can = vi.fn().mockReturnValue(true);
  h.cohorts = {
    isLoading: false,
    data: {
      data: [
        { _id: 'c-team', cohortCode: 'EL001', programName: 'Business English',
          status: 'Ongoing', totalSessions: 16, bookedSessions: 2,
          deliveryType: 'team', program: { schedulingMode: 'leader_booking' } },
        { _id: 'c-cohort', cohortCode: 'LD001', programName: 'Data Privacy',
          status: 'Ongoing', totalSessions: 4, bookedSessions: 0,
          deliveryType: 'cohort', program: { schedulingMode: 'self_enroll' } },
      ],
    },
  };
});

describe('CohortsTab — unified catalog (mode="all")', () => {
  it('lists BOTH worlds with a delivery-type badge', () => {
    renderTab('all');
    expect(screen.getByText('EL001')).toBeInTheDocument();
    expect(screen.getByText('LD001')).toBeInTheDocument();
    expect(screen.getByText('learning.cohorts.type_team')).toBeInTheDocument();
    expect(screen.getByText('learning.cohorts.type_cohort')).toBeInTheDocument();
  });

  it('offers cohort-enroll only on cohort-world rows', () => {
    renderTab('all');
    // Exactly one Enroll button — the cohort row; the team row enrols via teams.
    expect(screen.getAllByText('learning.cohorts.manage')).toHaveLength(1);
  });

  it('filters by world when a facet is clicked', () => {
    renderTab('all');
    fireEvent.click(screen.getByText('learning.cohorts.filter_team'));
    expect(screen.getByText('EL001')).toBeInTheDocument();
    expect(screen.queryByText('LD001')).not.toBeInTheDocument();
  });
});
