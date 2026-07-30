importScripts('https://www.gstatic.com/firebasejs/12.15.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.15.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCDk8kiDDdQJwggqaymUIG0vdxz40XFR5s',
  authDomain: 'link-app-965dd.firebaseapp.com',
  projectId: 'link-app-965dd',
  storageBucket: 'link-app-965dd.firebasestorage.app',
  messagingSenderId: '87561510798',
  appId: '1:87561510798:web:1726be658265d05bb7cedf',
  measurementId: 'G-WHDP1JTHL8',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'Link';
  const options = {
    body: payload.notification?.body || 'You have a new notification',
    icon: '/link-icon.svg',
    badge: '/link-icon.svg',
    data: payload.data || {},
  };

  self.registration.showNotification(title, options);
});
