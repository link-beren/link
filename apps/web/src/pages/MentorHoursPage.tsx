import { addDoc, collection, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore';
import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { Button, Card, Chip, DataTable } from '../components/ui';
import { db } from '../lib/firebase';

type HourReport = {
  id: string;
  date: string;
  hours: number;
  description: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt?: { toDate?: () => Date };
};

function statusLabel(status: HourReport['status']) {
  if (status === 'approved') return 'מאושר';
  if (status === 'rejected') return 'נדחה';
  return 'ממתין';
}

function statusTone(status: HourReport['status']) {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'danger';
  return 'muted';
}

export function MentorHoursPage() {
  const { user, profile } = useAuth();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState('1');
  const [description, setDescription] = useState('');
  const [reports, setReports] = useState<HourReport[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    const hoursQuery = query(collection(db, 'mentoringHours'), where('mentorUid', '==', user.uid));
    return onSnapshot(
      hoursQuery,
      (snapshot) => {
        setReports(
          snapshot.docs
            .map((reportDoc) => ({
              id: reportDoc.id,
              ...(reportDoc.data() as Omit<HourReport, 'id'>),
            }))
            .sort(
              (a, b) =>
                (b.createdAt?.toDate?.()?.getTime() || 0) -
                (a.createdAt?.toDate?.()?.getTime() || 0),
            ),
        );
      },
      () => setReports([]),
    );
  }, [user]);

  async function submitReport(event: FormEvent) {
    event.preventDefault();
    if (!user || !Number(hours) || !description.trim()) return;
    // בלי schoolId החוקים דוחים את היצירה — הצוות שואל
    // where('schoolId','==',...) ולכן השדה חייב לשבת על המסמך עצמו.
    if (!profile?.schoolId) return;
    setSaving(true);

    try {
      await addDoc(collection(db, 'mentoringHours'), {
        mentorUid: user.uid,
        mentorName: profile?.nickname || user.email || 'חונך/ת',
        schoolId: profile.schoolId,
        homeroomId: profile?.homeroomId || null,
        homeroomName: profile?.homeroomName || null,
        date,
        hours: Number(hours),
        description: description.trim(),
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setHours('1');
      setDescription('');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="page-head">
        <div>
          <h1>דיווח שעות</h1>
          <p>דיווח שעות מעורבות והיסטוריית אישורים.</p>
        </div>
      </section>

      <section className="two-column">
        <Card>
          <h2>דיווח חדש</h2>
          {!profile?.schoolId && (
            <p className="muted-note">
              החשבון שלך אינו משויך לבית ספר, ולכן לא ניתן לדווח שעות. פנה/י למנהל המערכת.
            </p>
          )}
          <form className="form-grid" onSubmit={(event) => void submitReport(event)}>
            <label>
              תאריך
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
            <label>
              שעות
              <input
                min="0.5"
                step="0.5"
                type="number"
                value={hours}
                onChange={(event) => setHours(event.target.value)}
              />
            </label>
            <label>
              פירוט פעילות
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="מה עשית עם החניך/ה?"
              />
            </label>
            <Button type="submit" disabled={saving || !description.trim() || !profile?.schoolId}>
              שליחת דיווח
            </Button>
          </form>
        </Card>

        <Card>
          <h2>סיכום</h2>
          <div className="summary-list">
            <span>סה"כ דיווחים: {reports.length}</span>
            <span>
              מאושר:{' '}
              {reports
                .filter((report) => report.status === 'approved')
                .reduce((sum, report) => sum + report.hours, 0)}
            </span>
            <span>
              ממתין:{' '}
              {reports
                .filter((report) => report.status === 'pending')
                .reduce((sum, report) => sum + report.hours, 0)}
            </span>
          </div>
        </Card>
      </section>

      <Card>
        <h2>היסטוריית דיווחים</h2>
        <DataTable
          headers={['תאריך', 'שעות', 'סטטוס', 'פירוט']}
          rows={reports.map((report) => [
            report.date,
            report.hours,
            <Chip key={report.id} tone={statusTone(report.status)}>
              {statusLabel(report.status)}
            </Chip>,
            report.description,
          ])}
        />
      </Card>
    </main>
  );
}
