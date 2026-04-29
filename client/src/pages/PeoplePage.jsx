import { useState } from 'react';
import UsersPage from './UsersPage';
import TeamsPage from './TeamsPage';
import EnrollmentPage from './EnrollmentPage';

// ──────────────────────────────────────────────────────────
// People Page — Hub for Users, Teams & Enrollment
// ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'users', label: 'Users', icon: '👤' },
  { id: 'teams', label: 'Teams', icon: '👥' },
  { id: 'enrollment', label: 'Enrollment', icon: '📋' },
];

export default function PeoplePage() {
  const [activeTab, setActiveTab] = useState('users');

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
                ? 'bg-primary-500/20 text-primary-300 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <span className="text-base">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── Tab content ────────────────────────────────── */}
      {activeTab === 'users' && <UsersPage />}
      {activeTab === 'teams' && <TeamsPage />}
      {activeTab === 'enrollment' && <EnrollmentPage />}
    </div>
  );
}
