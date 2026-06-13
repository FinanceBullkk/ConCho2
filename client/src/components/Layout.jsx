import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Topbar from './nav/Topbar';
import Sidebar from './nav/Sidebar';
import MobileSidebar from './nav/MobileSidebar';

// ──────────────────────────────────────────────────────────
// Layout — app shell (IA rework 2026-06-13: top bar → left sidebar).
//   • Topbar  — sticky slim bar (logo · search · notifications · theme · avatar)
//   • Sidebar — sticky left column on md+ (role-filtered primary nav)
//   • Mobile  — sidebar collapses into a hamburger-opened drawer
// ──────────────────────────────────────────────────────────
export default function Layout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();

  // Close the mobile drawer on navigation.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => setMobileNavOpen(false), [location.pathname]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <div className="min-h-screen">
      {/* Skip to main content — keyboard / screen-reader nav */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-primary focus:text-white focus:font-semibold focus:shadow-lg focus:outline-none"
      >
        Skip to main content
      </a>

      <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} />

      <div className="mx-auto max-w-[1440px] md:grid md:grid-cols-[256px_minmax(0,1fr)]">
        <aside className="hidden md:block border-r border-border">
          <div className="sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto px-3">
            <Sidebar />
          </div>
        </aside>

        <main id="main-content" tabIndex={-1} className="min-w-0 px-4 sm:px-6 py-8">
          <Outlet />
        </main>
      </div>

      <MobileSidebar open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
    </div>
  );
}
