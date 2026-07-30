import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { Badge, Card, Chip } from '../components/ui';
import { db } from '../lib/firebase';

type MentorChat = {
  id: string;
  studentUid?: string;
  participantNames?: Record<string, string>;
  chatNames?: Record<string, string>;
  lastMessage?: string;
  lastMessageAt?: { toDate?: () => Date };
};

type SocialChat = {
  id: string;
  chatName?: string;
  participantNames?: Record<string, string>;
  chatNames?: Record<string, string>;
  groupName?: string;
  lastMessage?: string;
  lastSender?: string;
  isGroup?: boolean;
  partnerUid?: string | null;
  lastMessageAt?: { toDate?: () => Date };
};

type HourReport = {
  id: string;
  hours: number;
  status?: string;
};

function asDate(value?: { toDate?: () => Date }) {
  return value?.toDate?.()?.getTime() || 0;
}

function formatTime(ts?: { toDate?: () => Date }) {
  const date = ts?.toDate?.();
  if (!date) return '';
  return date.toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getSocialChatTitle(chat: SocialChat, currentUid: string) {
  if (chat.isGroup) return chat.groupName || chat.chatName || 'קבוצה';
  if (chat.participantNames?.[currentUid]) return chat.participantNames[currentUid];
  if (chat.chatNames?.[currentUid]) return chat.chatNames[currentUid];
  return chat.chatName || 'שיחה';
}

export function MentorHomePage() {
  const { user } = useAuth();
  const [chats, setChats] = useState<MentorChat[]>([]);
  const [hours, setHours] = useState<HourReport[]>([]);
  const [socialChats, setSocialChats] = useState<SocialChat[]>([]);

  useEffect(() => {
    if (!user) return;
    const chatsQuery = query(collection(db, 'chats'), where('mentorUid', '==', user.uid));
    return onSnapshot(
      chatsQuery,
      (snapshot) => {
        setChats(
          snapshot.docs
            .map((chatDoc) => ({
              id: chatDoc.id,
              ...(chatDoc.data() as Omit<MentorChat, 'id'>),
            }))
            .sort((a, b) => asDate(b.lastMessageAt) - asDate(a.lastMessageAt)),
        );
      },
      () => setChats([]),
    );
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const hoursQuery = query(collection(db, 'mentoringHours'), where('mentorUid', '==', user.uid));
    return onSnapshot(
      hoursQuery,
      (snapshot) => {
        setHours(
          snapshot.docs.map((hourDoc) => {
            const data = hourDoc.data();
            return {
              id: hourDoc.id,
              hours: typeof data.hours === 'number' ? data.hours : 0,
              status: typeof data.status === 'string' ? data.status : 'pending',
            };
          }),
        );
      },
      () => setHours([]),
    );
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const socialQuery = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid),
      orderBy('lastMessageAt', 'desc'),
    );
    return onSnapshot(
      socialQuery,
      (snapshot) => {
        setSocialChats(
          snapshot.docs.map((chatDoc) => ({
            id: chatDoc.id,
            ...(chatDoc.data() as Omit<SocialChat, 'id'>),
          })),
        );
      },
      () => setSocialChats([]),
    );
  }, [user]);

  const stats = useMemo(() => {
    const approved = hours
      .filter((report) => report.status === 'approved')
      .reduce((sum, report) => sum + report.hours, 0);
    const pending = hours
      .filter((report) => report.status !== 'approved' && report.status !== 'rejected')
      .reduce((sum, report) => sum + report.hours, 0);

    return {
      mentees: new Set(chats.map((chat) => chat.studentUid).filter(Boolean)).size,
      conversations: chats.length,
      approved,
      pending,
    };
  }, [chats, hours]);

  return (
    <main className="page-shell">
      <section className="page-head">
        <div>
          <h1>אזור חונכים</h1>
          <p>תמונת מצב על חניכים, שיחות ושעות מעורבות.</p>
        </div>
        <Chip tone="success">מאושר/ת</Chip>
      </section>

      <section className="metric-grid" aria-label="מדדים לחונך">
        <Card>
          <span className="metric-label">חניכים</span>
          <strong className="metric-value">{stats.mentees}</strong>
        </Card>
        <Card>
          <span className="metric-label">שיחות חניכים</span>
          <strong className="metric-value">{stats.conversations}</strong>
        </Card>
        <Card>
          <span className="metric-label">שעות מאושרות</span>
          <strong className="metric-value">{stats.approved}</strong>
        </Card>
        <Card>
          <span className="metric-label">שעות ממתינות</span>
          <strong className="metric-value">{stats.pending}</strong>
        </Card>
      </section>

      <section className="two-column">
        <Card>
          <div className="card-head">
            <h2>שיחות חניכים</h2>
            <Link to="/mentor/chat">לכל השיחות</Link>
          </div>
          <div className="compact-list">
            {chats.length === 0 && <div className="empty-state">אין שיחות חניכים עדיין</div>}
            {chats.slice(0, 5).map((chat) => (
              <Link className="compact-row" key={chat.id} to={`/mentor/chat/${chat.id}`}>
                <span>
                  {user
                    ? chat.participantNames?.[user.uid] ||
                      chat.chatNames?.[user.uid] ||
                      'חניך/ה'
                    : 'חניך/ה'}
                </span>
                <small>{chat.lastMessage || 'אין הודעות'}</small>
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <div className="card-head">
            <h2>פעולות מהירות</h2>
          </div>
          <div className="action-list">
            <Link to="/mentor/hours">דיווח שעות <Badge>חדש</Badge></Link>
            <Link to="/mentor/reflection">רפלקציה</Link>
            <Link to="/mentor/activity">פעילות אחרונה</Link>
          </div>
        </Card>
      </section>

      <section className="two-column" style={{ marginTop: '1.5rem' }}>
        <Card>
          <div className="card-head">
            <h2>רשת חברתית — שיחות אחרונות</h2>
            <Link to="/social">לכל השיחות</Link>
          </div>
          <div className="compact-list">
            {socialChats.length === 0 && (
              <div className="empty-state">אין שיחות ברשת החברתית עדיין</div>
            )}
            {socialChats.slice(0, 5).map((chat) => (
              <Link
                className="compact-row"
                key={chat.id}
                to={`/social/${chat.id}`}
              >
                <span>
                  {user ? getSocialChatTitle(chat, user.uid) : chat.chatName || 'שיחה'}
                  {chat.isGroup && (
                    <small style={{ marginRight: '0.4rem', opacity: 0.6 }}>קבוצה</small>
                  )}
                </span>
                <small>
                  {chat.lastSender ? `${chat.lastSender}: ` : ''}
                  {chat.lastMessage || 'אין הודעות'}
                </small>
                <time style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                  {formatTime(chat.lastMessageAt)}
                </time>
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <div className="card-head">
            <h2>גישה מהירה</h2>
          </div>
          <div className="action-list">
            <Link to="/social">שיחות DM</Link>
            <Link to="/discover">קבוצות</Link>
            <Link to="/mentoring">מתנדבים</Link>
            <Link to="/friends">חברים</Link>
          </div>
        </Card>
      </section>
    </main>
  );
}
