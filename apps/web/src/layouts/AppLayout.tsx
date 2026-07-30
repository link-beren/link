import { NavLink, Outlet } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from '../auth/useAuth';
import { usePendingFriendRequestsCount } from '../friends/usePendingFriendRequestsCount';

type NavItem = {
  to: string;
  label: string;
  badge?: number;
};

function AppLayout({
  roleLabel,
  navItems,
}: {
  roleLabel: string;
  navItems: NavItem[];
}) {
  const { profile } = useAuth();

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">Link</div>
        <span className="role-chip">{roleLabel}</span>
        <nav className="nav" aria-label="Main navigation">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to}>
              {item.label}
              {!!item.badge && <span className="nav-badge">{item.badge}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="topbar-user">
          <span>{profile?.nickname || profile?.email || 'User'}</span>
          <button type="button" onClick={() => void signOut(auth)}>
            Sign out
          </button>
        </div>
      </header>
      <Outlet />
    </div>
  );
}

export function StudentLayout() {
  const pendingFriendRequests = usePendingFriendRequestsCount();

  return (
    <AppLayout
      roleLabel="Student"
      navItems={[
        { to: '/social', label: 'Social' },
        { to: '/mentoring', label: 'Peer Mentors' },
        { to: '/discover', label: 'Discover' },
        { to: '/friends', label: 'Friends', badge: pendingFriendRequests },
        { to: '/distress', label: 'SOS' },
        { to: '/profile', label: 'Profile' },
      ]}
    />
  );
}

export function MentorLayout() {
  const pendingFriendRequests = usePendingFriendRequestsCount();

  return (
    <AppLayout
      roleLabel="Peer Mentor"
      navItems={[
        { to: '/mentor', label: 'Home' },
        { to: '/mentor/chat', label: 'Mentees' },
        { to: '/mentor/hours', label: 'Hours' },
        { to: '/mentor/activity', label: 'Activity' },
        { to: '/mentor/reflection', label: 'Reflection' },
        { to: '/mentor/guide', label: 'Guide' },
        { to: '/social', label: 'Social' },
        { to: '/mentoring', label: 'Peer Mentors' },
        { to: '/discover', label: 'Discover' },
        { to: '/friends', label: 'Friends', badge: pendingFriendRequests },
        { to: '/profile', label: 'Profile' },
      ]}
    />
  );
}

export function SocialLayout() {
  const { profile } = useAuth();

  if (profile?.role === 'mentor') {
    return <MentorLayout />;
  }

  return <StudentLayout />;
}

export function StaffLayout() {
  return (
    <AppLayout
      roleLabel="Staff"
      navItems={[
        { to: '/school', label: 'School Portal' },
        { to: '/profile', label: 'Profile' },
      ]}
    />
  );
}

export function ProfileLayout() {
  const { profile } = useAuth();

  if (profile?.role === 'staff') {
    return <StaffLayout />;
  }

  return <SocialLayout />;
}
