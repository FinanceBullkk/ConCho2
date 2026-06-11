import { useTranslation } from 'react-i18next';
import { StatusBadge } from './StatusBadge';

// ──────────────────────────────────────────────────────────
// TeamRosterTable — presentational list of a manager's direct reports
// with their training rollup. Pure props in (no fetching) → testable.
// Consumes the `reports` array from GET /api/org/my-team.
// ──────────────────────────────────────────────────────────

const deptLabel = (dept) => {
  if (!dept) return '—';
  if (typeof dept === 'object') return dept.name || dept.code || '—';
  return dept; // legacy free-text string
};

export default function TeamRosterTable({ reports = [] }) {
  const { t } = useTranslation();

  if (!reports.length) {
    return (
      <div className="bg-card border border-border rounded-lg py-12 text-center text-subtle-foreground text-sm">
        {t('org.team.emptyTable')}
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-subtle-foreground uppercase tracking-wider">
            <th className="px-4 py-3 font-medium">{t('org.team.colEmployee')}</th>
            <th className="px-4 py-3 font-medium">{t('org.team.colDepartment')}</th>
            <th className="px-4 py-3 font-medium">{t('org.team.colStatus')}</th>
            <th className="px-4 py-3 font-medium text-right">{t('org.team.colActive')}</th>
            <th className="px-4 py-3 font-medium text-right">{t('org.team.colCompleted')}</th>
            <th className="px-4 py-3 font-medium text-right">{t('org.team.colCertificates')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {reports.map((r) => (
            <tr key={r._id} className="hover:bg-accent/40 transition-colors">
              <td className="px-4 py-3">
                <div className="font-medium text-foreground">{r.name}</div>
                <div className="text-xs text-subtle-foreground font-mono">{r.empCode}</div>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{deptLabel(r.department)}</td>
              <td className="px-4 py-3"><StatusBadge status={r.status} size="sm" /></td>
              <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{r.training.activeEnrollments}</td>
              <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{r.training.completedPrograms}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                <span className={r.training.certificates > 0 ? 'text-success font-medium' : 'text-subtle-foreground'}>
                  {r.training.certificates}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
