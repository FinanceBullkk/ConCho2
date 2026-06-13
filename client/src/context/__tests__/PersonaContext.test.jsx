import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PersonaProvider, usePersona } from '../PersonaContext';

const h = vi.hoisted(() => ({ user: null }));
vi.mock('../AuthContext', () => ({ useAuth: () => ({ user: h.user }) }));

function Probe() {
  const { persona, canSwitch, setPersona } = usePersona();
  return (
    <div>
      <span data-testid="persona">{persona}</span>
      <span data-testid="canSwitch">{String(canSwitch)}</span>
      <button onClick={() => setPersona('learner')}>to-learner</button>
      <button onClick={() => setPersona('admin')}>to-admin</button>
    </div>
  );
}

const renderProbe = () => render(<PersonaProvider><Probe /></PersonaProvider>);

beforeEach(() => {
  h.user = null;
  localStorage.clear();
});

describe('PersonaContext', () => {
  it('defaults a Participant to learner and locks the switch', () => {
    h.user = { role: 'Participant' };
    renderProbe();
    expect(screen.getByTestId('persona')).toHaveTextContent('learner');
    expect(screen.getByTestId('canSwitch')).toHaveTextContent('false');
  });

  it('defaults staff to admin and allows the switch', () => {
    h.user = { role: 'Teacher' };
    renderProbe();
    expect(screen.getByTestId('persona')).toHaveTextContent('admin');
    expect(screen.getByTestId('canSwitch')).toHaveTextContent('true');
  });

  it('honours a stored learner choice for staff', () => {
    localStorage.setItem('tms.persona', 'learner');
    h.user = { role: 'Admin' };
    renderProbe();
    expect(screen.getByTestId('persona')).toHaveTextContent('learner');
  });

  it('setPersona updates and persists', () => {
    h.user = { role: 'Admin' };
    renderProbe();
    fireEvent.click(screen.getByText('to-learner'));
    expect(screen.getByTestId('persona')).toHaveTextContent('learner');
    expect(localStorage.getItem('tms.persona')).toBe('learner');
  });

  it('ignores a stored admin choice for a Participant (locked to learner)', () => {
    localStorage.setItem('tms.persona', 'admin');
    h.user = { role: 'Participant' };
    renderProbe();
    expect(screen.getByTestId('persona')).toHaveTextContent('learner');
  });
});
