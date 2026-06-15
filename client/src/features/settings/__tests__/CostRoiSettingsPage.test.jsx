import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CostRoiSettingsPage from '../CostRoiSettingsPage';

const h = vi.hoisted(() => ({ cost: {}, exec: {} }));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }));
vi.mock('../../../hooks/useLearningDashboard', () => ({
  useCostConfig: () => h.cost,
  useExecutiveDashboard: () => h.exec,
}));
// Stub the reused form so the page test doesn't pull its mutation/i18n deps.
vi.mock('../../learning/DashboardCostConfigForm', () => ({
  default: () => <div data-testid="cost-config-form" />,
}));

const renderPage = () => render(<MemoryRouter><CostRoiSettingsPage /></MemoryRouter>);

describe('CostRoiSettingsPage', () => {
  it('renders the reused cost form and server-computed outputs when configured', () => {
    h.cost = { data: { annualBudgetMinor: 420000 }, isLoading: false };
    h.exec = { data: { financials: { configured: true, currency: 'VND', costPerEmployeeMinor: 1000, costPerCompletionMinor: 2000, efficiencyDividendMinor: 3000 } }, isError: false };
    renderPage();

    expect(screen.getByTestId('cost-config-form')).toBeInTheDocument();
    expect(screen.getByText('1,000 VND')).toBeInTheDocument();
    expect(screen.getByText('2,000 VND')).toBeInTheDocument();
    expect(screen.getByText('3,000 VND')).toBeInTheDocument();
  });

  it('prompts to configure when financials are not configured', () => {
    h.cost = { data: null, isLoading: false };
    h.exec = { data: { financials: { configured: false } }, isError: false };
    renderPage();
    expect(screen.getByText('costRoi.notConfigured')).toBeInTheDocument();
  });

  it('shows a load error when the ROI bundle fails', () => {
    h.cost = { data: null, isLoading: false };
    h.exec = { data: undefined, isError: true };
    renderPage();
    expect(screen.getByText('costRoi.loadError')).toBeInTheDocument();
  });
});
