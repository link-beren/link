import { useEffect, useState } from 'react';
import { getAuth } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * useMySchoolId — the signed-in user's school, live.
 *
 * Almost every list in the US product is scoped to one school, and that scope
 * is not optional: the security rules refuse to return a user, group or alert
 * from another school, and Firestore fails a query outright if any single
 * result is unreadable. A query missing its schoolId filter therefore returns
 * nothing at all rather than returning too much — which is safe, but looks
 * exactly like an empty database and is miserable to debug.
 *
 * Returns undefined while loading and null if the user has no school, so a
 * caller can tell "not ready yet" from "genuinely unaffiliated".
 *
 * Screens that also need the role should use useRoleGuard instead — it
 * returns the whole profile and avoids a second listener on the same document.
 */
export default function useMySchoolId() {
  const [schoolId, setSchoolId] = useState(undefined);

  useEffect(() => {
    const user = getAuth().currentUser;
    if (!user) {
      setSchoolId(null);
      return;
    }

    return onSnapshot(
      doc(db, 'users', user.uid),
      snap => setSchoolId(snap.data()?.schoolId || null),
      () => setSchoolId(null)
    );
  }, []);

  return schoolId;
}
