import { useSearchParams } from 'react-router-dom';
import { Settings, Database, ShieldCheck } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageHeader } from '@/components/PageHeader';
import SettingsPage from './SettingsPage';
import DatabaseExplorer from './DatabaseExplorer';
import ReconcilePage from './ReconcilePage';

// ──────────────────────────────────────────────────────────
// Admin — power-user section: settings + raw DB access + reconciliation.
// ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'settings',   label: 'Settings',       icon: Settings,    description: 'System configuration variables.' },
  { id: 'database',   label: 'Database',        icon: Database,    description: 'Browse and edit raw collection data.' },
  { id: 'reconcile',  label: 'Reconciliation',  icon: ShieldCheck, description: 'Detect data drift across Schedule, Attendance, Enrollment and Team.' },
];

export default function AdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') ?? 'settings';
  const current = TABS.find((t) => t.id === activeTab) ?? TABS[0];

  const setTab = (tabId) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tabId);
    setSearchParams(next, { replace: true });
  };

  return (
    <div>
      <PageHeader title="Admin" description={current.description} />
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
        <TabsContent value="settings" hidden={activeTab !== 'settings'}>
          {activeTab === 'settings' && <SettingsPage />}
        </TabsContent>
        <TabsContent value="database" hidden={activeTab !== 'database'}>
          {activeTab === 'database' && <DatabaseExplorer />}
        </TabsContent>
        <TabsContent value="reconcile" hidden={activeTab !== 'reconcile'}>
          {activeTab === 'reconcile' && <ReconcilePage />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
