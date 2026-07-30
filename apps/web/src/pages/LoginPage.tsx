import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { collection, doc, onSnapshot, orderBy, query, setDoc, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import type { SignupRole } from '../auth/types';
import { auth, db, functions } from '../lib/firebase';
import { Button, Card } from '../components/ui';

type ClassOption = {
  id: string;
  name: string;
};

type SchoolOption = {
  id: string;
  name: string;
  city?: string;
};

// שכבות הגיל של תלמידים — זהות לרשימה שבאפליקציית המובייל
const GRADES = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י', 'יא', 'יב'];

type LocationState = {
  from?: {
    pathname?: string;
  };
};

const savedEmailKey = 'link_web_saved_email';

function getRoleLabel(role: SignupRole) {
  if (role === 'student') return 'תלמיד/ה';
  if (role === 'mentor') return 'מתנדב/ת';
  return 'צוות בית ספר';
}

export function LoginPage() {
  const { status, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as LocationState | null;
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [role, setRole] = useState<SignupRole>('student');
  const [email, setEmail] = useState(() => localStorage.getItem(savedEmailKey) || '');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [staffCode, setStaffCode] = useState('');
  const [classId, setClassId] = useState('');
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [schoolId, setSchoolId] = useState('');
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [grade, setGrade] = useState('');
  const [rememberMe, setRememberMe] = useState(() => !!localStorage.getItem(savedEmailKey));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // רשימת בתי הספר הפעילים — נדרשת בטופס ההרשמה לפני אימות, ולכן schools
  // פתוח לקריאה. הקוד של כל בית ספר יושב בתת-אוסף פרטי ולא נחשף כאן.
  useEffect(() => {
    const schoolsQuery = query(
      collection(db, 'schools'),
      where('active', '==', true),
      orderBy('name'),
    );

    return onSnapshot(
      schoolsQuery,
      (snapshot) => {
        setSchools(
          snapshot.docs.map((schoolDoc) => ({
            id: schoolDoc.id,
            name:
              typeof schoolDoc.data().name === 'string'
                ? schoolDoc.data().name
                : schoolDoc.id,
            city:
              typeof schoolDoc.data().city === 'string'
                ? schoolDoc.data().city
                : undefined,
          })),
        );
      },
      () => setSchools([]),
    );
  }, []);

  // הכיתות נטענות רק אחרי בחירת בית ספר, ומסוננות אליו
  useEffect(() => {
    if (!schoolId) {
      setClasses([]);
      return;
    }

    const classesQuery = query(
      collection(db, 'classes'),
      where('schoolId', '==', schoolId),
      orderBy('name'),
    );

    return onSnapshot(
      classesQuery,
      (snapshot) => {
        setClasses(
          snapshot.docs.map((classDoc) => ({
            id: classDoc.id,
            name:
              typeof classDoc.data().name === 'string'
                ? classDoc.data().name
                : classDoc.id,
          })),
        );
      },
      () => setClasses([]),
    );
  }, [schoolId]);

  const selectedClass = useMemo(
    () => classes.find((classOption) => classOption.id === classId),
    [classId, classes],
  );

  if (status === 'authenticated') {
    if (locationState?.from?.pathname) {
      return <Navigate to={locationState.from.pathname} replace />;
    }

    if (profile?.role === 'staff') return <Navigate to="/school" replace />;
    if (profile?.role === 'mentor') {
      return (
        <Navigate
          to={profile.mentorStatus === 'approved' ? '/mentor' : '/mentor/pending'}
          replace
        />
      );
    }
    return <Navigate to="/social" replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('אנא מלא/י אימייל וסיסמה.');
      return;
    }

    if (mode === 'register' && (role === 'student' || role === 'mentor')) {
      if (!nickname.trim()) {
        setError('אנא בחר/י כינוי.');
        return;
      }
    }

    if (mode === 'register' && role === 'student' && !grade) {
      setError('אנא בחר/י כיתה.');
      return;
    }

    if (mode === 'register' && role === 'mentor') {
      if (!schoolId) {
        setError('אנא בחר/י בית ספר.');
        return;
      }
      if (!selectedClass) {
        setError('אנא בחר/י כיתה.');
        return;
      }
    }

    if (mode === 'register' && role === 'staff' && !staffCode.trim()) {
      setError('אנא הכנס/י קוד צוות.');
      return;
    }
    // אין יותר קוד קבוע בלקוח — לכל בית ספר קוד משלו, שמאומת בשרת
    // (registerStaffWithCode) כדי שלא ניתן יהיה לחלץ אותו מקוד הצד-לקוח.

    setLoading(true);

    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password,
        );
        const resolvedNickname = nickname.trim() || email.split('@')[0];

        if (role === 'staff') {
          // מסמך הצוות נוצר בשרת: הקוד מאומת מול schoolCodes ומשויך לבית הספר
          // הנכון. יצירת staff מהלקוח חסומה בחוקים, אחרת אפשר היה לזייף schoolId.
          try {
            await httpsCallable(functions, 'registerStaffWithCode')({
              code: staffCode.trim(),
              nickname: resolvedNickname,
            });
            // הפונקציה מציבה claim schoolId. בלי רענון מפורש הטוקן שבידינו
            // עדיין בלי ה-claim, וכל שאילתה מוגבלת-בית-ספר תיפול על הרשאות.
            await userCredential.user.getIdToken(true);
          } catch (codeError) {
            // הקוד שגוי — מוחקים את חשבון ה-Auth שנוצר עכשיו, אחרת יישאר חשבון
            // בלי מסמך משתמש שגם חוסם הרשמה חוזרת עם אותו אימייל
            try {
              await userCredential.user.delete();
            } catch {
              /* ignore */
            }
            setError(
              codeError instanceof Error && codeError.message
                ? codeError.message
                : 'קוד הצוות שגוי.',
            );
            setLoading(false);
            return;
          }
        } else {
          await setDoc(doc(db, 'users', userCredential.user.uid), {
            email: email.trim(),
            nickname: resolvedNickname,
            role,
            createdAt: new Date().toISOString(),
            // תלמיד גלובלי — שכבת גיל בלבד, בלי שיוך לבית ספר או לכיתה
            ...(role === 'student' ? { grade, className: `כיתה ${grade}` } : {}),
            ...(role === 'mentor'
              ? {
                  schoolId,
                  classId: selectedClass?.id,
                  className: selectedClass?.name,
                  mentorStatus: 'pending',
                }
              : {}),
          });
        }
      }

      if (rememberMe) {
        localStorage.setItem(savedEmailKey, email.trim());
      } else {
        localStorage.removeItem(savedEmailKey);
      }

      navigate('/', { replace: true });
    } catch (caughtError) {
      const code =
        typeof caughtError === 'object' &&
        caughtError &&
        'code' in caughtError &&
        typeof caughtError.code === 'string'
          ? caughtError.code
          : '';

      if (code === 'auth/email-already-in-use') setError('האימייל כבר בשימוש.');
      else if (code === 'auth/invalid-email') setError('האימייל לא תקין.');
      else if (code === 'auth/weak-password') setError('הסיסמה חלשה מדי.');
      else if (code === 'auth/invalid-credential') setError('פרטי ההתחברות שגויים.');
      else setError('לא ניתן להשלים את הפעולה כרגע.');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      setError('אנא הזן/י אימייל לפני איפוס סיסמה.');
      return;
    }

    await sendPasswordResetEmail(auth, email.trim());
    setError('אם קיים חשבון עם האימייל הזה, נשלח אליו קישור איפוס.');
  }

  return (
    <main className="login-page">
      <Card className="login-card">
        <div className="login-head">
          <div className="brand login-brand">Link</div>
          <h1>{mode === 'login' ? 'כניסה לחשבון' : 'יצירת חשבון'}</h1>
        </div>

        <div className="role-selector" aria-label="בחירת תפקיד">
          {(['student', 'mentor', 'staff'] as SignupRole[]).map((roleOption) => (
            <button
              key={roleOption}
              type="button"
              className={role === roleOption ? 'role-option role-option-active' : 'role-option'}
              onClick={() => setRole(roleOption)}
            >
              {getRoleLabel(roleOption)}
            </button>
          ))}
        </div>

        <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
          <label>
            אימייל
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </label>
          <label>
            סיסמה
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>

          {mode === 'register' && (role === 'student' || role === 'mentor') && (
            <label>
              כינוי
              <input
                type="text"
                value={nickname}
                maxLength={20}
                onChange={(event) => setNickname(event.target.value)}
              />
            </label>
          )}

          {mode === 'register' && role === 'student' && (
            <label>
              כיתה
              <select value={grade} onChange={(event) => setGrade(event.target.value)}>
                <option value="">בחר/י כיתה</option>
                {GRADES.map((gradeOption) => (
                  <option key={gradeOption} value={gradeOption}>
                    כיתה {gradeOption}
                  </option>
                ))}
              </select>
            </label>
          )}

          {mode === 'register' && role === 'mentor' && (
            <>
              <label>
                בית ספר
                <select
                  value={schoolId}
                  onChange={(event) => {
                    setSchoolId(event.target.value);
                    // החלפת בית ספר מאפסת כיתה שנבחרה קודם, אחרת היא תישאר
                    // כיתה של בית ספר אחר
                    setClassId('');
                  }}
                >
                  <option value="">בחר/י בית ספר</option>
                  {schools.map((schoolOption) => (
                    <option key={schoolOption.id} value={schoolOption.id}>
                      {schoolOption.city
                        ? `${schoolOption.name} — ${schoolOption.city}`
                        : schoolOption.name}
                    </option>
                  ))}
                </select>
              </label>
              {!!schoolId && (
                <label>
                  כיתה
                  <select value={classId} onChange={(event) => setClassId(event.target.value)}>
                    <option value="">בחר/י כיתה</option>
                    {classes.map((classOption) => (
                      <option key={classOption.id} value={classOption.id}>
                        {classOption.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {!!schoolId && classes.length === 0 && (
                <div className="form-message">
                  אין עדיין כיתות פעילות בבית הספר הזה — יש לפנות למורה/רכזת.
                </div>
              )}
            </>
          )}

          {mode === 'register' && role === 'staff' && (
            <label>
              קוד צוות
              <input
                type="password"
                value={staffCode}
                onChange={(event) => setStaffCode(event.target.value)}
              />
            </label>
          )}

          <label className="remember-row">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
            />
            זכור את האימייל במכשיר הזה
          </label>

          {error && <div className="form-message">{error}</div>}

          <Button type="submit" disabled={loading}>
            {loading ? 'טוען...' : mode === 'login' ? 'כניסה' : 'הרשמה'}
          </Button>
        </form>

        <div className="auth-footer">
          {mode === 'login' && (
            <button type="button" onClick={() => void handleForgotPassword()}>
              שכחתי סיסמה
            </button>
          )}
          <button
            type="button"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'login' ? 'אין לך חשבון? הרשמה' : 'יש לך חשבון? כניסה'}
          </button>
        </div>

        <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: 11, color: 'var(--color-text-subtle)', textAlign: 'center', marginBottom: 10, fontWeight: 700 }}>
            כניסה דרך גורם מזהה
          </div>
          <Link
            to="/login/moe"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              minHeight: 44,
              border: '1px solid #003D8F',
              borderRadius: 8,
              background: 'white',
              color: '#003D8F',
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 900,
              transition: 'background 0.15s',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 100 120" fill="none" aria-hidden="true">
              <rect x="35" y="105" width="30" height="5" rx="2" fill="#003D8F"/>
              <rect x="25" y="100" width="50" height="5" rx="2" fill="#003D8F"/>
              <rect x="48" y="30" width="4" height="70" rx="2" fill="#003D8F"/>
              <path d="M50 30 Q50 15 38 15 Q38 15 38 30" stroke="#003D8F" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
              <path d="M50 30 Q50 20 28 20 Q28 20 28 30" stroke="#003D8F" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
              <path d="M50 30 Q50 15 62 15 Q62 15 62 30" stroke="#003D8F" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
              <path d="M50 30 Q50 20 72 20 Q72 20 72 30" stroke="#003D8F" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
              <ellipse cx="28" cy="28" rx="3" ry="5" fill="#003D8F"/>
              <ellipse cx="38" cy="13" rx="3" ry="5" fill="#003D8F"/>
              <ellipse cx="50" cy="28" rx="3" ry="5" fill="#003D8F"/>
              <ellipse cx="62" cy="13" rx="3" ry="5" fill="#003D8F"/>
              <ellipse cx="72" cy="28" rx="3" ry="5" fill="#003D8F"/>
            </svg>
            כניסה עם מנד&quot;ה (משרד החינוך)
          </Link>
        </div>
      </Card>
    </main>
  );
}
