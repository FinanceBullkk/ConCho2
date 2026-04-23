import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { schedulesAPI, attendanceAPI } from '../api/api';

// ──────────────────────────────────────────────────────────
// Participant Dashboard
// ──────────────────────────────────────────────────────────
// Three sections:
//   1. My Upcoming Classes — schedules for the participant's team/class
//   2. My Attendance Stats — personal P/A/L/EL breakdown + rate
//   3. My Attendance History — per-session table with date, time, status
// ──────────────────────────────────────────────────────────

// Status badge config
const STATUS_CONFIG = {
  P:  { label: 'Có mặt',    short: 'P',  bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/25' },
  A:  { label: 'Vắng mặt',  short: 'A',  bg: 'bg-red-500/15',     text: 'text-red-400',     border: 'border-red-500/25' },
  L:  { label: 'Đi muộn',   short: 'L',  bg: 'bg-amber-500/15',   text: 'text-amber-400',   border: 'border-amber-500/25' },
  EL: { label: 'Có phép',   short: 'EL', bg: 'bg-blue-500/15',    text: 'text-blue-400',    border: 'border-blue-500/25' },
};

export default function ParticipantDashboard() {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState([]);
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [teamName, setTeamName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [schedRes, statsRes, historyRes] = await Promise.all([
          schedulesAPI.getMyClass(),
          attendanceAPI.getMyStats(),
          attendanceAPI.getByUser(user._id),
        ]);
        setSchedules(schedRes.data.data);
        setTeamName(schedRes.data.team || '');
        setStats(statsRes.data.data);
        // Sort by schedule date (newest first) — backend can't sort by populated fields
        const records = historyRes.data.data || [];
        records.sort((a, b) => {
          const dateA = a.scheduleId?.startTime ? new Date(a.scheduleId.startTime) : new Date(0);
          const dateB = b.scheduleId?.startTime ? new Date(b.scheduleId.startTime) : new Date(0);
          return dateB - dateA;
        });
        setHistory(records);
      } catch (err) {
        console.error('Dashboard fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user._id]);
  useEffect(() => { document.title = 'TMS — My Dashboard'; }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Attendance stat cards ─────────────────────────────────
  const rate = stats?.attendanceRate ?? 0;
  const rateColor = rate >= 80 ? 'text-accent-green' : rate >= 60 ? 'text-accent-amber' : 'text-accent-red';
  const rateGradient = rate >= 80 ? 'from-accent-green to-teal-400' : rate >= 60 ? 'from-accent-amber to-orange-400' : 'from-accent-red to-pink-500';

  const statCards = [
    { label: 'Total Sessions', value: stats?.totalSessions ?? 0, icon: '📊', color: 'from-primary-500 to-blue-400' },
    { label: 'Present', value: stats?.present ?? 0, icon: '✅', color: 'from-accent-green to-teal-400' },
    { label: 'Absent', value: stats?.absent ?? 0, icon: '❌', color: 'from-accent-red to-pink-500' },
    { label: 'Late', value: stats?.late ?? 0, icon: '⏰', color: 'from-accent-amber to-orange-400' },
    { label: 'Excused', value: stats?.excused ?? 0, icon: '📝', color: 'from-accent-purple to-pink-400' },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ── Header ───────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-white">🎓 My Learning Dashboard</h1>
        <p className="text-slate-400 mt-1">
          Welcome back, {user.name}
          {teamName && <span className="text-primary-400"> · {teamName}</span>}
        </p>
      </div>

      {/* ── Section 1: My Upcoming Classes ────────────────── */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            📅 My Upcoming Classes
          </h2>
          <span className="text-xs text-slate-500 bg-white/5 px-3 py-1 rounded-full">
            {schedules.length} session{schedules.length !== 1 ? 's' : ''}
          </span>
        </div>

        {schedules.length === 0 ? (
          <div className="text-center py-10">
            <div className="text-4xl mb-3 opacity-50">📭</div>
            <p className="text-slate-400">No upcoming classes scheduled</p>
            <p className="text-slate-500 text-sm mt-1">Your Team Leader can book sessions from the Schedule & Book page</p>
          </div>
        ) : (
          <div className="space-y-3 stagger">
            {schedules.map((s) => {
              const start = new Date(s.startTime);
              const end = new Date(s.endTime);
              const timeStr = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}-${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
              const isToday = new Date().toDateString() === start.toDateString();
              return (
                <div key={s._id} className={`glass-light rounded-xl p-4 flex items-center justify-between transition-all hover:scale-[1.01] ${isToday ? 'border border-primary-500/30 shadow-sm shadow-primary-500/10' : ''}`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center shrink-0 ${isToday ? 'bg-primary-500/20 text-primary-200' : 'bg-primary-500/10 text-primary-300'}`}>
                      <span className="text-xs font-bold">{start.toLocaleDateString('en', { month: 'short' })}</span>
                      <span className="text-xl font-bold leading-none">{start.getDate()}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-white">{s.classId?.classCode}</span>
                        {isToday && (
                          <span className="text-[10px] font-bold text-primary-300 bg-primary-500/20 px-2 py-0.5 rounded-full">
                            TODAY
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-slate-400 mt-0.5">{s.classId?.courseName}</div>
                      <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                        <span>🕐 {timeStr}</span>
                        <span>·</span>
                        <span>{start.toLocaleDateString('en', { weekday: 'long' })}</span>
                        {s.teacherId?.name && (
                          <>
                            <span>·</span>
                            <span>👨‍🏫 {s.teacherId.name}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <div className="text-sm font-medium text-white">{s.enrolledCount}</div>
                    <div className="text-[10px] text-slate-500">enrolled</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Section 2: My Attendance Stats ────────────────── */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            📈 My Attendance Stats
          </h2>
        </div>

        {/* Attendance Rate — big hero card */}
        <div className="glass-light rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-400 mb-1">Attendance Rate</div>
              <div className={`text-5xl font-bold ${rateColor}`}>{rate}%</div>
              <div className="text-xs text-slate-500 mt-2">
                {stats?.present ?? 0} present out of {stats?.totalSessions ?? 0} total sessions
              </div>
            </div>
            {/* Circular progress ring */}
            <div className="relative w-24 h-24 shrink-0">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                <circle
                  cx="50" cy="50" r="42" fill="none"
                  stroke="url(#rateGradient)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${rate * 2.64} ${264 - rate * 2.64}`}
                  className="transition-all duration-1000"
                />
                <defs>
                  <linearGradient id="rateGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={rate >= 80 ? '#22c55e' : rate >= 60 ? '#f59e0b' : '#ef4444'} />
                    <stop offset="100%" stopColor={rate >= 80 ? '#14b8a6' : rate >= 60 ? '#f97316' : '#ec4899'} />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-lg font-bold ${rateColor}`}>{rate}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Stat breakdown cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {statCards.map((card, i) => (
            <div key={card.label} className="glass-light rounded-xl p-4 text-center hover:scale-[1.03] transition-transform" style={{ animationDelay: `${i * 0.05}s` }}>
              <div className="text-2xl mb-2">{card.icon}</div>
              <div className="text-2xl font-bold text-white">{card.value}</div>
              <div className="text-xs text-slate-400 mt-1">{card.label}</div>
              <div className={`h-1 rounded-full bg-gradient-to-r ${card.color} mt-3 opacity-40`} />
            </div>
          ))}
        </div>

        {/* Empty state */}
        {(stats?.totalSessions ?? 0) === 0 && (
          <div className="text-center py-6 mt-4">
            <p className="text-slate-500 text-sm">No attendance records yet — stats will appear after your teacher marks attendance</p>
          </div>
        )}
      </div>

      {/* ── Section 3: My Attendance History (Table) ────────── */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            📋 Lịch Sử Điểm Danh
          </h2>
          <span className="text-xs text-slate-500 bg-white/5 px-3 py-1 rounded-full">
            {history.length} buổi
          </span>
        </div>

        {history.length === 0 ? (
          <div className="text-center py-10">
            <div className="text-4xl mb-3 opacity-50">📭</div>
            <p className="text-slate-400">Chưa có lịch sử điểm danh</p>
            <p className="text-slate-500 text-sm mt-1">Kết quả sẽ hiện sau khi giáo viên chấm công</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 px-3 text-slate-400 font-medium text-xs uppercase tracking-wider">Ngày</th>
                  <th className="text-left py-3 px-3 text-slate-400 font-medium text-xs uppercase tracking-wider">Giờ học</th>
                  <th className="text-left py-3 px-3 text-slate-400 font-medium text-xs uppercase tracking-wider">Mã lớp</th>
                  <th className="text-left py-3 px-3 text-slate-400 font-medium text-xs uppercase tracking-wider hidden sm:table-cell">Khóa học</th>
                  <th className="text-left py-3 px-3 text-slate-400 font-medium text-xs uppercase tracking-wider hidden md:table-cell">Giáo viên</th>
                  <th className="text-center py-3 px-3 text-slate-400 font-medium text-xs uppercase tracking-wider">Trạng thái</th>
                  <th className="text-left py-3 px-3 text-slate-400 font-medium text-xs uppercase tracking-wider hidden lg:table-cell">Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {history.map((record, i) => {
                  const sched = record.scheduleId;
                  const start = sched?.startTime ? new Date(sched.startTime) : null;
                  const end = sched?.endTime ? new Date(sched.endTime) : null;
                  const cfg = STATUS_CONFIG[record.status] || STATUS_CONFIG.A;

                  const dateStr = start
                    ? start.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
                    : '—';
                  const timeStr = start && end
                    ? `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')} – ${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`
                    : '—';

                  return (
                    <tr
                      key={record._id}
                      className={`border-b border-white/5 hover:bg-white/[0.02] transition-colors ${i === 0 ? '' : ''}`}
                    >
                      {/* Date */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          {start && (
                            <div className="w-9 h-9 rounded-lg bg-primary-500/10 flex flex-col items-center justify-center shrink-0">
                              <span className="text-[9px] font-bold text-primary-400 leading-tight">
                                {start.toLocaleDateString('en', { month: 'short' })}
                              </span>
                              <span className="text-sm font-bold text-primary-300 leading-tight">
                                {start.getDate()}
                              </span>
                            </div>
                          )}
                          <span className="text-slate-300 text-xs whitespace-nowrap">
                            {dateStr}
                          </span>
                        </div>
                      </td>

                      {/* Time */}
                      <td className="py-3 px-3 text-slate-300 whitespace-nowrap font-mono text-xs">
                        {timeStr}
                      </td>

                      {/* Class Code */}
                      <td className="py-3 px-3">
                        <span className="text-white font-medium">
                          {sched?.classId?.classCode || '—'}
                        </span>
                      </td>

                      {/* Course Name (hidden on mobile) */}
                      <td className="py-3 px-3 hidden sm:table-cell">
                        <span className="text-slate-400 text-xs">
                          {sched?.classId?.courseName || '—'}
                        </span>
                      </td>

                      {/* Teacher (hidden on small) */}
                      <td className="py-3 px-3 hidden md:table-cell">
                        <span className="text-slate-400 text-xs">
                          {sched?.teacherId?.name || <span className="text-slate-600 italic">—</span>}
                        </span>
                      </td>

                      {/* Status Badge */}
                      <td className="py-3 px-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                          {cfg.label}
                        </span>
                      </td>

                      {/* Remark (hidden on small) */}
                      <td className="py-3 px-3 hidden lg:table-cell">
                        <span className="text-slate-500 text-xs">
                          {record.remark || '—'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
