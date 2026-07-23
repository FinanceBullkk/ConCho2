import { useTranslation } from 'react-i18next';
import { LockKeyhole } from 'lucide-react';
import EnglishTrainingPage from '../english-training/EnglishTrainingPage';
import { useAuth } from '../../context/AuthContext';

export default function ArchivePanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  // Imported schedule/attendance evidence stays read-only, but Admin/Coordinator
  // may still fix data-quality gaps (missing BU/job role) on the canonical
  // employee record from the Issues drill-down — the shipped Phase-1 DQ loop.
  const canCorrect = user?.role === 'Admin' || user?.role === 'Coordinator';

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex gap-3">
          <LockKeyhole className="mt-0.5 size-5 text-muted-foreground" />
          <div>
            <h3 className="font-semibold text-foreground">{t('englishOperations.archive.sourceEvidenceTitle')}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t('englishOperations.archive.sourceEvidenceDescription')}</p>
          </div>
        </div>
      </section>
      <div className="rounded-lg border border-border bg-card p-4">
        <EnglishTrainingPage readOnly embedded allowCorrections={canCorrect} />
      </div>
    </div>
  );
}
