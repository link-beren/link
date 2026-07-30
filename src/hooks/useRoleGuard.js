import { useEffect, useState } from 'react';
import { getAuth } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * useRoleGuard — מאזין ל-role בזמן אמת ומחזיר אם המשתמש מורשה.
 *
 * @param {string | string[]} allowedRoles
 * @returns {{ authorized: boolean | null, profile: object | null }}
 *   authorized: null = עדיין טוען, true = מורשה,
 *               false = לא מורשה — המסך מחזיר null ו-App.js ינתב מחדש
 *   profile:    מסמך המשתמש (כולל schoolId), או null בטעינה
 *
 * ה-profile מוחזר כי המסכים המוגבלים-לבית-ספר צריכים את schoolId כדי
 * לבנות את השאילתות שלהם, וההאזנה למסמך כבר קיימת כאן.
 *
 * אין קריאה ל-navigation.goBack() — App.js הוא זה שמנהל ניתוב לפי role.
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

    // מאזין בזמן אמת — אם role משתנה ב-Firestore, authorized מתעדכן מיד
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
        // אדמין מורשה בכל מסך, ללא קשר לתפקיד הנדרש
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
