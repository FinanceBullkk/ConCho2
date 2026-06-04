import { useState, useEffect, useMemo } from 'react';
import { useAttendanceAnalyticsByEmployee, useAttendanceAnalyticsByTeam, useAttendanceAnalyticsByClass } from '../hooks/useAttendance';
import { useClasses } from '../hooks/useClasses';
import { useExportStats, useDownloadAttendance } from '../hooks/useExport';
import { Button } from '@/components/ui/button';
import { Spinner } from '../components/Spinner';
import { DataTable } from '../components/DataTable';

export default function AttendanceDashboardPage() {
  const [activeTab, setActiveTab] = useState('employee'); // employee, team, class
  const [selectedClass, setSelectedClass] = useState('');

  // ── Analytics queries (enabled based on active tab) ──────
  const { data: employeeData = [], isLoading: loadingEmployee } = useAttendanceAnalyticsByEmployee({}, { enabled: activeTab === 'employee' });
  const { data: teamData = [], isLoading: loadingTeam } = useAttendanceAnalyticsByTeam({}, { enabled: activeTab === 'team' });
  const { data: classesData = [] } = useClasses({}, { enabled: activeTab === 'class' });
  const { data: classAnalytics, isLoading: loadingClass } = useAttendanceAnalyticsByClass(
    { classId: selectedClass || classesData?.[0]?._id },
    { enabled: activeTab === 'class' && !!(selectedClass || classesData?.[0]?._id) }
  );

  // Auto-select first class when classes load
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (activeTab === 'class' && !selectedClass && classesData?.length > 0) {
      setSelectedClass(classesData[0]._id);
    }
  }, [activeTab, classesData, selectedClass]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const classes = classesData || [];
  const data = activeTab === 'employee' ? employeeData
             : activeTab === 'team' ? teamData
             : classAnalytics;
  const loading = activeTab === 'employee' ? loadingEmployee
                : activeTab === 'team' ? loadingTeam
                : loadingClass;

  useEffect(() => { document.title = 'TMS — Analytics'; }, []);

  // ── Export state ─────────────────────────────────────────
  const { data: exportStats = { pending: 0, exported: 0 } } = useExportStats();
  const downloadMutation = useDownloadAttendance();
  const [exportMsg, setExportMsg] = useState('');

  const handleExport = async () => {
    setExportMsg('');
    try {
      const res = await downloadMutation.mutateAsync();
      const disposition = res.headers['content-disposition'];
      let filename = 'TMS_Attendance_Export.xlsx';
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match) filename = match[1];
      }
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
      setExportMsg(`✅ Downloaded ${filename} successfully!`);
    } catch (err) {
      const msg = err.response?.status === 404
        ? 'No records to export.'
        : 'Failed to download the file. Please try again.';
      setExportMsg(`❌ ${msg}`);
    }
  };

  const renderProgressBar = (rate) => {
    let color = 'bg-destructive';
    if (rate >= 90) color = 'bg-success';
    else if (rate >= 75) color = 'bg-warning';

    return (
      <div className="w-full h-2 bg-muted rounded-full overflow-hidden mt-1">
        <div className={`h-full ${color} transition-all`} style={{ width: `${rate}%` }} />
      </div>
    );
  };

  const employeeColumns = useMemo(() => [
    {
      key: 'name',
      header: 'Employee',
      render: (row) => (
        <div>
          <div className="font-semibold text-foreground">{row.name}</div>
          <div className="text-xs text-subtle-foreground">{row.empCode} · {row.department}</div>
        </div>
      ),
    },
    { key: 'totalSessions', header: 'Total' },
    { key: 'present',  header: 'P',  headerCls: 'text-success' },
    { key: 'absent',   header: 'A',  headerCls: 'text-destructive' },
    { key: 'late',     header: 'L',  headerCls: 'text-warning' },
    { key: 'excused',  header: 'EL', headerCls: 'text-info' },
    {
      key: 'attendanceRate',
      header: 'Rate',
      cellCls: 'w-44',
      render: (row) => (
        <div>
          <span className="text-xs text-muted-foreground">{row.attendanceRate}%</span>
          {renderProgressBar(row.attendanceRate)}
        </div>
      ),
    },
  ], []);

  return (
    <div className="space-y-6 ">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-h1 text-foreground">Attendance Analytics</h1>
          <p className="text-muted-foreground mt-1">Track participation across employees, teams, and classes</p>
        </div>
      </div>

      {/* ── Export Banner ──────────────────────────────────── */}
      <div className="bg-card border border-border rounded-lg p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-md bg-success/10 flex items-center justify-center text-2xl">
            📥
          </div>
          <div>
            <h3 className="text-foreground font-semibold">Attendance Data Export (HR Export)</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {exportStats.pending > 0 ? (
                <><span className="text-success font-bold">{exportStats.pending}</span> new records not yet exported</>
              ) : (
                <>All exported · <span className="text-subtle-foreground">{exportStats.exported} records processed</span></>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {exportMsg && (
            <span className={`text-sm ${exportMsg.startsWith('✅') ? 'text-success' : 'text-destructive'}`}>
              {exportMsg}
            </span>
          )}
          <Button
            onClick={handleExport}
            disabled={downloadMutation.isPending || exportStats.pending === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-md font-semibold text-sm transition-all
              bg-success hover:bg-success/90 text-success-foreground
              disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-success
              whitespace-nowrap w-full sm:w-auto justify-center"
          >
            {downloadMutation.isPending ? (
              <>
                <Spinner size={16} />
                Downloading...
              </>
            ) : (
              <>
                <span>📄</span>
                Download Excel ({exportStats.pending})
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-px">
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
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>



      {loading ? (
        <div className="flex items-center justify-center py-20"><Spinner size={32} /></div>
      ) : (
        <div className="space-y-6">

          {/* Employee Tab */}
          {activeTab === 'employee' && (
            <DataTable
              columns={employeeColumns}
              data={Array.isArray(data) ? data : []}
              rowKey="empCode"
              emptyTitle="No attendance data"
              emptyMessage="No records found."
            />
          )}

          {/* Team Tab */}
          {activeTab === 'team' && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {Array.isArray(data) && data.map(team => (
                <div key={team._id} className="bg-card border border-border rounded-lg p-6 hover:border-border transition-all">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-bold text-lg text-foreground">{team.name}</h3>
                      <p className="text-sm text-muted-foreground">{team.memberCount} members</p>
                    </div>
                    <div className="text-2xl font-bold text-primary">{team.stats?.attendanceRate ?? 0}%</div>
                  </div>
                  {renderProgressBar(team.stats?.attendanceRate ?? 0)}
                  <div className="grid grid-cols-4 gap-2 mt-6 text-center text-sm">
                    <div className="bg-success/10 rounded-lg p-2">
                      <div className="text-success font-bold">{team.stats?.present ?? 0}</div>
                      <div className="text-xs text-subtle-foreground">P</div>
                    </div>
                    <div className="bg-destructive/10 rounded-lg p-2">
                      <div className="text-destructive font-bold">{team.stats?.absent ?? 0}</div>
                      <div className="text-xs text-subtle-foreground">A</div>
                    </div>
                    <div className="bg-warning/10 rounded-lg p-2">
                      <div className="text-warning font-bold">{team.stats?.late ?? 0}</div>
                      <div className="text-xs text-subtle-foreground">L</div>
                    </div>
                    <div className="bg-info/10 rounded-lg p-2">
                      <div className="text-info font-bold">{team.stats?.excused ?? 0}</div>
                      <div className="text-xs text-subtle-foreground">EL</div>
                    </div>
                  </div>
                </div>
              ))}
              {(!Array.isArray(data) || data.length === 0) && <div className="text-subtle-foreground">No teams found</div>}
            </div>
          )}

          {/* Class Tab */}
          {activeTab === 'class' && data?.schedules && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <label className="text-sm text-muted-foreground">Select Class:</label>
                <select
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  className="px-4 py-2 rounded-md bg-accent border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {classes.map(c => (
                    <option key={c._id} value={c._id}>{c.classCode} - {c.courseName}</option>
                  ))}
                </select>
              </div>

              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-accent border-b border-border text-muted-foreground text-sm">
                        <th className="p-4 font-semibold sticky left-0 bg-card border-r border-border z-10 w-48">Student</th>
                        <th className="p-4 font-semibold w-24">Rate</th>
                        {data.schedules.map((s, i) => (
                          <th key={s._id} className="p-4 font-semibold min-w-[80px] text-center border-l border-border">
                            <div className="text-xs text-muted-foreground">S{i+1}</div>
                            <div className="text-xs">{new Date(s.startTime).toLocaleDateString('en', { month: 'numeric', day: 'numeric' })}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-muted-foreground">
                      {data.roster.map((row, idx) => (
                        <tr key={idx} className="hover:bg-accent transition-colors">
                          <td className="p-4 sticky left-0 bg-card border-r border-border z-10">
                            <div className="font-semibold text-foreground whitespace-nowrap">{row.user.name}</div>
                            <div className="text-xs text-subtle-foreground">{row.user.empCode}</div>
                          </td>
                          <td className="p-4 font-bold text-primary">{row.attendanceRate}%</td>
                          {data.schedules.map(s => {
                            const status = row.sessions[s._id];
                            let colors = 'text-subtle-foreground';
                            if (status === 'P') colors = 'text-success bg-success/10';
                            if (status === 'A') colors = 'text-destructive bg-destructive/10';
                            if (status === 'L') colors = 'text-warning bg-warning/10';
                            if (status === 'EL') colors = 'text-info bg-info/10';

                            return (
                              <td key={s._id} className="p-2 border-l border-border text-center">
                                {status ? (
                                  <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg font-bold text-sm ${colors}`}>
                                    {status}
                                  </span>
                                ) : (
                                  <span className="text-subtle-foreground">-</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      {data.roster.length === 0 && (
                        <tr><td colSpan={data.schedules.length + 2} className="p-4 text-center text-subtle-foreground">No attendance data found for this class</td></tr>
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
