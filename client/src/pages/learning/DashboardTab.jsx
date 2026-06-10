import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRole } from '../../hooks/useRole';
import DashboardOperationalPanel from './DashboardOperationalPanel';
import DashboardExecutivePanel from './DashboardExecutivePanel';

// Dashboard tab shell — mirrors ReportsTab's view-toggle pattern. The
// Executive (ROI) view is Admin-only; non-Admins see no toggle at all. The
// hidden toggle is UX only — the executive endpoint is Admin-gated server-side.
export default function DashboardTab() {
  const { t } = useTranslation();
  const { isAdmin } = useRole();
  const [view, setView] = useState('operational');

  if (!isAdmin) {
    return <DashboardOperationalPanel />;
  }

  return (
    <Tabs value={view} onValueChange={setView} className="space-y-4">
      <div className="max-w-full overflow-x-auto pb-1">
        <TabsList className="w-max min-w-full justify-start">
          <TabsTrigger value="operational">{t('learning.dashboard.views.operational')}</TabsTrigger>
          <TabsTrigger value="executive">{t('learning.dashboard.views.executive')}</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="operational" hidden={view !== 'operational'}>
        {view === 'operational' && <DashboardOperationalPanel />}
      </TabsContent>
      <TabsContent value="executive" hidden={view !== 'executive'}>
        {view === 'executive' && <DashboardExecutivePanel />}
      </TabsContent>
    </Tabs>
  );
}
