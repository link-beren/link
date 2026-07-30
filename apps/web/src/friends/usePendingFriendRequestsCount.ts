import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { useAuth } from '../auth/useAuth';

export function usePendingFriendRequestsCount() {
  const { status, user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (status !== 'authenticated' || !user) {
      setCount(0);
      return;
    }

    const requestsQuery = query(
      collection(db, 'friendRequests'),
      where('toUid', '==', user.uid),
      where('status', '==', 'pending'),
    );

    return onSnapshot(
      requestsQuery,
      (snapshot) => setCount(snapshot.size),
      () => setCount(0),
    );
  }, [status, user]);

  return count;
}
