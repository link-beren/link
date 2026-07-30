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
        <nav className="nav" aria-label="ניווט ראשי">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to}>
              {item.label}
              {!!item.badge && <span className="nav-badge">{item.badge}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="topbar-user">
          <span>{profile?.nickname || profile?.email || 'משתמש/ת'}</span>
          <button type="button" onClick={() => void signOut(auth)}>
            התנתקות
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
      roleLabel="תלמיד/ה"
      navItems={[
        { to: '/social', label: 'רשת חברתית' },
        { to: '/mentoring', label: 'מתנדבים' },
        { to: '/discover', label: 'גלה' },
        { to: '/friends', label: 'חברים', badge: pendingFriendRequests },
        { to: '/distress', label: 'SOS' },
        { to: '/profile', label: 'פרופיל' },
      ]}
    />
  );
}

export function MentorLayout() {
  const pendingFriendRequests = usePendingFriendRequestsCount();

  return (
    <AppLayout
      roleLabel="חונך/ת"
      navItems={[
        { to: '/mentor', label: 'בית' },
        { to: '/mentor/chat', label: 'חניכים' },
        { to: '/mentor/hours', label: 'שעות' },
        { to: '/mentor/activity', label: 'פעילות' },
        { to: '/mentor/reflection', label: 'רפלקציה' },
        { to: '/mentor/guide', label: 'מדריך' },
        { to: '/social', label: 'רשת חברתית' },
        { to: '/mentoring', label: 'מתנדבים' },
        { to: '/discover', label: 'גלה' },
        { to: '/friends', label: 'חברים', badge: pendingFriendRequests },
        { to: '/profile', label: 'פרופיל' },
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
      roleLabel="צוות"
      navItems={[
        { to: '/school', label: 'פורטל בית ספר' },
        { to: '/profile', label: 'פרופיל' },
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
