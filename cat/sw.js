// 猫の気持ちは https://kosa0721-sys.github.io/cat_app/ に移転しました。
// 古いサービスワーカーを置き換えて、キャッシュを消して自分を解除します。
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('cat-mood-')).map(k => caches.delete(k)));
    await self.registration.unregister();
    const cs = await self.clients.matchAll({ type: 'window' });
    cs.forEach(c => c.navigate('https://kosa0721-sys.github.io/cat_app/').catch(() => {}));
  })());
});
