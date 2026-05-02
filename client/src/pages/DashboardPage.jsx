import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { dashboardAPI, schedulesAPI } from '../api/api';
import ParticipantDashboard from './ParticipantDashboard';

// ── Status color palette ─────────────────────────────────
const COURSE_COLORS = [
  '#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444',
];

export default function DashboardPage() {
  const { user, isAdmin, isParticipant } = useAuth();
  const [stats, setStats] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { document.title = 'TMS — Dashboard'; }, []);

  useEffect(() => {
    if (isParticipant) return;
    const fetchData = async () => {
      try {
        const [dashRes, schedRes] = await Promise.all([
          isAdmin ? dashboardAPI.getStats() : Promise.resolve(null),
          schedulesAPI.getAll({ from: new Date().toISOString(), limit: 5 }),
        ]);
        if (dashRes) setStats(dashRes.data.data);
        setSchedules(schedRes.data.data);
      } catch (err) {
        console.error('Dashboard fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [isAdmin, isParticipant]);

  if (isParticipant) return <ParticipantDashboard />;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const o = stats?.overview || {};
  const pct = (n) => (n * 100).toFixed(1) + '%';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">📊 Admin Dashboard</h1>
          <p className="text-slate-400 mt-1">English Class Management — Overview</p>
        </div>
        <div className="text-xs text-slate-500">
          Last updated: {new Date().toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })}
        </div>
      </div>

      {/* ═══ SECTION 1: OVERVIEW KPIs ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Active Students', value: o.active, sub: `out of ${o.totalStudents || 0} total`, color: '#10b981', icon: '🟢' },
          { label: 'Attendance Rate', value: pct(o.attendanceRate || 0), sub: `${o.presentSessions || 0} / ${o.totalSessions || 0} sessions`, color: '#6366f1', icon: '📊' },
          { label: 'At Risk', value: o.atRisk || 0, sub: 'flagged for follow-up', color: o.atRisk > 0 ? '#ef4444' : '#64748b', icon: '⚠️' },
          { label: 'Inactive', value: o.inactive || 0, sub: 'completed or stopped', color: '#64748b', icon: '⏸️' },
          { label: 'Waiting for Class', value: o.waiting || 0, sub: 'pending placement', color: '#3b82f6', icon: '⏳' },
        ].map((card, i) => (
          <div key={card.label} className="glass rounded-xl p-4 relative overflow-hidden" style={{ animationDelay: `${i * 0.05}s` }}>
            <div className="absolute top-0 right-0 w-16 h-16 rounded-bl-[40px] opacity-10" style={{ background: card.color }} />
            <div className="text-lg mb-1">{card.icon}</div>
            <div className="text-2xl font-bold text-white">{card.value}</div>
            <div className="text-xs text-slate-400 mt-0.5">{card.label}</div>
            <div className="text-[10px] text-slate-500 mt-1">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* ═══ SECTION 2 & 3: Side by side ═══ */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Section 2: Students by Course */}
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <span className="w-1 h-4 rounded-full bg-primary-500 inline-block" />
            Active Students by Course
          </h3>
          {stats?.courseBreakdown?.length > 0 ? (
            <div className="space-y-2.5">
              {stats.courseBreakdown.map((c, i) => {
                const maxTotal = Math.max(...stats.courseBreakdown.map(x => x.total));
                const barWidth = maxTotal > 0 ? (c.total / maxTotal) * 100 : 0;
                const color = COURSE_COLORS[i % COURSE_COLORS.length];
                return (
                  <div key={c.courseName}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-300 font-medium">{c.courseName}</span>
                      <div className="flex gap-2 text-[10px]">
                        <span style={{ color }}>●{c.active} active</span>
                        <span className="text-slate-500">{c.inactive} inactive</span>
                        {c.waiting > 0 && <span className="text-blue-400">{c.waiting} waiting</span>}
                      </div>
                    </div>
                    <div className="w-full bg-white/5 rounded-full h-4 overflow-hidden">
                      <div className="h-full rounded-full flex transition-all duration-700" style={{ width: barWidth + '%' }}>
                        <div className="h-full rounded-l-full" style={{ width: c.total > 0 ? (c.active / c.total) * 100 + '%' : '0%', background: color }} />
                        <div className="h-full" style={{ width: c.total > 0 ? (c.inactive / c.total) * 100 + '%' : '0%', background: color, opacity: 0.25 }} />
                        {c.waiting > 0 && (
                          <div className="h-full rounded-r-full" style={{ width: (c.waiting / c.total) * 100 + '%', background: '#3b82f6', opacity: 0.4 }} />
                        )}
                      </div>
                    </div>
                    <div className="text-right text-[10px] text-slate-500 mt-0.5">{c.total} total</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-slate-500 text-sm">No course data yet — assign teams to classes first</p>
          )}
        </div>

        {/* Section 3: Why Students Go Inactive */}
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <span className="w-1 h-4 rounded-full bg-red-500 inline-block" />
            Why Students Go Inactive
          </h3>
          {stats?.dropReasons?.length > 0 ? (
            <div className="space-y-1.5">
              {stats.dropReasons.map((d, i) => {
                const maxCount = stats.dropReasons[0]?.count || 1;
                const totalDrop = stats.dropReasons.reduce((s, x) => s + x.count, 0);
                const barWidth = (d.count / maxCount) * 100;
                return (
                  <div key={d.reason || i} className="flex items-center gap-2">
                    <div className="w-32 text-xs text-slate-400 truncate text-right" title={d.reason}>{d.reason}</div>
                    <div className="flex-1 bg-white/5 rounded-full h-5 overflow-hidden relative">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: barWidth + '%',
                          background: `linear-gradient(90deg, rgba(239,68,68,0.6) 0%, rgba(239,68,68,0.2) 100%)`,
                        }} />
                      <span className="absolute inset-0 flex items-center pl-2 text-[10px] text-white/70 font-medium">
                        {d.count}
                      </span>
                    </div>
                    <div className="w-10 text-right text-[10px] text-slate-500">{pct(d.count / totalDrop)}</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-slate-500 text-sm">No drop data recorded yet</p>
          )}

          {/* Classifications */}
          {stats?.dropClassifications?.length > 0 && (
            <div className="mt-4 pt-3 border-t border-white/5">
              <div className="text-xs text-slate-400 mb-2 font-medium">Inactive Classification</div>
              <div className="flex flex-wrap gap-1.5">
                {stats.dropClassifications.map((d, i) => (
                  <span key={i} className="px-2 py-1 rounded-lg bg-white/5 text-[11px] text-slate-300">
                    {d.classification} <span className="text-slate-500 ml-1">{d.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ SECTION 4: CLASS PROGRESS ═══ */}
      <div className="glass rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <span className="w-1 h-4 rounded-full bg-accent-green inline-block" />
          Class Progress
        </h3>
        {stats?.classProgress?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 uppercase tracking-wider border-b border-white/5">
                  {['Class', 'Course', 'PIC', 'Done', 'Expected', 'Progress', 'Status'].map(h => (
                    <th key={h} className="px-3 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {stats.classProgress.map((c, i) => {
                  const progressPct = Math.min(c.progress * 100, 100);

                  // Status based purely on actual progress
                  let statusLabel, statusClass, barColor;
                  if (c.doneSessions >= c.totalSessions && c.totalSessions > 0) {
                    statusLabel = '✅ Completed';
                    statusClass = 'bg-emerald-500/15 text-emerald-400';
                    barColor = '#10b981';
                  } else if (c.doneSessions === 0) {
                    statusLabel = '⏳ Not started';
                    statusClass = 'bg-slate-500/15 text-slate-400';
                    barColor = '#64748b';
                  } else if (progressPct > 50) {
                    statusLabel = '🔄 In progress';
                    statusClass = 'bg-primary-500/15 text-primary-300';
                    barColor = '#6366f1';
                  } else {
                    statusLabel = '🔄 In progress';
                    statusClass = 'bg-amber-500/15 text-amber-400';
                    barColor = '#f59e0b';
                  }

                  return (
                    <tr key={i} className="hover:bg-white/3 transition-colors">
                      <td className="px-3 py-2.5 font-mono text-primary-300 font-medium">{c.classCode}</td>
                      <td className="px-3 py-2.5 text-white">{c.courseName}</td>
                      <td className="px-3 py-2.5 text-slate-400">{c.teacher || '—'}</td>
                      <td className="px-3 py-2.5 text-white font-medium">{c.doneSessions}</td>
                      <td className="px-3 py-2.5 text-slate-400">{c.totalSessions}</td>
                      <td className="px-3 py-2.5 w-48">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-white/5 rounded-full h-2 overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: progressPct + '%', background: barColor }} />
                          </div>
                          <span className="text-[10px] w-8 text-right" style={{ color: barColor }}>{progressPct.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${statusClass}`}>
                          {statusLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-slate-500 text-sm">No class data yet</p>
        )}
      </div>

      {/* ═══ UPCOMING SCHEDULES ═══ */}
      <div className="glass rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <span className="w-1 h-4 rounded-full bg-accent-amber inline-block" />
          Upcoming Schedules
        </h3>
        {schedules.length === 0 ? (
          <p className="text-slate-500 text-sm">No upcoming schedules</p>
        ) : (
          <div className="space-y-2 stagger">
            {schedules.map((s) => {
              const start = new Date(s.startTime);
              const end = new Date(s.endTime);
              const timeStr = `${String(start.getHours()).padStart(2,'0')}:${String(start.getMinutes()).padStart(2,'0')}-${String(end.getHours()).padStart(2,'0')}:${String(end.getMinutes()).padStart(2,'0')}`;
              const today = new Date(); today.setHours(0,0,0,0);
              const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
              const schedDate = new Date(start); schedDate.setHours(0,0,0,0);
              const isToday = schedDate.getTime() === today.getTime();
              const isTomorrow = schedDate.getTime() === tomorrow.getTime();
              return (
                <Link key={s._id} to="/schedules" className={`block rounded-xl p-3 flex items-center justify-between hover:scale-[1.01] transition-all border ${
                  isToday ? 'border-accent-green/30 bg-accent-green/5' : isTomorrow ? 'border-accent-amber/20 bg-accent-amber/5' : 'border-white/5 hover:border-primary-500/20'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center ${
                      isToday ? 'bg-accent-green/15 text-accent-green' : 'bg-primary-500/10 text-primary-300'
                    }`}>
                      <span className="text-[9px] font-bold">{isToday ? 'Today' : isTomorrow ? 'Tmrw' : start.toLocaleDateString('en', { month: 'short' })}</span>
                      <span className="text-sm font-bold leading-none">{start.getDate()}</span>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">{s.classId?.courseName || s.classId?.classCode}</div>
                      <div className="text-xs text-slate-400">{timeStr}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-medium text-white">{s.enrolledCount}/{s.capacity}</div>
                    <div className="text-[10px] text-slate-500">enrolled</div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
