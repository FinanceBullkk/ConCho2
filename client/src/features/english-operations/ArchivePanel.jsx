import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '../../context/AuthContext';
import EnglishTrainingPage from '../english-training/EnglishTrainingPage';
import {
  useCutoverEnglishArchive,
  useEnglishArchiveStatus,
  useEnglishCombinedHistory,
} from './useEnglishOperations';

export default function ArchivePanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const status = useEnglishArchiveStatus();
  const history = useEnglishCombinedHistory(Boolean(status.data?.isFrozen));
  const cutover = useCutoverEnglishArchive();
  const [reason, setReason] = useState('');
  const freeze = () => {
    if (!window.confirm(t('englishOperations.archive.cutoverConfirm'))) return;
    cutover.mutate({ confirm: true, reason: reason.trim() });
  };

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3">
            <LockKeyhole className="mt-0.5 size-5 text-muted-foreground" />
            <div>
              <h3 className="font-semibold text-foreground">
                {status.data?.isFrozen
                  ? t('englishOperations.archive.readOnly')
                  : t('englishOperations.archive.awaitingCutover')}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {status.data?.isFrozen
                  ? t('englishOperations.archive.frozenAt', { date: new Date(status.data.cutoverAt).toLocaleString() })
                  : t('englishOperations.archive.openDescription')}
              </p>
              {history.data && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t('englishOperations.archive.historySummary', history.data.summary)}
                </p>
              )}
            </div>
          </div>
          {user?.role === 'Admin' && status.data && !status.data.isFrozen && (
            <div className="w-full max-w-md space-y-2">
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                minLength={10}
                maxLength={500}
                placeholder={t('englishOperations.archive.reason')}
                className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              />
              <Button type="button" variant="destructive" onClick={freeze} disabled={reason.trim().length < 10 || cutover.isPending}>
                {t('englishOperations.archive.cutover')}
              </Button>
            </div>
          )}
        </div>
      </section>
      <div className="rounded-lg border border-border bg-card p-4">
        <EnglishTrainingPage readOnly embedded />
      </div>
    </div>
  );
}
