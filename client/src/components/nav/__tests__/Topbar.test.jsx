import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Topbar from '../Topbar';

const h = vi.hoisted(() => ({
  user: { role: 'Admin', name: 'Ada Admin', empCode: '000001' },
  persona: 'admin',
  setPersona: vi.fn(),
  canSwitch: true,
}));

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: h.user, logout: vi.fn() }),
}));
vi.mock('../../../context/PersonaContext', () => ({
  usePersona: () => ({ persona: h.persona, setPersona: h.setPersona, canSwitch: h.canSwitch }),
}));
vi.mock('../../../hooks/useTheme', () => ({
  useTheme: () => ({ isDark: false, toggle: vi.fn() }),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }));
vi.mock('../../../features/notifications/NotificationBell', () => ({ default: () => <div data-testid="bell" /> }));
vi.mock('../../SearchPalette', () => ({
  default: ({ open }) => (open ? <div data-testid="search-open" /> : null),
}));

function renderTopbar(initialEntries = ['/home']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Topbar onOpenMobileNav={vi.fn()} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  h.user = { role: 'Admin', name: 'Ada Admin', empCode: '000001' };
  h.persona = 'admin';
  h.setPersona = vi.fn();
  h.canSwitch = true;
});

describe('Topbar', () => {
  it('renders the workspace breadcrumb, notification bell and account menu trigger', () => {
    renderTopbar();
    expect(screen.getByTestId('bell')).toBeInTheDocument();
    expect(screen.getByLabelText('nav.openAccountMenu')).toBeInTheDocument();
    // Brand/logo moved to the sidebar (north-star shell); the topbar now leads
    // with the workspace breadcrumb instead.
    expect(screen.getByText('nav.workspace.admin')).toBeInTheDocument();
  });

  it('renders the English Operations workspace breadcrumb', () => {
    h.persona = 'english';
    renderTopbar();
    expect(screen.getByText('nav.workspace.english')).toBeInTheDocument();
  });

  it('uses the active English query tab in the page breadcrumb', () => {
    h.persona = 'english';
    renderTopbar(['/english-operations?tab=attendance']);
    expect(screen.getByText('englishOperations.tabs.attendance')).toBeInTheDocument();
    expect(screen.queryByText('englishOperations.tabs.overview')).toBeNull();
  });

  it('opens the search palette on Ctrl+K', () => {
    renderTopbar();
    expect(screen.queryByTestId('search-open')).toBeNull();
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(screen.getByTestId('search-open')).toBeInTheDocument();
  });

  it('opens the mobile nav via the hamburger', () => {
    const onOpen = vi.fn();
    render(
      <MemoryRouter>
        <Topbar onOpenMobileNav={onOpen} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByLabelText('nav.openMenu'));
    expect(onOpen).toHaveBeenCalled();
  });

  it('renders nothing without a user', () => {
    h.user = null;
    const { container } = renderTopbar();
    expect(container).toBeEmptyDOMElement();
  });
});
