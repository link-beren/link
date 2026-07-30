import { arrayRemove, arrayUnion, collection, doc, increment, onSnapshot, orderBy, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { db } from '../lib/firebase';
import { useAuth } from '../auth/useAuth';
import { Button, Card, Chip } from '../components/ui';

type GroupCategory = 'gaming' | 'sports' | 'art' | 'literature' | 'science';

type Group = {
  id: string;
  name: string;
  description?: string;
  category?: GroupCategory;
  icon?: string;
  accentColor?: string;
  memberCount?: number;
};

const filters: Array<{ key: 'all' | GroupCategory; label: string }> = [
  { key: 'all', label: 'הכל' },
  { key: 'gaming', label: 'גיימינג' },
  { key: 'sports', label: 'ספורט' },
  { key: 'art', label: 'אמנות' },
  { key: 'literature', label: 'ספרות' },
  { key: 'science', label: 'מדע' },
];

const categoryMeta: Record<GroupCategory, { icon: string; color: string }> = {
  gaming: { icon: 'G', color: '#3b82f6' },
  sports: { icon: 'S', color: '#10b981' },
  art: { icon: 'A', color: '#be185d' },
  literature: { icon: 'L', color: '#f59e0b' },
  science: { icon: 'C', color: '#8b5cf6' },
};

function getGroupData(groupDoc: { id: string; data: () => Record<string, unknown> }): Group {
  const data = groupDoc.data();
  return {
    id: groupDoc.id,
    name: typeof data.name === 'string' ? data.name : 'קבוצה',
    description: typeof data.description === 'string' ? data.description : undefined,
    category: filters.some((filter) => filter.key === data.category)
      ? (data.category as GroupCategory)
      : undefined,
    icon: typeof data.icon === 'string' ? data.icon : undefined,
    accentColor: typeof data.accentColor === 'string' ? data.accentColor : undefined,
    memberCount: typeof data.memberCount === 'number' ? data.memberCount : 0,
  };
}

export function DiscoverPage() {
  const { user, profile } = useAuth();
  const [activeFilter, setActiveFilter] = useState<'all' | GroupCategory>('all');
  const [groups, setGroups] = useState<Group[]>([]);
  const [joinedGroupIds, setJoinedGroupIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState<GroupCategory>('gaming');
  const [actionId, setActionId] = useState<string | null>(null);

  const schoolId = profile?.schoolId;

  // Groups belong to a school. Without the filter the rules reject the whole
  // query — a Firestore query fails outright if any single result is
  // unreadable — so the list would come back empty, not over-broad.
  useEffect(() => {
    if (!schoolId) {
      setGroups([]);
      return;
    }

    const groupsQuery = query(
      collection(db, 'groups'),
      where('schoolId', '==', schoolId),
      orderBy('name'),
    );
    return onSnapshot(
      groupsQuery,
      (snapshot) => setGroups(snapshot.docs.map(getGroupData)),
      () => setGroups([]),
    );
  }, [schoolId]);

  useEffect(() => {
    if (!user) return;

    return onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
      const ids = Array.isArray(snapshot.data()?.joinedGroupIds)
        ? (snapshot.data()?.joinedGroupIds as unknown[]).filter(
            (id): id is string => typeof id === 'string',
          )
        : [];
      setJoinedGroupIds(ids);
    });
  }, [user]);

  const filteredGroups = useMemo(
    () =>
      groups.filter(
        (group) => activeFilter === 'all' || group.category === activeFilter,
      ),
    [activeFilter, groups],
  );

  async function createGroup() {
    // schoolId is mandatory: the rules reject a group document without one,
    // and reject one carrying a school other than the creator's.
    if (!user || !newName.trim() || !schoolId) return;
    setActionId('create');

    try {
      const groupRef = doc(collection(db, 'groups'));
      const meta = categoryMeta[newCategory];
      const batch = writeBatch(db);

      batch.set(groupRef, {
        name: newName.trim(),
        description: newDescription.trim(),
        category: newCategory,
        icon: meta.icon,
        accentColor: meta.color,
        schoolId,
        createdBy: user.uid,
        createdByName: profile?.nickname || user.email || 'A user',
        memberCount: 1,
        createdAt: serverTimestamp(),
      });
      batch.set(doc(db, 'groups', groupRef.id, 'members', user.uid), {
        nickname: profile?.nickname || user.email || 'A user',
        role: 'admin',
        joinedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'users', user.uid), {
        joinedGroupIds: arrayUnion(groupRef.id),
      }, { merge: true });
      batch.set(doc(db, 'chats', groupRef.id), {
        isGroup: true,
        type: 'group',
        groupId: groupRef.id,
        groupName: newName.trim(),
        schoolId,
        participants: [user.uid],
      }, { merge: true });

      await batch.commit();
      setNewName('');
      setNewDescription('');
      setCreating(false);
    } finally {
      setActionId(null);
    }
  }

  async function toggleJoin(group: Group) {
    if (!user) return;
    setActionId(group.id);
    const joined = joinedGroupIds.includes(group.id);

    try {
      const batch = writeBatch(db);

      if (joined) {
        batch.delete(doc(db, 'groups', group.id, 'members', user.uid));
        batch.update(doc(db, 'groups', group.id), { memberCount: increment(-1) });
        batch.set(doc(db, 'users', user.uid), {
          joinedGroupIds: arrayRemove(group.id),
        }, { merge: true });
        batch.set(doc(db, 'chats', group.id), {
          participants: arrayRemove(user.uid),
        }, { merge: true });
      } else {
        batch.set(doc(db, 'groups', group.id, 'members', user.uid), {
          nickname: profile?.nickname || user.email || 'משתמש/ת',
          role: 'member',
          joinedAt: serverTimestamp(),
        });
        batch.update(doc(db, 'groups', group.id), { memberCount: increment(1) });
        batch.set(doc(db, 'users', user.uid), {
          joinedGroupIds: arrayUnion(group.id),
        }, { merge: true });
        batch.set(doc(db, 'chats', group.id), {
          participants: arrayUnion(user.uid),
        }, { merge: true });
      }

      await batch.commit();
    } finally {
      setActionId(null);
    }
  }

  return (
    <main className="discover-page">
      <section className="friends-header">
        <div>
          <h1>גלה קבוצות</h1>
          <p>מצא/י קבוצות לפי תחומי עניין והצטרף/י לשיחות קבוצתיות.</p>
        </div>
        <Button type="button" onClick={() => setCreating((value) => !value)}>
          {creating ? 'ביטול' : 'קבוצה חדשה'}
        </Button>
      </section>

      {creating && (
        <Card className="create-group-card">
          <label>
            שם הקבוצה
            <input value={newName} onChange={(event) => setNewName(event.target.value)} />
          </label>
          <label>
            תיאור
            <textarea
              value={newDescription}
              onChange={(event) => setNewDescription(event.target.value)}
            />
          </label>
          <label>
            קטגוריה
            <select
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value as GroupCategory)}
            >
              {filters.slice(1).map((filter) => (
                <option key={filter.key} value={filter.key}>{filter.label}</option>
              ))}
            </select>
          </label>
          <Button type="button" disabled={actionId === 'create'} onClick={() => void createGroup()}>
            צור קבוצה
          </Button>
        </Card>
      )}

      <div className="filter-row">
        {filters.map((filter) => (
          <button
            type="button"
            key={filter.key}
            className={activeFilter === filter.key ? 'filter-chip filter-chip-active' : 'filter-chip'}
            onClick={() => setActiveFilter(filter.key)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <section className="group-grid">
        {filteredGroups.length === 0 && <div className="empty-state">אין קבוצות להצגה</div>}
        {filteredGroups.map((group) => {
          const joined = joinedGroupIds.includes(group.id);
          return (
            <Card key={group.id} className="group-card">
              <div className="group-card-top">
                <span>{group.icon || group.name[0]}</span>
                <Chip tone={joined ? 'success' : 'muted'}>
                  {joined ? 'חבר/ה' : `${group.memberCount || 0} פעילים`}
                </Chip>
              </div>
              <h2>{group.name}</h2>
              <p>{group.description || 'אין תיאור לקבוצה.'}</p>
              <Button
                tone={joined ? 'muted' : 'primary'}
                type="button"
                disabled={actionId === group.id}
                onClick={() => void toggleJoin(group)}
              >
                {joined ? 'עזוב קבוצה' : 'הצטרף'}
              </Button>
            </Card>
          );
        })}
      </section>
    </main>
  );
}
