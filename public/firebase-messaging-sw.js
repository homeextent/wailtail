// Firebase Cloud Messaging Background Service Worker for Wailtail Auctions
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyCfNsFjLPai4Vr6NqsSlc4vLVpKLNJNymQ",
  authDomain: "studio-apps-483721.firebaseapp.com",
  projectId: "studio-apps-483721",
  storageBucket: "studio-apps-483721.firebasestorage.app",
  messagingSenderId: "767927725806",
  appId: "1:767927725806:web:c366ad85b6e13322628dff"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);

  const notificationTitle = payload.notification?.title || payload.data?.title || 'Wailtail Auction Alert';
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || 'New live auction activity update.',
    icon: payload.notification?.icon || payload.data?.icon || '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    data: payload.data || {},
    tag: payload.data?.tag || 'wailtail-outbid-alert',
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || event.notification.data?.click_action || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
