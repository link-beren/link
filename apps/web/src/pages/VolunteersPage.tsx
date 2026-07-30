import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { Avatar, Button, Card, Chip, SearchBox } from '../components/ui';
import { db } from '../lib/firebase';

type MentorProfile = {
  id: string;
  nickname: string;
  email?: string;
  avatarUrl?: string;
  className?: string;
};

function getMentoringChatId(studentUid: string, mentorUid: string) {
  return `mentoring_${[studentUid, mentorUid].sort().join('_')}`;
}

export function VolunteersPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [mentors, setMentors] = useState<MentorProfile[]>([]);
  const [search, setSearch] = useState('');
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    const mentorsQuery = query(
      collection(db, 'users'),
      where('role', '==', 'mentor'),
      where('mentorStatus', '==', 'approved'),
    );

    return onSnapshot(
      mentorsQuery,
      (snapshot) => {
        setMentors(
          snapshot.docs.map((mentorDoc) => {
            const data = mentorDoc.data();
            return {
              id: mentorDoc.id,
              nickname:
                typeof data.nickname === 'string'
                  ? data.nickname
                  : typeof data.email === 'string'
                    ? data.email
                    : 'חונך/ת',
              email: typeof data.email === 'string' ? data.email : undefined,
              avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : undefined,
              className: typeof data.className === 'string' ? data.className : undefined,
            };
          }),
        );
      },
      () => setMentors([]),
    );
  }, []);

  const filteredMentors = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return mentors;
    return mentors.filter((mentor) =>
      [mentor.nickname, mentor.email, mentor.className]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term)),
    );
  }, [mentors, search]);

  async function openMentoringChat(mentor: MentorProfile) {
    if (!user) return;
    const chatId = getMentoringChatId(user.uid, mentor.id);
    const studentName = profile?.nickname || user.email || 'תלמיד/ה';
    setOpeningId(mentor.id);

    try {
      await setDoc(
        doc(db, 'chats', chatId),
        {
          participants: [user.uid, mentor.id],
          studentUid: user.uid,
          mentorUid: mentor.id,
          type: 'mentoring',
          isGroup: false,
          // participantNames הוא השדה הקנוני; chatNames נשמר לתאימות אחורה
          participantNames: {
            [user.uid]: mentor.nickname,
            [mentor.id]: studentName,
          },
          chatNames: {
            [user.uid]: mentor.nickname,
            [mentor.id]: studentName,
          },
          lastMessage: 'שיחת ליווי נפתחה',
          lastSender: 'Link',
          lastMessageAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true },
      );
      navigate(`/social/${chatId}`);
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <main className="page-shell">
      <section className="page-head">
        <div>
          <h1>מתנדבים</h1>
          <p>בחירת חונך/ת מאושר/ת ופתיחת שיחת ליווי אישית.</p>
        </div>
        <Chip tone="success">{mentors.length} זמינים</Chip>
      </section>

      <SearchBox
        placeholder="חיפוש חונך/ת..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      <section className="mentor-grid" aria-live="polite">
        {filteredMentors.length === 0 && <div className="empty-state">אין חונכים זמינים כרגע</div>}
        {filteredMentors.map((mentor) => (
          <Card key={mentor.id} className="mentor-card">
            <Avatar name={mentor.nickname} src={mentor.avatarUrl} />
            <div>
              <h2>{mentor.nickname}</h2>
              <p>{mentor.className || mentor.email || 'חונך/ת מאושר/ת'}</p>
            </div>
            <Button
              type="button"
              disabled={openingId === mentor.id}
              onClick={() => void openMentoringChat(mentor)}
            >
              פתיחת שיחה
            </Button>
          </Card>
        ))}
      </section>
    </main>
  );
}
