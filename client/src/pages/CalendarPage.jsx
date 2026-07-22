import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Compatibility route only. Schedule and Attendance are owned by the dedicated
// English Operations workspace; old bookmarks land on the matching English tab.
export default function CalendarPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  if (user?.role === 'Participant') return <Navigate to="/english" replace />;
  if (user?.role === 'Teacher') return <Navigate to="/english-operations?tab=overview" replace />;

  const tab = searchParams.get('tab') === 'attendance' ? 'attendance' : 'schedule';
  return <Navigate to={`/english-operations?tab=${tab}`} replace />;
}
