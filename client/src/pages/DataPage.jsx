import { useState } from 'react';
import HRExportPage from './HRExportPage';
import SyncPage from './SyncPage';
import DatabaseExplorer from './DatabaseExplorer';
import CourseManager from './CourseManager';

// ──────────────────────────────────────────────────────────
// Data Page — HR Export + Sheets Sync + Database Explorer
// ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'courses', label: 'Courses', icon: '📚' },
  { id: 'database', label: 'Database', icon: '🗄️' },
  { id: 'export', label: 'HR Export', icon: '📤' },
  { id: 'sync', label: 'Sheets Sync', icon: '📊' },
];

export default function DataPage() {
  const [activeTab, setActiveTab] = useState('courses');

  return (
    <div className="space-y-0">
      {/* ── Sub-tab bar ────────────────────────────────── */}
      <div className="flex items-center gap-1 mb-6 p-1 bg-white/[0.03] rounded-xl w-fit border border-white/5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-primary/20 text-primary shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <span className="text-base">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── Tab content ────────────────────────────────── */}
      {activeTab === 'courses' && <CourseManager />}
      {activeTab === 'database' && <DatabaseExplorer />}
      {activeTab === 'export' && <HRExportPage />}
      {activeTab === 'sync' && <SyncPage />}
    </div>
  );
}
