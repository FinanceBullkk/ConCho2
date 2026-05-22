import { useState, useEffect } from 'react';
import { teamsAPI } from '../../api/api';
import Portal from '../Portal';
import { Spinner } from '../Spinner';

const STATUS_ICONS = {
  P: '✅',
  A: '❌',
  L: '⚠️',
  EL: 'ℹ️',
};

export default function TeamProgressModal({ teamId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    teamsAPI.getProgress(teamId).then(res => {
      setData(res.data.data);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, [teamId]);

  if (loading) return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <Spinner size={32} />
      </div>
    </Portal>
  );
  if (!data) return null;

  const { team, schedules, attendances } = data;
  const members = team.members || [];

  const formatDate = (dateString) => {
    const d = new Date(dateString);
    return `${d.getDate()}/${d.getMonth()+1}`;
  };

  const getOrdinal = (n) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
        <div
          className="bg-card rounded-lg w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-border"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-6 border-b border-border flex justify-between items-center bg-accent">
            <h2 className="text-h3 text-foreground">Progress: {team.name} ({team.classId?.courseName})</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-2xl leading-none transition-colors">&times;</button>
          </div>

          <div className="p-6 overflow-auto">
            <table className="w-full text-left text-sm text-foreground">
              <thead className="bg-accent text-foreground">
                <tr>
                  <th className="p-3 rounded-tl-md whitespace-nowrap sticky left-0 bg-muted z-10 border-b border-border">Member</th>
                  {schedules.map((sch, i) => (
                    <th key={sch._id} className="p-3 text-center whitespace-nowrap border-b border-border">
                      <div>{getOrdinal(i+1)}</div>
                      <div className="text-xs text-subtle-foreground font-normal">{formatDate(sch.startTime)}</div>
                    </th>
                  ))}
                  <th className="p-3 text-center rounded-tr-md border-l border-b border-border">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {members.map(member => {
                  let presentCount = 0;
                  let absentCount = 0;

                  return (
                    <tr key={member._id} className="hover:bg-accent transition-colors">
                      <td className="p-3 font-medium text-foreground whitespace-nowrap sticky left-0 bg-card z-10 border-r border-border">
                        {member.name}
                        <div className="text-xs text-subtle-foreground font-normal">{member.empCode}</div>
                      </td>
                      {schedules.map(sch => {
                        const att = attendances.find(a => {
                          const aSchId = a.scheduleId?._id || a.scheduleId;
                          const aUserId = a.userId?._id || a.userId;
                          return aSchId?.toString() === sch._id?.toString() && aUserId?.toString() === member._id?.toString();
                        });
                        if (att) {
                          if (att.status === 'P' || att.status === 'L') presentCount++;
                          if (att.status === 'A') absentCount++;
                        }

                        const icon = att ? STATUS_ICONS[att.status] || att.status : '-';
                        return (
                          <td key={sch._id} className="p-3 text-center text-lg" title={att?.status || 'No record'}>
                            {icon}
                          </td>
                        );
                      })}
                      <td className="p-3 text-center border-l border-border">
                        <span className="text-success font-medium">{presentCount}</span>
                        <span className="text-subtle-foreground mx-1">/</span>
                        <span className="text-destructive font-medium">{absentCount}</span>
                      </td>
                    </tr>
                  );
                })}
                {members.length === 0 && (
                  <tr><td colSpan={schedules.length + 2} className="p-6 text-center text-subtle-foreground">No members in this team</td></tr>
                )}
              </tbody>
            </table>

            <div className="mt-6 flex gap-4 text-xs text-muted-foreground justify-center bg-accent py-2 rounded-md border border-border">
              <span>✅ Present</span>
              <span>❌ Absent</span>
              <span>⚠️ Late</span>
              <span>ℹ️ Excused</span>
              <span>- No Record</span>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
