import { useSearchParams } from 'react-router-dom';
import { Download, RefreshCw, ClipboardEdit, ChartLine } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageHeader } from '@/components/PageHeader';
import { useRole } from '@/hooks/useRole';
import HRExportPage from './HRExportPage';
import SyncPage from '../features/sync/SyncPage';
import EvaluationPage from '../features/evaluations/EvaluationPage';
import AttendanceDashboardPage from './AttendanceDashboardPage';

// ──────────────────────────────────────────────────────────
// Reports — Analytics, HR Export, Sheets Sync, Evaluations.
//
// Audit PR K (FE-007): each tab declares the `perm` it requires; we
// filter the visible set per user role and silently substitute the
// first allowed tab if the URL tab=... points at one they can't see.
// HR Export + Sheets Sync are Admin-only on the server, so Teachers
// previously saw tabs that 403'd on first action.
// ──────────────────────────────────────────────────────────

const ALL_TABS = [
  { id: 'analytics',    label: 'Analytics',    icon: ChartLine,     description: 'Attendance rates by employee, team, class.',  perm: 'read:attendance' },
  { id: 'hr-export',    label: 'HR Export',    icon: Download,      description: 'Download attendance data as Excel for HR.',   perm: 'export:data' },
  { id: 'sheets-sync',  label: 'Sheets Sync',  icon: RefreshCw,     description: 'Sync team enrollments from Google Sheets.',   perm: 'sync:sheets' },
  { id: 'evaluations',  label: 'Evaluations',  icon: ClipboardEdit, description: 'Enter and review learner evaluation scores.', perm: 'read:evaluations' },
];

export default function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { can } = useRole();

  const tabs = ALL_TABS.filter((t) => can(t.perm));
  const requested = searchParams.get('tab') ?? tabs[0]?.id ?? 'analytics';
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
        <TabsList>
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <TabsTrigger key={t.id} value={t.id} className="gap-2">
                <Icon className="size-4" />
                {t.label}
              </TabsTrigger>
            );
          })}
        </TabsList>
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
        {can('sync:sheets') && (
          <TabsContent value="sheets-sync" hidden={activeTab !== 'sheets-sync'}>
            {activeTab === 'sheets-sync' && <SyncPage />}
          </TabsContent>
        )}
        {can('read:evaluations') && (
          <TabsContent value="evaluations" hidden={activeTab !== 'evaluations'}>
            {activeTab === 'evaluations' && <EvaluationPage />}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
