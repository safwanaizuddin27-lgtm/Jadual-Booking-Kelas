// Minimal service worker for Jadual Kelas 4 Sigma.
// Its only job is to let the page call registration.showNotification()
// so real OS-level notification banners work reliably (including on
// Android Chrome, where plain `new Notification()` from page script is
// restricted). There is no push server behind this, so it does not
// listen for 'push' events - notifications are triggered directly by
// the open page when it sees a new event in Firestore.

self.addEventListener('install', function(event) {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});
