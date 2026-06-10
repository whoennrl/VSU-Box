// VSU Box Service Worker
const CACHE = "vsu-box[build_26w24с9]"

self.addEventListener("install", () => {
    self.skipWaiting()
})

self.addEventListener("activate", e => {
    e.waitUntil(clients.claim())
    // Удаляем устаревшие кеши при активации
    e.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.filter(k => k !== CACHE).map(k => caches.delete(k))
        ))
    )
})

// Страница отправляет SKIP_WAITING → активируем новый SW
self.addEventListener("message", e => {
    if (e.data?.type === "SKIP_WAITING") self.skipWaiting()
})

self.addEventListener("push", e => {
    if (!e.data) return
    let data = {}
    try { data = e.data.json() } catch { data = { title: "VSU Box", body: e.data.text() } }

    e.waitUntil(
        self.registration.showNotification(data.title || "VSU Box", {
            body: data.body || "",
            icon: data.icon || "/app/assets/logo.png",
            badge: "/app/assets/logo.png",
            data: { url: data.url || "/app/" },
            vibrate: [100, 50, 100]
        })
    )
})

self.addEventListener("notificationclick", e => {
    e.notification.close()
    const url = e.notification.data?.url || "/app/"
    e.waitUntil(
        clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
            for (const c of list) {
                if (c.url.includes("/app/") && "focus" in c) { c.focus(); return }
            }
            clients.openWindow(url)
        })
    )
})

self.addEventListener("fetch", e => {
    // Не кэшируем API
    if (e.request.url.includes('/api/')) return;
    if (e.request.method !== 'GET') return;
    e.respondWith(
        caches.open(CACHE).then(cache => {
            // Идем в сеть, принудительно игнорируя старый кэш
            return fetch(e.request, { cache: 'no-cache' })
                .then(response => {
                    // Сохраняем свежий файл в наш Service Workeк кеш
                    cache.put(e.request, response.clone());
                    return response;
                })
                .catch(() => {
                    // Без инета достаем сохраненную копию из кэша
                    return cache.match(e.request);
                });
        })
    );
});