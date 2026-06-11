import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { schedulesAPI } from '../../api/api';
import { qk } from '../../hooks/queryKeys';

// ── Session waitlist hooks (Wave E3 phase-04, slice B) ─────
// A learner self-joins the FIFO queue of a FULL session; a freed seat
// auto-promotes the oldest waiter (server-side, transactional). Feature-local
// to the learner pages — the only consumers live under features/learner/.

export const useMyWaitlist = (options = {}) =>
  useQuery({
    queryKey: qk.schedules.myWaitlist,
    queryFn: async () => (await schedulesAPI.myWaitlist()).data,
    ...options,
  });

const invalidate = (qc) => {
  qc.invalidateQueries({ queryKey: qk.schedules.all });
  qc.invalidateQueries({ queryKey: qk.learning.all });
};

export const useJoinWaitlist = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scheduleId) => schedulesAPI.joinWaitlist(scheduleId).then((r) => r.data.data),
    onSettled: () => invalidate(qc),
  });
};

export const useLeaveWaitlist = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scheduleId) => schedulesAPI.leaveWaitlist(scheduleId).then((r) => r.data),
    onSettled: () => invalidate(qc),
  });
};
