import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { TriangleAlert } from 'lucide-react';
import { useSettings, useUpdateSettings } from '../hooks/useSettings';
import { Button } from '@/components/ui/button';
import { Spinner } from '../components/Spinner';
import { SettingsEditor } from '../components/SettingsEditor';

// ──────────────────────────────────────────────────────────
// SettingsPage — Phase 4 Surface 9 §G
//
// System config JSON values. Renders inside SystemPage Tabs (no h1 here
// — PageHeader at the umbrella level handles title/description).
//
// Behavior:
//   • Dirty tracking — compare current input vs original stringified value
//   • On-blur validate — JSON.parse per field, red border + inline error
//   • Unsaved banner — appears when dirtyKeys.length > 0
//   • beforeunload guard — browser confirm if user closes tab dirty
//   • Save batches all dirty fields in one mutation
// ──────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { data: settings = [], isLoading: loading } = useSettings();
  const updateMutation = useUpdateSettings();

  const [formData, setFormData] = useState({});
  const [errors, setErrors] = useState({});

  // Sync formData when settings load/refetch. Store the original stringified
  // value as a baseline for dirty-tracking.
  const initial = useMemo(() => {
    const m = {};
    settings.forEach((s) => { m[s.key] = JSON.stringify(s.value, null, 2); });
    return m;
  }, [settings]);

  useEffect(() => {
    if (settings.length > 0) setFormData(initial);
  }, [initial, settings.length]);

  const dirtyKeys = useMemo(
    () => Object.keys(formData).filter((k) => formData[k] !== initial[k]),
    [formData, initial],
  );
  const hasErrors = Object.values(errors).some(Boolean);
  const canSave   = dirtyKeys.length > 0 && !hasErrors && !updateMutation.isPending;

  // beforeunload guard — covers tab close / browser back to a different origin.
  // In-app navigation guard (useBlocker) requires the data-router; current
  // setup uses BrowserRouter so we ship only the close-tab path. Spec §J risk
  // documents this exact fallback.
  useEffect(() => {
    if (dirtyKeys.length === 0) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirtyKeys.length]);

  const validateOnBlur = (key) => () => {
    try {
      JSON.parse(formData[key] ?? '');
      setErrors((prev) => (prev[key] ? { ...prev, [key]: null } : prev));
    } catch (e) {
      setErrors((prev) => ({ ...prev, [key]: e.message }));
    }
  };

  const handleSave = async () => {
    // Defense-in-depth: validate everything once more before submit.
    const failed = [];
    const payload = [];
    for (const [key, strValue] of Object.entries(formData)) {
      try {
        payload.push({ key, value: JSON.parse(strValue) });
      } catch {
        failed.push(key);
      }
    }
    if (failed.length) {
      toast.error(`Invalid JSON: ${failed.join(', ')}`);
      return;
    }
    try {
      await updateMutation.mutateAsync(payload);
      toast.success('Settings saved');
      setErrors({});
    } catch (err) {
      toast.error(err?.message || 'Failed to save settings');
    }
  };

  if (loading) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <Spinner size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Sticky-ish unsaved banner + save action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {dirtyKeys.length > 0 ? (
          <div
            role="status"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-warning-tint border border-warning/30 text-warning text-sm"
          >
            <TriangleAlert className="size-4" aria-hidden="true" />
            <span><strong>Unsaved changes</strong> · {dirtyKeys.length} setting{dirtyKeys.length === 1 ? '' : 's'} modified</span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">All changes saved.</p>
        )}
        <Button onClick={handleSave} disabled={!canSave}>
          {updateMutation.isPending ? <><Spinner size={14} />Saving…</> : 'Save changes'}
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {settings.map((s) => (
          <div key={s._id} className="bg-card border border-border rounded-lg p-5 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground font-mono">{s.key}</h3>
              {s.description && (
                <p className="text-xs text-muted-foreground mt-1">{s.description}</p>
              )}
            </div>
            <SettingsEditor
              value={formData[s.key] ?? ''}
              onChange={(v) => setFormData((prev) => ({ ...prev, [s.key]: v }))}
              onBlur={validateOnBlur(s.key)}
              error={errors[s.key] || undefined}
              minHeight={180}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
