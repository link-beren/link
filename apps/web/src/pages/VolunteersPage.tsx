import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { Avatar, Button, Card, Chip, SearchBox } from '../components/ui';
import { db } from '../lib/firebase';
import { gradeLabel } from '../config/market';

type MentorProfile = {
  id: string;
  nickname: string;
  email?: string;
  avatarUrl?: string;
  gradeLevel?: string;
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

  const schoolId = profile?.schoolId;

  useEffect(() => {
    // Peer mentors come from the student's own school. The schoolId filter is
    // not cosmetic: the rules reject a read of any out-of-school user, and a
    // Firestore query fails as a whole if a single result is unreadable — so
    // without this filter the list does not come back partly filtered, it
    // comes back empty.
    if (!schoolId) {
      setMentors([]);
      return;
    }

    const mentorsQuery = query(
      collection(db, 'users'),
      where('schoolId', '==', schoolId),
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
                    : 'Peer mentor',
              email: typeof data.email === 'string' ? data.email : undefined,
              avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : undefined,
              gradeLevel: typeof data.gradeLevel === 'string' ? data.gradeLevel : undefined,
            };
          }),
        );
      },
      () => setMentors([]),
    );
  }, [schoolId]);

  const filteredMentors = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return mentors;
    return mentors.filter((mentor) =>
      [mentor.nickname, mentor.email, gradeLabel(mentor.gradeLevel)]
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
        {filteredMentors.length === 0 && (
          <div className="empty-state">No peer mentors are available at your school right now</div>
        )}
        {filteredMentors.map((mentor) => (
          <Card key={mentor.id} className="mentor-card">
            <Avatar name={mentor.nickname} src={mentor.avatarUrl} />
            <div>
              <h2>{mentor.nickname}</h2>
              <p>{gradeLabel(mentor.gradeLevel) || mentor.email || 'Approved peer mentor'}</p>
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
