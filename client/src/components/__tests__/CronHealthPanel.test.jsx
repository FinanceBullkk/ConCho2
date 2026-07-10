import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CronHealthPanel from '../CronHealthPanel';

const HOUR = 60 * 60 * 1000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

describe('CronHealthPanel', () => {
  it('shows a loading spinner state', () => {
    const { container } = render(<CronHealthPanel jobs={[]} isLoading />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders an empty state when no jobs have run', () => {
    render(<CronHealthPanel jobs={[]} isLoading={false} />);
    expect(screen.getByText(/No scheduled-job runs recorded yet/i)).toBeInTheDocument();
  });

  it('renders a healthy job with a friendly label', () => {
    render(
      <CronHealthPanel
        isLoading={false}
        jobs={[{
          jobName: 'assignment-reminders', health: 'ok', lastStatus: 'ok',
          lastRunAt: ago(HOUR), lastSuccessAt: ago(HOUR),
          lastDurationMs: 120, runCount: 3, failCount: 0,
        }]}
      />
    );
    expect(screen.getByText('Assignment reminders')).toBeInTheDocument();
    expect(screen.getByText('Healthy')).toBeInTheDocument();
  });

  it('surfaces the error message on a failing job', () => {
    render(
      <CronHealthPanel
        isLoading={false}
        jobs={[{
          jobName: 'attendance-reminders', health: 'error', lastStatus: 'error',
          lastRunAt: ago(HOUR), lastSuccessAt: null,
          lastError: 'SMTP timeout', runCount: 2, failCount: 1,
        }]}
      />
    );
    expect(screen.getByText('Attendance reminders')).toBeInTheDocument();
    expect(screen.getByText('Failing')).toBeInTheDocument();
    expect(screen.getByText('SMTP timeout')).toBeInTheDocument();
  });

  it('marks a job that has not run within cadence as stale', () => {
    render(
      <CronHealthPanel
        isLoading={false}
        jobs={[{
          jobName: 'assignment-reminders', health: 'stale', lastStatus: 'ok',
          lastRunAt: ago(72 * HOUR), lastSuccessAt: ago(72 * HOUR),
          runCount: 5, failCount: 0,
        }]}
      />
    );
    expect(screen.getByText('Stale')).toBeInTheDocument();
  });
});
