import { useSearchParams } from 'react-router-dom';
import { BookOpen, Library } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageHeader } from '@/components/PageHeader';
import ClassesPage from './ClassesPage';
import CourseManager from './CourseManager';

// ──────────────────────────────────────────────────────────
// ProgramsPage — Phase 2 IA-S2
// Route: /programs  (Admin only)
// Tabs: Classes · Courses
// Replaces /academy?tab=classes and /academy?tab=courses.
// ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'classes', label: 'Classes', icon: BookOpen, description: 'Class instances per course.' },
  { id: 'courses', label: 'Courses', icon: Library,  description: 'Catalog of available courses.' },
];

export default function ProgramsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') ?? 'classes';
  const current   = TABS.find((t) => t.id === activeTab) ?? TABS[0];

  const setTab = (tabId) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tabId);
    setSearchParams(next, { replace: true });
  };

  return (
    <div>
      <PageHeader title="Programs" description={current.description} />
      <Tabs value={activeTab} onValueChange={setTab} className="space-y-6">
        <TabsList>
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <TabsTrigger key={t.id} value={t.id} className="gap-2">
                <Icon className="size-4" aria-hidden="true" />
                {t.label}
              </TabsTrigger>
            );
          })}
        </TabsList>
        <TabsContent value="classes" hidden={activeTab !== 'classes'}>
          {activeTab === 'classes' && <ClassesPage />}
        </TabsContent>
        <TabsContent value="courses" hidden={activeTab !== 'courses'}>
          {activeTab === 'courses' && <CourseManager />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
