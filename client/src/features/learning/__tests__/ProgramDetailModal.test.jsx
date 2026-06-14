import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ProgramDetailModal from '../ProgramDetailModal';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }));

const customDefs = [
  { _id: 'd1', key: 'budget_code', label: 'Budget code', type: 'text' },
  { _id: 'd2', key: 'theme', label: 'Theme', type: 'select', options: ['A', 'B'] },
];
vi.mock('../../custom-fields/useCustomFields', () => ({
  useCustomFields: () => ({ data: customDefs }),
}));

const program = {
  _id: 'p1', name: 'Leadership 101', code: 'LEAD-101', status: 'active',
  category: 'soft_skills', schedulingMode: 'admin_scheduled', deliveryMode: 'online',
  defaultSessionCount: 8,
  completionPolicy: { attendanceThresholdPercent: 80, requiresAssessment: true, requiresFeedback: false },
  certificateValidityDays: 365,
  capacityPolicy: { maxParticipants: 20, maxParticipantsPerSession: 12 },
  recertifyPolicy: { autoAssign: true },
  prerequisitePrograms: ['p0'],
  description: 'A leadership program.',
  customFields: { budget_code: 'FY26-OPS', theme: '' },
};
const programs = [program, { _id: 'p0', name: 'Intro', code: 'INTRO' }];

const renderModal = (props = {}) =>
  render(
    <ProgramDetailModal
      program={program} programs={programs} canManage
      onEdit={() => {}} onClose={() => {}} {...props}
    />,
  );

describe('ProgramDetailModal', () => {
  it('renders the program, custom field values, and prerequisites', () => {
    renderModal();
    expect(screen.getByText('Leadership 101')).toBeInTheDocument();
    expect(screen.getByText('LEAD-101')).toBeInTheDocument();
    // Custom field label + its stored value (define → save → READ).
    expect(screen.getByText('Budget code')).toBeInTheDocument();
    expect(screen.getByText('FY26-OPS')).toBeInTheDocument();
    // An empty defined field shows the placeholder, not a blank.
    expect(screen.getByText('Theme')).toBeInTheDocument();
    expect(screen.getByText('learning.programs.detail.none')).toBeInTheDocument();
    // Prerequisite resolved to its program name.
    expect(screen.getByText('Intro')).toBeInTheDocument();
  });

  it('shows an Edit shortcut for managers and fires onEdit', () => {
    const onEdit = vi.fn();
    renderModal({ onEdit });
    const btn = screen.getByRole('button', { name: /learning\.programs\.edit/ });
    fireEvent.click(btn);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('hides the Edit shortcut for read-only users', () => {
    renderModal({ canManage: false });
    expect(screen.queryByRole('button', { name: /learning\.programs\.edit/ })).toBeNull();
  });
});
