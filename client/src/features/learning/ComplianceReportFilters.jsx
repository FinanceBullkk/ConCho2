import { useTranslation } from 'react-i18next';
import { controlClass, LearningField } from './LearningField';

const ASSIGNMENT_STATUSES = ['not_started', 'in_progress', 'complete', 'overdue'];
const CERTIFICATE_STATES = ['issued', 'missing', 'expiring', 'expired', 'revoked'];

const optionLabel = (...parts) => parts.filter(Boolean).join(' · ');

export default function ComplianceReportFilters({
  filters,
  onFilterChange,
  assignments,
  programs,
  departments,
  managers,
}) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <LearningField label={t('learning.reports.compliance.filters.assignment')}>
        <select aria-label={t('learning.reports.compliance.filters.assignment')} className={controlClass} value={filters.assignmentId} onChange={onFilterChange('assignmentId')}>
          <option value="">{t('learning.reports.compliance.filters.allAssignments')}</option>
          {assignments.map((assignment) => (
            <option key={assignment._id} value={assignment._id}>
              {optionLabel(assignment.title, assignment.target?.name || assignment.target?.title)}
            </option>
          ))}
        </select>
      </LearningField>
      <LearningField label={t('learning.reports.compliance.filters.program')}>
        <select aria-label={t('learning.reports.compliance.filters.program')} className={controlClass} value={filters.programId} onChange={onFilterChange('programId')}>
          <option value="">{t('learning.reports.compliance.filters.allPrograms')}</option>
          {programs.map((program) => (
            <option key={program._id} value={program._id}>
              {optionLabel(program.code, program.name)}
            </option>
          ))}
        </select>
      </LearningField>
      <LearningField label={t('learning.reports.compliance.filters.department')}>
        <select aria-label={t('learning.reports.compliance.filters.department')} className={controlClass} value={filters.departmentId} onChange={onFilterChange('departmentId')}>
          <option value="">{t('learning.reports.compliance.filters.allDepartments')}</option>
          {departments.map((department) => (
            <option key={department._id} value={department._id}>
              {optionLabel(department.code, department.name)}
            </option>
          ))}
        </select>
      </LearningField>
      <LearningField label={t('learning.reports.compliance.filters.manager')}>
        <select aria-label={t('learning.reports.compliance.filters.manager')} className={controlClass} value={filters.managerId} onChange={onFilterChange('managerId')}>
          <option value="">{t('learning.reports.compliance.filters.allManagers')}</option>
          {managers.map((manager) => (
            <option key={manager._id} value={manager._id}>
              {optionLabel(manager.empCode, manager.name)}
            </option>
          ))}
        </select>
      </LearningField>
      <LearningField label={t('learning.reports.compliance.filters.status')}>
        <select aria-label={t('learning.reports.compliance.filters.status')} className={controlClass} value={filters.status} onChange={onFilterChange('status')}>
          <option value="">{t('learning.reports.compliance.filters.allStatuses')}</option>
          {ASSIGNMENT_STATUSES.map((status) => (
            <option key={status} value={status}>{t(`learning.reports.compliance.status.${status}`)}</option>
          ))}
        </select>
      </LearningField>
      <LearningField label={t('learning.reports.compliance.filters.certificateState')}>
        <select aria-label={t('learning.reports.compliance.filters.certificateState')} className={controlClass} value={filters.certificateState} onChange={onFilterChange('certificateState')}>
          <option value="">{t('learning.reports.compliance.filters.allCertificateStates')}</option>
          {CERTIFICATE_STATES.map((state) => (
            <option key={state} value={state}>{t(`learning.reports.compliance.certificateState.${state}`)}</option>
          ))}
        </select>
      </LearningField>
      <LearningField label={t('learning.reports.compliance.filters.dueFrom')}>
        <input aria-label={t('learning.reports.compliance.filters.dueFrom')} type="date" className={controlClass} value={filters.dueFrom} onChange={onFilterChange('dueFrom')} />
      </LearningField>
      <LearningField label={t('learning.reports.compliance.filters.dueTo')}>
        <input aria-label={t('learning.reports.compliance.filters.dueTo')} type="date" className={controlClass} value={filters.dueTo} onChange={onFilterChange('dueTo')} />
      </LearningField>
    </div>
  );
}
