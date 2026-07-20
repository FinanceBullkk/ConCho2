import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AttendanceDrawer } from '../AttendanceDrawer';

describe('AttendanceDrawer workflow status options', () => {
  it('shows all four shared attendance states for English Operations', () => {
    render(
      <AttendanceDrawer
        isOpen
        isLoading={false}
        schedule={{
          _id: 'session-1',
          startTime: '2026-01-01T03:00:00.000Z',
          classId: { classCode: 'ENG-A' },
        }}
        records={[{
          userId: 'user-1', empCode: 'E001', name: 'Learner One', department: 'Ops', status: 'P', isMarked: true,
        }]}
        isPending={false}
        result={null}
        isStale={false}
        isAdmin
        isDirty={false}
        confirmingClose={false}
        onCloseRequest={vi.fn()}
        onCancelClose={vi.fn()}
        onDiscardAndClose={vi.fn()}
        onMarkAll={vi.fn()}
        onRecordUpdate={vi.fn()}
        onSubmit={vi.fn()}
        makeRowKeyHandler={() => vi.fn()}
        statusOptions={['P', 'L', 'A', 'EL']}
      />,
    );

    ['P', 'L', 'A', 'EL'].forEach((status) => {
      expect(screen.getByRole('button', { name: status })).toBeInTheDocument();
    });
  });

  it('renders historical attendance without mutation controls', () => {
    render(
      <AttendanceDrawer
        isOpen
        isLoading={false}
        schedule={{
          _id: 'archive:session-1',
          startTime: '2025-01-01T03:00:00.000Z',
          classId: { classCode: 'HIST-A' },
        }}
        records={[{
          userId: 'archive-enrollment-1', empCode: 'E001', name: 'Learner One', department: '', status: 'A', isMarked: true,
        }]}
        isPending={false}
        result={null}
        isStale={false}
        isAdmin
        isDirty={false}
        confirmingClose={false}
        onCloseRequest={vi.fn()}
        onCancelClose={vi.fn()}
        onDiscardAndClose={vi.fn()}
        onMarkAll={vi.fn()}
        onRecordUpdate={vi.fn()}
        onSubmit={vi.fn()}
        makeRowKeyHandler={() => vi.fn()}
        statusOptions={['P', 'A']}
        isReadOnly
        readOnlyLabel="Historical attendance · Read-only"
      />,
    );

    expect(screen.getByText('Historical attendance · Read-only')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'P' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'A' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /mark all/i })).toBeNull();
  });
});
