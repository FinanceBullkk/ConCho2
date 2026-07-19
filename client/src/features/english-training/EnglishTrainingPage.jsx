import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../components/PageHeader';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';
import {
  useEnglishCohorts, useEnglishCourses, useEnglishEmployees,
  useEnglishSessions, useEnglishSessionAttendance, useEnglishEligibility,
  useEnglishIssues, useEnglishIssueDetails, useCorrectEnglishEmployee,
} from './useEnglishTraining';
import EvaluationView from './EvaluationView';
import OverviewPanel from './OverviewPanel';
import ClassDetailView from './ClassDetailView';
import { EngBadge } from './eng-status-badge';

const editableTabs = ['overview', 'classes', 'courses', 'employees', 'sessions', 'eligibility', 'evaluation', 'issues'];
const archiveTabs = ['classes', 'courses', 'employees', 'sessions', 'eligibility', 'issues'];

// Status columns get a colored pill instead of raw text so the tables read at a glance.
const BADGE_KEYS = new Set(['status', 'employmentStatus', 'eligibilityStatus', 'enrollmentStatus']);
const badgeCell = (row, key) => (BADGE_KEYS.has(key) ? <EngBadge status={row[key]} /> : (row[key] ?? '—'));
// Classes list: the class code opens the class 360° detail; everything else is a badge/plain cell.
const classCell = (onOpen, t) => (row, key) => (key === 'classCode'
  ? <button type="button" onClick={() => onOpen(row.id)}
      aria-label={t('englishTraining.classDetail.open', { code: row.classCode })}
      className="font-medium text-primary hover:underline underline-offset-2">{row.classCode}</button>
  : badgeCell(row, key));
const definitions = {
  classes: [['classCode', 'classCode'], ['status', 'status'], ['activeMembers', 'activeMembers'], ['runs', 'runs']],
  courses: [['courseCode', 'courseCode'], ['courseName', 'courseName'], ['expectedUnits', 'expectedUnits'], ['maxAbsencesAllowed', 'maxAbsences'], ['runs', 'runs']],
  employees: [['empCode', 'employeeCode'], ['fullName', 'fullName'], ['email', 'email'], ['employmentStatus', 'status']],
  eligibility: [['employee', 'employee'], ['classCode', 'classCode'], ['courseName', 'courseName'], ['absenceCount', 'absences'], ['allowedAbsences', 'allowedAbsences'], ['eligibilityStatus', 'eligibilityStatus']],
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

function SessionsView({ rows, selected, onSelect, detail, t }) {
  const sessionRows = (rows || []).map((row) => ({
    ...row,
    heldAtText: row.heldAt ? new Date(row.heldAt).toLocaleString() : null,
  }));
  const columns = [
    ['classCode', 'classCode'], ['courseName', 'courseName'], ['sessionNumber', 'sessionNumber'],
    ['heldAtText', 'heldAt'], ['presentCount', 'present'], ['absentCount', 'absent'], ['actions', 'actions'],
  ];
  const roster = (detail.data?.roster || []).map((row) => ({
    ...row,
    employee: [row.employeeCode, row.employeeName].filter(Boolean).join(' · '),
  }));
  return (
    <div className="space-y-5">
      <DataTable rows={sessionRows} columns={columns} t={t} renderCell={(row, key) => {
        if (key === 'actions') return (
          <button type="button" onClick={() => onSelect(row.id)} className="font-medium text-primary hover:underline underline-offset-2">
            {t('englishTraining.viewAttendance')}
          </button>
        );
        return row[key] ?? '—';
      }} />
      {selected && detail.isLoading && <div className="flex justify-center py-8"><Spinner size={24} label={t('englishTraining.loading')} /></div>}
      {selected && detail.isError && <EmptyState title={t('englishTraining.loadError')} />}
      {selected && detail.data && (
        <section className="space-y-3" aria-label={t('englishTraining.sessionAttendance')}>
          <h2 className="text-h3 text-foreground">
            {t('englishTraining.sessionAttendance')} · {detail.data.classCode} · {detail.data.courseName} · #{detail.data.sessionNumber}
          </h2>
          <DataTable rows={roster} columns={[
            ['employee', 'employee'], ['enrollmentStatus', 'enrollmentStatus'], ['attendanceStatus', 'attendanceStatus'],
          ]} t={t} />
        </section>
      )}
    </div>
  );
}

function IssuesView({ rows, selected, onSelect, details, t, readOnly = false }) {
  const [editing, setEditing] = useState(null);
  if (!rows?.length) return <EmptyState title={t('englishTraining.empty')} />;
  const canCorrect = !readOnly && (selected === 'missing_bu' || selected === 'missing_role');
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

export default function EnglishTrainingPage({ readOnly = false, embedded = false }) {
  const { t } = useTranslation();
  const tabs = readOnly ? archiveTabs : editableTabs;
  const [active, setActive] = useState(() => readOnly ? 'classes' : 'overview');
  const [search, setSearch] = useState('');
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  const [selectedClass, setSelectedClass] = useState(null);
  const listParams = { q: search || undefined, limit: 100 };
  const queries = {
    classes: useEnglishCohorts(), courses: useEnglishCourses(),
    employees: useEnglishEmployees(listParams), sessions: useEnglishSessions(listParams),
    eligibility: useEnglishEligibility(listParams), issues: useEnglishIssues(),
  };
  const issueDetails = useEnglishIssueDetails(selectedIssue);
  const sessionAttendance = useEnglishSessionAttendance(selectedSession);
  const current = queries[active];
  return (
    <div className="space-y-6">
      {!embedded && <PageHeader title={t('englishTraining.title')} description={t('englishTraining.description')} />}
      <div className="flex flex-wrap gap-2" role="tablist">{tabs.map((tab) => (
        <button key={tab} type="button" role="tab" aria-selected={active === tab} onClick={() => { setActive(tab); setSelectedClass(null); }}
          className={`rounded-md px-3 py-2 text-sm font-medium ${active === tab ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
          {t(`englishTraining.${tab}`)}
        </button>
      ))}</div>
      {active === 'overview' ? (
        <OverviewPanel t={t} onNavigate={setActive} />
      ) : active === 'evaluation' ? (
        <EvaluationView t={t} />
      ) : active === 'classes' && selectedClass ? (
        <ClassDetailView classId={selectedClass} onBack={() => setSelectedClass(null)} t={t} />
      ) : active === 'classes' ? (
        current.isLoading ? <div className="flex justify-center py-12"><Spinner size={32} label={t('englishTraining.loading')} /></div>
          : current.isError ? <EmptyState title={t('englishTraining.loadError')} />
            : <DataTable rows={current.data} columns={definitions.classes} t={t} renderCell={classCell(setSelectedClass, t)} />
      ) : (
        <>
          {['employees', 'sessions', 'eligibility'].includes(active) && <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t(`englishTraining.${active}Search`)}
            aria-label={t(`englishTraining.${active}Search`)} className="w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm" />}
          {current.isLoading && <div className="flex justify-center py-12"><Spinner size={32} label={t('englishTraining.loading')} /></div>}
          {current.isError && <EmptyState title={t('englishTraining.loadError')} />}
          {!current.isLoading && !current.isError && active === 'issues' && (
            <IssuesView rows={current.data} selected={selectedIssue} onSelect={setSelectedIssue} details={issueDetails} t={t} readOnly={readOnly} />
          )}
          {!current.isLoading && !current.isError && active === 'sessions' && (
            <SessionsView rows={current.data} selected={selectedSession} onSelect={setSelectedSession} detail={sessionAttendance} t={t} />
          )}
          {!current.isLoading && !current.isError && active === 'eligibility' && (
            <DataTable rows={current.data.map((row) => ({ ...row, employee: `${row.employeeCode} · ${row.employeeName}` }))} columns={definitions.eligibility} t={t} renderCell={badgeCell} />
          )}
          {!current.isLoading && !current.isError && !['issues', 'sessions', 'eligibility'].includes(active) && (
            <DataTable rows={current.data} columns={definitions[active]} t={t} renderCell={badgeCell} />
          )}
        </>
      )}
    </div>
  );
}
