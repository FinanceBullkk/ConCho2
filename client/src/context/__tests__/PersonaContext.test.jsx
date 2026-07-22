import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PersonaProvider, usePersona } from '../PersonaContext';

const h = vi.hoisted(() => ({ user: null }));
vi.mock('../AuthContext', () => ({ useAuth: () => ({ user: h.user }) }));

function Probe() {
  const { persona, canSwitch, setPersona, availablePersonas } = usePersona();
  return (
    <div>
      <span data-testid="persona">{persona}</span>
      <span data-testid="canSwitch">{String(canSwitch)}</span>
      <span data-testid="available">{availablePersonas.join(',')}</span>
      <button onClick={() => setPersona('learner')}>to-learner</button>
      <button onClick={() => setPersona('admin')}>to-admin</button>
      <button onClick={() => setPersona('english')}>to-english</button>
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
    expect(screen.getByTestId('available')).toHaveTextContent('learner');
  });

  it('defaults staff to admin and allows the switch', () => {
    h.user = { role: 'Teacher' };
    renderProbe();
    expect(screen.getByTestId('persona')).toHaveTextContent('admin');
    expect(screen.getByTestId('canSwitch')).toHaveTextContent('true');
    expect(screen.getByTestId('available')).toHaveTextContent('admin,english,learner');
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

  it('allows staff to select the English Operations workspace', () => {
    h.user = { role: 'Coordinator' };
    renderProbe();
    fireEvent.click(screen.getByText('to-english'));
    expect(screen.getByTestId('persona')).toHaveTextContent('english');
    expect(localStorage.getItem('tms.persona')).toBe('english');
  });

  it('ignores a stored admin choice for a Participant (locked to learner)', () => {
    localStorage.setItem('tms.persona', 'admin');
    h.user = { role: 'Participant' };
    renderProbe();
    expect(screen.getByTestId('persona')).toHaveTextContent('learner');
  });

  it('ignores a stored English choice for a Participant', () => {
    localStorage.setItem('tms.persona', 'english');
    h.user = { role: 'Participant' };
    renderProbe();
    expect(screen.getByTestId('persona')).toHaveTextContent('learner');
  });
});
