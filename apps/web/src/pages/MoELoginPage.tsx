import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import React, { FormEvent, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import type { SignupRole } from '../auth/types';
import { auth, db, functions } from '../lib/firebase';

// ─── Demo users (replace with real MoE SSO when approved) ───────────────────
const MOE_DEMO_USERS: Record<
  string,
  { password: string; name: string; firstName: string; grade: string }
> = {
  '4508408': {
    password: '6951',
    name: 'יהל ברנשטיין',
    firstName: 'יהל',
    grade: 'ו',
  },
};

type MoEUser = {
  id: string;
  name: string;
  firstName: string;
  grade: string;
};

type ClassOption = { id: string; name: string };
type SchoolOption = { id: string; name: string; city?: string };

function getRoleLabel(role: SignupRole) {
  if (role === 'student') return 'תלמיד/ה';
  if (role === 'mentor') return 'מתנדב/ת';
  return 'איש/ת צוות';
}

// ─── Israeli State Emblem SVG (Menorah) ─────────────────────────────────────
function StateEmblem({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Menorah base */}
      <rect x="35" y="105" width="30" height="5" rx="2" fill="#003D8F" />
      <rect x="25" y="100" width="50" height="5" rx="2" fill="#003D8F" />
      {/* Center stem */}
      <rect x="48" y="30" width="4" height="70" rx="2" fill="#003D8F" />
      {/* Branches */}
      <path d="M50 30 Q50 15 38 15 Q38 15 38 30" stroke="#003D8F" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M50 30 Q50 20 28 20 Q28 20 28 30" stroke="#003D8F" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M50 30 Q50 15 62 15 Q62 15 62 30" stroke="#003D8F" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M50 30 Q50 20 72 20 Q72 20 72 30" stroke="#003D8F" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      {/* Flames */}
      <ellipse cx="28" cy="28" rx="3" ry="5" fill="#003D8F" />
      <ellipse cx="38" cy="13" rx="3" ry="5" fill="#003D8F" />
      <ellipse cx="50" cy="28" rx="3" ry="5" fill="#003D8F" />
      <ellipse cx="62" cy="13" rx="3" ry="5" fill="#003D8F" />
      <ellipse cx="72" cy="28" rx="3" ry="5" fill="#003D8F" />
      {/* Olive branches */}
      <path d="M25 85 Q15 75 10 65 Q18 70 22 80" fill="#003D8F" opacity="0.7" />
      <path d="M75 85 Q85 75 90 65 Q82 70 78 80" fill="#003D8F" opacity="0.7" />
    </svg>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export function MoELoginPage() {
  const { status } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<'moe-login' | 'role-select'>('moe-login');
  const [moeUser, setMoeUser] = useState<MoEUser | null>(null);
  const [role, setRole] = useState<SignupRole>('student');
  const [classId, setClassId] = useState('');
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [schoolId, setSchoolId] = useState('');
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [staffCode, setStaffCode] = useState('');

  const [moId, setMoId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'schools'),
      where('active', '==', true),
      orderBy('name'),
    );
    return onSnapshot(q, (snap) => {
      setSchools(
        snap.docs.map((d) => ({
          id: d.id,
          name: typeof d.data().name === 'string' ? d.data().name : d.id,
          city: typeof d.data().city === 'string' ? d.data().city : undefined,
        })),
      );
    }, () => setSchools([]));
  }, []);

  // הכיתות מסוננות לבית הספר שנבחר — מתנדב עובד תחת בית ספר אחד בלבד
  useEffect(() => {
    if (!schoolId) {
      setClasses([]);
      return;
    }
    const q = query(
      collection(db, 'classes'),
      where('schoolId', '==', schoolId),
      orderBy('name'),
    );
    return onSnapshot(q, (snap) => {
      setClasses(
        snap.docs.map((d) => ({
          id: d.id,
          name: typeof d.data().name === 'string' ? d.data().name : d.id,
        })),
      );
    }, () => setClasses([]));
  }, [schoolId]);

  if (status === 'authenticated') return <Navigate to="/" replace />;

  // Step 1: MoE credentials
  function handleMoELogin(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const demo = MOE_DEMO_USERS[moId.trim()];
    if (!demo || demo.password !== password.trim()) {
      setError('מספר הזהות או הסיסמה שגויים. אנא בדוק/י ונסה/י שנית.');
      return;
    }

    setMoeUser({ id: moId.trim(), ...demo });
    setStep('role-select');
  }

  // Step 2: Role → Firebase
  async function handleRoleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!moeUser) return;
    setError(null);

    if (role === 'mentor' && !schoolId) {
      setError('אנא בחר/י בית ספר.');
      return;
    }
    if (role === 'mentor' && !classId) {
      setError('אנא בחר/י כיתה לביצוע ההתנדבות.');
      return;
    }
    if (role === 'staff' && !staffCode.trim()) {
      setError('אנא הכנס/י את קוד הצוות של בית הספר.');
      return;
    }

    setLoading(true);

    const firebaseEmail = `moe_${moeUser.id}@link-demo.app`;
    const firebasePassword = `link_moe_${moeUser.id}_secure`;

    try {
      let uid: string;

      try {
        const cred = await signInWithEmailAndPassword(
          auth,
          firebaseEmail,
          firebasePassword,
        );
        uid = cred.user.uid;
      } catch {
        // First time: create account
        const cred = await createUserWithEmailAndPassword(
          auth,
          firebaseEmail,
          firebasePassword,
        );
        uid = cred.user.uid;
      }

      const identity = {
        email: firebaseEmail,
        nickname: moeUser.firstName,
        moId: moeUser.id,
        moName: moeUser.name,
        moGrade: moeUser.grade,
        updatedAt: new Date().toISOString(),
      };

      if (role === 'staff') {
        // גם בהזדהות ממשלתית שיוך הצוות לבית ספר נעשה רק דרך קוד הצוות,
        // ורק בשרת. קודם המסלול הזה כתב role: 'staff' בלי שום קוד.
        try {
          await httpsCallable(functions, 'registerStaffWithCode')({
            code: staffCode.trim(),
            nickname: moeUser.firstName,
          });
          // הפונקציה מציבה claim schoolId. בלי רענון מפורש הטוקן שבידינו
          // עדיין בלי ה-claim, וכל שאילתה מוגבלת-בית-ספר תיפול על הרשאות.
          await auth.currentUser?.getIdToken(true);
        } catch (codeError) {
          setError(
            codeError instanceof Error && codeError.message
              ? codeError.message
              : 'קוד הצוות שגוי.',
          );
          setLoading(false);
          return;
        }
        // role ו-schoolId נכתבו בשרת; כאן רק פרטי ההזדהות
        await setDoc(doc(db, 'users', uid), identity, { merge: true });
      } else {
        const selectedClass = classes.find((c) => c.id === classId);
        const roleExtra =
          role === 'student'
            ? // תלמיד גלובלי — שכבת גיל מנתוני משרד החינוך, בלי שיוך לבית ספר
              { grade: moeUser.grade, className: `כיתה ${moeUser.grade}` }
            : { schoolId, classId, className: selectedClass?.name, mentorStatus: 'pending' };

        await setDoc(
          doc(db, 'users', uid),
          { ...identity, role, ...roleExtra },
          { merge: true },
        );
      }

      navigate('/', { replace: true });
    } catch {
      setError('אירעה שגיאה בהתחברות. אנא נסה/י שנית.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f4f6fb', direction: 'rtl' }}>
      {/* Government top bar */}
      <div style={{ background: '#003D8F', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 14, height: 60 }}>
        <StateEmblem size={36} />
        <div style={{ color: 'white' }}>
          <div style={{ fontSize: 11, opacity: 0.8, letterSpacing: 0.5 }}>מדינת ישראל</div>
          <div style={{ fontSize: 14, fontWeight: 800 }}>משרד החינוך</div>
        </div>
        <div style={{ marginRight: 'auto', color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
          שירותי מידע ומחשוב
        </div>
      </div>

      {/* Secondary nav bar */}
      <div style={{ background: '#0052B5', padding: '8px 24px', display: 'flex', gap: 20 }}>
        {['עמוד הבית', 'הורים', 'תלמידים', 'מורים', 'מנהלים'].map((item) => (
          <span key={item} style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, cursor: 'default' }}>{item}</span>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: '40px 20px' }}>
        <div style={{
          width: 'min(100%, 460px)',
          background: 'white',
          border: '1px solid #d0d7e6',
          borderRadius: 8,
          boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
          overflow: 'hidden',
        }}>
          {/* Card header */}
          <div style={{ background: '#003D8F', padding: '22px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <StateEmblem size={44} />
              <div>
                <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>פורטל הזדהות ממשלתי</div>
                <div style={{ color: 'white', fontSize: 20, fontWeight: 900, marginTop: 2 }}>
                  {step === 'moe-login' ? 'כניסה למערכות משרד החינוך' : 'בחירת תפקיד'}
                </div>
              </div>
            </div>
          </div>

          <div style={{ padding: '28px' }}>
            {step === 'moe-login' ? (
              /* ── Step 1: MoE credentials ── */
              <form onSubmit={handleMoELogin} style={{ display: 'grid', gap: 16 }}>
                <div style={{ background: '#EFF5FF', border: '1px solid #c0d4f5', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: '#003D8F' }}>
                  🔒 ההתחברות מאובטחת בתקן ISO 27001 של מדינת ישראל
                </div>

                <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 700, color: '#333' }}>
                  מספר זהות / מזהה משרדי
                  <input
                    type="text"
                    value={moId}
                    onChange={(e) => setMoId(e.target.value)}
                    placeholder="הזן/י מספר זהות"
                    inputMode="numeric"
                    required
                    style={inputStyle}
                  />
                </label>

                <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 700, color: '#333' }}>
                  סיסמה
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="הזן/י סיסמה"
                    required
                    style={inputStyle}
                  />
                </label>

                {error && (
                  <div style={{ padding: '10px 14px', borderRadius: 6, background: '#FEF2F2', border: '1px solid #fca5a5', color: '#b91c1c', fontSize: 13, fontWeight: 700 }}>
                    {error}
                  </div>
                )}

                <button type="submit" style={moeBtnStyle}>
                  כניסה
                </button>

                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 14, display: 'grid', gap: 8 }}>
                  <button type="button" style={{ ...ghostBtnStyle, textAlign: 'center' }}>
                    שכחתי סיסמה
                  </button>
                  <button type="button" style={{ ...ghostBtnStyle, textAlign: 'center', color: '#003D8F' }} onClick={() => navigate('/login')}>
                    ← חזרה לכניסה הרגילה
                  </button>
                </div>

                <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', lineHeight: 1.6 }}>
                  מערכת זו מיועדת לעובדי ותלמידי מערכת החינוך בלבד.<br />
                  גישה בלתי מורשית אסורה על פי חוק.
                </div>
              </form>
            ) : (
              /* ── Step 2: Role selection ── */
              <form onSubmit={(e) => void handleRoleSubmit(e)} style={{ display: 'grid', gap: 16 }}>
                {/* User info banner */}
                <div style={{ background: '#F0FDF4', border: '1px solid #86efac', borderRadius: 6, padding: '12px 14px' }}>
                  <div style={{ fontSize: 12, color: '#15803d', fontWeight: 700 }}>✓ זוהית בהצלחה</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#166534', marginTop: 2 }}>{moeUser?.name}</div>
                  <div style={{ fontSize: 12, color: '#15803d', marginTop: 2 }}>
                    כיתה {moeUser?.grade} · מספר זהות {moeUser?.id}
                  </div>
                </div>

                <div style={{ fontSize: 14, fontWeight: 800, color: '#374151' }}>
                  באיזה תפקיד תרצה/י להשתמש בLink?
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {(['student', 'mentor', 'staff'] as SignupRole[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      style={{
                        minHeight: 52,
                        border: `2px solid ${role === r ? '#003D8F' : '#e5e7eb'}`,
                        borderRadius: 6,
                        background: role === r ? '#EFF5FF' : 'white',
                        color: role === r ? '#003D8F' : '#6b7280',
                        font: 'inherit',
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      {getRoleLabel(r)}
                    </button>
                  ))}
                </div>

                {/* Student: show class info (read-only) */}
                {role === 'student' && (
                  <div style={{ background: '#F8FAFF', border: '1px solid #c7d8f5', borderRadius: 6, padding: '12px 14px', fontSize: 13, color: '#374151' }}>
                    <span style={{ fontWeight: 700 }}>כיתה: </span>
                    כיתה {moeUser?.grade ?? ''}
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>הכיתה נקבעת אוטומטית לפי נתוני משרד החינוך</div>
                  </div>
                )}

                {/* Mentor: school then class */}
                {role === 'mentor' && (
                  <>
                    <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 700, color: '#333' }}>
                      בית ספר
                      <select
                        value={schoolId}
                        onChange={(e) => {
                          setSchoolId(e.target.value);
                          setClassId('');
                        }}
                        style={inputStyle}
                      >
                        <option value="">בחר/י בית ספר</option>
                        {schools.map((sc) => (
                          <option key={sc.id} value={sc.id}>
                            {sc.city ? `${sc.name} — ${sc.city}` : sc.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {!!schoolId && (
                      <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 700, color: '#333' }}>
                        כיתה להתנדבות
                        <select
                          value={classId}
                          onChange={(e) => setClassId(e.target.value)}
                          style={inputStyle}
                        >
                          <option value="">בחר/י כיתה</option>
                          {classes.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                        <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 400 }}>
                          לאחר הבחירה תועבר/י לאישור המורה
                        </span>
                      </label>
                    )}
                  </>
                )}

                {/* Staff: school code */}
                {role === 'staff' && (
                  <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 700, color: '#333' }}>
                    קוד צוות בית ספר
                    <input
                      type="password"
                      value={staffCode}
                      onChange={(e) => setStaffCode(e.target.value)}
                      placeholder="הקוד שקיבלת מרכז/ת התוכנית"
                      style={inputStyle}
                    />
                    <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 400 }}>
                      הקוד קובע לאיזה בית ספר החשבון משויך
                    </span>
                  </label>
                )}

                {error && (
                  <div style={{ padding: '10px 14px', borderRadius: 6, background: '#FEF2F2', border: '1px solid #fca5a5', color: '#b91c1c', fontSize: 13, fontWeight: 700 }}>
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading} style={{ ...moeBtnStyle, opacity: loading ? 0.7 : 1 }}>
                  {loading ? 'מתחבר...' : 'המשך'}
                </button>

                <button
                  type="button"
                  onClick={() => { setStep('moe-login'); setError(null); }}
                  style={{ ...ghostBtnStyle, textAlign: 'center' }}
                >
                  ← חזרה
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ background: '#003D8F', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>
          © {new Date().getFullYear()} מדינת ישראל – משרד החינוך
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          {['נגישות', 'פרטיות', 'תנאי שימוש'].map((t) => (
            <span key={t} style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, cursor: 'default' }}>{t}</span>
          ))}
        </div>
      </div>
    </main>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  minHeight: 42,
  width: '100%',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  background: 'white',
  color: '#111',
  font: 'inherit',
  fontSize: 14,
  padding: '0 12px',
  outline: 'none',
};

const moeBtnStyle: React.CSSProperties = {
  minHeight: 44,
  width: '100%',
  border: 0,
  borderRadius: 6,
  background: '#003D8F',
  color: 'white',
  font: 'inherit',
  fontSize: 14,
  fontWeight: 900,
  cursor: 'pointer',
  letterSpacing: 0.5,
};

const ghostBtnStyle: React.CSSProperties = {
  border: 0,
  background: 'transparent',
  color: '#6b7280',
  font: 'inherit',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  padding: '4px 0',
};
