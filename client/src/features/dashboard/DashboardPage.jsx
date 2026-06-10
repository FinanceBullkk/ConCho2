import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, BarChart3, AlertTriangle, PauseCircle, RefreshCw, BookOpen, Building2, UserCog } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useDashboardStats, useDashboardFilterOptions } from '../../hooks/useDashboard';
import { AlertBand } from '@/components/home/AlertBand';
import { TodayHero } from '@/components/home/TodayHero';
import { PageHeader } from '@/components/PageHeader';
import { KPICard } from '@/components/KPICard';
import { FilterBar } from '@/components/FilterBar';
import { EmptyState } from '@/components/EmptyState';
import { Spinner } from '@/components/Spinner';
import { Button } from '@/components/ui/button';
import ParticipantDashboard from './ParticipantDashboard';
import QueryError from '../../components/QueryError';
import { activeRatioBarWidth } from '../../lib/dashboard-bar-width';

// Indexed chart-1…5 (guaranteed tokens in Phase 0 §04 palette).
// Use (i % 5) + 1 inline — no static array needed.
const chartVar = (i) => `var(--color-chart-${(i % 5) + 1})`;

export default function DashboardPage() {
  const { t } = useTranslation();
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

  useEffect(() => { document.title = t('dashboard.docTitle'); }, [t]);
  if (isParticipant) return <ParticipantDashboard />;

  // UX-01: Only show the full-page spinner on the FIRST load (no data yet).
  // On subsequent filter changes, `placeholderData: keepPreviousData` keeps the
  // previous stats in `stats`, so we keep rendering the dashboard and only
  // show a subtle dim + the refresh-button spinner. This eliminates the
  // "screen goes blank on every filter click" flash.
  if (loadingStats && !stats) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Spinner size={32} />
      </div>
    );
  }

  if (isError && !stats) {
    return <QueryError error={error} onRetry={refetch} className="py-32" />;
  }

  const o = stats?.overview || {};
  const pct = (n) => (n * 100).toFixed(1) + '%';

  const dateLocale = 'en-US';
  const minutesAgo = Math.round((Date.now() - dataUpdatedAt) / 60000);
  const updatedText = minutesAgo
    ? t('dashboard.updatedMinutesAgo', { count: minutesAgo })
    : t('dashboard.updatedLessThanMinute');

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

  const classHeaders = [
    t('dashboard.classProgress.headers.class'),
    t('dashboard.classProgress.headers.course'),
    t('dashboard.classProgress.headers.done'),
    t('dashboard.classProgress.headers.total'),
    t('dashboard.classProgress.headers.progress'),
    t('dashboard.classProgress.headers.status'),
  ];

  const laggardHeaders = [
    t('dashboard.laggard.headers.class'),
    t('dashboard.laggard.headers.course'),
    t('dashboard.laggard.headers.done'),
    t('dashboard.laggard.headers.total'),
    t('dashboard.laggard.headers.progress'),
  ];

  // UX-01: When refetching after a filter change, dim the content slightly so
  // the user sees that the dashboard is updating. The PageHeader stays at full
  // opacity so the spinner in the Refresh button remains clearly visible.
  const isRefreshingFilters = isFetching && !loadingStats;

  return (
    <div className="space-y-5" aria-busy={isFetching}>
      <PageHeader
        title={t('dashboard.greeting', { name: user?.name?.split(' ')[0] || t('dashboard.greetingFallback') })}
        description={new Date().toLocaleDateString(dateLocale, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
        actions={
          <div className="flex items-center gap-2">
            {dataUpdatedAt > 0 && !isFetching && (
              <span className="text-small text-subtle-foreground" title={new Date(dataUpdatedAt).toLocaleTimeString()}>
                {updatedText}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              title={t('dashboard.refreshTitle')}
              className="gap-1.5"
            >
              {isFetching ? <Spinner size={13} /> : <RefreshCw style={{ width: 13, height: 13 }} />}
              <span className="hidden sm:inline">{isFetching ? t('dashboard.refreshing') : t('dashboard.refresh')}</span>
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
          { key: 'department',    placeholder: t('dashboard.filters.allBU'),        options: filterOpts?.departments   || [], value: filters.department    || '', onChange: v => setFilter('department', v) },
          { key: 'position',      placeholder: t('dashboard.filters.allPositions'), options: filterOpts?.positions      || [], value: filters.position      || '', onChange: v => setFilter('position', v) },
          { key: 'entranceLevel', placeholder: t('dashboard.filters.allEntranceLevels'), options: filterOpts?.entranceLevels || [], value: filters.entranceLevel || '', onChange: v => setFilter('entranceLevel', v) },
          { key: 'currentLevel',  placeholder: t('dashboard.filters.allCurrentLevels'),  options: filterOpts?.currentLevels  || [], value: filters.currentLevel  || '', onChange: v => setFilter('currentLevel', v) },
          { key: 'status',        placeholder: t('dashboard.filters.allStatuses'),  options: filterOpts?.statuses       || [], value: filters.status        || '', onChange: v => setFilter('status', v) },
        ]}
      >
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={resetFilters} className="text-destructive hover:text-destructive hover:bg-destructive/10">
            {t('dashboard.filters.clearFilters')}
          </Button>
        )}
      </FilterBar>

      {/* UX-01: dim/disable everything BELOW the filter bar while a new filter
          query is in flight. The FilterBar itself stays fully interactive so
          the user can chain filter changes without waiting. */}
      <div className={`space-y-5 transition-opacity duration-(--dur-fast) ${isRefreshingFilters ? 'opacity-60' : 'opacity-100'}`}>

      {/* ═══ KPI ROW ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard label={t('dashboard.kpi.activeStudents')}   value={o.active}                   sub={t('dashboard.kpi.totalSuffix', { total: o.totalStudents || 0 })}                                                      icon={Users}         tone="success" />
        <KPICard label={t('dashboard.kpi.attendanceRate')}   value={pct(o.attendanceRate || 0)} sub={t('dashboard.kpi.sessionsSuffix', { present: o.presentSessions || 0, total: o.totalSessions || 0 })}                  icon={BarChart3}     tone="info" />
        <KPICard label={t('dashboard.kpi.atRisk')}           value={o.atRisk || 0}              sub={t('dashboard.kpi.atRiskSub')}                                                                                          icon={AlertTriangle} tone={o.atRisk > 0 ? 'danger' : 'neutral'} />
        <KPICard label={t('dashboard.kpi.inactive')}         value={o.inactive || 0}            sub={t('dashboard.kpi.waitingSuffix', { count: o.waiting || 0 })}                                                          icon={PauseCircle}   tone="neutral" />
      </div>

      {/* ═══ ROW 2: Course + BU/Position (tabbed) ═══ */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Students by Course */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <span className="w-1 h-4 rounded-full bg-primary inline-block" />
            {t('dashboard.courseBreakdown.title')}
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
                        {c.waiting > 0 && <span className="text-info">{t('dashboard.courseBreakdown.waiting', { count: c.waiting })}</span>}
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
          ) : <EmptyState icon={BookOpen} title={t('dashboard.courseBreakdown.empty')} variant="firstTime" className="py-8" />}
        </div>

        {/* Tabbed: BU | Position */}
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span className={`w-1 h-4 rounded-full inline-block ${orgTab === 'bu' ? 'bg-info' : 'bg-warning'}`} />
              {orgTab === 'bu' ? t('dashboard.orgBreakdown.byBU') : t('dashboard.orgBreakdown.byPosition')}
            </h3>
            <div className="flex rounded-md overflow-hidden border border-border">
              <button onClick={() => setOrgTab('bu')} className={`text-[10px] px-3 py-1 transition-colors duration-(--dur-fast) ${orgTab === 'bu' ? 'bg-accent text-foreground' : 'text-subtle-foreground hover:text-muted-foreground'}`}>BU</button>
              <button onClick={() => setOrgTab('position')} className={`text-[10px] px-3 py-1 transition-colors duration-(--dur-fast) ${orgTab === 'position' ? 'bg-accent text-foreground' : 'text-subtle-foreground hover:text-muted-foreground'}`}>{t('dashboard.orgBreakdown.positionTab')}</button>
            </div>
          </div>

          {orgTab === 'bu' ? (
            stats?.departmentBreakdown?.length > 0 ? (
              <div className="space-y-1.5">
                {stats.departmentBreakdown.map((d, i) => {
                  const barWidth = activeRatioBarWidth(d.active, d.total);
                  const color = chartVar(i);
                  const isActive = filters.department === d.department;
                  return (
                    <div key={d.department} onClick={() => toggleFilter('department', d.department)}
                      role="button" tabIndex={0} aria-pressed={isActive}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleFilter('department', d.department); } }}
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
            ) : <EmptyState icon={Building2} title={t('dashboard.orgBreakdown.emptyBU')} variant="firstTime" className="py-8" />
          ) : (
            stats?.positionBreakdown?.length > 0 ? (
              <div className="space-y-1.5">
                {stats.positionBreakdown.map((p, i) => {
                  const barWidth = activeRatioBarWidth(p.active, p.total);
                  const color = chartVar(i);
                  const isActive = filters.position === p.position;
                  return (
                    <div key={p.position} onClick={() => toggleFilter('position', p.position)}
                      role="button" tabIndex={0} aria-pressed={isActive}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleFilter('position', p.position); } }}
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
            ) : <EmptyState icon={UserCog} title={t('dashboard.orgBreakdown.emptyPosition')} variant="firstTime" className="py-8" />
          )}
        </div>
      </div>

      {/* ═══ ROW 3: Level Progression (grouped chart) ═══ */}
      {allLevels.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-chart-2 inline-block" />
              {t('dashboard.levelBreakdown.title')}
            </h3>
            {lp.total > 0 && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-chart-2/70 inline-block" /> {t('dashboard.levelBreakdown.entrance')}</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-chart-4/70 inline-block" /> {t('dashboard.levelBreakdown.current')}</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-success-tint text-success font-medium">
                  {t('dashboard.levelBreakdown.progressedPct', { pct: Math.round((lp.progressed / lp.total) * 100) })}
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
            {t('dashboard.classProgress.title')}
          </h3>
          <span className="text-[10px] text-subtle-foreground">{t('dashboard.classProgress.classCount', { count: classData.length })}</span>
        </div>
        {visibleClasses.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left border-b border-border">
                    {classHeaders.map(h => (
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
                        title={c._id ? t('dashboard.classProgress.clickToView') : undefined}
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
                {showAllClasses ? t('dashboard.classProgress.collapse') : t('dashboard.classProgress.showAll', { count: classData.length })}
              </button>
            )}
          </>
        ) : <EmptyState icon={BookOpen} title={t('dashboard.classProgress.empty')} variant="firstTime" className="py-8" />}
      </div>

      {/* ═══ ROW 5: Laggard Classes — Ongoing with < 40% completion ═══ */}
      {laggardClasses.length > 0 && (
        <div className="bg-card border border-warning/20 rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-warning inline-block" />
              {t('dashboard.laggard.title')}
              <span className="text-[10px] font-normal text-warning bg-warning/10 px-1.5 py-0.5 rounded">
                {t('dashboard.laggard.badge')}
              </span>
            </h3>
            <span className="text-[10px] text-subtle-foreground">{t('dashboard.laggard.count', { count: laggardClasses.length })}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left border-b border-border">
                  {laggardHeaders.map(h => (
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
                      title={c._id ? t('dashboard.classProgress.clickToView') : undefined}
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

      </div> {/* /UX-01 dim wrapper */}
    </div>
  );
}
