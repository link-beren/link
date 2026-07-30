import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Query,
} from 'firebase/firestore';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { Button, Card, Chip, DataTable, Modal, SearchBox } from '../components/ui';
import { db } from '../lib/firebase';

// טאב "תלמידים" הוסר: תלמיד אינו משויך לבית ספר (מתנדב מכל בית ספר יכול
// ללוות אותו), ולכן לצוות אין רשימת תלמידים משמעותית להציג. הגישה לתלמיד
// היא דרך התראת מצוקה שנותבה לבית הספר.
type StaffTab = 'dashboard' | 'alerts' | 'hours' | 'classes' | 'mentors' | 'reports' | 'requests';

type UserRow = {
  id: string;
  nickname?: string;
  email?: string;
  role?: string;
  mentorStatus?: string;
  schoolId?: string;
  classId?: string;
  className?: string;
};

type DistressAlert = {
  id: string;
  uid?: string;
  userId?: string;
  studentUid?: string;
  nickname?: string;
  reason?: string;
  message?: string;
  status?: string;
  handled?: boolean;
  notifySchoolIds?: string[];
  createdAt?: { toDate?: () => Date };
};

type HourRow = {
  id: string;
  mentorUid?: string;
  mentorName?: string;
  schoolId?: string;
  date?: string;
  hours?: number;
  description?: string;
  status?: string;
};

type ClassRow = {
  id: string;
  name?: string;
  schoolId?: string;
  teacherUid?: string;
  teacherName?: string;
};

/**
 * מאזין לשאילתה. מקבל `null` כשעדיין אין schoolId (הפרופיל בטעינה) —
 * חשוב, כי שאילתה בלי המסננים תיפול על חוקי האבטחה: Firestore דוחה
 * שאילתה שלמה אם ולו מסמך אחד בתוצאה חורג מהחוק, ולא מסננת בשקט.
 */
function useQueryRows<T>(builtQuery: Query | null) {
  const [rows, setRows] = useState<T[]>([]);

  useEffect(() => {
    if (!builtQuery) {
      setRows([]);
      return;
    }
    return onSnapshot(
      builtQuery,
      (snapshot) =>
        setRows(
          snapshot.docs.map((rowDoc) => ({
            id: rowDoc.id,
            ...(rowDoc.data() as Omit<T, 'id'>),
          })) as T[],
        ),
      (error) => {
        console.error('staff portal query failed', error);
        setRows([]);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builtQuery]);

  return rows;
}

function formatDate(value?: { toDate?: () => Date }) {
  const date = value?.toDate?.();
  return date ? date.toLocaleString('he-IL') : '';
}

// שני מסלולי היצירה (DistressScreen במובייל ו-DistressPage בווב) כותבים 'uid',
// ולכן הוא הקנוני. studentUid/userId נשארים כנפילה למסמכים היסטוריים.
function getAlertStudentUid(alert: DistressAlert) {
  return alert.uid || alert.studentUid || alert.userId || '';
}

function getStatusTone(status?: string, handled?: boolean) {
  if (handled || status === 'resolved' || status === 'approved') return 'success';
  if (status === 'rejected') return 'danger';
  return 'muted';
}

export function StaffPortalPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<StaffTab>('dashboard');
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [className, setClassName] = useState('');
  const [editingClass, setEditingClass] = useState<ClassRow | null>(null);
  const [editClassName, setEditClassName] = useState('');

  const schoolId = profile?.schoolId || '';

  // כל שאילתה מוגבלת לבית הספר של איש הצוות. המסננים כאן אינם קוסמטיים —
  // הם תנאי מוקדם לכך שהחוקים יאשרו את הקריאה בכלל.
  const mentorsQuery = useMemo(
    () =>
      schoolId
        ? query(
            collection(db, 'users'),
            where('role', '==', 'mentor'),
            where('schoolId', '==', schoolId),
          )
        : null,
    [schoolId],
  );

  // התראות מנותבות בשרת: sendDistressAlertNotification כותב notifySchoolIds
  // לפי בתי הספר של המלווים של התלמיד (לתלמיד עצמו אין שיוך).
  const alertsQuery = useMemo(
    () =>
      schoolId
        ? query(
            collection(db, 'distressAlerts'),
            where('notifySchoolIds', 'array-contains', schoolId),
            orderBy('createdAt', 'desc'),
          )
        : null,
    [schoolId],
  );

  const hoursQuery = useMemo(
    () =>
      schoolId
        ? query(collection(db, 'mentoringHours'), where('schoolId', '==', schoolId))
        : null,
    [schoolId],
  );

  const classesQuery = useMemo(
    () =>
      schoolId ? query(collection(db, 'classes'), where('schoolId', '==', schoolId)) : null,
    [schoolId],
  );

  const mentors = useQueryRows<UserRow>(mentorsQuery);
  const alerts = useQueryRows<DistressAlert>(alertsQuery);
  const hours = useQueryRows<HourRow>(hoursQuery);
  const classes = useQueryRows<ClassRow>(classesQuery);

  const pendingMentors = useMemo(
    () => mentors.filter((row) => row.mentorStatus === 'pending'),
    [mentors],
  );

  const approvedMentors = useMemo(
    () => mentors.filter((row) => row.mentorStatus === 'approved'),
    [mentors],
  );

  const openAlerts = useMemo(
    () => alerts.filter((alert) => !alert.handled && alert.status !== 'resolved'),
    [alerts],
  );

  const pendingHours = useMemo(
    () => hours.filter((row) => !row.status || row.status === 'pending'),
    [hours],
  );

  // הכיתות של בית הספר הן מקור האמת לרשימת הכיתות. קודם היא נבנתה
  // מ-classId של המשתמשים, מה שהחזיר גם כיתות של בתי ספר אחרים.
  const classOptions = useMemo(
    () => classes.map((row) => [row.id, row.name || row.id] as [string, string]),
    [classes],
  );

  const filteredMentors = useMemo(
    () =>
      mentors.filter((row) => {
        const term = search.trim().toLowerCase();
        const text = [row.nickname, row.email, row.className].filter(Boolean).join(' ').toLowerCase();
        return (!term || text.includes(term)) && (!classFilter || row.classId === classFilter);
      }),
    [classFilter, mentors, search],
  );

  async function resolveAlert(alert: DistressAlert) {
    await updateDoc(doc(db, 'distressAlerts', alert.id), {
      handled: true,
      status: 'resolved',
      handledBy: user?.uid || null,
      handledAt: serverTimestamp(),
    });
  }

  async function openStudentChat(alert: DistressAlert) {
    if (!user) return;
    const studentUid = getAlertStudentUid(alert);
    if (!studentUid) return;
    const chatId = `staff_${[user.uid, studentUid].sort().join('_')}`;
    const names = {
      [user.uid]: alert.nickname || 'תלמיד/ה',
      [studentUid]: profile?.nickname || user.email || 'צוות',
    };
    await setDoc(
      doc(db, 'chats', chatId),
      {
        participants: [user.uid, studentUid],
        staffUid: user.uid,
        studentUid,
        type: 'staff',
        isGroup: false,
        // participantNames הוא השדה הקנוני; chatNames נשמר לתאימות אחורה
        participantNames: names,
        chatNames: names,
        lastMessage: 'שיחת צוות נפתחה',
        lastSender: 'Link',
        lastMessageAt: serverTimestamp(),
      },
      { merge: true },
    );
    navigate(`/school/chat/${chatId}`);
  }

  async function setHourStatus(row: HourRow, status: 'approved' | 'rejected') {
    await updateDoc(doc(db, 'mentoringHours', row.id), {
      status,
      approvedBy: user?.uid || null,
      approvedAt: serverTimestamp(),
    });
  }

  async function submitClass(event: FormEvent) {
    event.preventDefault();
    if (!className.trim() || !schoolId) return;
    await addDoc(collection(db, 'classes'), {
      name: className.trim(),
      // כיתה שייכת לבית ספר; בלי השדה הזה החוקים ידחו את היצירה
      schoolId,
      teacherUid: user?.uid || null,
      teacherName: profile?.nickname || profile?.email || null,
      createdAt: serverTimestamp(),
    });
    setClassName('');
  }

  async function setMentorStatus(row: UserRow, mentorStatus: 'approved' | 'rejected') {
    // החוקים מתירים לצוות לשנות רק mentorStatus, ורק למתנדבי בית הספר שלו,
    // ולכן זו הכתיבה היחידה כאן — שדות ביקורת נוספים יידחו.
    await updateDoc(doc(db, 'users', row.id), { mentorStatus });
  }

  function openEditClass(row: ClassRow) {
    setEditingClass(row);
    setEditClassName(row.name || '');
  }

  async function saveEditClass(event: FormEvent) {
    event.preventDefault();
    if (!editingClass || !editClassName.trim()) return;
    await updateDoc(doc(db, 'classes', editingClass.id), {
      name: editClassName.trim(),
    });
    setEditingClass(null);
  }

  async function deleteClass(row: ClassRow) {
    if (!window.confirm(`למחוק את הכיתה "${row.name}"?`)) return;
    await deleteDoc(doc(db, 'classes', row.id));
  }

  if (!schoolId) {
    return (
      <main className="page-shell">
        <Card>
          <h1>פורטל בית ספר</h1>
          <p>
            החשבון שלך אינו משויך לבית ספר. פנה/י למנהל המערכת כדי לשייך אותו, או התחבר/י מחדש אם
            השיוך בוצע כרגע.
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="page-head">
        <div>
          <h1>פורטל בית ספר</h1>
          <p>
            {profile?.schoolName || 'בית הספר שלי'} — ניהול חונכים, כיתות, התראות ושעות מעורבות.
          </p>
        </div>
      </section>

      <div className="tabs staff-tabs" role="tablist" aria-label="פורטל צוות">
        {[
          ['dashboard', 'דשבורד'],
          ['alerts', 'התראות'],
          ['hours', 'שעות'],
          ['classes', 'כיתות'],
          ['mentors', 'חונכים'],
          ['requests', 'בקשות'],
          ['reports', 'דוחות'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'tab-button tab-button-active' : 'tab-button'}
            onClick={() => setTab(id as StaffTab)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && (
        <section className="metric-grid">
          <Card>
            <span className="metric-label">חונכים מאושרים</span>
            <strong className="metric-value">{approvedMentors.length}</strong>
          </Card>
          <Card>
            <span className="metric-label">בקשות חונכים</span>
            <strong className="metric-value">{pendingMentors.length}</strong>
          </Card>
          <Card>
            <span className="metric-label">התראות פתוחות</span>
            <strong className="metric-value">{openAlerts.length}</strong>
          </Card>
          <Card>
            <span className="metric-label">שעות ממתינות</span>
            <strong className="metric-value">{pendingHours.length}</strong>
          </Card>
        </section>
      )}

      {tab === 'alerts' && (
        <Card>
          <p className="muted-note">
            מוצגות התראות של תלמידים שמלווה אותם חונך/ת מבית הספר הזה.
          </p>
          <DataTable
            headers={['תלמיד/ה', 'סיבה', 'סטטוס', 'נוצר', 'פעולות']}
            rows={alerts.map((alert) => [
              alert.nickname || getAlertStudentUid(alert) || 'לא ידוע',
              alert.reason || alert.message || '',
              <Chip key={`${alert.id}-status`} tone={getStatusTone(alert.status, alert.handled)}>
                {alert.handled || alert.status === 'resolved' ? 'טופל' : 'פתוח'}
              </Chip>,
              formatDate(alert.createdAt),
              <span className="row-actions" key={`${alert.id}-actions`}>
                <Button tone="success" type="button" onClick={() => void resolveAlert(alert)}>
                  טופל
                </Button>
                <Button tone="muted" type="button" onClick={() => void openStudentChat(alert)}>
                  שיחה
                </Button>
              </span>,
            ])}
          />
        </Card>
      )}

      {tab === 'hours' && (
        <Card>
          <DataTable
            headers={['חונך/ת', 'תאריך', 'שעות', 'פירוט', 'סטטוס', 'פעולות']}
            rows={hours.map((row) => [
              row.mentorName || row.mentorUid || '',
              row.date || '',
              row.hours || 0,
              row.description || '',
              <Chip key={`${row.id}-status`} tone={getStatusTone(row.status)}>
                {row.status === 'approved' ? 'מאושר' : row.status === 'rejected' ? 'נדחה' : 'ממתין'}
              </Chip>,
              <span className="row-actions" key={`${row.id}-actions`}>
                <Button tone="success" type="button" onClick={() => void setHourStatus(row, 'approved')}>
                  אשר
                </Button>
                <Button tone="danger" type="button" onClick={() => void setHourStatus(row, 'rejected')}>
                  דחה
                </Button>
              </span>,
            ])}
          />
        </Card>
      )}

      {tab === 'classes' && (
        <>
          <section className="two-column">
            <Card>
              <h2>יצירת כיתה</h2>
              <form className="form-grid" onSubmit={(event) => void submitClass(event)}>
                <label>
                  שם כיתה
                  <input value={className} onChange={(event) => setClassName(event.target.value)} />
                </label>
                <Button type="submit" disabled={!className.trim()}>
                  יצירה
                </Button>
              </form>
            </Card>
            <Card>
              <h2>כיתות פעילות</h2>
              <DataTable
                headers={['שם כיתה', 'מורה אחראי', 'חונכים', 'פעולות']}
                rows={classes.map((row) => [
                  row.name || row.id,
                  row.teacherName || row.teacherUid || '',
                  mentors.filter((m) => m.classId === row.id).length,
                  <span className="row-actions" key={`${row.id}-actions`}>
                    <Button tone="muted" type="button" onClick={() => openEditClass(row)}>
                      עריכה
                    </Button>
                    <Button tone="danger" type="button" onClick={() => void deleteClass(row)}>
                      מחיקה
                    </Button>
                  </span>,
                ])}
              />
            </Card>
          </section>

          <Modal
            title={`עריכת כיתה: ${editingClass?.name || ''}`}
            open={!!editingClass}
            onClose={() => setEditingClass(null)}
          >
            <form className="form-grid" onSubmit={(event) => void saveEditClass(event)}>
              <label>
                שם כיתה
                <input value={editClassName} onChange={(event) => setEditClassName(event.target.value)} autoFocus />
              </label>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <Button tone="muted" type="button" onClick={() => setEditingClass(null)}>
                  ביטול
                </Button>
                <Button type="submit" disabled={!editClassName.trim()}>
                  שמירה
                </Button>
              </div>
            </form>
          </Modal>
        </>
      )}

      {tab === 'requests' && (
        <section className="two-column">
          <Card>
            <h2>בקשות הצטרפות חונכים</h2>
            <DataTable
              headers={['שם', 'אימייל', 'כיתה', 'פעולות']}
              rows={pendingMentors.map((row) => [
                row.nickname || 'חונך/ת',
                row.email || '',
                row.className || row.classId || '',
                <span className="row-actions" key={`${row.id}-mentor-actions`}>
                  <Button tone="success" type="button" onClick={() => void setMentorStatus(row, 'approved')}>
                    אשר
                  </Button>
                  <Button tone="danger" type="button" onClick={() => void setMentorStatus(row, 'rejected')}>
                    דחה
                  </Button>
                </span>,
              ])}
            />
          </Card>
          <Card>
            <h2>בקשות אישור שעות</h2>
            <DataTable
              headers={['חונך/ת', 'תאריך', 'שעות', 'פירוט', 'פעולות']}
              rows={pendingHours.map((row) => [
                row.mentorName || row.mentorUid || '',
                row.date || '',
                row.hours || 0,
                row.description || '',
                <span className="row-actions" key={`${row.id}-hours-actions`}>
                  <Button tone="success" type="button" onClick={() => void setHourStatus(row, 'approved')}>
                    אשר
                  </Button>
                  <Button tone="danger" type="button" onClick={() => void setHourStatus(row, 'rejected')}>
                    דחה
                  </Button>
                </span>,
              ])}
            />
          </Card>
        </section>
      )}

      {tab === 'mentors' && (
        <Card>
          <div className="table-toolbar">
            <SearchBox
              placeholder="חיפוש חונכים..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
              <option value="">כל הכיתות</option>
              {classOptions.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <DataTable
            headers={['שם', 'אימייל', 'כיתה', 'סטטוס', 'פעולות']}
            rows={filteredMentors.map((row) => [
              row.nickname || 'חונך/ת',
              row.email || '',
              row.className || row.classId || '',
              <Chip key={`${row.id}-status`} tone={getStatusTone(row.mentorStatus)}>
                {row.mentorStatus === 'approved'
                  ? 'מאושר'
                  : row.mentorStatus === 'rejected'
                    ? 'נדחה'
                    : 'ממתין'}
              </Chip>,
              <span className="row-actions" key={`${row.id}-actions`}>
                <Button tone="success" type="button" onClick={() => void setMentorStatus(row, 'approved')}>
                  אשר
                </Button>
                <Button tone="danger" type="button" onClick={() => void setMentorStatus(row, 'rejected')}>
                  דחה
                </Button>
              </span>,
            ])}
          />
        </Card>
      )}

      {tab === 'reports' && (
        <section className="two-column">
          <Card>
            <h2>דוח לפי כיתה</h2>
            {/* התלמידים אינם משויכים לכיתה או לבית ספר, ולכן הדוח מודד
                את פריסת החונכים בכיתות בית הספר. */}
            <DataTable
              headers={['כיתה', 'חונכים', 'מהם מאושרים']}
              rows={classOptions.map(([classId, label]) => [
                label,
                mentors.filter((row) => row.classId === classId).length,
                mentors.filter((row) => row.classId === classId && row.mentorStatus === 'approved')
                  .length,
              ])}
            />
          </Card>
          <Card>
            <h2>דוח חונכים</h2>
            <DataTable
              headers={['חונך/ת', 'שעות מאושרות', 'שעות ממתינות']}
              rows={mentors.map((mentor) => [
                mentor.nickname || mentor.email || mentor.id,
                hours
                  .filter((row) => row.mentorUid === mentor.id && row.status === 'approved')
                  .reduce((sum, row) => sum + (row.hours || 0), 0),
                hours
                  .filter((row) => row.mentorUid === mentor.id && (!row.status || row.status === 'pending'))
                  .reduce((sum, row) => sum + (row.hours || 0), 0),
              ])}
            />
          </Card>
        </section>
      )}
    </main>
  );
}
