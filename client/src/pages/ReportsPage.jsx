import { useSearchParams } from 'react-router-dom';
import { Download, RefreshCw, ClipboardEdit } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageHeader } from '@/components/PageHeader';
import HRExportPage from './HRExportPage';
import SyncPage from './SyncPage';
import EvaluationPage from './EvaluationPage';

// ──────────────────────────────────────────────────────────
// Reports — section shell for HR Export, Sheets Sync, and Evaluations.
// ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'hr-export', label: 'HR Export', icon: Download, description: 'Download attendance data as Excel for HR.' },
  { id: 'sheets-sync',  label: 'Sheets Sync',  icon: RefreshCw,     description: 'Sync team enrollments from Google Sheets.' },
  { id: 'evaluations',  label: 'Evaluations',  icon: ClipboardEdit, description: 'Enter and review learner evaluation scores.' },
];

export default function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') ?? 'hr-export';
  const current = TABS.find((t) => t.id === activeTab) ?? TABS[0];

  const setTab = (tabId) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tabId);
    setSearchParams(next, { replace: true });
  };

  return (
    <div>
      <PageHeader title="Reports" description={current.description} />
      <Tabs value={activeTab} onValueChange={setTab} className="space-y-6">
        <TabsList>
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <TabsTrigger key={t.id} value={t.id} className="gap-2">
                <Icon className="size-4" />
                {t.label}
              </TabsTrigger>
            );
          })}
        </TabsList>
        <TabsContent value="hr-export" hidden={activeTab !== 'hr-export'}>
          {activeTab === 'hr-export' && <HRExportPage />}
        </TabsContent>
        <TabsContent value="sheets-sync" hidden={activeTab !== 'sheets-sync'}>
          {activeTab === 'sheets-sync' && <SyncPage />}
        </TabsContent>
        <TabsContent value="evaluations" hidden={activeTab !== 'evaluations'}>
          {activeTab === 'evaluations' && <EvaluationPage />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
