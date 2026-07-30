import { addDoc, collection, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { db } from '../lib/firebase';
import { useAuth } from '../auth/useAuth';
import { Avatar, Button, SearchBox } from '../components/ui';

type ChatSummary = {
  id: string;
  chatName?: string;
  // participantNames הוא השדה הקנוני (מובייל + פאנל אדמין);
  // chatNames נותר לקריאה בלבד עבור מסמכים שנוצרו בגרסאות ווב קודמות.
  participantNames?: Record<string, string>;
  chatNames?: Record<string, string>;
  groupName?: string;
  lastMessage?: string;
  lastSender?: string;
  isGroup?: boolean;
  partnerUid?: string | null;
  lastMessageAt?: {
    toDate?: () => Date;
  };
};

type Message = {
  id: string;
  text: string;
  senderId: string;
  senderName?: string;
};

type SearchUser = {
  id: string;
  nickname: string;
  role?: string;
  avatarUrl?: string;
};

function formatTime(ts?: ChatSummary['lastMessageAt']) {
  const date = ts?.toDate?.();
  if (!date) return '';
  return date.toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getDmChatId(uidA: string, uidB: string) {
  return [uidA, uidB].sort().join('_');
}

// סוג השיחה נגזר ממזהה המסמך ולא נכתב קבוע כ-'dm'. קודם כל הודעה בשיחת ליווי
// דרסה את type ל-'dm' ב-merge, וכך השיחה נעלמה מכל מסך שמסנן 'mentoring'
// (בית המתנדב, פורטל הצוות) וגם מניתוב התראות המצוקה.
function deriveChatType(chatId: string, isGroup?: boolean) {
  if (isGroup) return 'group';
  if (chatId.startsWith('mentoring_')) return 'mentoring';
  if (chatId.startsWith('staff_')) return 'staff';
  return 'dm';
}

function getChatTitle(chat: ChatSummary, currentUid: string) {
  if (chat.isGroup) return chat.groupName || chat.chatName || 'קבוצה';
  if (chat.participantNames?.[currentUid]) return chat.participantNames[currentUid];
  if (chat.chatNames?.[currentUid]) return chat.chatNames[currentUid];
  return chat.chatName || 'שיחה';
}

type PendingPartnerState = {
  partnerUid?: string;
  partnerNickname?: string;
  myNickname?: string;
};

export function ChatPage() {
  const { user, profile } = useAuth();
  const { chatId } = useParams();
  const location = useLocation();
  const pendingPartner = location.state as PendingPartnerState | null;
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatSummary | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [helpRequested, setHelpRequested] = useState(false);
  const schoolId = profile?.schoolId;
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!user) return;

    const chatsQuery = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid),
      orderBy('lastMessageAt', 'desc'),
    );

    return onSnapshot(
      chatsQuery,
      (snapshot) => {
        const nextChats = snapshot.docs.map((chatDoc) => ({
          id: chatDoc.id,
          ...(chatDoc.data() as Omit<ChatSummary, 'id'>),
        }));
        setChats(nextChats);
        setSelectedChat((current) => {
          if (chatId) {
            return nextChats.find((chat) => chat.id === chatId) || current;
          }
          if (current) {
            return nextChats.find((chat) => chat.id === current.id) || current;
          }
          return nextChats[0] || null;
        });
      },
      () => setChats([]),
    );
  }, [chatId, user]);

  useEffect(() => {
    if (!user || !pendingPartner?.partnerUid) return;
    const partnerUid = pendingPartner.partnerUid;
    const dmChatId = getDmChatId(user.uid, partnerUid);

    setSelectedChat((current) => {
      if (current?.id === dmChatId) return current;
      return {
        id: dmChatId,
        isGroup: false,
        partnerUid,
        participantNames: {
          [user.uid]: pendingPartner.partnerNickname || 'משתמש/ת',
          [partnerUid]: pendingPartner.myNickname || profile?.nickname || user.email || 'משתמש/ת',
        },
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, pendingPartner?.partnerUid]);

  useEffect(() => {
    if (!selectedChat) {
      setMessages([]);
      return;
    }

    const messagesQuery = query(
      collection(db, 'chats', selectedChat.id, 'messages'),
      orderBy('createdAt', 'asc'),
    );

    return onSnapshot(
      messagesQuery,
      (snapshot) => {
        setMessages(
          snapshot.docs.map((messageDoc) => ({
            id: messageDoc.id,
            ...(messageDoc.data() as Omit<Message, 'id'>),
          })),
        );
      },
      () => setMessages([]),
    );
  }, [selectedChat]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const selectedTitle = useMemo(
    () => (selectedChat && user ? getChatTitle(selectedChat, user.uid) : 'בחר/י שיחה'),
    [selectedChat, user],
  );

  async function handleSearch(value: string) {
    setSearch(value);

    // Without a school there is nobody to find. Running the query unfiltered
    // would not return other schools' students \u2014 the rules reject the read,
    // and a Firestore query fails as a whole if any single result is
    // unreadable \u2014 it would just fail with a permission error.
    if (!user || !schoolId || value.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);

    try {
      const usersQuery = query(
        collection(db, 'users'),
        where('schoolId', '==', schoolId),
        where('nickname', '>=', value.trim()),
        where('nickname', '<=', `${value.trim()}\uf8ff`),
        limit(12),
      );
      const snapshot = await getDocs(usersQuery);
      setSearchResults(
        snapshot.docs
          .filter((userDoc) => userDoc.id !== user.uid)
          // צוות ואדמין אינם ניתנים לפנייה ישירה: שיחה עם הצוות נפתחת רק
          // דרך התראת מצוקה מנותבת, ואדמין אינו משתמש-קצה בכלל.
          .filter((userDoc) => {
            const role = userDoc.data().role;
            return role === 'student' || role === 'mentor';
          })
          .map((userDoc) => {
            const data = userDoc.data();
            return {
              id: userDoc.id,
              nickname:
                typeof data.nickname === 'string'
                  ? data.nickname
                  : typeof data.email === 'string'
                    ? data.email
                    : 'משתמש/ת',
              role: typeof data.role === 'string' ? data.role : undefined,
              avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : undefined,
            };
          }),
      );
    } finally {
      setSearching(false);
    }
  }

  function openUserChat(searchUser: SearchUser) {
    if (!user) return;
    const chatId = getDmChatId(user.uid, searchUser.id);
    const chat: ChatSummary = {
      id: chatId,
      isGroup: false,
      partnerUid: searchUser.id,
      participantNames: {
        [user.uid]: searchUser.nickname,
        [searchUser.id]: profile?.nickname || user.email || 'משתמש/ת',
      },
    };
    setSelectedChat(chat);
    setSearch('');
    setSearchResults([]);
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!user || !selectedChat || !text.trim()) return;
    const messageText = text.trim();
    setText('');
    const senderName = profile?.nickname || user.email?.split('@')[0] || 'משתמש/ת';

    await addDoc(collection(db, 'chats', selectedChat.id, 'messages'), {
      text: messageText,
      senderId: user.uid,
      senderName,
      createdAt: serverTimestamp(),
    });

    if (selectedChat.isGroup) {
      await setDoc(doc(db, 'chats', selectedChat.id), {
        lastMessage: messageText,
        lastMessageAt: serverTimestamp(),
        lastSender: senderName,
        isGroup: true,
        type: 'group',
      }, { merge: true });
    } else {
      const names = selectedChat.participantNames || selectedChat.chatNames;
      await setDoc(doc(db, 'chats', selectedChat.id), {
        lastMessage: messageText,
        lastMessageAt: serverTimestamp(),
        lastSender: senderName,
        participants: [user.uid, selectedChat.partnerUid].filter(Boolean),
        partnerUid: selectedChat.partnerUid || null,
        isGroup: false,
        type: deriveChatType(selectedChat.id, false),
        ...(names ? { participantNames: names, chatNames: names } : {}),
      }, { merge: true });
    }
  }

  async function requestHelp() {
    if (!user || !selectedChat) return;
    const confirmed = window.confirm('האם אתה/ת בטוח/ה שברצונך לבקש עזרה מאדמין? האדמין יוכל לצפות בתוכן השיחה הזו.');
    if (!confirmed) return;
    await updateDoc(doc(db, 'chats', selectedChat.id), {
      helpRequested: true,
      helpRequestedAt: serverTimestamp(),
      helpRequestedBy: user.uid,
    });
    setHelpRequested(true);
  }

  return (
    <main className="chat-page">
      <aside className="chat-master">
        <SearchBox
          placeholder="חיפוש משתמשים לפי כינוי..."
          value={search}
          onChange={(event) => void handleSearch(event.target.value)}
        />

        {search.length >= 2 && (
          <div className="search-results">
            {searching && <div className="empty-state">מחפש...</div>}
            {!searching && searchResults.length === 0 && (
              <div className="empty-state">לא נמצאו משתמשים</div>
            )}
            {searchResults.map((searchUser) => (
              <button
                key={searchUser.id}
                type="button"
                className="chat-row"
                onClick={() => openUserChat(searchUser)}
              >
                <Avatar name={searchUser.nickname} src={searchUser.avatarUrl} />
                <span>{searchUser.nickname}</span>
              </button>
            ))}
          </div>
        )}

        <div className="chat-list">
          {chats.length === 0 && <div className="empty-state">אין שיחות עדיין</div>}
          {chats.map((chat) => (
            <button
              key={chat.id}
              type="button"
              className={selectedChat?.id === chat.id ? 'chat-row chat-row-active' : 'chat-row'}
              onClick={() => setSelectedChat(chat)}
            >
              <Avatar name={user ? getChatTitle(chat, user.uid) : chat.chatName} />
              <span className="chat-row-body">
                <strong>{user ? getChatTitle(chat, user.uid) : chat.chatName}</strong>
                <small>{chat.lastSender ? `${chat.lastSender}: ` : ''}{chat.lastMessage || 'אין הודעות'}</small>
              </span>
              <time>{formatTime(chat.lastMessageAt)}</time>
            </button>
          ))}
        </div>
      </aside>

      <section className="chat-detail">
        <header className="chat-detail-head">
          <h1>{selectedTitle}</h1>
          <span>{selectedChat?.isGroup ? 'קבוצה' : 'שיחה פרטית'}</span>
          {selectedChat && (
            <Button
              type="button"
              onClick={() => void requestHelp()}
              disabled={helpRequested}
              style={{ marginRight: 'auto', fontSize: '13px' }}
            >
              {helpRequested ? '✅ בקשת עזרה נשלחה' : '🆘 בקש עזרה מאדמין'}
            </Button>
          )}
        </header>

        <div className="message-list">
          {!selectedChat && <div className="empty-state">בחר/י שיחה מהרשימה</div>}
          {selectedChat && messages.length === 0 && (
            <div className="empty-state">אין הודעות עדיין</div>
          )}
          {messages.map((message) => {
            const mine = message.senderId === user?.uid;
            return (
              <article key={message.id} className={mine ? 'message message-mine' : 'message'}>
                <strong>{message.senderName || 'משתמש/ת'}</strong>
                <p>{message.text}</p>
              </article>
            );
          })}
          <div ref={endRef} />
        </div>

        <form className="message-form" onSubmit={(event) => void sendMessage(event)}>
          <input
            value={text}
            disabled={!selectedChat}
            placeholder="כתוב/י הודעה..."
            onChange={(event) => setText(event.target.value)}
          />
          <Button type="submit" disabled={!selectedChat || !text.trim()}>
            שלח
          </Button>
        </form>
      </section>
    </main>
  );
}
