import {
  collection, doc, writeBatch, increment, serverTimestamp, arrayUnion, arrayRemove,
} from 'firebase/firestore';
import { db } from './firebase';

export async function createGroup({ name, description, category, icon, accentColor, uid, nickname }) {
  const groupRef = doc(collection(db, 'groups'));
  const batch = writeBatch(db);

  batch.set(groupRef, {
    name,
    description,
    category,
    icon,
    accentColor,
    createdBy: uid,
    createdByName: nickname,
    memberCount: 1,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, 'groups', groupRef.id, 'members', uid), {
    nickname,
    role: 'admin',
    joinedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'users', uid), { joinedGroupIds: arrayUnion(groupRef.id) }, { merge: true });
  // צ'אט הקבוצה — נוצר עם רשימת המשתתפים כדי שיהיה מסונכרן עם ההאזנות הקיימות (App.js)
  batch.set(doc(db, 'chats', groupRef.id), {
    isGroup: true,
    type: 'group',
    groupId: groupRef.id,
    groupName: name,
    participants: [uid],
  }, { merge: true });

  await batch.commit();
  return groupRef.id;
}

export async function joinGroup(groupId, uid, nickname) {
  const batch = writeBatch(db);

  batch.set(doc(db, 'groups', groupId, 'members', uid), {
    nickname,
    role: 'member',
    joinedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'groups', groupId), { memberCount: increment(1) });
  batch.set(doc(db, 'users', uid), { joinedGroupIds: arrayUnion(groupId) }, { merge: true });
  batch.set(doc(db, 'chats', groupId), { participants: arrayUnion(uid) }, { merge: true });

  await batch.commit();
}

export async function leaveGroup(groupId, uid) {
  const batch = writeBatch(db);

  batch.delete(doc(db, 'groups', groupId, 'members', uid));
  batch.update(doc(db, 'groups', groupId), { memberCount: increment(-1) });
  batch.set(doc(db, 'users', uid), { joinedGroupIds: arrayRemove(groupId) }, { merge: true });
  batch.set(doc(db, 'chats', groupId), { participants: arrayRemove(uid) }, { merge: true });

  await batch.commit();
}
