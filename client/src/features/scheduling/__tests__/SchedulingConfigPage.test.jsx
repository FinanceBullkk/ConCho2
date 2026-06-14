import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SchedulingConfigPage from '../SchedulingConfigPage';

// Two non-overlapping windows: 10:00–11:00 and 13:00–14:00 (both 1h).
const initialSlots = [
  { sh: 10, sm: 0, eh: 11, em: 0 },
  { sh: 13, sm: 0, eh: 14, em: 0 },
];

const h = vi.hoisted(() => ({
  settings: [],
  isLoading: false,
  mutateAsync: vi.fn(() => Promise.resolve()),
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../settings/useSettings', () => ({
  useSettings: () => ({ data: h.settings, isLoading: h.isLoading }),
  useUpdateSettings: () => ({ mutateAsync: h.mutateAsync, isPending: false }),
}));
vi.mock('../../../hooks/useSchedulingConfig', () => ({
  useSchedulingConfig: () => ({
    data: { timezone: 'Asia/Ho_Chi_Minh', weeklyTeamLimit: 2, slots: [] },
  }),
}));

const renderPage = () => render(<MemoryRouter><SchedulingConfigPage /></MemoryRouter>);
const startInputs = () => screen.getAllByLabelText('scheduling.startAria');
const saveBtn = () => screen.getByRole('button', { name: 'scheduling.save' });

beforeEach(() => {
  h.settings = [{ _id: 's1', key: 'ALLOWED_TIME_SLOTS', value: initialSlots.map((s) => ({ ...s })) }];
  h.isLoading = false;
  h.mutateAsync.mockClear();
});

describe('SchedulingConfigPage', () => {
  it('renders the configured windows, durations, and the rules panel', () => {
    renderPage();
    const starts = startInputs();
    expect(starts).toHaveLength(2);
    expect(starts[0]).toHaveValue('10:00');
    expect(starts[1]).toHaveValue('13:00');
    // Both windows are 1h.
    expect(screen.getAllByText('1h').length).toBe(2);
    // Rules panel surfaces the authoritative timezone + weekly limit.
    expect(screen.getByText('Asia/Ho_Chi_Minh')).toBeInTheDocument();
    expect(screen.getByText('scheduling.perWeek')).toBeInTheDocument();
    // No edits yet → Save is disabled (not dirty).
    expect(saveBtn()).toBeDisabled();
  });

  it('flags an overlapping edit and blocks saving', () => {
    renderPage();
    // Move the 2nd window to 10:30 so it overlaps the first (10:00–11:00).
    fireEvent.change(startInputs()[1], { target: { value: '10:30' } });
    expect(screen.getAllByText('scheduling.errOverlap').length).toBeGreaterThan(0);
    expect(saveBtn()).toBeDisabled();
    expect(h.mutateAsync).not.toHaveBeenCalled();
  });

  it('saves a valid edit with the ALLOWED_TIME_SLOTS payload', async () => {
    renderPage();
    // Shift the 2nd window start to 13:30 — still valid, no overlap.
    fireEvent.change(startInputs()[1], { target: { value: '13:30' } });
    const btn = saveBtn();
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(h.mutateAsync).toHaveBeenCalledWith([
      {
        key: 'ALLOWED_TIME_SLOTS',
        value: [
          { sh: 10, sm: 0, eh: 11, em: 0 },
          { sh: 13, sm: 30, eh: 14, em: 0 },
        ],
      },
    ]);
  });

  it('adds and removes windows', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /scheduling\.addWindow/ }));
    expect(startInputs()).toHaveLength(3);
    fireEvent.click(screen.getAllByLabelText('scheduling.removeAria')[0]);
    expect(startInputs()).toHaveLength(2);
  });

  it('warns and disables booking when there are no windows', () => {
    h.settings = [{ _id: 's1', key: 'ALLOWED_TIME_SLOTS', value: [] }];
    renderPage();
    expect(screen.getByText('scheduling.emptyWarn')).toBeInTheDocument();
    expect(screen.queryAllByLabelText('scheduling.startAria')).toHaveLength(0);
  });
});
