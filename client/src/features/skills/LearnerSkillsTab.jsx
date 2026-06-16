import { useTranslation } from 'react-i18next';
import { Sparkles, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useLearnerSkills, useLearnerRecommendations } from './useSkills';

// Learner 360° "Skills" tab (TMS.update gap #4) — derived proficiency + role gap.
// Fed by GET /api/skills/learner/:userId (self-or-manage). Honest empty states:
// skills appear only as the learner completes certified programs mapped to them.
const p = 'learning.learnerProfile';

// Small fixed-dot proficiency meter (level / max).
function Dots({ level, max }) {
  return (
    <div className="flex items-center gap-1" aria-label={`${level}/${max}`}>
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className={cn('size-2 rounded-[2px]', i < level ? 'bg-primary' : 'bg-muted')} />
      ))}
    </div>
  );
}

// Reusable role-gap list (also used as the overview "Role readiness" card).
export function RoleReadinessList({ userId, showTarget = false }) {
  const { t } = useTranslation();
  const { data } = useLearnerSkills(userId);
  const required = data?.roleProfile?.required ?? [];
  if (!required.length) return <p className="text-sm text-muted-foreground">{t(`${p}.noRoleTargets`)}</p>;
  return (
    <div className="space-y-3">
      {required.map((r) => {
        const ok = r.gap === 0;
        const pct = Math.min(100, Math.round((r.level / Math.max(1, r.target)) * 100));
        return (
          <div key={r.name}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium">{r.name}</span>
              {showTarget
                ? <span className="text-[11px] text-subtle-foreground">{t(`${p}.target`, { n: r.target })}</span>
                : <span className={cn('flex items-center gap-1 text-[11px] font-semibold', ok ? 'text-success' : 'text-warning')}>
                    {ok ? <><Check className="size-3" />{t(`${p}.metBadge`)}</> : t(`${p}.gapBadge`, { n: r.gap })}
                  </span>}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <span className={cn('block h-full rounded-full', ok ? 'bg-success' : 'bg-warning')} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Gap-driven program recommendations (B2 skills-as-spine). Hidden when the
// learner has no open role gaps — no noise when they're already on target.
function RecommendedPrograms({ userId }) {
  const { t } = useTranslation();
  const { data } = useLearnerRecommendations(userId);
  const recs = data?.recommendations ?? [];
  if (!recs.length) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t(`${p}.recommended`)}</CardTitle>
        <p className="text-xs text-muted-foreground">{t(`${p}.recommendedHint`)}</p>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {recs.map((r) => (
            <li key={r.programId} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{r.name}</p>
                <p className="truncate text-[11px] text-subtle-foreground">{r.skills.map((sk) => sk.name).join(', ')}</p>
              </div>
              <Badge variant="secondary" className="shrink-0">{t(`${p}.closesGaps`, { n: r.gapClosed })}</Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export default function LearnerSkillsTab({ userId }) {
  const { t } = useTranslation();
  const { data } = useLearnerSkills(userId);
  const skills = data?.skills ?? [];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t(`${p}.skillsAcquired`)}</CardTitle>
          <p className="text-xs text-muted-foreground">{t(`${p}.skillsAcquiredHint`)}</p>
        </CardHeader>
        <CardContent>
          {skills.length ? (
            <ul className="divide-y divide-border">
              {skills.map((sk) => (
                <li key={sk.skillId} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary-tint text-primary"><Sparkles className="size-4" aria-hidden="true" /></span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{sk.name}</p>
                      <p className="truncate text-[11px] text-subtle-foreground">{sk.category}{sk.via.length ? ` · ${t(`${p}.via`)} ${sk.via.join(', ')}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Dots level={sk.level} max={sk.max} />
                    <span className="w-8 text-right font-mono text-[11px] text-subtle-foreground">{sk.level}/{sk.max}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">{t(`${p}.noSkills`)}</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">{t(`${p}.roleSkillProfile`)}</CardTitle></CardHeader>
        <CardContent><RoleReadinessList userId={userId} showTarget /></CardContent>
      </Card>
      </div>
      <RecommendedPrograms userId={userId} />
    </div>
  );
}
