const VERSION = {
    __ver: "3.0",
    __badge: true,
    __badge_title: "public beta",
    __build: "26w24с"
}

async function catcher(callback, ...args) {
    try {
        let r = await callback(...args)
        return ["ok", r]
    } catch (e) {
        return [e.name, e.message]
    }
}

function goTo(screenName) {
    document.querySelectorAll(".screen, .screen-part").forEach(e => e.classList.add("hidden"))
    document.querySelector(`.screen[scr='${screenName}']`).classList.remove("hidden")
}

function showError(message) {
    document.querySelector(".screen[scr='error'] .message").innerHTML = message;
    goTo("error")
}

// Применяем тему до рендера
;(function() {
    function _resolveTheme(t) {
        if (t === 'dark')  return 'dark'
        if (t === 'light') return 'light'
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    function _updateStatusBar() {
        const meta = document.querySelector('meta[name="theme-color"]')
        if (!meta) return
        const color = getComputedStyle(document.documentElement).getPropertyValue('--bg-2').trim()
        if (color) meta.content = color
    }
    function _applyTheme(t) {
        const resolved = _resolveTheme(t)
        document.documentElement.setAttribute('data-theme', resolved)
        _updateStatusBar()
        document.dispatchEvent(new CustomEvent('vsu-theme-change', { detail: { theme: resolved } }))
        return resolved
    }
    window._vsuApplyTheme = _applyTheme
    window.updateStatusBarColor = function(color) {
        const meta = document.querySelector('meta[name="theme-color"]')
        if (meta && color) meta.content = color
    }
    _applyTheme(localStorage.getItem('vsu_theme') || 'system')
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if ((localStorage.getItem('vsu_theme') || 'system') === 'system') _applyTheme('system')
    })
})()

// Применяем сохранённый масштаб шрифта до отрисовки (только контент, не навигация)
;(function() {
    const z = localStorage.getItem('vsu_font_zoom')
    if (z && z !== '1') {
        const s = document.createElement('style')
        s.id = 'vsu-font-zoom'
        s.textContent = `.screen-part,.news-reader-body,.screen.miniapp .module-body{zoom:${z}}`
        document.head.appendChild(s)
    }
})()

window.addEventListener("DOMContentLoaded", async () => {
    goTo("loading")

    window.api = new VSUApi({
        baseUrl: "https://vsu-box.whoennrl.ru/api/",
        onTokenUpdate: (acc, ref) => {
            localStorage.setItem("vsu_access", acc)
            localStorage.setItem("vsu_refresh", ref)
        },
        onLogout: () => {
            localStorage.removeItem("vsu_access");
            localStorage.removeItem("vsu_refresh")
        }
    })

    window.api.accessToken = localStorage.getItem('vsu_access');
    window.api.refreshToken = localStorage.getItem('vsu_refresh');
    window.app = {}

    window.api.me().then((user) => {
        window.app.user = user;
        goTo("homeboard")
        initHomeData(user)
    }).catch((e) => {
        if (e.status == "401") {
            goTo('login')
            document.querySelector(".screen[scr='login'] .button").addEventListener("click", () => {
                let login = document.querySelector(".screen[scr='login'] input[type='text']").value.toString();
                let password = document.querySelector(".screen[scr='login'] input[type='password']").value.toString();
                goTo("loading")
                window.api.login(login, password).then(() => {
                    document.location.reload()
                }).catch(e => {
                    goTo("login")
                    document.querySelector(".screen[scr='login'] input[type='text']").value = ""
                    document.querySelector(".screen[scr='login'] input[type='password']").value = ""
                    alert(e.message || e.toString())
                })
            })
        } else {
            showError(e.message || "Ошибка подключения")
        }
    })
})

function initHomeData(user) {
    window.app.homeboard = { menu: "home" }

    document.querySelectorAll(".screen[scr='homeboard'] .screen-part").forEach(e => e.classList.add("hidden"))
    document.querySelector(".screen[scr='homeboard'] .screen-part[src='home']").classList.remove("hidden")

    // Нижнее меню
    document.querySelectorAll(".screen[scr='homeboard'] .bottomMenu .item").forEach(e => {
        e.addEventListener("click", () => {
            const tp = e.getAttribute("tp")
            if (tp === window.app.homeboard.menu) return

            window.app.homeboard.menu = tp
            document.querySelectorAll(".screen[scr='homeboard'] .screen-part").forEach(s => s.classList.add("hidden"))
            document.querySelector(`.screen[scr='homeboard'] .screen-part[src='${tp}']`).classList.remove("hidden")
            document.querySelectorAll(".screen[scr='homeboard'] .bottomMenu .item").forEach(o => o.classList.remove("select"))
            e.classList.add("select")

            const isDesktop = window.innerWidth >= 760
            if (tp === "menu") {
                if (!isDesktop) document.querySelectorAll(".screen[scr='homeboard'] .bottomMenu .left .item").forEach(i => {
                    i.querySelector(".name").style.width = "0%"
                    i.querySelector(".name").style.opacity = "0"
                    i.querySelector(".icon").style.transform = i.getAttribute("tp") === "schedule"
                        ? "translateY(9px) scale(1.35)"
                        : "translateY(9px) scale(1.15)"
                    i.style.width = "50px"
                })
            } else {
                if (!isDesktop) document.querySelectorAll(".screen[scr='homeboard'] .bottomMenu .left .item").forEach(i => {
                    i.querySelector(".name").style.width = "100%"
                    i.querySelector(".name").style.opacity = "1"
                    i.querySelector(".icon").style.transform = "translateY(0px) scale(1)"
                    i.style.width = "80px"
                })
            }

            if (tp === "home"     && window.app.homeModule)     window.app.homeModule.onShow()
            if (tp === "schedule" && window.app.scheduleModule) window.app.scheduleModule.onShow()
        })
    })

    // Версия в меню
    let ver_data = `<div class='ver-data'>Version: ${VERSION.__ver}`
    if (VERSION.__badge) ver_data += ` <span class='badge'>${VERSION.__badge_title}</span>`
    ver_data += `</div><div class='ver-build'>Build: ${VERSION.__build}</div>`
    document.querySelector(".screen[scr='homeboard'] .screen-part[src='menu'] .appbox .version").innerHTML = ver_data

    // Свайп-навигация между вкладками
    initSwipeGestures()

    // Инициализация модулей
    initModules(user)

    // Запуск установленных расширений
    if (window.vsuAddons) window.vsuAddons.loadInstalled()
}

function initSwipeGestures() {
    const TABS = ["home", "schedule"]
    const homeboard = document.querySelector(".screen[scr='homeboard']")

    let startX = 0, startY = 0, tracking = false

    homeboard.addEventListener("touchstart", e => {
        // Не перехватывать свайпы внутри скролл-контейнеров
        if (e.target.closest(".dataI, .module-body, .miniapp")) return
        startX = e.touches[0].clientX
        startY = e.touches[0].clientY
        tracking = true
    }, { passive: true })

    homeboard.addEventListener("touchend", e => {
        if (!tracking) return
        tracking = false

        const dx = e.changedTouches[0].clientX - startX
        const dy = e.changedTouches[0].clientY - startY

        // Игнорировать если преобладает вертикальное движение или слишком короткий жест
        if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.8) return

        const cur = window.app.homeboard?.menu
        const idx = TABS.indexOf(cur)
        if (idx === -1) return

        let next = dx < 0 ? idx + 1 : idx - 1
        if (next < 0 || next >= TABS.length) return

        const target = document.querySelector(`.screen[scr='homeboard'] .bottomMenu .item[tp='${TABS[next]}']`)
        if (target) target.click()
    }, { passive: true })
}

function initModules(user) {
    if (typeof initHomeModule       === "function") initHomeModule(user)
    if (typeof initScheduleModule   === "function") initScheduleModule(user)
    if (typeof initWorkmodeModule   === "function") initWorkmodeModule(user)
    if (typeof initStoreModule      === "function") initStoreModule(user)
    if (typeof initSettingsModule   === "function") initSettingsModule(user)
    if (typeof initClassroomModule  === "function") initClassroomModule(user)
    if (user.is_developer && typeof initDevmodeModule === "function") initDevmodeModule(user)
    if (user.is_admin     && typeof initAdminModule   === "function") initAdminModule(user)
}

// ══════════════════════════════════════════
// Teacher sheet — глобальный просмотр преподавателя
// ══════════════════════════════════════════

function openTeacherSheet(name, prefill) {
    if (!name) return
    const esc  = s => s ? String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;") : ""
    const escNl = s => esc(s).replace(/\n/g,"<br>")

    const overlay = document.createElement("div")
    overlay.className = "tsh-overlay"
    overlay.innerHTML = `
        <div class="tsh-sheet">
            <div class="tsh-handle"></div>
            <div class="tsh-body" id="tsh-body">
                <div class="tsh-loading"><div class="loading_anim"></div></div>
            </div>
        </div>
    `
    document.body.appendChild(overlay)
    requestAnimationFrame(() => overlay.classList.add("tsh-visible"))

    function close() {
        overlay.classList.remove("tsh-visible")
        setTimeout(() => overlay.remove(), 300)
    }
    overlay.addEventListener("click", e => { if (e.target === overlay) close() })

    // Drag-to-close на шторке
    const sheet = overlay.querySelector(".tsh-sheet")
    let dragY = 0, isDragging = false
    sheet.querySelector(".tsh-handle").addEventListener("touchstart", e => {
        isDragging = true; dragY = e.touches[0].clientY
        sheet.style.transition = "none"
    }, { passive: true })
    document.addEventListener("touchmove", e => {
        if (!isDragging) return
        const dy = Math.max(0, e.touches[0].clientY - dragY)
        sheet.style.transform = `translateY(${dy}px)`
    }, { passive: true })
    document.addEventListener("touchend", e => {
        if (!isDragging) return
        isDragging = false
        const dy = e.changedTouches[0].clientY - dragY
        sheet.style.transition = ""
        sheet.style.transform = ""
        if (dy > 120) close()
    }, { passive: true })

    function render(t) {
        const displayName = t.full_name || t.name || name
        const hasPhoto = !!t.photo_url
        const initial = (displayName[0] || "?").toUpperCase()
        const body = overlay.querySelector("#tsh-body")

        const infoRows = [
            t.department ? `<div class="tsh-info-row"><div class="tsh-info-icon tshi-dept"></div><div>${esc(t.department)}</div></div>` : "",
            t.email      ? `<div class="tsh-info-row tsh-info-link" data-href="mailto:${esc(t.email)}"><div class="tsh-info-icon tshi-email"></div><div>${esc(t.email)}</div></div>` : "",
            t.phone      ? `<div class="tsh-info-row tsh-info-link" data-href="tel:${esc(t.phone)}"><div class="tsh-info-icon tshi-phone"></div><div>${esc(t.phone)}</div></div>` : "",
        ].filter(Boolean).join("")

        const isAdmin = window.app?.user?.is_admin
        const statsHtml = isAdmin && (t.lessons_count || t.groups_count) ? `
            <div class="tsh-stats">
                ${t.lessons_count ? `<div class="tsh-stat"><div class="tsh-stat-val">${t.lessons_count}</div><div class="tsh-stat-lbl">занятий</div></div>` : ""}
                ${t.groups_count  ? `<div class="tsh-stat"><div class="tsh-stat-val">${t.groups_count}</div><div class="tsh-stat-lbl">групп</div></div>` : ""}
            </div>` : ""

        body.innerHTML = `
            <div class="tsh-header">
                <div class="tsh-avatar ${hasPhoto ? "" : "tsh-avatar--initials"}" ${hasPhoto ? `style="background-image:url('${esc(t.photo_url)}')"` : ""}>${hasPhoto ? "" : esc(initial)}</div>
                <div class="tsh-name-block">
                    <div class="tsh-name">${esc(displayName)}</div>
                    ${t.full_name && t.name && t.full_name !== t.name ? `<div class="tsh-name-short">${esc(t.name)}</div>` : ""}
                </div>
            </div>
            ${statsHtml}
            ${infoRows ? `<div class="tsh-info-list">${infoRows}</div>` : ""}
            ${t.description ? `<div class="tsh-desc">${escNl(t.description)}</div>` : ""}
            ${!infoRows && !t.description && !statsHtml ? `<div class="tsh-no-info">Информация пока не добавлена</div>` : ""}
            <div class="tsh-close-btn" id="tsh-close">Закрыть</div>
        `
        overlay.querySelector("#tsh-close").addEventListener("click", close)
        overlay.querySelectorAll(".tsh-info-link").forEach(row => {
            row.addEventListener("click", () => window.open(row.dataset.href, "_blank"))
        })
    }

    // Показываем то что уже знаем, пока грузим
    if (prefill && (prefill.teacher_photo || prefill.full_name)) {
        render({
            name,
            full_name: prefill.teacher_full_name || null,
            photo_url: prefill.teacher_photo || null,
            description: null, department: null, email: null, phone: null,
            lessons_count: 0, groups_count: 0,
        })
    }

    window.api.getTeacherInfo(name).then(t => render(t)).catch(() => {
        if (!prefill) {
            overlay.querySelector("#tsh-body").innerHTML = `<div class="tsh-no-info">Не удалось загрузить информацию</div><div class="tsh-close-btn" id="tsh-close">Закрыть</div>`
            overlay.querySelector("#tsh-close").addEventListener("click", close)
        }
    })
}

// ══════════════════════════════════════════
// MiniApp — базовый класс модуля
// ══════════════════════════════════════════

class MiniApp {
    constructor(name, version, developer) {
        this.name = name;
        this.version = version;
        this.developer = developer;

        this.__screen = document.createElement("div");
        this.__screen.classList.add("screen", "hidden", "miniapp");
        this.__screen.setAttribute("miniapp", name);
        document.body.appendChild(this.__screen);
    }

    init(callback) { callback(this); }

    setContent(html) {
        this.__screen.innerHTML = html;
    }

    addMenuButton(iconPath, name) {
        const block = document.createElement("div");
        block.classList.add("button");
        block.addEventListener("click", () => this.openScreen())

        const icon = document.createElement("div");
        icon.classList.add("icon");
        icon.style.maskImage    = `url(${iconPath})`;
        icon.style.maskRepeat   = "no-repeat";
        icon.style.maskSize     = "contain";
        icon.style.maskPosition = "center center";

        const label = document.createElement("div");
        label.classList.add("name");
        label.textContent = name;

        block.appendChild(icon);
        block.appendChild(label);
        document.querySelector(".screen[scr='homeboard'] .screen-part[src='menu'] .data").appendChild(block)
    }

    openScreen() {
        document.querySelectorAll(".screen").forEach(e => e.classList.add("hidden"))
        this.__screen.classList.remove("hidden")
        const c = getComputedStyle(document.documentElement).getPropertyValue('--bg-nav').trim()
        if (c) window.updateStatusBarColor?.(c)
    }

    closeScreen() {
        this.__screen.classList.add("hidden")
        document.querySelector(".screen[scr='homeboard']").classList.remove("hidden")
        const c = getComputedStyle(document.documentElement).getPropertyValue('--bg-2').trim()
        if (c) window.updateStatusBarColor?.(c)
    }

    // Получить элемент внутри экрана
    $(selector) { return this.__screen.querySelector(selector); }
    $$(selector) { return this.__screen.querySelectorAll(selector); }

    render(callback) {
        this.__screen.innerHTML = "";
        this.__screen.appendChild(callback().render())
    }
}
