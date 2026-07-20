import { useTranslation } from 'react-i18next';
import { LockKeyhole } from 'lucide-react';
import EnglishTrainingPage from '../english-training/EnglishTrainingPage';

export default function ArchivePanel() {
  const { t } = useTranslation();

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
        <EnglishTrainingPage readOnly embedded />
      </div>
    </div>
  );
}
