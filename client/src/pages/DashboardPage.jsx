import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDashboardStats, useDashboardFilterOptions } from '../hooks/useDashboard';
import { useSchedules } from '../hooks/useSchedules';
import { TodayHero } from '@/components/home/TodayHero';
import { PageHeader } from '@/components/PageHeader';
import ParticipantDashboard from './ParticipantDashboard';
import QueryError from '../components/QueryError';

// ── Color palettes ───────────────────────────────────────
const COURSE_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];
const BU_COLORS = ['#06b6d4', '#0ea5e9', '#6366f1', '#8b5cf6', '#14b8a6', '#22c55e', '#f59e0b', '#ec4899', '#f97316', '#a855f7', '#64748b', '#84cc16'];
const POSITION_COLORS = ['#f59e0b', '#f97316', '#ef4444', '#ec4899', '#8b5cf6', '#6366f1', '#06b6d4', '#10b981', '#84cc16', '#64748b'];

// ── Filter dropdown ──────────────────────────────────────
function FilterSelect({ label, value, options, onChange }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`appearance-none text-xs rounded-lg px-3 py-1.5 pr-6 border transition-all cursor-pointer outline-none bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2210%22%20height%3D%226%22%20viewBox%3D%220%200%2010%206%22%3E%3Cpath%20fill%3D%22%2394a3b8%22%20d%3D%22M0%200l5%206%205-6z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:10px_6px] bg-[right_8px_center] bg-no-repeat ${
        value
          ? 'bg-primary-500/20 border-primary-500/40 text-primary-200'
          : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'
      }`}
    >
      <option value="">{label}</option>
      {(options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
    </select>
  );
}

export default function DashboardPage() {
  const { user, isAdmin, isParticipant } = useAuth();
  const navigate = useNavigate();

  // ── Filter state ─────────────────────────────────────
  const [filters, setFilters] = useState({});
  const [orgTab, setOrgTab] = useState('bu'); // 'bu' | 'position'
  const [showAllClasses, setShowAllClasses] = useState(false);
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const setFilter = useCallback((key, value) => {
    setFilters(prev => {
      const next = { ...prev };
      if (value) next[key] = value; else delete next[key];
      return next;
    });
  }, []);

  const toggleFilter = useCallback((key, value) => {
    setFilters(prev => {
      const next = { ...prev };
      if (prev[key] === value) delete next[key]; else next[key] = value;
      return next;
    });
  }, []);

  const resetFilters = useCallback(() => setFilters({}), []);

  // ── Data fetching ────────────────────────────────────
  const { data: stats, isLoading: loadingStats, isError, error, isFetching, refetch, dataUpdatedAt } = useDashboardStats(filters, { enabled: isAdmin });
  const { data: filterOpts } = useDashboardFilterOptions({ enabled: isAdmin });

  useEffect(() => { document.title = 'TMS — Dashboard'; }, []);
  if (isParticipant) return <ParticipantDashboard />;

  if (loadingStats) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isError) {
    return <QueryError error={error} onRetry={refetch} className="py-32" />;
  }

  const o = stats?.overview || {};
  const pct = (n) => (n * 100).toFixed(1) + '%';

  // ── Level data: merge entrance + current for grouped chart ──
  const levelOrder = {};
  (stats?.entranceLevelBreakdown || []).forEach(l => { levelOrder[l.level] = (levelOrder[l.level] || 0) + l.count; });
  (stats?.currentLevelBreakdown || []).forEach(l => { levelOrder[l.level] = (levelOrder[l.level] || 0) + l.count; });
  const allLevels = Object.keys(levelOrder).sort((a, b) => levelOrder[b] - levelOrder[a]);
  const entranceMap = Object.fromEntries((stats?.entranceLevelBreakdown || []).map(l => [l.level, l.count]));
  const currentMap = Object.fromEntries((stats?.currentLevelBreakdown || []).map(l => [l.level, l.count]));
  const maxLevelCount = Math.max(...allLevels.map(l => Math.max(entranceMap[l] || 0, currentMap[l] || 0)), 1);
  const lp = stats?.levelProgression || {};

  // ── Class progress: top 10 or all ──
  const classData = stats?.classProgress || [];
  const sortedClasses = [...classData].sort((a, b) => {
    if (a.status === 'Ongoing' && b.status !== 'Ongoing') return -1;
    if (a.status !== 'Ongoing' && b.status === 'Ongoing') return 1;
    return b.progress - a.progress;
  });
  const visibleClasses = showAllClasses ? sortedClasses : sortedClasses.slice(0, 10);

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title={`Welcome back, ${user?.name?.split(' ')[0] || 'there'}`}
        description={new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
        actions={
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {dataUpdatedAt > 0 && !isFetching && (
              <span title={new Date(dataUpdatedAt).toLocaleTimeString()}>
                Updated {Math.round((Date.now() - dataUpdatedAt) / 60000) || '<1'}m ago
              </span>
            )}
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              title="Refresh dashboard data"
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10 hover:text-white transition-all disabled:opacity-50"
            >
              {isFetching
                ? <span className="w-3 h-3 border border-primary-400 border-t-transparent rounded-full animate-spin inline-block" />
                : '↻'}
              <span className="hidden sm:inline">{isFetching ? 'Loading…' : 'Refresh'}</span>
            </button>
          </div>
        }
      />

      {/* ═══ Today hero — actionable items ═══ */}
      <TodayHero />

      <div className="glass rounded-xl px-3 py-2 flex items-center gap-2 flex-wrap">
        <FilterSelect label="All BUs" value={filters.department || ''} options={filterOpts?.departments} onChange={v => setFilter('department', v)} />
        <FilterSelect label="All Positions" value={filters.position || ''} options={filterOpts?.positions} onChange={v => setFilter('position', v)} />
        <FilterSelect label="Entrance Level" value={filters.entranceLevel || ''} options={filterOpts?.entranceLevels} onChange={v => setFilter('entranceLevel', v)} />
        <FilterSelect label="Current Level" value={filters.currentLevel || ''} options={filterOpts?.currentLevels} onChange={v => setFilter('currentLevel', v)} />
        <FilterSelect label="All Statuses" value={filters.status || ''} options={filterOpts?.statuses} onChange={v => setFilter('status', v)} />
        {activeFilterCount > 0 && (
          <>
            <div className="h-4 w-px bg-white/10 mx-1" />
            {Object.entries(filters).filter(([,v]) => v).map(([k, v]) => (
              <span key={k} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-500/15 text-primary-300 text-[10px]">
                {v} <button onClick={() => setFilter(k, '')} className="hover:text-red-400">✕</button>
              </span>
            ))}
            <button onClick={resetFilters} className="text-[10px] text-red-400 hover:text-red-300 px-1.5 py-0.5 rounded hover:bg-red-500/10 ml-auto">Reset</button>
          </>
        )}
      </div>

      {/* ═══ KPI ROW — 4 cards ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Active Students', value: o.active, sub: `/ ${o.totalStudents || 0}`, color: '#10b981', icon: '🟢' },
          { label: 'Attendance Rate', value: pct(o.attendanceRate || 0), sub: `${o.presentSessions || 0} / ${o.totalSessions || 0}`, color: '#6366f1', icon: '📊' },
          { label: 'At Risk', value: o.atRisk || 0, sub: 'no activity 30d', color: o.atRisk > 0 ? '#ef4444' : '#64748b', icon: '⚠️' },
          { label: 'Inactive / Waiting', value: `${o.inactive || 0}`, sub: `${o.waiting || 0} waiting`, color: '#64748b', icon: '⏸️' },
        ].map((c, i) => (
          <div key={c.label} className="glass rounded-xl p-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-14 h-14 rounded-bl-[36px] opacity-10" style={{ background: c.color }} />
            <div className="text-sm mb-0.5">{c.icon}</div>
            <div className="text-2xl font-bold text-white">{c.value}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{c.label}</div>
            <div className="text-[10px] text-slate-500">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* ═══ ROW 2: Course + BU/Position (tabbed) ═══ */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Students by Course */}
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <span className="w-1 h-4 rounded-full bg-primary-500 inline-block" />
            Students by Course
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
                        <span style={{ color }}>●{c.active}</span>
                        <span className="text-slate-500">{c.inactive}</span>
                        {c.waiting > 0 && <span className="text-blue-400">{c.waiting}⏳</span>}
                      </div>
                    </div>
                    <div className="w-full bg-white/5 rounded-full h-3.5 overflow-hidden">
                      <div className="h-full rounded-full flex transition-all duration-500" style={{ width: barWidth + '%' }}>
                        <div className="h-full rounded-l-full" style={{ width: c.total > 0 ? (c.active / c.total) * 100 + '%' : '0%', background: color }} />
                        <div className="h-full rounded-r-full" style={{ width: c.total > 0 ? ((c.inactive + (c.waiting||0)) / c.total) * 100 + '%' : '0%', background: color, opacity: 0.2 }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-slate-500 text-sm">No course data</p>}
        </div>

        {/* Tabbed: BU | Position */}
        <div className="glass rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <span className={`w-1 h-4 rounded-full inline-block ${orgTab === 'bu' ? 'bg-cyan-500' : 'bg-amber-500'}`} />
              Students by {orgTab === 'bu' ? 'Department' : 'Position'}
            </h3>
            <div className="flex rounded-lg overflow-hidden border border-white/10">
              <button onClick={() => setOrgTab('bu')} className={`text-[10px] px-3 py-1 transition-all ${orgTab === 'bu' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'}`}>BU</button>
              <button onClick={() => setOrgTab('position')} className={`text-[10px] px-3 py-1 transition-all ${orgTab === 'position' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'}`}>Position</button>
            </div>
          </div>

          {orgTab === 'bu' ? (
            stats?.departmentBreakdown?.length > 0 ? (
              <div className="space-y-1.5">
                {stats.departmentBreakdown.map((d, i) => {
                  const maxTotal = Math.max(...stats.departmentBreakdown.map(x => x.total));
                  const barWidth = maxTotal > 0 ? (d.total / maxTotal) * 100 : 0;
                  const color = BU_COLORS[i % BU_COLORS.length];
                  const isActive = filters.department === d.department;
                  return (
                    <div key={d.department} onClick={() => toggleFilter('department', d.department)}
                      className={`cursor-pointer rounded-lg px-2 py-1 -mx-2 transition-all ${isActive ? 'bg-cyan-500/10 ring-1 ring-cyan-500/30' : 'hover:bg-white/3'}`}>
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span className={`font-medium truncate max-w-[180px] ${isActive ? 'text-cyan-300' : 'text-slate-300'}`}>{d.department}</span>
                        <span className="text-[10px] text-slate-500">{d.active}/{d.total}</span>
                      </div>
                      <div className="w-full bg-white/5 rounded-full h-2.5 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: barWidth + '%', background: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-slate-500 text-sm">No BU data</p>
          ) : (
            stats?.positionBreakdown?.length > 0 ? (
              <div className="space-y-1.5">
                {stats.positionBreakdown.map((p, i) => {
                  const maxTotal = Math.max(...stats.positionBreakdown.map(x => x.total));
                  const barWidth = maxTotal > 0 ? (p.total / maxTotal) * 100 : 0;
                  const color = POSITION_COLORS[i % POSITION_COLORS.length];
                  const isActive = filters.position === p.position;
                  return (
                    <div key={p.position} onClick={() => toggleFilter('position', p.position)}
                      className={`cursor-pointer rounded-lg px-2 py-1 -mx-2 transition-all ${isActive ? 'bg-amber-500/10 ring-1 ring-amber-500/30' : 'hover:bg-white/3'}`}>
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span className={`font-medium truncate max-w-[180px] ${isActive ? 'text-amber-300' : 'text-slate-300'}`}>{p.position}</span>
                        <span className="text-[10px] text-slate-500">{p.active}/{p.total}</span>
                      </div>
                      <div className="w-full bg-white/5 rounded-full h-2.5 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: barWidth + '%', background: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-slate-500 text-sm">No position data</p>
          )}
        </div>
      </div>

      {/* ═══ ROW 3: Level Progression (grouped chart) ═══ */}
      {allLevels.length > 0 && (
        <div className="glass rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-violet-500 inline-block" />
              Level Distribution
            </h3>
            {lp.total > 0 && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-4 text-[10px]">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-violet-500/70 inline-block" /> Entrance</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-teal-500/70 inline-block" /> Current</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-medium">
                  {Math.round((lp.progressed / lp.total) * 100)}% progressed
                </span>
              </div>
            )}
          </div>
          <div className="space-y-2">
            {allLevels.map(level => {
              const eCount = entranceMap[level] || 0;
              const cCount = currentMap[level] || 0;
              const eWidth = (eCount / maxLevelCount) * 100;
              const cWidth = (cCount / maxLevelCount) * 100;
              return (
                <div key={level} className="flex items-center gap-2">
                  <div className="w-28 text-[11px] text-slate-400 text-right truncate shrink-0" title={level}>{level}</div>
                  <div className="flex-1 flex flex-col gap-0.5">
                    <div className="w-full bg-white/3 rounded-full h-2.5 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: eWidth + '%', background: 'rgba(139,92,246,0.6)' }} />
                    </div>
                    <div className="w-full bg-white/3 rounded-full h-2.5 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: cWidth + '%', background: 'rgba(20,184,166,0.6)' }} />
                    </div>
                  </div>
                  <div className="w-14 text-[10px] text-right shrink-0">
                    <div className="text-violet-400">{eCount || '–'}</div>
                    <div className="text-teal-400">{cCount || '–'}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ ROW 4: Class Progress (compact, expandable) ═══ */}
      <div className="glass rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <span className="w-1 h-4 rounded-full bg-emerald-500 inline-block" />
            Class Progress
          </h3>
          <span className="text-[10px] text-slate-500">{classData.length} classes</span>
        </div>
        {visibleClasses.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 uppercase tracking-wider text-[10px] border-b border-white/5">
                    {['Class', 'Course', 'Done', 'Total', 'Progress', 'Status'].map(h => (
                      <th key={h} className="px-2 py-1.5 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {visibleClasses.map((c, i) => {
                    const progressPct = Math.min(c.progress * 100, 100);
                    const done = c.doneSessions >= c.totalSessions && c.totalSessions > 0;
                    const barColor = done ? '#10b981' : progressPct > 50 ? '#6366f1' : c.doneSessions === 0 ? '#64748b' : '#f59e0b';
                    return (
                      <tr
                        key={i}
                        onClick={() => c._id && navigate(`/classes/${c._id}`)}
                        className={`transition-colors ${c._id ? 'cursor-pointer hover:bg-white/[0.04]' : 'hover:bg-white/3'}`}
                        title={c._id ? 'Click to open class detail' : undefined}
                      >
                        <td className="px-2 py-2 font-mono text-primary-300 font-medium">{c.classCode}</td>
                        <td className="px-2 py-2 text-white">{c.courseName}</td>
                        <td className="px-2 py-2 text-white font-medium">{c.doneSessions}</td>
                        <td className="px-2 py-2 text-slate-400">{c.totalSessions}</td>
                        <td className="px-2 py-2 w-36">
                          <div className="flex items-center gap-1.5">
                            <div className="flex-1 bg-white/5 rounded-full h-1.5 overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-500" style={{ width: progressPct + '%', background: barColor }} />
                            </div>
                            <span className="text-[10px] w-7 text-right" style={{ color: barColor }}>{progressPct.toFixed(0)}%</span>
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${done ? 'bg-emerald-500/15 text-emerald-400' : c.doneSessions === 0 ? 'bg-slate-500/15 text-slate-400' : 'bg-primary-500/15 text-primary-300'}`}>
                            {done ? '✅' : c.doneSessions === 0 ? '⏳' : '🔄'} {c.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {classData.length > 10 && (
              <button onClick={() => setShowAllClasses(!showAllClasses)}
                className="mt-2 w-full text-center text-[11px] text-primary-400 hover:text-primary-300 py-1.5 rounded-lg hover:bg-white/3 transition-all">
                {showAllClasses ? `Show less ↑` : `Show all ${classData.length} classes ↓`}
              </button>
            )}
          </>
        ) : <p className="text-slate-500 text-sm">No class data</p>}
      </div>
    </div>
  );
}
