import { useEffect, useState } from 'react';
import { getAuth } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * useRoleGuard — listens to role in real time and returns whether the user is authorized.
 *
 * @param {string | string[]} allowedRoles
 * @returns {{ authorized: boolean | null, profile: object | null }}
 *   authorized: null = still loading, true = authorized,
 *               false = not authorized — the screen returns null and App.js re-routes
 *   profile:    the user document (including schoolId), or null while loading
 *
 * The profile is returned because the school-scoped screens need schoolId in order
 * to build their queries, and the listener on the document already lives here.
 *
 * There is no call to navigation.goBack() — App.js is what handles role-based routing.
 */
export default function useRoleGuard(allowedRoles) {
  const [authorized, setAuthorized] = useState(null);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    const user = getAuth().currentUser;
    if (!user) {
      setAuthorized(false);
      return;
    }

    const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    // Real-time listener — if role changes in Firestore, authorized updates immediately
    const unsub = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        if (!snap.exists()) {
          setAuthorized(false);
          setProfile(null);
          return;
        }
        const data = snap.data() || {};
        setProfile({ uid: user.uid, ...data });
        // A system admin is authorized on every screen, regardless of the required role
        setAuthorized(data.role === 'admin' || allowed.includes(data.role));
      },
      () => {
        setAuthorized(false);
        setProfile(null);
      }
    );

    return unsub;
  }, []);

  return { authorized, profile };
}
