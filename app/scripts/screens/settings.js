function initSettingsModule(user) {
    const app = new MiniApp("system-settings", "1.0.0", "system")
    app.addMenuButton("./assets/gear.png", "Настройки")

    app.setContent(`
        <div class="module-nav">
            <div class="module-back" id="st-back"></div>
            <div class="module-title">Настройки</div>
        </div>
        <div class="module-body">

            <div class="module-profile-card">
                <div class="profile-info">
                    <div class="profile-name">${escSt(user.name || user.lastname)}</div>
                    <div class="profile-sub">${escSt(user.username || "")}</div>
                </div>
            </div>

            <div class="module-label">Устройства</div>
            <div id="st-sessions-container">
                <div class="module-empty">Загрузка...</div>
            </div>

            <div class="module-label">Уведомления</div>
            <div class="module-rows">
                <div class="module-row" id="st-push-row">
                    <div class="row-icon" style="mask-image:url(./assets/bell.fill.png)"></div>
                    <div class="row-body">
                        <div class="row-label">Push-уведомления</div>
                        <div class="row-sub" id="st-push-sub">Загрузка...</div>
                    </div>
                    <div id="st-push-toggle" style="cursor:pointer;user-select:none"></div>
                </div>
            </div>

            <div class="module-label">Отображение</div>
            <div class="module-card" style="gap:12px">
                <div style="display:flex;align-items:center;justify-content:space-between">
                    <span style="font-size:15px;font-weight:600; color: var(--text)">Тема</span>
                </div>
                <div class="font-size-picker" id="st-theme-picker">
                    <div class="font-size-opt" data-theme-val="light">Светлая</div>
                    <div class="font-size-opt" data-theme-val="system">Авто</div>
                    <div class="font-size-opt" data-theme-val="dark">Тёмная</div>
                </div>
            </div>
            <div class="module-card" style="gap:12px">
                <div style="display:flex;align-items:center;justify-content:space-between">
                    <span style="font-size:15px;font-weight:600; color: var(--text)">Размер текста</span>
                    <span id="st-font-label" style="font-size:13px;color: var(--text-2)">Обычный</span>
                </div>
                <div class="font-size-picker" id="st-font-picker">
                    <div class="font-size-opt" data-zoom="0.9">А−</div>
                    <div class="font-size-opt" data-zoom="1">А</div>
                    <div class="font-size-opt" data-zoom="1.1">А+</div>
                    <div class="font-size-opt" data-zoom="1.2">А++</div>
                </div>
            </div>

            <div class="module-btn danger" id="st-logout" style="margin-top:8px">Выйти из аккаунта</div>
        </div>
    `)

    app.$(".module-nav .module-back").addEventListener("click", () => app.closeScreen())

    app.$("#st-logout").addEventListener("click", () => {
        if (!confirm("Выйти из аккаунта?")) return
        window.api.logout().finally(() => {
            localStorage.removeItem("vsu_access")
            localStorage.removeItem("vsu_refresh")
            document.location.reload()
        })
    })

    const origOpen = app.openScreen.bind(app)
    app.openScreen = function() {
        origOpen()
        loadSessions()
        initPushRow()
        initThemePicker()
        initFontPicker()
    }

    function loadSessions() {
        const cont = app.$("#st-sessions-container")
        cont.innerHTML = `<div class="module-empty">Загрузка...</div>`

        window.api.getSessions().then(data => {
            const sessions = data.sessions || []
            if (sessions.length === 0) {
                cont.innerHTML = `<div class="module-empty">Нет активных сессий</div>`
                return
            }

            const rows = document.createElement("div")
            rows.className = "module-rows"

            sessions.forEach(s => {
                const row = document.createElement("div")
                row.className = "module-row"
                const d = new Date(s.last_used_at * 1000)
                const lastUsed = d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
                row.innerHTML = `
                    <div class="row-icon" style="mask-image:url(./assets/gear.png)"></div>
                    <div class="row-body">
                        <div class="row-label">${escSt(s.device_name || s.browser || "Устройство")}</div>
                        <div class="row-sub">${escSt(s.os || "")} · ${lastUsed}</div>
                    </div>
                    <div class="row-value" style="color:rgb(255,56,60);cursor:pointer;padding:0 4px;font-size:18px">✕</div>
                `
                row.querySelector(".row-value").addEventListener("click", (e) => {
                    e.stopPropagation()
                    if (!confirm("Отключить это устройство?")) return
                    window.api.revokeSession(s.id).then(() => row.remove())
                        .catch(err => alert("Ошибка: " + err.message))
                })
                rows.appendChild(row)
            })

            cont.innerHTML = ""
            cont.appendChild(rows)

            if (sessions.length > 1) {
                const btn = document.createElement("div")
                btn.className = "module-btn"
                btn.style.marginTop = "8px"
                btn.textContent = "Отключить все устройства"
                btn.addEventListener("click", () => {
                    if (!confirm("Завершить все сессии кроме текущей?")) return
                    window.api.revokeAllSessions().then(() => loadSessions())
                        .catch(e => alert("Ошибка: " + e.message))
                })
                cont.appendChild(btn)
            }
        }).catch(() => {
            cont.innerHTML = `<div class="module-empty">Не удалось загрузить</div>`
        })
    }

    // ── Push-уведомления ──────────────────────────────

    function initPushRow() {
        const subEl    = app.$("#st-push-sub")
        const toggleEl = app.$("#st-push-toggle")
        if (!subEl || !toggleEl) return

        const supported = "serviceWorker" in navigator && "PushManager" in window
        if (!supported) {
            subEl.textContent = "Не поддерживается браузером"
            return
        }

        navigator.serviceWorker.getRegistration("/app/sw.js").then(reg => {
            if (!reg) { checkPermission(null); return }
            return reg.pushManager.getSubscription().then(sub => checkPermission(sub))
        }).catch(() => { subEl.textContent = "Ошибка проверки"; })

        function checkPermission(currentSub) {
            const perm = Notification.permission
            if (perm === "denied") {
                subEl.textContent = "Заблокировано в настройках браузера"
                toggleEl.textContent = ""
                return
            }
            const isOn = !!currentSub
            renderToggle(isOn, toggleEl)
            subEl.textContent = isOn ? "Включены" : "Отключены"

            toggleEl.onclick = () => {
                if (isOn) unsubscribePush()
                else      subscribePush()
            }
        }

        async function subscribePush() {
            subEl.textContent = "Подключение..."
            try {
                const perm = await Notification.requestPermission()
                if (perm !== "granted") { subEl.textContent = "Разрешение отклонено"; return }

                let reg = await navigator.serviceWorker.getRegistration("/app/sw.js")
                if (!reg) reg = await navigator.serviceWorker.register("/app/sw.js", { scope: "/app/" })
                await navigator.serviceWorker.ready

                // Получаем VAPID ключ
                const cfg = await window.api.appConfig().catch(() => null)
                const vapidKey = cfg?.vapid_public_key
                if (!vapidKey || vapidKey.includes("ЗАМЕНИ")) {
                    alert("Push-уведомления ещё не настроены на сервере")
                    subEl.textContent = "Не настроено"
                    return
                }

                const sub = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(vapidKey)
                })
                await window.api.pushSubscribe(sub)
                subEl.textContent = "Включены"
                renderToggle(true, toggleEl)
                toggleEl.onclick = unsubscribePush
            } catch (e) {
                subEl.textContent = "Ошибка подключения"
                console.error("Push subscribe:", e)
            }
        }

        async function unsubscribePush() {
            subEl.textContent = "Отключение..."
            try {
                const reg = await navigator.serviceWorker.getRegistration("/app/sw.js")
                if (reg) {
                    const sub = await reg.pushManager.getSubscription()
                    if (sub) await sub.unsubscribe()
                }
                await window.api.pushUnsubscribe()
                subEl.textContent = "Отключены"
                renderToggle(false, toggleEl)
                toggleEl.onclick = subscribePush
            } catch (e) {
                subEl.textContent = "Ошибка"
            }
        }
    }

    function initThemePicker() {
        const picker = app.$('#st-theme-picker')
        if (!picker) return
        const opts = picker.querySelectorAll('.font-size-opt[data-theme-val]')
        const saved = localStorage.getItem('vsu_theme') || 'system'
        opts.forEach(o => o.classList.toggle('active', o.dataset.themeVal === saved))
        if (picker.dataset.init) return
        picker.dataset.init = '1'
        opts.forEach(o => {
            o.addEventListener('click', () => {
                const val = o.dataset.themeVal
                localStorage.setItem('vsu_theme', val)
                opts.forEach(x => x.classList.toggle('active', x.dataset.themeVal === val))
                if (window._vsuApplyTheme) window._vsuApplyTheme(val)
            })
        })
    }

    function initFontPicker() {
        const picker = app.$('#st-font-picker')
        if (!picker) return
        const ZOOM_LABELS = { '0.9':'Маленький', '1':'Обычный', '1.1':'Крупный', '1.2':'Очень крупный' }
        const saved   = localStorage.getItem('vsu_font_zoom') || '1'
        const labelEl = app.$('#st-font-label')
        const opts    = picker.querySelectorAll('.font-size-opt[data-zoom]')

        function applyZoom(zoom) {
            localStorage.setItem('vsu_font_zoom', zoom)
            let s = document.getElementById('vsu-font-zoom')
            if (!s) {
                s = document.createElement('style')
                s.id = 'vsu-font-zoom'
                document.head.appendChild(s)
            }
            s.textContent = zoom === '1' ? '' : `.screen-part,.news-reader-body,.screen.miniapp .module-body{zoom:${zoom}}`
            if (labelEl) labelEl.textContent = ZOOM_LABELS[zoom] || 'Обычный'
            opts.forEach(o => o.classList.toggle('active', o.dataset.zoom === zoom))
        }

        applyZoom(saved)
        if (picker.dataset.init) return
        picker.dataset.init = '1'
        opts.forEach(o => o.addEventListener('click', () => applyZoom(o.dataset.zoom)))
    }

    function renderToggle(on, el) {
        el.innerHTML = ""
        const toggle = document.createElement("div")
        toggle.style.cssText = `
            width:44px;height:26px;border-radius:13px;
            background:${on ? "rgb(52,199,89)" : "rgba(0,0,0,0.15)"};
            position:relative;transition:0.25s;cursor:pointer;flex-shrink:0;
        `
        const knob = document.createElement("div")
        knob.style.cssText = `
            position:absolute;width:22px;height:22px;border-radius:50%;
            background:white;top:2px;
            left:${on ? "20px" : "2px"};transition:0.25s;
            box-shadow:0 1px 4px rgba(0,0,0,0.25);
        `
        toggle.appendChild(knob)
        el.appendChild(toggle)
    }

    function urlBase64ToUint8Array(base64String) {
        const padding = "=".repeat((4 - base64String.length % 4) % 4)
        const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
        const raw = atob(base64)
        return Uint8Array.from(raw, c => c.charCodeAt(0))
    }

    return app
}

function escSt(str) {
    if (!str) return ""
    return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
}
