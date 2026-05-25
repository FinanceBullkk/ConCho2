import { useState, useEffect } from 'react';
import { usersAPI } from '../../api/api';
import Portal from '../Portal';
import { Spinner } from '../Spinner';

const STATUS_ICONS = { P: '✅', A: '❌', L: '⚠️', EL: 'ℹ️' };

export default function StudentProgressModal({ userId, userName, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    usersAPI.getProgress(userId).then(res => {
      setData(res.data.data);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, [userId]);

  if (loading) return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" aria-hidden="true">
        <Spinner size={32} />
      </div>
    </Portal>
  );
  if (!data) return null;

  const { enrollments, schedules, attendances } = data;

  const formatDate = (dateString) => {
    const d = new Date(dateString);
    return `${d.getDate()}/${d.getMonth()+1}`;
  };

  const getOrdinal = (n) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  // Group schedules by teamId
  const teamSchedules = {};
  schedules.forEach(sch => {
    const tid = sch.bookedTeamId?._id || sch.bookedTeamId;
    if (!teamSchedules[tid]) teamSchedules[tid] = [];
    teamSchedules[tid].push(sch);
  });

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose} aria-hidden="true">
        <div
          className="bg-card rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-border"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-6 border-b border-border flex justify-between items-center bg-accent">
            <h2 className="text-h3 text-foreground">Progress: {userName || data.user?.name}</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-2xl leading-none transition-colors">&times;</button>
          </div>

          <div className="p-6 overflow-auto space-y-6">
            {enrollments.length === 0 ? (
              <div className="text-center text-subtle-foreground py-8">Not enrolled in any classes.</div>
            ) : (
              enrollments.map(enrollment => {
                const team = enrollment.teamId;
                if (!team) return null;
                const tSchedules = teamSchedules[team._id] || [];

                let pCount = 0, aCount = 0;

                return (
                  <div key={enrollment._id} className="bg-accent rounded-md border border-border overflow-hidden">
                    <div className="p-4 border-b border-border bg-muted flex justify-between items-center">
                      <div>
                        <h3 className="text-foreground font-bold">{team.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {enrollment.classId?.courseName || 'N/A'} · Enrolled: {new Date(enrollment.joinedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-xs font-medium ${enrollment.status === 'Active' ? 'bg-primary/15 text-primary' : 'bg-destructive/10 text-destructive'}`}>
                        {enrollment.status}
                      </div>
                    </div>

                    <div className="p-4 overflow-x-auto">
                      {tSchedules.length === 0 ? (
                        <div className="text-sm text-subtle-foreground text-center py-4">No schedules found for this team.</div>
                      ) : (
                        <div className="flex items-center gap-2 min-w-max">
                          {tSchedules.map((sch, i) => {
                            const att = attendances.find(a => {
                              const aSchId = a.scheduleId?._id || a.scheduleId;
                              return aSchId?.toString() === sch._id?.toString();
                            });
                            if (att) {
                              if (att.status === 'P' || att.status === 'L') pCount++;
                              if (att.status === 'A') aCount++;
                            }
                            const icon = att ? STATUS_ICONS[att.status] || att.status : '-';

                            return (
                              <div key={sch._id} className="flex flex-col items-center justify-center bg-background rounded-md p-3 w-20 border border-border">
                                <span className="text-xs font-medium text-muted-foreground">{getOrdinal(i+1)}</span>
                                <span className="text-[10px] text-subtle-foreground mb-2">{formatDate(sch.startTime)}</span>
                                <span className="text-xl" title={att?.status}>{icon}</span>
                              </div>
                            );
                          })}

                          <div className="ml-4 pl-4 border-l border-border flex flex-col justify-center">
                            <div className="text-xs text-muted-foreground mb-1">Summary</div>
                            <div className="flex gap-2">
                              <span className="text-success text-sm font-bold bg-success/10 px-2 py-1 rounded border border-success/20">{pCount} P</span>
                              <span className="text-destructive text-sm font-bold bg-destructive/10 px-2 py-1 rounded border border-destructive/20">{aCount} A</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}
