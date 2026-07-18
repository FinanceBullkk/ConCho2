import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../components/PageHeader';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';
import {
  useEnglishCohorts, useEnglishCourses, useEnglishEmployees,
  useEnglishIssues, useEnglishIssueDetails, useCorrectEnglishEmployee,
} from './useEnglishTraining';

const tabs = ['cohorts', 'courses', 'employees', 'issues'];
const definitions = {
  cohorts: [['classCode', 'classCode'], ['status', 'status'], ['activeMembers', 'activeMembers'], ['runs', 'runs']],
  courses: [['courseCode', 'courseCode'], ['courseName', 'courseName'], ['expectedUnits', 'expectedUnits'], ['maxAbsencesAllowed', 'maxAbsences'], ['runs', 'runs']],
  employees: [['empCode', 'employeeCode'], ['fullName', 'fullName'], ['email', 'email'], ['employmentStatus', 'status']],
};

function DataTable({ rows, columns, t, renderCell }) {
  if (!rows?.length) return <EmptyState title={t('englishTraining.empty')} />;
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/50 text-left"><tr>{columns.map(([key, label]) => <th key={key} className="px-4 py-3 font-medium">{t(`englishTraining.columns.${label}`)}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => (
          <tr key={row.id || row.empCode || row.courseCode || row.classCode || row.code || index} className="border-b border-border last:border-0">
            {columns.map(([key]) => (
              <td key={key} className="px-4 py-3 text-foreground">
                {renderCell ? renderCell(row, key) : (row[key] ?? '—')}
              </td>
            ))}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function CorrectionForm({ row, issueCode, onSaved, onCancel, t }) {
  const correction = useCorrectEnglishEmployee();
  const [businessUnit, setBusinessUnit] = useState(row.businessUnit || '');
  const [jobRole, setJobRole] = useState(row.jobRole || '');
  const [reason, setReason] = useState('');
  const requiredValue = issueCode === 'missing_bu' ? businessUnit.trim() : jobRole.trim();
  const canSubmit = Boolean(requiredValue && reason.trim().length >= 3);

  const submit = async (event) => {
    event.preventDefault();
    const payload = { empCode: row.employeeCode, reason: reason.trim() };
    if (businessUnit.trim()) payload.businessUnit = businessUnit.trim();
    if (jobRole.trim()) payload.jobRole = jobRole.trim();
    await correction.mutateAsync(payload);
    onSaved();
  };

  return (
    <form onSubmit={submit} className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div>
        <h3 className="text-h3 text-foreground">{t('englishTraining.correctEmployee')}</h3>
        <p className="text-sm text-muted-foreground">{row.employeeCode} · {row.employeeName}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm font-medium">
          <span>{t('englishTraining.businessUnit')}</span>
          <input value={businessUnit} onChange={(event) => setBusinessUnit(event.target.value)} maxLength={100}
            required={issueCode === 'missing_bu'}
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-normal" />
        </label>
        <label className="space-y-1 text-sm font-medium">
          <span>{t('englishTraining.jobRole')}</span>
          <input value={jobRole} onChange={(event) => setJobRole(event.target.value)} maxLength={100}
            required={issueCode === 'missing_role'}
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-normal" />
        </label>
      </div>
      <label className="block space-y-1 text-sm font-medium">
        <span>{t('englishTraining.reason')}</span>
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} required minLength={3} maxLength={500}
          className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 font-normal" />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={!canSubmit || correction.isPending}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {correction.isPending ? t('englishTraining.savingCorrection') : t('englishTraining.saveCorrection')}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md bg-muted px-3 py-2 text-sm font-medium">
          {t('englishTraining.cancelCorrection')}
        </button>
      </div>
    </form>
  );
}

function IssuesView({ rows, selected, onSelect, details, t }) {
  const [editing, setEditing] = useState(null);
  if (!rows?.length) return <EmptyState title={t('englishTraining.empty')} />;
  const canCorrect = selected === 'missing_bu' || selected === 'missing_role';
  const detailColumns = [
    ['entityType', 'entity'], ['entityKey', 'entityKey'], ['employee', 'employee'],
    ['classCode', 'cohort'], ['source', 'source'], ['detailText', 'detail'],
    ...(canCorrect ? [['actions', 'actions']] : []),
  ];
  const detailRows = (details.data || []).map((row) => ({
    ...row,
    employee: [row.employeeCode, row.employeeName].filter(Boolean).join(' · ') || null,
    source: row.sourceSheet
      ? (row.sourceRow ? t('englishTraining.sourceRow', { sheet: row.sourceSheet, row: row.sourceRow }) : row.sourceSheet)
      : null,
    detailText: row.detail ? JSON.stringify(row.detail) : null,
  }));

  return (
    <div className="space-y-5">
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/50 text-left"><tr>
            <th className="px-4 py-3 font-medium">{t('englishTraining.columns.issue')}</th>
            <th className="px-4 py-3 font-medium">{t('englishTraining.columns.count')}</th>
          </tr></thead>
          <tbody>{rows.map((row) => (
            <tr key={row.code} className={`border-b border-border last:border-0 ${selected === row.code ? 'bg-primary/5' : ''}`}>
              <td className="px-4 py-3">
                <button type="button" onClick={() => onSelect(row.code)}
                  aria-label={t('englishTraining.viewDetails', { code: row.code })}
                  className="font-medium text-primary hover:underline underline-offset-2">
                  {row.code}
                </button>
              </td>
              <td className="px-4 py-3 text-foreground">{row.count}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {!selected && <EmptyState title={t('englishTraining.selectIssue')} />}
      {selected && details.isLoading && <div className="flex justify-center py-8"><Spinner size={24} label={t('englishTraining.loading')} /></div>}
      {selected && details.isError && <EmptyState title={t('englishTraining.loadError')} />}
      {selected && !details.isLoading && !details.isError && (
        <section className="space-y-3" aria-label={t('englishTraining.affectedRecords')}>
          <h2 className="text-h3 text-foreground">{t('englishTraining.affectedRecords')} · {selected}</h2>
          {detailRows.length
            ? <DataTable rows={detailRows} columns={detailColumns} t={t} renderCell={(row, key) => {
              if (key === 'actions') return (
                <button type="button" onClick={() => setEditing(row)} className="font-medium text-primary hover:underline underline-offset-2">
                  {t('englishTraining.correct')}
                </button>
              );
              return row[key] ?? '—';
            }} />
            : <EmptyState title={t('englishTraining.noIssueDetails')} />}
        </section>
      )}
      {editing && <CorrectionForm key={editing.employeeCode} row={editing} issueCode={selected} t={t} onSaved={() => setEditing(null)} onCancel={() => setEditing(null)} />}
    </div>
  );
}

export default function EnglishTrainingPage() {
  const { t } = useTranslation();
  const [active, setActive] = useState('cohorts');
  const [search, setSearch] = useState('');
  const [selectedIssue, setSelectedIssue] = useState(null);
  const queries = {
    cohorts: useEnglishCohorts(), courses: useEnglishCourses(),
    employees: useEnglishEmployees({ q: search || undefined, limit: 100 }), issues: useEnglishIssues(),
  };
  const issueDetails = useEnglishIssueDetails(selectedIssue);
  const current = queries[active];
  return (
    <div className="space-y-6">
      <PageHeader title={t('englishTraining.title')} description={t('englishTraining.description')} />
      <div className="flex flex-wrap gap-2" role="tablist">{tabs.map((tab) => (
        <button key={tab} type="button" role="tab" aria-selected={active === tab} onClick={() => setActive(tab)}
          className={`rounded-md px-3 py-2 text-sm font-medium ${active === tab ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
          {t(`englishTraining.${tab}`)}
        </button>
      ))}</div>
      {active === 'employees' && <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('englishTraining.search')}
        aria-label={t('englishTraining.search')} className="w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm" />}
      {current.isLoading && <div className="flex justify-center py-12"><Spinner size={32} label={t('englishTraining.loading')} /></div>}
      {current.isError && <EmptyState title={t('englishTraining.loadError')} />}
      {!current.isLoading && !current.isError && active === 'issues' && (
        <IssuesView rows={current.data} selected={selectedIssue} onSelect={setSelectedIssue} details={issueDetails} t={t} />
      )}
      {!current.isLoading && !current.isError && active !== 'issues' && (
        <DataTable rows={current.data} columns={definitions[active]} t={t} />
      )}
    </div>
  );
}
