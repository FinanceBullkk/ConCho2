import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useSettings, useUpdateSettings } from '../hooks/useSettings';

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
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            ⚙️ Cấu hình hệ thống
          </h1>
          <p className="text-slate-400 text-sm mt-1">Quản lý các biến cấu hình dùng chung (JSON format)</p>
        </div>
        <button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="px-4 py-2 bg-primary hover:bg-primary text-white rounded-xl font-medium shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50"
        >
          {updateMutation.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {settings.map(s => (
          <div key={s._id} className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-white">{s.key}</h3>
                {s.description && <p className="text-sm text-slate-400 mt-1">{s.description}</p>}
              </div>
            </div>
            
            <textarea
              className="w-full h-64 bg-slate-900/50 border border-white/10 rounded-xl p-4 text-sm font-mono text-emerald-400 focus:outline-none focus:border-primary/50 transition-colors"
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
