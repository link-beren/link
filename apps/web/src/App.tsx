import { Navigate, Route, Routes } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { useAuth } from './auth/useAuth';
import { Toast } from './components/ui';
import { subscribeForegroundMessages } from './lib/messaging';
import { FriendsPage } from './pages/FriendsPage';
import { DiscoverPage } from './pages/DiscoverPage';
import { DistressPage } from './pages/DistressPage';
import { ChatPage } from './pages/ChatPage';
import { MentorLayout, ProfileLayout, SocialLayout, StaffLayout } from './layouts/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { MoELoginPage } from './pages/MoELoginPage';
import { MentorActivityPage } from './pages/MentorActivityPage';
import { MentorGuidePage } from './pages/MentorGuidePage';
import { MentorHomePage } from './pages/MentorHomePage';
import { MentorHoursPage } from './pages/MentorHoursPage';
import { MentorPendingPage } from './pages/MentorPendingPage';
import { MentorReflectionPage } from './pages/MentorReflectionPage';
import { ProfilePage } from './pages/ProfilePage';
import { StaffPortalPage } from './pages/StaffPortalPage';
import { UnauthorizedPage } from './pages/UnauthorizedPage';
import { VolunteersPage } from './pages/VolunteersPage';

function PlaceholderPage({ title }: { title: string }) {
  return (
    <main className="page-shell">
      <h1>{title}</h1>
    </main>
  );
}

function HomeRedirect() {
  const { status, profile } = useAuth();

  if (status === 'loading') {
    return (
      <main className="page-shell">
        <h1>טוען...</h1>
      </main>
    );
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }

  if (profile?.role === 'staff') {
    return <Navigate to="/school" replace />;
  }

  if (profile?.role === 'student') {
    return <Navigate to="/social" replace />;
  }

  if (profile?.role === 'mentor') {
    return (
      <Navigate
        to={profile.mentorStatus === 'approved' ? '/mentor' : '/mentor/pending'}
        replace
      />
    );
  }

  return <Navigate to="/unauthorized" replace />;
}

export default function App() {
  const [notification, setNotification] = useState('');

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    void subscribeForegroundMessages((message) => {
      setNotification(message);
      window.setTimeout(() => setNotification(''), 5000);
    }).then((nextUnsubscribe) => {
      unsubscribe = nextUnsubscribe;
    });

    return () => unsubscribe?.();
  }, []);

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        דילוג לתוכן
      </a>
      {!!notification && <Toast>{notification}</Toast>}
      <div id="main-content">
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/login/moe" element={<MoELoginPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />

          <Route element={<ProtectedRoute allowedRoles={['mentor']} />}>
            <Route path="/mentor/pending" element={<MentorPendingPage />} />
          </Route>

          <Route
            element={
              <ProtectedRoute
                allowedRoles={['mentor']}
                requireApprovedMentor
              />
            }
          >
            <Route element={<MentorLayout />}>
              <Route path="/mentor" element={<MentorHomePage />} />
              <Route path="/mentor/chat" element={<ChatPage />} />
              <Route path="/mentor/chat/:chatId" element={<ChatPage />} />
              <Route path="/mentor/hours" element={<MentorHoursPage />} />
              <Route path="/mentor/activity" element={<MentorActivityPage />} />
              <Route path="/mentor/reflection" element={<MentorReflectionPage />} />
              <Route path="/mentor/guide" element={<MentorGuidePage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['staff']} />}>
            <Route element={<StaffLayout />}>
              <Route
                path="/school"
                element={<StaffPortalPage />}
              />
              <Route path="/school/chat/:chatId" element={<ChatPage />} />
            </Route>
          </Route>

          <Route
            element={
              <ProtectedRoute
                allowedRoles={['student', 'mentor']}
                requireApprovedMentor
              />
            }
          >
            <Route element={<SocialLayout />}>
              <Route
                path="/social"
                element={<ChatPage />}
              />
              <Route path="/social/:chatId" element={<ChatPage />} />
              <Route path="/mentoring" element={<VolunteersPage />} />
              <Route path="/discover" element={<DiscoverPage />} />
              <Route path="/friends" element={<FriendsPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['student']} />}>
            <Route element={<SocialLayout />}>
              <Route path="/distress" element={<DistressPage />} />
            </Route>
          </Route>

          <Route
            element={
              <ProtectedRoute
                allowedRoles={['student', 'mentor', 'staff']}
                requireApprovedMentor
              />
            }
          >
            <Route element={<ProfileLayout />}>
              <Route path="/profile" element={<ProfilePage />} />
            </Route>
          </Route>
        </Routes>
      </div>
    </div>
  );
}
