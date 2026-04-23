import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { schedulesAPI, attendanceAPI } from '../api/api';

// ──────────────────────────────────────────────────────────
// Teacher Dashboard
// ──────────────────────────────────────────────────────────
// Sections:
//   1. Quick Stats — total assigned, today's classes, pending attendance
//   2. Today's Classes — sessions happening today
//   3. Upcoming Classes — next 5 sessions to teach
//   4. Attendance Summary — quick-access to mark attendance
// ──────────────────────────────────────────────────────────

export default function TeacherDashboard() {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState([]);
  const [unmarkedCount, setUnmarkedCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => { document.title = 'TMS — Teacher Dashboard'; }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await schedulesAPI.getAll({ limit: 200 });
        const all = res.data.data;

        // Filter to schedules assigned to this teacher
        const mySchedules = all.filter(
          (s) => s.teacherId?._id === user._id || s.teacherId === user._id
        );
        setSchedules(mySchedules);

        // Check unmarked attendance
        let unmarked = 0;
        await Promise.all(
          mySchedules
            .filter((s) => new Date(s.startTime) < new Date()) // Past only
            .map(async (s) => {
              try {
                const attRes = await attendanceAPI.getBySchedule(s._id);
                if (!attRes.data.data || attRes.data.data.length === 0) unmarked++;
              } catch { unmarked++; }
            })
        );
        setUnmarkedCount(unmarked);
      } catch (err) {
        console.error('Teacher dashboard error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user._id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const now = new Date();
  const todayStr = now.toDateString();
  const todayClasses = schedules.filter((s) => new Date(s.startTime).toDateString() === todayStr);
  const upcoming = schedules
    .filter((s) => new Date(s.startTime) >= now)
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
    .slice(0, 7);

  const pastUnmarked = schedules.filter(
    (s) => new Date(s.startTime) < now
  );

  // Stats
  const statCards = [
    { label: 'My Sessions', value: schedules.length, icon: '📅', color: 'from-primary-500 to-blue-400' },
    { label: "Today's Classes", value: todayClasses.length, icon: '🎯', color: 'from-accent-green to-teal-400' },
    { label: 'Upcoming', value: upcoming.length, icon: '📆', color: 'from-accent-amber to-orange-400' },
    {
      label: 'Need Marking',
      value: unmarkedCount,
      icon: '⚠️',
      color: unmarkedCount > 0 ? 'from-accent-red to-pink-500' : 'from-slate-500 to-slate-400',
    },
  ];

  const formatTime = (s) => {
    const start = new Date(s.startTime);
    const end = new Date(s.endTime);
    return `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}-${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">📖 Teacher Dashboard</h1>
        <p className="text-slate-400 mt-1">Welcome back, {user.name}</p>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {statCards.map((card, i) => (
          <div key={card.label} className="glass rounded-2xl p-5 hover:scale-[1.02] transition-transform" style={{ animationDelay: `${i * 0.05}s` }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{card.icon}</span>
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.color} opacity-20`} />
            </div>
            <div className="text-3xl font-bold text-white">{card.value}</div>
            <div className="text-sm text-slate-400 mt-1">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Today's Classes */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            🎯 Today's Classes
          </h2>
          <span className="text-xs text-slate-500 bg-white/5 px-3 py-1 rounded-full">
            {todayClasses.length} session{todayClasses.length !== 1 ? 's' : ''}
          </span>
        </div>
        {todayClasses.length === 0 ? (
          <div className="text-center py-6">
            <div className="text-3xl mb-2 opacity-50">☕</div>
            <p className="text-slate-500 text-sm">No classes today — enjoy your break!</p>
          </div>
        ) : (
          <div className="space-y-3 stagger">
            {todayClasses.map((s) => (
              <Link key={s._id} to="/attendance" className="block glass-light rounded-xl p-4 flex items-center justify-between hover:scale-[1.01] hover:border-primary-500/20 border border-transparent transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-accent-green/10 flex items-center justify-center text-accent-green text-lg font-bold">
                    📚
                  </div>
                  <div>
                    <div className="font-medium text-white">{s.classId?.courseName || s.classId?.classCode}</div>
                    <div className="text-sm text-slate-400">{formatTime(s)} • {s.enrolledCount}/{s.capacity} students</div>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full bg-primary-500/20 text-primary-300 text-xs font-medium">
                  Mark Attendance →
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming Classes */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            📆 Upcoming Classes
          </h2>
          <Link to="/schedules" className="text-xs text-primary-400 hover:text-primary-300 transition-colors">
            View all →
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <div className="text-center py-6">
            <div className="text-3xl mb-2 opacity-50">📭</div>
            <p className="text-slate-500 text-sm">No upcoming classes assigned to you</p>
          </div>
        ) : (
          <div className="space-y-3 stagger">
            {upcoming.map((s) => {
              const start = new Date(s.startTime);
              const isToday = start.toDateString() === todayStr;
              return (
                <div key={s._id} className={`glass-light rounded-xl p-4 flex items-center justify-between ${isToday ? 'border border-accent-green/20' : ''}`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 ${isToday ? 'bg-accent-green/10 text-accent-green' : 'bg-primary-500/10 text-primary-300'}`}>
                      <span className="text-xs font-bold">{start.toLocaleDateString('en', { month: 'short' })}</span>
                      <span className="text-lg font-bold leading-none">{start.getDate()}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{s.classId?.classCode}</span>
                        {isToday && <span className="text-[10px] font-bold text-accent-green bg-accent-green/20 px-2 py-0.5 rounded-full">TODAY</span>}
                      </div>
                      <div className="text-sm text-slate-400">{s.classId?.courseName}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{formatTime(s)} • {start.toLocaleDateString('en', { weekday: 'long' })}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-white">{s.enrolledCount}</div>
                    <div className="text-[10px] text-slate-500">students</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Link to="/attendance" className="glass rounded-2xl p-6 hover:scale-[1.01] transition-transform group">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-accent-green/10 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
              ✅
            </div>
            <div>
              <div className="font-semibold text-white">Mark Attendance</div>
              <div className="text-sm text-slate-400">Select a session and mark P/A/L/EL</div>
            </div>
          </div>
          {unmarkedCount > 0 && (
            <div className="mt-3 px-3 py-1.5 rounded-lg bg-accent-red/10 border border-accent-red/20 text-accent-red text-xs">
              ⚠️ {unmarkedCount} past session{unmarkedCount !== 1 ? 's' : ''} need marking
            </div>
          )}
        </Link>
        <Link to="/analytics" className="glass rounded-2xl p-6 hover:scale-[1.01] transition-transform group">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary-500/10 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
              📈
            </div>
            <div>
              <div className="font-semibold text-white">View Analytics</div>
              <div className="text-sm text-slate-400">Attendance rates and trends</div>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
