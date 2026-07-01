importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyD2rPXVNfX-Rr4ggmjds9pLm2aWk8A52zg',
  authDomain: 'hydration-v2.firebaseapp.com',
  projectId: 'hydration-v2',
  storageBucket: 'hydration-v2.firebasestorage.app',
  messagingSenderId: '347969374865',
  appId: '1:347969374865:web:b7e47a8ecd0a2de1d8cd30'
});

const messaging = firebase.messaging();

const APP_URL = '/hydration-app/';

messaging.onBackgroundMessage(payload => {
  if (payload.notification) return;
  const title = (payload.data && payload.data.title) || '水分補給リマインダー';
  const body  = (payload.data && payload.data.body)  || 'チェックしてね';
  self.registration.showNotification(title, {
    body,
    icon: '/hydration-app/icons/icon-192.png',
    badge: '/hydration-app/icons/icon-192.png',
    tag: 'hydration',
    renotify: true,
    data: { url: APP_URL }
  });
});

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
