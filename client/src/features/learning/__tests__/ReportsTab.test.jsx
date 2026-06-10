import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReportsTab from '../ReportsTab';

const mocks = vi.hoisted(() => ({
  loadRollup: vi.fn(),
  downloadCompletion: vi.fn(),
  downloadCompliance: vi.fn(),
  saveBlob: vi.fn(),
  complianceCalls: [],
  state: {
    isAdmin: true,
    complianceReport: null,
    complianceFetching: false,
  },
}));

const complianceReport = {
  summary: { rows: 1, overdue: 1, complete: 0, issued: 0, expiring: 0, expired: 1 },
  rows: [{
    learner: { id: 'u1', empCode: '000011', name: 'Alice Nguyen' },
    org: { departmentName: 'Sales', managerName: 'Manager One' },
    assignment: {
      id: 'a1',
      title: 'Quarterly Compliance',
      targetName: 'Cyber Hygiene',
      dueDate: '2026-06-30T00:00:00.000Z',
      status: 'overdue',
    },
    certificate: { state: 'expired', number: 'CERT-1', validUntil: '2026-06-01T00:00:00.000Z' },
  }],
};

vi.mock('../../../hooks/useLearning', () => ({
  useLearningCohorts: () => ({ data: { data: [{ _id: 'c1', cohortCode: 'EL001', programName: 'English' }] } }),
  useLearningPrograms: () => ({ data: { data: [{ _id: 'p1', code: 'COC', name: 'Code of Conduct' }] } }),
  useLearningAssignments: () => ({
    data: {
      data: [{
        _id: 'a1',
        title: 'Quarterly Compliance',
        target: { name: 'Cyber Hygiene' },
      }],
    },
  }),
  useCompletionReport: () => ({ data: null, isLoading: false }),
  useCompletionRollup: () => ({
    data: null,
    isFetching: false,
    refetch: mocks.loadRollup,
  }),
  useComplianceReport: (filters, options = {}) => {
    mocks.complianceCalls.push({ filters, enabled: options.enabled });
    return {
      data: mocks.state.complianceReport,
      isFetching: mocks.state.complianceFetching,
      refetch: vi.fn(),
    };
  },
  useDownloadCompletionReport: () => ({ mutateAsync: mocks.downloadCompletion, isPending: false }),
  useDownloadComplianceReport: () => ({ mutateAsync: mocks.downloadCompliance, isPending: false }),
}));

vi.mock('../../../hooks/useOrg', () => ({
  useDepartments: () => ({ data: [{ _id: 'd1', code: 'SALES', name: 'Sales' }] }),
}));

vi.mock('../../../hooks/useUsers', () => ({
  useUsers: () => ({ data: { data: [{ _id: 'm1', empCode: '000100', name: 'Manager One' }] } }),
}));

vi.mock('../../../hooks/useRole', () => ({
  useRole: () => ({ isAdmin: mocks.state.isAdmin }),
}));

vi.mock('../report-download', () => ({
  saveBlob: mocks.saveBlob,
}));

describe('ReportsTab', () => {
  beforeEach(() => {
    mocks.loadRollup.mockReset();
    mocks.downloadCompletion.mockReset();
    mocks.downloadCompliance.mockReset();
    mocks.saveBlob.mockReset();
    mocks.downloadCompliance.mockResolvedValue({ headers: {}, data: new Blob(['xlsx']) });
    mocks.complianceCalls.length = 0;
    mocks.state.isAdmin = true;
    mocks.state.complianceReport = null;
    mocks.state.complianceFetching = false;
  });

  it('does not load heavy rollups until requested', async () => {
    const user = userEvent.setup();
    mocks.loadRollup.mockResolvedValueOnce({});

    render(<ReportsTab />);

    expect(mocks.loadRollup).not.toHaveBeenCalled();
    expect(screen.getByText('Rollups are ready on demand')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /load rollups/i }));
    expect(mocks.loadRollup).toHaveBeenCalledTimes(1);
  });

  it('loads compliance report only after Admin requests it', async () => {
    const user = userEvent.setup();
    render(<ReportsTab />);

    await user.click(screen.getByRole('tab', { name: /compliance/i }));
    expect(screen.getByText('Compliance report ready')).toBeInTheDocument();
    expect(mocks.complianceCalls.at(-1)).toEqual({ filters: {}, enabled: false });

    await user.selectOptions(screen.getByLabelText('Assignment status'), 'overdue');
    await user.click(screen.getByRole('button', { name: /load report/i }));

    expect(mocks.complianceCalls.at(-1)).toEqual({ filters: { status: 'overdue' }, enabled: true });
  });

  it('enables compliance export only after rows are loaded', async () => {
    const user = userEvent.setup();
    mocks.state.complianceReport = complianceReport;
    render(<ReportsTab />);

    await user.click(screen.getByRole('tab', { name: /compliance/i }));
    expect(screen.getByRole('button', { name: /export excel/i })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /load report/i }));
    await user.click(screen.getByRole('button', { name: /export excel/i }));

    expect(mocks.downloadCompliance).toHaveBeenCalledWith({});
    expect(mocks.saveBlob).toHaveBeenCalledWith(expect.any(Object), 'compliance-report.xlsx');
  });

  it('hides the Compliance view for non-admin report readers', () => {
    mocks.state.isAdmin = false;
    render(<ReportsTab />);

    expect(screen.getByText('Completion rollups')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /compliance/i })).not.toBeInTheDocument();
  });
});
