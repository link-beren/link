import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';
import type { UserRole } from './types';

type ProtectedRouteProps = {
  allowedRoles: UserRole[];
  requireApprovedMentor?: boolean;
};

export function ProtectedRoute({
  allowedRoles,
  requireApprovedMentor = false,
}: ProtectedRouteProps) {
  const { status, profile } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <main className="page-shell">
        <h1>Loading...</h1>
      </main>
    );
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!profile?.role || !allowedRoles.includes(profile.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  if (
    profile.role === 'mentor' &&
    requireApprovedMentor &&
    profile.mentorStatus !== 'approved'
  ) {
    return <Navigate to="/mentor/pending" replace />;
  }

  return <Outlet />;
}
