import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Users, Building2, MapPin, DoorOpen } from 'lucide-react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { PageHeader } from '@/components/PageHeader';
import { useRole } from '../hooks/useRole';
import UsersPage from '../features/users/UsersPage';
import DepartmentsPage from '../features/org/DepartmentsPage';
import OfficesPage from '../features/org/OfficesPage';
import RoomsPage from '../features/rooms/RoomsPage';

// ──────────────────────────────────────────────────────────
// PeoplePage — Phase 2 IA-S2
// Route: /people  (Admin + Coordinator — see App.jsx)
// Tabs: Users · Departments · Offices · Rooms, each gated by a
// permission so a Coordinator only sees the org tabs they can use.
// Teams moved to the English-class section (/english?tab=teams) —
// English-class separation 2026-06-12.
// ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'users', icon: Users, component: UsersPage, perm: 'read:users' },
  { id: 'departments', icon: Building2, component: DepartmentsPage, perm: 'read:department' },
  { id: 'offices', icon: MapPin, component: OfficesPage, perm: 'read:office' },
  { id: 'rooms', icon: DoorOpen, component: RoomsPage, perm: 'read:room' },
];

export default function PeoplePage() {
  const { t } = useTranslation();
  const { can } = useRole();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabs = TABS.filter((tab) => !tab.perm || can(tab.perm));
  const requested = searchParams.get('tab') ?? 'users';
  // Fall back to the first visible tab when the URL points at a hidden one.
  const current = tabs.find((tab) => tab.id === requested) ?? tabs[0];
  const activeTab = current?.id;

  const setTab = (tabId) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tabId);
    setSearchParams(next, { replace: true });
  };

  if (!current) return null; // no visible tabs for this role

  return (
    <div>
      <PageHeader title={t('people.title')} description={t(`people.tabs.${current.id}Desc`)} />
      {/* IA Phase 03: tab strip removed — the sidebar's People group drives ?tab=. */}
      <Tabs value={activeTab} onValueChange={setTab} className="space-y-6">
        {tabs.map((tab) => {
          const Body = tab.component;
          return (
            <TabsContent key={tab.id} value={tab.id} hidden={activeTab !== tab.id}>
              {activeTab === tab.id && <Body />}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
