import { useState } from 'react';
import AttendancePage from './AttendancePage';
import AttendanceDashboardPage from './AttendanceDashboardPage';

// ──────────────────────────────────────────────────────────
// Attendance Hub — Attendance Grid + Analytics
// ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'attendance', label: 'Attendance', icon: '✅' },
  { id: 'analytics', label: 'Analytics', icon: '📈' },
];

export default function AttendanceHubPage() {
  const [activeTab, setActiveTab] = useState('attendance');

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
      {activeTab === 'attendance' && <AttendancePage />}
      {activeTab === 'analytics' && <AttendanceDashboardPage />}
    </div>
  );
}
