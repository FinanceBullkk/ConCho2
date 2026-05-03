import { useState, useEffect } from 'react';
import { teamsAPI } from '../../api/api';
import Portal from '../Portal';

const STATUS_ICONS = {
  Present: '✅',
  Absent: '❌',
  Late: '⚠️',
  Excused: 'ℹ️'
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

  if (loading) return <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm text-white">Loading...</div></Portal>;
  if (!data) return null;

  const { team, schedules, attendances } = data;
  const members = team.members || [];

  // Helper to format date
  const formatDate = (dateString) => {
    const d = new Date(dateString);
    return `${d.getDate()}/${d.getMonth()+1}`;
  };

  // Helper to get ordinal
  const getOrdinal = (n) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[#1e1e1e] rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-white/10" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
          <h2 className="text-xl font-bold text-white">Progress: {team.name} ({team.classId?.courseName})</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>
        
        <div className="p-6 overflow-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-white/5 text-slate-200">
              <tr>
                <th className="p-3 rounded-tl-lg whitespace-nowrap sticky left-0 bg-[#2a2a2a] z-10 border-b border-white/10">Member</th>
                {schedules.map((sch, i) => (
                  <th key={sch._id} className="p-3 text-center whitespace-nowrap border-b border-white/10">
                    <div>{getOrdinal(i+1)}</div>
                    <div className="text-xs text-slate-500 font-normal">{formatDate(sch.startTime)}</div>
                  </th>
                ))}
                <th className="p-3 text-center rounded-tr-lg border-l border-b border-white/10">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {members.map(member => {
                let presentCount = 0;
                let absentCount = 0;
                
                return (
                  <tr key={member._id} className="hover:bg-white/5 transition-colors">
                    <td className="p-3 font-medium text-white whitespace-nowrap sticky left-0 bg-[#1e1e1e] group-hover:bg-[#2a2a2a] z-10 border-r border-white/5">
                      {member.name}
                      <div className="text-xs text-slate-500 font-normal">{member.empCode}</div>
                    </td>
                    {schedules.map(sch => {
                      const att = attendances.find(a => a.scheduleId === sch._id && a.userId === member._id);
                      if (att) {
                        if (att.status === 'Present') presentCount++;
                        if (att.status === 'Absent') absentCount++;
                      }
                      
                      const icon = att ? STATUS_ICONS[att.status] || att.status : '-';
                      return (
                        <td key={sch._id} className="p-3 text-center text-lg" title={att?.status || 'No record'}>
                          {icon}
                        </td>
                      );
                    })}
                    <td className="p-3 text-center border-l border-white/10">
                      <span className="text-green-400 font-medium">{presentCount}</span>
                      <span className="text-slate-500 mx-1">/</span>
                      <span className="text-red-400 font-medium">{absentCount}</span>
                    </td>
                  </tr>
                );
              })}
              {members.length === 0 && (
                <tr><td colSpan={schedules.length + 2} className="p-6 text-center text-slate-500">No members in this team</td></tr>
              )}
            </tbody>
          </table>
          
          <div className="mt-6 flex gap-4 text-xs text-slate-400 justify-center bg-white/5 py-2 rounded-lg border border-white/5">
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
