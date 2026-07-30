import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import {
  createContext,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { auth, authPersistenceReady, db } from '../lib/firebase';
import type { AuthState, MentorStatus, UserProfile, UserRole } from './types';

export const AuthContext = createContext<AuthState | null>(null);

function isUserRole(value: unknown): value is UserRole {
  // 'admin' נכלל — בלעדיו הפרופיל של אדמין חוזר בלי role והניתוב נשבר
  return (
    value === 'student' ||
    value === 'mentor' ||
    value === 'staff' ||
    value === 'admin'
  );
}

function isMentorStatus(value: unknown): value is MentorStatus {
  return value === 'pending' || value === 'approved' || value === 'rejected';
}

async function loadUserProfile(uid: string): Promise<Partial<UserProfile>> {
  const userDoc = await getDoc(doc(db, 'users', uid));

  if (!userDoc.exists()) {
    return {};
  }

  const data = userDoc.data();

  return {
    nickname: typeof data.nickname === 'string' ? data.nickname : undefined,
    role: isUserRole(data.role) ? data.role : undefined,
    mentorStatus: isMentorStatus(data.mentorStatus)
      ? data.mentorStatus
      : undefined,
    schoolId: typeof data.schoolId === 'string' ? data.schoolId : undefined,
    schoolName:
      typeof data.schoolName === 'string' ? data.schoolName : undefined,
    classId: typeof data.classId === 'string' ? data.classId : undefined,
    className: typeof data.className === 'string' ? data.className : undefined,
    grade: typeof data.grade === 'string' ? data.grade : undefined,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    status: 'loading',
    user: null,
    profile: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    async function subscribe() {
      try {
        await authPersistenceReady;
      } catch (error) {
        if (!cancelled) {
          setAuthState({
            status: 'unauthenticated',
            user: null,
            profile: null,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to initialize Firebase Auth persistence.',
          });
        }
        return;
      }

      unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (!user) {
          if (!cancelled) {
            setAuthState({
              status: 'unauthenticated',
              user: null,
              profile: null,
              error: null,
            });
          }
          return;
        }

        try {
          const token = await user.getIdTokenResult();
          const firestoreProfile = await loadUserProfile(user.uid);
          const role = isUserRole(token.claims.role)
            ? token.claims.role
            : firestoreProfile.role;
          const mentorStatus = isMentorStatus(token.claims.mentorStatus)
            ? token.claims.mentorStatus
            : firestoreProfile.mentorStatus;

          if (!cancelled) {
            setAuthState({
              status: 'authenticated',
              user,
              profile: {
                uid: user.uid,
                email: user.email,
                ...firestoreProfile,
                role,
                mentorStatus,
              },
              error: null,
            });
          }
        } catch (error) {
          if (!cancelled) {
            setAuthState({
              status: 'authenticated',
              user,
              profile: {
                uid: user.uid,
                email: user.email,
              },
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to load user profile.',
            });
          }
        }
      });
    }

    void subscribe();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const value = useMemo(() => authState, [authState]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
