import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { schedulesAPI, classesAPI, usersAPI, teamsAPI } from '../api/api';
import ParticipantDashboard from './ParticipantDashboard';

export default function DashboardPage() {
  const { user, isAdmin, isTeacher, isParticipant } = useAuth();

  // Participant gets their own dedicated dashboard
  if (isParticipant) return <ParticipantDashboard />;
  const [stats, setStats] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const schedRes = await schedulesAPI.getAll();
        setSchedules(schedRes.data.data.slice(0, 5));

        if (isAdmin) {
          const [usersRes, teamsRes, classesRes] = await Promise.all([
            usersAPI.getAll(),
            teamsAPI.getAll(),
            classesAPI.getAll(),
          ]);
          setStats({
            users: usersRes.data.count,
            teams: teamsRes.data.count,
            classes: classesRes.data.count,
            schedules: schedRes.data.count,
          });
        } else {
          setStats({ schedules: schedRes.data.count });
        }
      } catch (err) {
        console.error('Dashboard fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [isAdmin]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const roleGreeting = {
    Admin: '🛡️ Admin Control Center',
    Teacher: '📖 Teacher Dashboard',
    Participant: '🎓 My Learning Dashboard',
  };

  const statCards = isAdmin
    ? [
        { label: 'Users', value: stats?.users, icon: '👤', color: 'from-primary-500 to-blue-400' },
        { label: 'Teams', value: stats?.teams, icon: '👥', color: 'from-accent-purple to-pink-400' },
        { label: 'Classes', value: stats?.classes, icon: '📚', color: 'from-accent-green to-teal-400' },
        { label: 'Schedules', value: stats?.schedules, icon: '📅', color: 'from-accent-amber to-orange-400' },
      ]
    : [{ label: 'Upcoming Sessions', value: stats?.schedules, icon: '📅', color: 'from-primary-500 to-blue-400' }];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">{roleGreeting[user.role]}</h1>
        <p className="text-slate-400 mt-1">Welcome back, {user.name}</p>
      </div>

      {/* Stat Cards */}
      <div className={`grid gap-4 ${isAdmin ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2'}`}>
        {statCards.map((card, i) => (
          <div key={card.label} className="glass rounded-2xl p-5 hover:scale-[1.02] transition-transform" style={{ animationDelay: `${i * 0.05}s` }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{card.icon}</span>
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.color} opacity-20`} />
            </div>
            <div className="text-3xl font-bold text-white">{card.value ?? '—'}</div>
            <div className="text-sm text-slate-400 mt-1">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Upcoming Schedules */}
      <div className="glass rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">📅 Upcoming Schedules</h2>
        {schedules.length === 0 ? (
          <p className="text-slate-400 text-sm">No upcoming schedules</p>
        ) : (
          <div className="space-y-3 stagger">
            {schedules.map((s) => {
              const start = new Date(s.startTime);
              const end = new Date(s.endTime);
              const timeStr = `${String(start.getHours()).padStart(2,'0')}:${String(start.getMinutes()).padStart(2,'0')}-${String(end.getHours()).padStart(2,'0')}:${String(end.getMinutes()).padStart(2,'0')}`;
              return (
              <div key={s._id} className="glass-light rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary-500/10 flex flex-col items-center justify-center text-primary-300">
                    <span className="text-xs font-bold">{start.toLocaleDateString('en', { month: 'short' })}</span>
                    <span className="text-lg font-bold leading-none">{start.getDate()}</span>
                  </div>
                  <div>
                    <div className="font-medium text-white">{s.classId?.courseName || s.classId?.classCode}</div>
                    <div className="text-sm text-slate-400">{timeStr} • {s.teacherId?.name || 'No teacher'}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-white">{s.enrolledCount}/{s.capacity}</div>
                  <div className="text-xs text-slate-500">enrolled</div>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
