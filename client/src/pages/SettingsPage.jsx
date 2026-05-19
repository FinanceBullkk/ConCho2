import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useSettings, useUpdateSettings } from '../hooks/useSettings';
import { Button } from '@/components/ui/button';
import { Spinner } from '../components/Spinner';

export default function SettingsPage() {
  const { data: settings = [], isLoading: loading } = useSettings();
  const updateMutation = useUpdateSettings();
  const [formData, setFormData] = useState({});

  // Sync formData when settings are loaded/refetched
  useEffect(() => {
    if (settings.length > 0) {
      const initial = {};
      settings.forEach(s => {
        initial[s.key] = JSON.stringify(s.value, null, 2);
      });
      setFormData(initial);
    }
  }, [settings]);

  const handleSave = async () => {
    try {
      const payload = [];
      for (const [key, strValue] of Object.entries(formData)) {
        try {
          const parsed = JSON.parse(strValue);
          payload.push({ key, value: parsed });
        } catch (e) {
          throw new Error(`Invalid JSON for setting: ${key}`);
        }
      }

      await updateMutation.mutateAsync(payload);
      toast.success('Settings saved successfully');
    } catch (error) {
      toast.error(error.message || 'Failed to save settings');
    }
  };

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Spinner size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-h1 text-foreground flex items-center gap-2">
            ⚙️ Cấu hình hệ thống
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Quản lý các biến cấu hình dùng chung (JSON format)</p>
        </div>
        <Button onClick={handleSave} disabled={updateMutation.isPending}>
          {updateMutation.isPending ? <><Spinner size={14} />Đang lưu…</> : 'Lưu thay đổi'}
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {settings.map(s => (
          <div key={s._id} className="bg-card border border-border rounded-lg p-6 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-foreground">{s.key}</h3>
                {s.description && <p className="text-sm text-muted-foreground mt-1">{s.description}</p>}
              </div>
            </div>

            <textarea
              className="w-full h-64 bg-background border border-input rounded-md p-4 text-sm font-mono text-success focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
              value={formData[s.key] || ''}
              onChange={(e) => setFormData({...formData, [s.key]: e.target.value})}
              spellCheck="false"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
