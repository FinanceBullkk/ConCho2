import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Topbar from './nav/Topbar';
import Sidebar from './nav/Sidebar';
import SidebarBrand from './nav/SidebarBrand';
import PersonaSwitch from './nav/PersonaSwitch';
import SidebarFooter from './nav/SidebarFooter';
import MobileSidebar from './nav/MobileSidebar';

// ──────────────────────────────────────────────────────────
// Layout — north-star app shell (2026-06-14):
//   • Sidebar — fixed full-height left column on md+ (brand · persona switch ·
//     role-filtered nav · signed-in footer). Window scroll is preserved; only
//     the nav list scrolls internally when it overflows.
//   • Topbar  — slim sticky breadcrumb bar over the offset main column
//     (workspace › page · search · notifications · theme · avatar).
//   • Mobile  — the sidebar collapses into a hamburger-opened drawer.
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

      {/* Fixed full-height sidebar (md+) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-card md:flex">
        <SidebarBrand />
        <PersonaSwitch />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Sidebar />
        </div>
        <SidebarFooter />
      </aside>

      {/* Main column — offset by the sidebar width on md+ */}
      <div className="md:pl-64">
        <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main id="main-content" tabIndex={-1} className="min-w-0">
          <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-7">
            <Outlet />
          </div>
        </main>
      </div>

      <MobileSidebar open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
    </div>
  );
}
