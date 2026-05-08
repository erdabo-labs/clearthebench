self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  const tag = (data.tag || 'rotation') + '-' + (data.gameId || 'alert');
  const autoDismissMs = data.autoDismissMs || 0;

  const shown = self.registration.showNotification(data.title || 'Time to Rotate!', {
    body: data.body || 'Rotation window is open',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200, 100, 200],
    tag,
    renotify: true,
  });

  if (autoDismissMs > 0) {
    event.waitUntil(
      shown.then(() => new Promise(resolve => {
        setTimeout(() => {
          self.registration.getNotifications({ tag }).then(ns => {
            ns.forEach(n => n.close());
            resolve();
          });
        }, autoDismissMs);
      }))
    );
  } else {
    event.waitUntil(shown);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin)) return c.focus();
      }
      return clients.openWindow('/');
    })
  );
});
