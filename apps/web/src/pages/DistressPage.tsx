import { addDoc, collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { useState } from 'react';
import { db } from '../lib/firebase';
import { useAuth } from '../auth/useAuth';
import { Button, Card } from '../components/ui';

const distressOptions = [
  { id: 1, text: 'אני חושש/ת שיהיה מקרה אלימות בקרוב' },
  { id: 2, text: 'אני חושב/ת שעושים עליי חרם' },
  { id: 3, text: 'מישהו שולח לי הודעות מאיימות ברשת' },
  { id: 4, text: 'אני בסכנה פיזית ממשית וצריך/ה עזרה עכשיו' },
];

export function DistressPage() {
  const { user, profile } = useAuth();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function sendAlert() {
    const selected = distressOptions.find((option) => option.id === selectedId);
    if (!selected || !user) return;
    setSending(true);

    try {
      await addDoc(collection(db, 'distressAlerts'), {
        uid: user.uid,
        nickname: profile?.nickname || user.email || 'לא ידוע',
        reasonId: selected.id,
        reasonText: selected.text,
        status: 'open',
        createdAt: serverTimestamp(),
      });

      // פתח גישת אדמין לכל השיחות של המשתמש
      const chatsSnap = await getDocs(
        query(collection(db, 'chats'), where('participants', 'array-contains', user.uid))
      );
      await Promise.all(
        chatsSnap.docs.map((d) => updateDoc(doc(db, 'chats', d.id), {
          helpRequested: true,
          helpRequestedAt: serverTimestamp(),
          helpRequestedBy: user.uid,
        }))
      );

      setSent(true);
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <main className="distress-page">
        <Card className="distress-card">
          <h1>הקריאה נשלחה</h1>
          <p>הצוות קיבל את ההודעה ויצור איתך קשר בהקדם.</p>
          <Button type="button" onClick={() => { setSent(false); setSelectedId(null); }}>
            סגור
          </Button>
        </Card>
      </main>
    );
  }

  return (
    <main className="distress-page">
      <Card className="distress-card">
        <h1>כפתור מצוקה</h1>
        <p>בחר/י את הסיבה הקרובה ביותר. לחיצה תשלח התראה מיידית לצוות.</p>
        <div className="distress-options">
          {distressOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              className={selectedId === option.id ? 'distress-option distress-option-selected' : 'distress-option'}
              onClick={() => setSelectedId(option.id)}
            >
              {option.text}
            </button>
          ))}
        </div>
        <Button
          tone="danger"
          type="button"
          disabled={!selectedId || sending}
          onClick={() => void sendAlert()}
        >
          שלח קריאת עזרה
        </Button>
      </Card>
    </main>
  );
}
