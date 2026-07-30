import { addDoc, collection, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore';
import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { Button, Card, Chip } from '../components/ui';
import { db } from '../lib/firebase';

type Reflection = {
  id: string;
  rating: number;
  text: string;
  createdAt?: { toDate?: () => Date };
};

function formatDate(value?: { toDate?: () => Date }) {
  const date = value?.toDate?.();
  return date
    ? date.toLocaleDateString('he-IL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '';
}

export function MentorReflectionPage() {
  const { user, profile } = useAuth();
  const [rating, setRating] = useState(4);
  const [text, setText] = useState('');
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      query(collection(db, 'reflections'), where('mentorUid', '==', user.uid)),
      (snapshot) =>
        setReflections(
          snapshot.docs
            .map((reflectionDoc) => ({
              id: reflectionDoc.id,
              ...(reflectionDoc.data() as Omit<Reflection, 'id'>),
            }))
            .sort(
              (a, b) =>
                (b.createdAt?.toDate?.()?.getTime() || 0) -
                (a.createdAt?.toDate?.()?.getTime() || 0),
            ),
        ),
      () => setReflections([]),
    );
  }, [user]);

  async function submitReflection(event: FormEvent) {
    event.preventDefault();
    if (!user || !text.trim()) return;
    setSaving(true);

    try {
      await addDoc(collection(db, 'reflections'), {
        mentorUid: user.uid,
        mentorName: profile?.nickname || user.email || 'חונך/ת',
        rating,
        text: text.trim(),
        createdAt: serverTimestamp(),
      });
      setRating(4);
      setText('');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="page-head">
        <div>
          <h1>רפלקציה</h1>
          <p>תיעוד קצר של חוויית החונכות והתקדמות התהליך.</p>
        </div>
      </section>

      <section className="two-column">
        <Card>
          <h2>רפלקציה חדשה</h2>
          <form className="form-grid" onSubmit={(event) => void submitReflection(event)}>
            <label>
              דירוג מפגש
              <input
                max="5"
                min="1"
                type="range"
                value={rating}
                onChange={(event) => setRating(Number(event.target.value))}
              />
            </label>
            <Chip tone="primary">{rating}/5</Chip>
            <label>
              תיאור
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="מה עבד טוב? מה דורש המשך ליווי?"
              />
            </label>
            <Button type="submit" disabled={saving || !text.trim()}>
              שמירת רפלקציה
            </Button>
          </form>
        </Card>

        <Card>
          <h2>רפלקציות קודמות</h2>
          <div className="compact-list">
            {reflections.length === 0 && <div className="empty-state">אין רפלקציות עדיין</div>}
            {reflections.map((reflection) => (
              <article className="compact-row" key={reflection.id}>
                <span>{reflection.rating}/5</span>
                <small>{reflection.text}</small>
                <time>{formatDate(reflection.createdAt)}</time>
              </article>
            ))}
          </div>
        </Card>
      </section>
    </main>
  );
}
