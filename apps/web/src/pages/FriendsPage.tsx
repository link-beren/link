import { arrayRemove, arrayUnion, collection, doc, getDoc, onSnapshot, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import { useAuth } from '../auth/useAuth';

type FriendProfile = {
  id: string;
  nickname?: string;
  email?: string;
  role?: string;
  avatarUrl?: string;
};

type FriendRequest = {
  id: string;
  fromUid: string;
  toUid: string;
  status: 'pending' | 'accepted' | 'declined';
  senderNickname: string;
  senderAvatarUrl?: string;
};

type FriendsTab = 'requests' | 'friends';

function getInitials(name?: string) {
  return (name?.trim()?.[0] || '?').toUpperCase();
}

function getRoleLabel(role?: string) {
  if (role === 'student') return 'תלמיד/ה';
  if (role === 'mentor') return 'מתנדב/ת';
  if (role === 'staff') return 'צוות';
  return 'משתמש/ת';
}

async function getUserProfile(uid: string): Promise<FriendProfile | null> {
  const userSnap = await getDoc(doc(db, 'users', uid));

  if (!userSnap.exists()) {
    return null;
  }

  const data = userSnap.data();

  return {
    id: userSnap.id,
    nickname: typeof data.nickname === 'string' ? data.nickname : undefined,
    email: typeof data.email === 'string' ? data.email : undefined,
    role: typeof data.role === 'string' ? data.role : undefined,
    avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : undefined,
  };
}

export function FriendsPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<FriendsTab>('requests');
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const requestsQuery = query(
      collection(db, 'friendRequests'),
      where('toUid', '==', user.uid),
      where('status', '==', 'pending'),
    );

    return onSnapshot(
      requestsQuery,
      async (snapshot) => {
        const pendingRequests = await Promise.all(
          snapshot.docs.map(async (requestDoc) => {
            const data = requestDoc.data();
            const fromUid = typeof data.fromUid === 'string' ? data.fromUid : '';
            const sender = fromUid ? await getUserProfile(fromUid) : null;

            return {
              id: requestDoc.id,
              fromUid,
              toUid: typeof data.toUid === 'string' ? data.toUid : '',
              status: 'pending' as const,
              senderNickname: sender?.nickname || sender?.email || 'משתמש/ת',
              senderAvatarUrl: sender?.avatarUrl,
            };
          }),
        );

        setRequests(pendingRequests.filter((request) => request.fromUid));
        setLoadingRequests(false);
      },
      () => {
        setRequests([]);
        setLoadingRequests(false);
      },
    );
  }, [user]);

  useEffect(() => {
    if (!user) return;

    return onSnapshot(
      doc(db, 'users', user.uid),
      async (snapshot) => {
        const friendUids = Array.isArray(snapshot.data()?.friends)
          ? (snapshot.data()?.friends as unknown[]).filter(
              (uid): uid is string => typeof uid === 'string',
            )
          : [];

        if (friendUids.length === 0) {
          setFriends([]);
          setLoadingFriends(false);
          return;
        }

        const friendProfiles = await Promise.all(friendUids.map(getUserProfile));
        setFriends(friendProfiles.filter((friend): friend is FriendProfile => !!friend));
        setLoadingFriends(false);
      },
      () => {
        setFriends([]);
        setLoadingFriends(false);
      },
    );
  }, [user]);

  const activeLoading = useMemo(
    () => (tab === 'requests' ? loadingRequests : loadingFriends),
    [loadingFriends, loadingRequests, tab],
  );

  async function acceptRequest(request: FriendRequest) {
    if (!user) return;
    setActionId(request.id);

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'friendRequests', request.id), { status: 'accepted' });
      batch.update(doc(db, 'users', user.uid), { friends: arrayUnion(request.fromUid) });
      batch.update(doc(db, 'users', request.fromUid), { friends: arrayUnion(user.uid) });
      await batch.commit();
    } finally {
      setActionId(null);
    }
  }

  async function declineRequest(request: FriendRequest) {
    setActionId(request.id);

    try {
      await updateDoc(doc(db, 'friendRequests', request.id), { status: 'declined' });
    } finally {
      setActionId(null);
    }
  }

  function openChatWithFriend(friend: FriendProfile) {
    if (!user) return;

    navigate('/social', {
      state: {
        partnerUid: friend.id,
        partnerNickname: friend.nickname || friend.email || 'משתמש/ת',
        myNickname: profile?.nickname || user.email || 'משתמש/ת',
      },
    });
  }

  async function removeFriend(friend: FriendProfile) {
    if (!user) return;
    const approved = window.confirm(`להסיר את ${friend.nickname || friend.email || 'המשתמש/ת'} מרשימת החברים?`);

    if (!approved) return;
    setActionId(friend.id);

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', user.uid), { friends: arrayRemove(friend.id) });
      batch.update(doc(db, 'users', friend.id), { friends: arrayRemove(user.uid) });
      await batch.commit();
    } finally {
      setActionId(null);
    }
  }

  return (
    <main className="friends-page">
      <section className="friends-header" aria-labelledby="friends-title">
        <div>
          <h1 id="friends-title">חברים</h1>
          <p>ניהול בקשות חברות ורשימת החברים שלך.</p>
        </div>
        {requests.length > 0 && (
          <span className="request-summary">{requests.length} בקשות ממתינות</span>
        )}
      </section>

      <div className="tabs" role="tablist" aria-label="חברים">
        <button
          type="button"
          className={tab === 'requests' ? 'tab-button tab-button-active' : 'tab-button'}
          onClick={() => setTab('requests')}
        >
          בקשות
          {requests.length > 0 && <span className="tab-badge">{requests.length}</span>}
        </button>
        <button
          type="button"
          className={tab === 'friends' ? 'tab-button tab-button-active' : 'tab-button'}
          onClick={() => setTab('friends')}
        >
          החברים שלי
          <span className="tab-count">{friends.length}</span>
        </button>
      </div>

      <section className="friends-list" aria-live="polite">
        {activeLoading && <div className="empty-state">טוען...</div>}

        {!activeLoading && tab === 'requests' && requests.length === 0 && (
          <div className="empty-state">אין בקשות ממתינות</div>
        )}

        {!activeLoading && tab === 'friends' && friends.length === 0 && (
          <div className="empty-state">אין חברים עדיין</div>
        )}

        {!activeLoading &&
          tab === 'requests' &&
          requests.map((request) => (
            <article className="friend-row" key={request.id}>
              <div className="avatar">{getInitials(request.senderNickname)}</div>
              <div className="friend-info">
                <h2>{request.senderNickname}</h2>
                <p>שלח/ה לך בקשת חברות</p>
              </div>
              <div className="friend-actions">
                <button
                  className="accept-button"
                  type="button"
                  disabled={actionId === request.id}
                  onClick={() => void acceptRequest(request)}
                >
                  אשר
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  disabled={actionId === request.id}
                  onClick={() => void declineRequest(request)}
                >
                  דחה
                </button>
              </div>
            </article>
          ))}

        {!activeLoading &&
          tab === 'friends' &&
          friends.map((friend) => (
            <article className="friend-row" key={friend.id}>
              <div className="avatar">{getInitials(friend.nickname || friend.email)}</div>
              <div className="friend-info">
                <h2>{friend.nickname || friend.email || 'משתמש/ת'}</h2>
                <p>{getRoleLabel(friend.role)}</p>
              </div>
              <div className="friend-actions">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => openChatWithFriend(friend)}
                >
                  פתח שיחה
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  disabled={actionId === friend.id}
                  onClick={() => void removeFriend(friend)}
                >
                  הסר
                </button>
              </div>
            </article>
          ))}
      </section>
    </main>
  );
}
