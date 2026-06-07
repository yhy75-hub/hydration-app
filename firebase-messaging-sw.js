// ===== 【要変更】FirebaseプロジェクトのAPIキーに変更 =====
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyAX1QmJoIVN67GKMoXV1oIbNmV1bk-E2aM',
  authDomain: 'hydration-850bd.firebaseapp.com',
  projectId: 'hydration-850bd',
  storageBucket: 'hydration-850bd.firebasestorage.app',
  messagingSenderId: '385339912693',
  appId: '1:385339912693:web:4db23ab0e1e6f8c35630bc'
});

const messaging = firebase.messaging();

// バックグラウンド通知受信
const APP_URL = '/hydration-app/';

messaging.onBackgroundMessage(payload => {
  const { title, body } = payload.notification;
  self.registration.showNotification(title, {
    body,
    icon: '/hydration-app/icons/icon-192.png',
    badge: '/hydration-app/icons/icon-192.png',
    tag: 'hydration',
    renotify: true,
    data: { url: APP_URL }
  });
});

// 通知タップで画面を開く
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const targetUrl = (e.notification.data && e.notification.data.url) || APP_URL;
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(APP_URL));
      return existing ? existing.focus() : clients.openWindow(targetUrl);
    })
  );
});
