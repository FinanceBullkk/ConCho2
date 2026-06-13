import { useSearchParams } from 'react-router-dom';
import { LayoutDashboard, BarChart3, ChartLine, Download } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageHeader } from '@/components/PageHeader';
import { useRole } from '@/hooks/useRole';
import AdminAnalyticsPanel from '../features/dashboard/AdminAnalyticsPanel';
import DashboardTab from '../features/learning/DashboardTab';
import ReportsTab from '../features/learning/ReportsTab';
import AttendanceDashboardPage from '../features/attendance/AttendanceDashboardPage';
import HRExportPage from '../features/admin/HRExportPage';

// ──────────────────────────────────────────────────────────
// Reports — the single home for ALL analytics & reporting (IA cleanup
// 2026-06-13). Previously reporting was scattered across Home (training
// analytics), Learning▸Dashboard, Learning▸Reports, and this page. They now
// all live here as tabs. Sheets Sync moved OUT to System▸Sync (data-ops, next
// to Reconciliation) — it was a duplicate mount of the same SyncPage.
//
// Each tab declares the `perm` it requires; we filter the visible set per role
// and substitute the first allowed tab if the URL points at one they can't see.
//   overview   (read:dashboard, Admin)  — training analytics moved from Home
//   learning   (read:reports)           — L&D operational/executive dashboard
//   completion (read:reports)           — cohort completion + compliance
//   analytics  (read:attendance)        — attendance analytics
//   hr-export  (export:data, Admin)     — Excel export for HR
// ──────────────────────────────────────────────────────────

const ALL_TABS = [
  { id: 'overview',   label: 'Overview',      icon: LayoutDashboard, description: 'Training KPIs — active learners, attendance, course and level breakdowns, class progress.', perm: 'read:dashboard' },
  { id: 'learning',   label: 'L&D Dashboard', icon: BarChart3,       description: 'Operational and executive L&D KPIs — completion, obligations, quality, ROI.',              perm: 'read:reports' },
  { id: 'completion', label: 'Completion',    icon: ChartLine,       description: 'Cohort completion and Admin compliance status for required learning.',                    perm: 'read:reports' },
  { id: 'analytics',  label: 'Attendance',    icon: ChartLine,       description: 'Attendance rates by employee, team, class.',                                              perm: 'read:attendance' },
  { id: 'hr-export',  label: 'HR Export',     icon: Download,        description: 'Download attendance data as Excel for HR.',                                               perm: 'export:data' },
];

export default function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { can } = useRole();

  const tabs = ALL_TABS.filter((t) => can(t.perm));
  const requested = searchParams.get('tab') ?? tabs[0]?.id ?? 'overview';
  const activeTab = tabs.some((t) => t.id === requested) ? requested : tabs[0]?.id;
  const current = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  const setTab = (tabId) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tabId);
    setSearchParams(next, { replace: true });
  };

  if (!current) {
    // User has access to none of the report tabs — render an empty header
    // rather than crash. ProtectedRoute should normally prevent this.
    return <PageHeader title="Reports" description="No reports available for your role." />;
  }

  return (
    <div>
      <PageHeader title="Reports" description={current.description} />
      <Tabs value={activeTab} onValueChange={setTab} className="space-y-6">
        <div className="max-w-full overflow-x-auto pb-1">
          <TabsList className="w-max min-w-full justify-start">
            {tabs.map((t) => {
              const Icon = t.icon;
              return (
                <TabsTrigger key={t.id} value={t.id} className="gap-2">
                  <Icon className="size-4" aria-hidden="true" />
                  {t.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>
        {can('read:dashboard') && (
          <TabsContent value="overview" hidden={activeTab !== 'overview'}>
            {activeTab === 'overview' && <AdminAnalyticsPanel />}
          </TabsContent>
        )}
        {can('read:reports') && (
          <TabsContent value="learning" hidden={activeTab !== 'learning'}>
            {activeTab === 'learning' && <DashboardTab />}
          </TabsContent>
        )}
        {can('read:reports') && (
          <TabsContent value="completion" hidden={activeTab !== 'completion'}>
            {activeTab === 'completion' && <ReportsTab />}
          </TabsContent>
        )}
        {can('read:attendance') && (
          <TabsContent value="analytics" hidden={activeTab !== 'analytics'}>
            {activeTab === 'analytics' && <AttendanceDashboardPage />}
          </TabsContent>
        )}
        {can('export:data') && (
          <TabsContent value="hr-export" hidden={activeTab !== 'hr-export'}>
            {activeTab === 'hr-export' && <HRExportPage />}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
