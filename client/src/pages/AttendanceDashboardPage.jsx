import { useState, useEffect } from 'react';
import { attendanceAPI, classesAPI, exportAPI } from '../api/api';

export default function AttendanceDashboardPage() {
  const [activeTab, setActiveTab] = useState('employee'); // employee, team, class
  const [data, setData] = useState([]);
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ── Export state ─────────────────────────────────────────
  const [exportStats, setExportStats] = useState({ pending: 0, exported: 0 });
  const [isExporting, setIsExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError('');
    setData([]);  // Reset data to prevent stale renders during tab switch
    try {
      if (activeTab === 'employee') {
        const res = await attendanceAPI.getAnalyticsByEmployee();
        setData(res.data.data);
      } else if (activeTab === 'team') {
        const res = await attendanceAPI.getAnalyticsByTeam();
        setData(res.data.data);
      } else if (activeTab === 'class') {
        if (!selectedClass) {
          const cRes = await classesAPI.getAll();
          setClasses(cRes.data.data);
          if (cRes.data.data.length > 0) {
            setSelectedClass(cRes.data.data[0]._id);
          } else {
            setData(null);
            setLoading(false);
            return;
          }
        }
        
        const targetClassId = selectedClass || classes[0]?._id;
        if (targetClassId) {
          const res = await attendanceAPI.getAnalyticsByClass({ classId: targetClassId });
          setData(res.data.data);
        }
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load analytics data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab, selectedClass]);
  useEffect(() => { document.title = 'TMS — Analytics'; }, []);

  // ── Load export stats on mount ──────────────────────────
  const loadExportStats = async () => {
    try {
      const res = await exportAPI.getStats();
      setExportStats(res.data.data);
    } catch { /* non-critical */ }
  };
  useEffect(() => { loadExportStats(); }, []);

  // ── Export handler: download Excel via blob ─────────────
  const handleExport = async () => {
    setIsExporting(true);
    setExportMsg('');
    try {
      const res = await exportAPI.downloadAttendance();
      // Extract filename from content-disposition header or use default
      const disposition = res.headers['content-disposition'];
      let filename = 'TMS_Attendance_Export.xlsx';
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match) filename = match[1];
      }
      // Create a temporary <a> element to trigger browser download
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setExportMsg(`✅ Đã tải ${filename} thành công!`);
      loadExportStats(); // Refresh stats (pending → 0)
    } catch (err) {
      const msg = err.response?.status === 404
        ? 'Không có bản ghi nào để xuất.'
        : 'Lỗi khi tải file. Vui lòng thử lại.';
      setExportMsg(`❌ ${msg}`);
    } finally {
      setIsExporting(false);
    }
  };

  const renderProgressBar = (rate) => {
    let color = 'bg-red-500';
    if (rate >= 90) color = 'bg-emerald-500';
    else if (rate >= 75) color = 'bg-amber-500';

    return (
      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden mt-1">
        <div className={`h-full ${color} transition-all`} style={{ width: `${rate}%` }} />
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">📈 Attendance Analytics</h1>
          <p className="text-slate-400 mt-1">Track participation across employees, teams, and classes</p>
        </div>
      </div>

      {/* ── Export Banner ──────────────────────────────────── */}
      <div className="glass rounded-2xl p-5 border border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-2xl">
            📥
          </div>
          <div>
            <h3 className="text-white font-semibold">Xuất Dữ Liệu Điểm Danh (HR Export)</h3>
            <p className="text-sm text-slate-400 mt-0.5">
              {exportStats.pending > 0 ? (
                <>Có <span className="text-emerald-400 font-bold">{exportStats.pending}</span> bản ghi mới chưa xuất</>
              ) : (
                <>Tất cả đã được xuất · <span className="text-slate-500">{exportStats.exported} bản ghi đã xử lý</span></>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {exportMsg && (
            <span className={`text-sm ${exportMsg.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>
              {exportMsg}
            </span>
          )}
          <button
            onClick={handleExport}
            disabled={isExporting || exportStats.pending === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all
              bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/20
              disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-emerald-500
              whitespace-nowrap w-full sm:w-auto justify-center"
          >
            {isExporting ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Đang tải...
              </>
            ) : (
              <>
                <span>📄</span>
                Tải Excel ({exportStats.pending})
              </>
            )}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10 pb-px">
        {[
          { id: 'employee', label: 'By Employee' },
          { id: 'team', label: 'By Team' },
          { id: 'class', label: 'By Class' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
              activeTab === tab.id 
                ? 'border-primary-400 text-primary-300 bg-primary-500/5' 
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-6">
          
          {/* Employee Tab */}
          {activeTab === 'employee' && (
            <div className="glass rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/10 text-slate-300 text-sm">
                      <th className="p-4 font-semibold">Employee</th>
                      <th className="p-4 font-semibold">Total Sessions</th>
                      <th className="p-4 font-semibold text-emerald-400">P</th>
                      <th className="p-4 font-semibold text-red-400">A</th>
                      <th className="p-4 font-semibold text-amber-400">L</th>
                      <th className="p-4 font-semibold text-blue-400">EL</th>
                      <th className="p-4 font-semibold">Attendance Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-300">
                    {Array.isArray(data) && data.map((row, idx) => (
                      <tr key={idx} className="hover:bg-white/5 transition-colors">
                        <td className="p-4">
                          <div className="font-semibold text-white">{row.name}</div>
                          <div className="text-xs text-slate-500">{row.empCode} • {row.department}</div>
                        </td>
                        <td className="p-4">{row.totalSessions}</td>
                        <td className="p-4">{row.present}</td>
                        <td className="p-4">{row.absent}</td>
                        <td className="p-4">{row.late}</td>
                        <td className="p-4">{row.excused}</td>
                        <td className="p-4 w-48">
                          <div className="flex justify-between text-xs mb-1">
                            <span>{row.attendanceRate}%</span>
                          </div>
                          {renderProgressBar(row.attendanceRate)}
                        </td>
                      </tr>
                    ))}
                    {(!Array.isArray(data) || data.length === 0) && (
                      <tr><td colSpan="7" className="p-4 text-center text-slate-500">No data found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Team Tab */}
          {activeTab === 'team' && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {Array.isArray(data) && data.map(team => (
                <div key={team._id} className="glass rounded-2xl p-6 border border-white/5 hover:border-white/10 transition-all">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-bold text-lg text-white">{team.name}</h3>
                      <p className="text-sm text-slate-400">{team.memberCount} members</p>
                    </div>
                    <div className="text-2xl font-bold text-primary-300">{team.stats?.attendanceRate ?? 0}%</div>
                  </div>
                  {renderProgressBar(team.stats?.attendanceRate ?? 0)}
                  <div className="grid grid-cols-4 gap-2 mt-6 text-center text-sm">
                    <div className="bg-emerald-500/10 rounded-lg p-2">
                      <div className="text-emerald-400 font-bold">{team.stats?.present ?? 0}</div>
                      <div className="text-xs text-slate-500">P</div>
                    </div>
                    <div className="bg-red-500/10 rounded-lg p-2">
                      <div className="text-red-400 font-bold">{team.stats?.absent ?? 0}</div>
                      <div className="text-xs text-slate-500">A</div>
                    </div>
                    <div className="bg-amber-500/10 rounded-lg p-2">
                      <div className="text-amber-400 font-bold">{team.stats?.late ?? 0}</div>
                      <div className="text-xs text-slate-500">L</div>
                    </div>
                    <div className="bg-blue-500/10 rounded-lg p-2">
                      <div className="text-blue-400 font-bold">{team.stats?.excused ?? 0}</div>
                      <div className="text-xs text-slate-500">EL</div>
                    </div>
                  </div>
                </div>
              ))}
              {(!Array.isArray(data) || data.length === 0) && <div className="text-slate-500">No teams found</div>}
            </div>
          )}

          {/* Class Tab */}
          {activeTab === 'class' && data?.schedules && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <label className="text-sm text-slate-300">Select Class:</label>
                <select 
                  value={selectedClass} 
                  onChange={(e) => setSelectedClass(e.target.value)}
                  className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                >
                  {classes.map(c => (
                    <option key={c._id} value={c._id} className="bg-slate-800">{c.classCode} - {c.courseName}</option>
                  ))}
                </select>
              </div>

              <div className="glass rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-white/5 border-b border-white/10 text-slate-300 text-sm">
                        <th className="p-4 font-semibold sticky left-0 bg-slate-900/90 backdrop-blur-sm border-r border-white/10 z-10 w-48">Student</th>
                        <th className="p-4 font-semibold w-24">Rate</th>
                        {data.schedules.map((s, i) => (
                          <th key={s._id} className="p-4 font-semibold min-w-[80px] text-center border-l border-white/5">
                            <div className="text-xs text-slate-400">S{i+1}</div>
                            <div className="text-xs">{new Date(s.startTime).toLocaleDateString('en', { month: 'numeric', day: 'numeric' })}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-300">
                      {data.roster.map((row, idx) => (
                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                          <td className="p-4 sticky left-0 bg-slate-900/90 backdrop-blur-sm border-r border-white/10 z-10">
                            <div className="font-semibold text-white whitespace-nowrap">{row.user.name}</div>
                            <div className="text-xs text-slate-500">{row.user.empCode}</div>
                          </td>
                          <td className="p-4 font-bold text-primary-300">{row.attendanceRate}%</td>
                          {data.schedules.map(s => {
                            const status = row.sessions[s._id];
                            let colors = 'text-slate-600';
                            if (status === 'P') colors = 'text-emerald-400 bg-emerald-400/10';
                            if (status === 'A') colors = 'text-red-400 bg-red-400/10';
                            if (status === 'L') colors = 'text-amber-400 bg-amber-400/10';
                            if (status === 'EL') colors = 'text-blue-400 bg-blue-400/10';
                            
                            return (
                              <td key={s._id} className="p-2 border-l border-white/5 text-center">
                                {status ? (
                                  <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg font-bold text-sm ${colors}`}>
                                    {status}
                                  </span>
                                ) : (
                                  <span className="text-slate-600">-</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      {data.roster.length === 0 && (
                        <tr><td colSpan={data.schedules.length + 2} className="p-4 text-center text-slate-500">No attendance data found for this class</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
