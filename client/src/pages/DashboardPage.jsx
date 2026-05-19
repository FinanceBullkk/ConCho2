import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, BarChart3, AlertTriangle, PauseCircle, RefreshCw, BookOpen, Building2, UserCog } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDashboardStats, useDashboardFilterOptions } from '../hooks/useDashboard';
import { AlertBand } from '@/components/home/AlertBand';
import { TodayHero } from '@/components/home/TodayHero';
import { PageHeader } from '@/components/PageHeader';
import { KPICard } from '@/components/KPICard';
import { FilterBar } from '@/components/FilterBar';
import { EmptyState } from '@/components/EmptyState';
import { Spinner } from '@/components/Spinner';
import { Button } from '@/components/ui/button';
import ParticipantDashboard from './ParticipantDashboard';
import QueryError from '../components/QueryError';

// Indexed chart-1…5 (guaranteed tokens in Phase 0 §04 palette).
// Use (i % 5) + 1 inline — no static array needed.
const chartVar = (i) => `var(--color-chart-${(i % 5) + 1})`;

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
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Spinner size={32} />
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

  // ── Class progress: sort + split visible / laggard ──
  const classData = stats?.classProgress || [];
  const sortedClasses = [...classData].sort((a, b) => {
    if (a.status === 'Ongoing' && b.status !== 'Ongoing') return -1;
    if (a.status !== 'Ongoing' && b.status === 'Ongoing') return 1;
    return b.progress - a.progress;
  });
  const visibleClasses = showAllClasses ? sortedClasses : sortedClasses.slice(0, 10);

  // Laggard: Ongoing classes with < 40% completion and at least 1 total session
  const laggardClasses = classData.filter(
    c => c.status === 'Ongoing' && c.totalSessions > 0 && c.progress < 0.4,
  ).sort((a, b) => a.progress - b.progress);

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Welcome back, ${user?.name?.split(' ')[0] || 'there'}`}
        description={new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
        actions={
          <div className="flex items-center gap-2">
            {dataUpdatedAt > 0 && !isFetching && (
              <span className="text-small text-subtle-foreground" title={new Date(dataUpdatedAt).toLocaleTimeString()}>
                Updated {Math.round((Date.now() - dataUpdatedAt) / 60000) || '<1'}m ago
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              title="Refresh dashboard data"
              className="gap-1.5"
            >
              {isFetching ? <Spinner size={13} /> : <RefreshCw style={{ width: 13, height: 13 }} />}
              <span className="hidden sm:inline">{isFetching ? 'Loading…' : 'Refresh'}</span>
            </Button>
          </div>
        }
      />

      {/* ═══ Alert band — actionable items (toMark, no leader…) ═══ */}
      <AlertBand />

      {/* ═══ Today hero — compact session-status band ═══ */}
      <TodayHero />

      <FilterBar
        filters={[
          { key: 'department',    placeholder: 'All BUs',          options: filterOpts?.departments   || [], value: filters.department    || '', onChange: v => setFilter('department', v) },
          { key: 'position',      placeholder: 'All Positions',    options: filterOpts?.positions      || [], value: filters.position      || '', onChange: v => setFilter('position', v) },
          { key: 'entranceLevel', placeholder: 'Entrance Level',   options: filterOpts?.entranceLevels || [], value: filters.entranceLevel || '', onChange: v => setFilter('entranceLevel', v) },
          { key: 'currentLevel',  placeholder: 'Current Level',    options: filterOpts?.currentLevels  || [], value: filters.currentLevel  || '', onChange: v => setFilter('currentLevel', v) },
          { key: 'status',        placeholder: 'All Statuses',     options: filterOpts?.statuses       || [], value: filters.status        || '', onChange: v => setFilter('status', v) },
        ]}
      >
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={resetFilters} className="text-destructive hover:text-destructive hover:bg-destructive/10">
            Reset filters
          </Button>
        )}
      </FilterBar>

      {/* ═══ KPI ROW ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard label="Active Students"    value={o.active}                   sub={`/ ${o.totalStudents || 0} total`}                           icon={Users}         tone="success" />
        <KPICard label="Attendance Rate"    value={pct(o.attendanceRate || 0)} sub={`${o.presentSessions || 0} / ${o.totalSessions || 0} sessions`} icon={BarChart3}     tone="info" />
        <KPICard label="At Risk"            value={o.atRisk || 0}              sub="no activity 30 days"                                          icon={AlertTriangle}  tone={o.atRisk > 0 ? 'danger' : 'neutral'} />
        <KPICard label="Inactive / Waiting" value={o.inactive || 0}            sub={`${o.waiting || 0} waiting`}                                  icon={PauseCircle}   tone="neutral" />
      </div>

      {/* ═══ ROW 2: Course + BU/Position (tabbed) ═══ */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Students by Course */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <span className="w-1 h-4 rounded-full bg-primary inline-block" />
            Students by Course
          </h3>
          {stats?.courseBreakdown?.length > 0 ? (
            <div className="space-y-2.5">
              {stats.courseBreakdown.map((c, i) => {
                const maxTotal = Math.max(...stats.courseBreakdown.map(x => x.total));
                const barWidth = maxTotal > 0 ? (c.total / maxTotal) * 100 : 0;
                const color = chartVar(i);
                return (
                  <div key={c.courseName}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-foreground font-medium">{c.courseName}</span>
                      <div className="flex gap-2 text-[10px]">
                        <span style={{ color }}>●{c.active}</span>
                        <span className="text-subtle-foreground">{c.inactive}</span>
                        {c.waiting > 0 && <span className="text-info">{c.waiting} wait</span>}
                      </div>
                    </div>
                    <div className="w-full bg-muted rounded-full h-3.5 overflow-hidden">
                      <div className="h-full rounded-full flex" style={{ width: barWidth + '%' }}>
                        <div className="h-full rounded-l-full" style={{ width: c.total > 0 ? (c.active / c.total) * 100 + '%' : '0%', background: color }} />
                        <div className="h-full rounded-r-full" style={{ width: c.total > 0 ? ((c.inactive + (c.waiting || 0)) / c.total) * 100 + '%' : '0%', background: color, opacity: 0.2 }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <EmptyState icon={BookOpen} title="No course data" variant="firstTime" className="py-8" />}
        </div>

        {/* Tabbed: BU | Position */}
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span className={`w-1 h-4 rounded-full inline-block ${orgTab === 'bu' ? 'bg-info' : 'bg-warning'}`} />
              Students by {orgTab === 'bu' ? 'Department' : 'Position'}
            </h3>
            <div className="flex rounded-md overflow-hidden border border-border">
              <button onClick={() => setOrgTab('bu')} className={`text-[10px] px-3 py-1 transition-colors duration-(--dur-fast) ${orgTab === 'bu' ? 'bg-accent text-foreground' : 'text-subtle-foreground hover:text-muted-foreground'}`}>BU</button>
              <button onClick={() => setOrgTab('position')} className={`text-[10px] px-3 py-1 transition-colors duration-(--dur-fast) ${orgTab === 'position' ? 'bg-accent text-foreground' : 'text-subtle-foreground hover:text-muted-foreground'}`}>Position</button>
            </div>
          </div>

          {orgTab === 'bu' ? (
            stats?.departmentBreakdown?.length > 0 ? (
              <div className="space-y-1.5">
                {stats.departmentBreakdown.map((d, i) => {
                  const maxTotal = Math.max(...stats.departmentBreakdown.map(x => x.total));
                  const barWidth = maxTotal > 0 ? (d.total / maxTotal) * 100 : 0;
                  const color = chartVar(i);
                  const isActive = filters.department === d.department;
                  return (
                    <div key={d.department} onClick={() => toggleFilter('department', d.department)}
                      className={`cursor-pointer rounded-lg px-2 py-1 -mx-2 transition-colors duration-(--dur-fast) ${isActive ? 'bg-info/10 ring-1 ring-info/30' : 'hover:bg-accent/50'}`}>
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span className={`font-medium truncate max-w-[180px] ${isActive ? 'text-info' : 'text-foreground'}`}>{d.department}</span>
                        <span className="text-[10px] text-subtle-foreground">{d.active}/{d.total}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: barWidth + '%', background: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : <EmptyState icon={Building2} title="No department data" variant="firstTime" className="py-8" />
          ) : (
            stats?.positionBreakdown?.length > 0 ? (
              <div className="space-y-1.5">
                {stats.positionBreakdown.map((p, i) => {
                  const maxTotal = Math.max(...stats.positionBreakdown.map(x => x.total));
                  const barWidth = maxTotal > 0 ? (p.total / maxTotal) * 100 : 0;
                  const color = chartVar(i);
                  const isActive = filters.position === p.position;
                  return (
                    <div key={p.position} onClick={() => toggleFilter('position', p.position)}
                      className={`cursor-pointer rounded-lg px-2 py-1 -mx-2 transition-colors duration-(--dur-fast) ${isActive ? 'bg-warning/10 ring-1 ring-warning/30' : 'hover:bg-accent/50'}`}>
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span className={`font-medium truncate max-w-[180px] ${isActive ? 'text-warning' : 'text-foreground'}`}>{p.position}</span>
                        <span className="text-[10px] text-subtle-foreground">{p.active}/{p.total}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: barWidth + '%', background: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : <EmptyState icon={UserCog} title="No position data" variant="firstTime" className="py-8" />
          )}
        </div>
      </div>

      {/* ═══ ROW 3: Level Progression (grouped chart) ═══ */}
      {allLevels.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-chart-2 inline-block" />
              Level Distribution
            </h3>
            {lp.total > 0 && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-chart-2/70 inline-block" /> Entrance</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-chart-4/70 inline-block" /> Current</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-success-tint text-success font-medium">
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
                  <div className="w-28 text-[11px] text-muted-foreground text-right truncate shrink-0" title={level}>{level}</div>
                  <div className="flex-1 flex flex-col gap-0.5">
                    <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: eWidth + '%', background: 'var(--color-chart-2)', opacity: 0.7 }} />
                    </div>
                    <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: cWidth + '%', background: 'var(--color-chart-4)', opacity: 0.7 }} />
                    </div>
                  </div>
                  <div className="w-14 text-[10px] text-right shrink-0 tabular-nums">
                    <div className="text-chart-2">{eCount || '–'}</div>
                    <div className="text-chart-4">{cCount || '–'}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ ROW 4: Class Progress (compact, expandable) ═══ */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className="w-1 h-4 rounded-full bg-success inline-block" />
            Class Progress
          </h3>
          <span className="text-[10px] text-subtle-foreground">{classData.length} classes</span>
        </div>
        {visibleClasses.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left border-b border-border">
                    {['Class', 'Course', 'Done', 'Total', 'Progress', 'Status'].map(h => (
                      <th key={h} className="px-2 py-1.5 text-overline text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visibleClasses.map((c, i) => {
                    const progressPct = Math.min(c.progress * 100, 100);
                    const done = c.doneSessions >= c.totalSessions && c.totalSessions > 0;
                    const barColor = done
                      ? 'var(--color-success)'
                      : progressPct > 50
                      ? 'var(--color-chart-1)'
                      : c.doneSessions === 0
                      ? 'var(--color-subtle-foreground)'
                      : 'var(--color-warning)';
                    return (
                      <tr
                        key={i}
                        onClick={() => c._id && navigate(`/classes/${c._id}`)}
                        className={`transition-colors duration-(--dur-fast) ${c._id ? 'cursor-pointer hover:bg-accent/50' : ''}`}
                        title={c._id ? 'Click to open class detail' : undefined}
                      >
                        <td className="px-2 py-2 text-mono text-primary">{c.classCode}</td>
                        <td className="px-2 py-2 text-foreground text-xs">{c.courseName}</td>
                        <td className="px-2 py-2 text-foreground text-xs font-medium tabular-nums">{c.doneSessions}</td>
                        <td className="px-2 py-2 text-muted-foreground text-xs tabular-nums">{c.totalSessions}</td>
                        <td className="px-2 py-2 w-36">
                          <div className="flex items-center gap-1.5">
                            <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: progressPct + '%', background: barColor }} />
                            </div>
                            <span className="text-[10px] w-7 text-right tabular-nums" style={{ color: barColor }}>{progressPct.toFixed(0)}%</span>
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${done ? 'bg-success-tint text-success' : c.doneSessions === 0 ? 'bg-muted text-muted-foreground' : 'bg-primary-tint text-primary'}`}>
                            {c.status}
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
                className="mt-2 w-full text-center text-small text-primary hover:text-primary py-1.5 rounded-md hover:bg-accent/50 transition-colors duration-(--dur-fast)">
                {showAllClasses ? 'Show less ↑' : `Show all ${classData.length} classes ↓`}
              </button>
            )}
          </>
        ) : <EmptyState icon={BookOpen} title="No class data" variant="firstTime" className="py-8" />}
      </div>

      {/* ═══ ROW 5: Laggard Classes — Ongoing with < 40% completion ═══ */}
      {laggardClasses.length > 0 && (
        <div className="bg-card border border-warning/20 rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-warning inline-block" />
              Needs Attention
              <span className="text-[10px] font-normal text-warning bg-warning/10 px-1.5 py-0.5 rounded">
                &lt;40% sessions done
              </span>
            </h3>
            <span className="text-[10px] text-subtle-foreground">{laggardClasses.length} ongoing class{laggardClasses.length !== 1 ? 'es' : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left border-b border-border">
                  {['Class', 'Course', 'Done', 'Total', 'Progress'].map(h => (
                    <th key={h} className="px-2 py-1.5 text-overline text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {laggardClasses.map((c, i) => {
                  const progressPct = Math.min(c.progress * 100, 100);
                  return (
                    <tr
                      key={i}
                      onClick={() => c._id && navigate(`/classes/${c._id}`)}
                      className={`transition-colors duration-(--dur-fast) ${c._id ? 'cursor-pointer hover:bg-accent/50' : ''}`}
                      title={c._id ? 'Click to open class detail' : undefined}
                    >
                      <td className="px-2 py-2 text-mono text-primary">{c.classCode}</td>
                      <td className="px-2 py-2 text-foreground">{c.courseName}</td>
                      <td className="px-2 py-2 text-foreground font-medium tabular-nums">{c.doneSessions}</td>
                      <td className="px-2 py-2 text-muted-foreground tabular-nums">{c.totalSessions}</td>
                      <td className="px-2 py-2 w-36">
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                            <div className="h-full rounded-full bg-warning" style={{ width: progressPct + '%' }} />
                          </div>
                          <span className="text-[10px] w-7 text-right tabular-nums text-warning">{progressPct.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
