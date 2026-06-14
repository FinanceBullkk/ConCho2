import { useTranslation } from 'react-i18next';
import { Pencil, BookOpen, Check } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCustomFields } from '../custom-fields/useCustomFields';
import { completionRules, neverExpires } from './program-builder/program-form-config';

// ──────────────────────────────────────────────────────────
// ProgramDetailModal — read-only program detail (closes the loop).
//
// Programs were only viewable by opening the edit builder (managers only), so
// a program's config — including admin-defined **custom field values** — had no
// read surface. This is that surface: a polished read-only view of the program
// (overview · completion · certificate · capacity · prerequisites · custom
// fields) that any reader can open from the list, with an Edit shortcut for
// managers. The custom field values now flow define → builder → save → READ.
// ──────────────────────────────────────────────────────────

const statusTone = { active: 'default', inactive: 'secondary', archived: 'outline' };
const overline = 'text-[10.5px] font-semibold uppercase tracking-[0.08em] text-subtle-foreground';

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{children}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="space-y-2.5">
      <div className={overline}>{title}</div>
      {children}
    </div>
  );
}

export default function ProgramDetailModal({ program, programs = [], canManage, onEdit, onClose }) {
  const { t } = useTranslation();
  const { data: customDefs = [] } = useCustomFields({ entity: 'Program' });

  const rules = completionRules(program, t);
  const validity = program.certificateValidityDays;
  const never = neverExpires(validity);
  const cap = program.capacityPolicy?.maxParticipants;
  const capPer = program.capacityPolicy?.maxParticipantsPerSession;
  const autoRecert = Boolean(program.recertifyPolicy?.autoAssign);

  // Resolve prerequisite ids → known programs (inactive ones may not resolve).
  const byId = new Map(programs.map((p) => [p._id, p]));
  const prereqs = (program.prerequisitePrograms || [])
    .map((id) => byId.get(typeof id === 'object' ? id?._id : id))
    .filter(Boolean);

  const cf = program.customFields || {};
  const fmt = (v) => (v === undefined || v === null || v === '' ? t('learning.programs.detail.none') : String(v));

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto p-0" aria-label={program.name}>
        <DialogHeader className="flex flex-row items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-tint text-primary">
                <BookOpen className="h-4 w-4" />
              </span>
              <Badge variant={statusTone[program.status] || 'secondary'}>
                {t(`learning.status.${program.status}`, program.status)}
              </Badge>
            </div>
            <DialogTitle className="text-h3 text-foreground">{program.name}</DialogTitle>
            <DialogDescription className="font-mono text-sm text-primary">{program.code}</DialogDescription>
          </div>
          {canManage && (
            <Button type="button" variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
              {t('learning.programs.edit')}
            </Button>
          )}
        </DialogHeader>

        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <Section title={t('learning.programs.detail.overview')}>
            <Row label={t('learning.programs.colCategory')}>{t(`learning.category.${program.category}`, program.category)}</Row>
            <Row label={t('learning.programs.colScheduling')}>{t(`learning.scheduling.${program.schedulingMode}`, program.schedulingMode)}</Row>
            <Row label={t('learning.programs.colDelivery')}>{t(`learning.delivery.${program.deliveryMode}`, program.deliveryMode)}</Row>
            <Row label={t('learning.programs.colSessions')}>{program.defaultSessionCount}</Row>
          </Section>

          <Section title={t('learning.programs.detail.capacity')}>
            <Row label={t('learning.programs.detail.capacity')}>
              {cap ? t('learning.builder.capacityLabel', { n: cap }) : t('learning.builder.unlimited')}
            </Row>
            {capPer != null && <Row label={t('learning.programs.detail.perSession')}>{capPer}</Row>}
          </Section>

          <Section title={t('learning.builder.completesWhen')}>
            <div className="flex flex-wrap gap-1.5">
              {rules.length ? rules.map((r) => (
                <span key={r} className="inline-flex items-center gap-1 rounded-full bg-success-tint px-2 py-1 text-[11px] font-semibold text-success">
                  <Check className="h-3 w-3" />{r}
                </span>
              )) : (
                <span className="inline-flex items-center rounded-full bg-surface-2 px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                  {t('learning.builder.enrollmentOnly')}
                </span>
              )}
            </div>
          </Section>

          <Section title={t('learning.builder.certificate')}>
            <Row label={t('learning.builder.validity')}>
              {never ? t('learning.builder.neverExpires') : t('learning.builder.daysValid', { n: validity })}
            </Row>
            {autoRecert && (
              <Row label={t('learning.builder.recert')}>
                <span className="inline-flex items-center rounded-full bg-primary-tint px-2 py-0.5 text-[11px] font-semibold text-primary">
                  {t('learning.builder.automatic')}
                </span>
              </Row>
            )}
          </Section>

          {prereqs.length > 0 && (
            <div className="sm:col-span-2">
              <Section title={t('learning.programs.detail.prerequisites')}>
                <div className="flex flex-wrap gap-1.5">
                  {prereqs.map((p) => (
                    <span key={p._id} className="inline-flex items-center rounded-full bg-surface-2 px-2 py-1 text-[11px] font-medium text-muted-foreground">
                      {p.name} <span className="ml-1 font-mono opacity-70">{p.code}</span>
                    </span>
                  ))}
                </div>
              </Section>
            </div>
          )}

          {program.description && (
            <div className="sm:col-span-2">
              <Section title={t('learning.programs.detail.description')}>
                <p className="text-sm text-foreground">{program.description}</p>
              </Section>
            </div>
          )}

          {customDefs.length > 0 && (
            <div className="sm:col-span-2">
              <Section title={t('learning.programs.detail.customFields')}>
                <dl className="space-y-2">
                  {customDefs.map((def) => (
                    <Row key={def._id} label={def.label}>{fmt(cf[def.key])}</Row>
                  ))}
                </dl>
              </Section>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
