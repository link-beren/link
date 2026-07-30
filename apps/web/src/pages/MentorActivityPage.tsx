import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { Card, Chip } from '../components/ui';
import { db } from '../lib/firebase';

type ChatActivity = {
  id: string;
  lastMessage?: string;
  lastMessageAt?: { toDate?: () => Date };
};

type HourActivity = {
  id: string;
  date?: string;
  hours?: number;
  status?: string;
  createdAt?: { toDate?: () => Date };
};

type ReflectionActivity = {
  id: string;
  text?: string;
  rating?: number;
  createdAt?: { toDate?: () => Date };
};

type ActivityItem = {
  id: string;
  title: string;
  body: string;
  time: number;
  tone: 'primary' | 'success' | 'muted';
};

function dateValue(value?: { toDate?: () => Date }) {
  return value?.toDate?.()?.getTime() || 0;
}

function formatDate(timestamp: number) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function MentorActivityPage() {
  const { user } = useAuth();
  const [chats, setChats] = useState<ChatActivity[]>([]);
  const [hours, setHours] = useState<HourActivity[]>([]);
  const [reflections, setReflections] = useState<ReflectionActivity[]>([]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      query(collection(db, 'chats'), where('mentorUid', '==', user.uid)),
      (snapshot) =>
        setChats(
          snapshot.docs.map((chatDoc) => ({
            id: chatDoc.id,
            ...(chatDoc.data() as Omit<ChatActivity, 'id'>),
          })),
        ),
      () => setChats([]),
    );
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      query(collection(db, 'mentoringHours'), where('mentorUid', '==', user.uid)),
      (snapshot) =>
        setHours(
          snapshot.docs.map((hourDoc) => ({
            id: hourDoc.id,
            ...(hourDoc.data() as Omit<HourActivity, 'id'>),
          })),
        ),
      () => setHours([]),
    );
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      query(collection(db, 'reflections'), where('mentorUid', '==', user.uid)),
      (snapshot) =>
        setReflections(
          snapshot.docs.map((reflectionDoc) => ({
            id: reflectionDoc.id,
            ...(reflectionDoc.data() as Omit<ReflectionActivity, 'id'>),
          })),
        ),
      () => setReflections([]),
    );
  }, [user]);

  const activity = useMemo<ActivityItem[]>(() => {
    const chatItems = chats.map((chat) => ({
      id: `chat-${chat.id}`,
      title: 'שיחת חניך',
      body: chat.lastMessage || 'עוד אין הודעות בשיחה',
      time: dateValue(chat.lastMessageAt),
      tone: 'primary' as const,
    }));
    const hourItems = hours.map((report) => ({
      id: `hour-${report.id}`,
      title: 'דיווח שעות',
      body: `${report.hours || 0} שעות בתאריך ${report.date || ''}`,
      time: dateValue(report.createdAt),
      tone: report.status === 'approved' ? ('success' as const) : ('muted' as const),
    }));
    const reflectionItems = reflections.map((reflection) => ({
      id: `reflection-${reflection.id}`,
      title: 'רפלקציה',
      body: reflection.text || `דירוג ${reflection.rating || '-'}`,
      time: dateValue(reflection.createdAt),
      tone: 'muted' as const,
    }));

    return [...chatItems, ...hourItems, ...reflectionItems]
      .sort((a, b) => b.time - a.time)
      .slice(0, 30);
  }, [chats, hours, reflections]);

  return (
    <main className="page-shell">
      <section className="page-head">
        <div>
          <h1>פעילות</h1>
          <p>פיד פעולות אחרונות משיחות, שעות ורפלקציות.</p>
        </div>
      </section>

      <Card>
        <div className="timeline">
          {activity.length === 0 && <div className="empty-state">אין פעילות להצגה</div>}
          {activity.map((item) => (
            <article className="timeline-item" key={item.id}>
              <Chip tone={item.tone}>{item.title}</Chip>
              <p>{item.body}</p>
              <time>{formatDate(item.time)}</time>
            </article>
          ))}
        </div>
      </Card>
    </main>
  );
}
