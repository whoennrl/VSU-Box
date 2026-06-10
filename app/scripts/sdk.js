// ══════════════════════════════════════════════════════════
//  VSUBox SDK  — API для разработчиков расширений
//  Каждое расширение получает изолированный экземпляр SDK.
//  Код расширения запускается в iframe-песочнице.
// ══════════════════════════════════════════════════════════

class VSUBoxSDKInstance {
    constructor(addonId) {
        this._id        = addonId
        this._ns        = `addon::${addonId}`
        this._screen    = null
        this._callbacks = {}

        this.app      = _sdkApp(this)
        this.user     = _sdkUser(this)
        this.schedule = _sdkSchedule(this)
        this.storage  = _sdkStorage(this)
        this.ui       = _sdkUI(this)
        this.events   = _sdkEvents(this)
    }

    _emit(event, data) {
        const cbs = this._callbacks[event] || []
        cbs.forEach(cb => { try { cb(data) } catch(e) {} })
    }
}

function _sdkApp(sdk) {
    return {
        get version() { return VERSION.__ver },
        get build()   { return VERSION.__build },
    }
}

function _sdkUser(sdk) {
    return {
        get name()         { return window.app.user?.name         || "" },
        get firstname()    { return window.app.user?.firstname    || "" },
        get lastname()     { return window.app.user?.lastname     || "" },
        get is_admin()     { return !!(window.app.user?.is_admin) },
        get is_developer() { return !!(window.app.user?.is_developer) },
        async group()   {
            const d = await window.api.storageGet("group")
            return d?.value || null
        },
        async faculty() {
            const d = await window.api.storageGet("faculty")
            return d?.value || null
        },
    }
}

function _sdkSchedule(sdk) {
    async function getStorageMode() {
        return window.api.storageGet(["mode","faculty","group","teacher"])
    }
    return {
        async getWeek(weekOffset = 0) {
            const d = await getStorageMode()
            if (d.mode === "student")  return window.api.getWeek(d.faculty, d.group, weekOffset)
            if (d.mode === "teacher")  return window.api.getTeacherSchedule(d.teacher, weekOffset)
            throw new Error("Режим работы не настроен")
        },
        async getToday() {
            const d = await getStorageMode()
            const today = new Date().toISOString().split("T")[0]
            if (d.mode === "student")  return window.api.getDate(d.faculty, d.group, today)
            throw new Error("getToday доступен только в режиме студента")
        },
    }
}

function _sdkStorage(sdk) {
    const ns = sdk._ns
    return {
        async set(key, value) { return window.api.storageSet(`${ns}::${key}`, value) },
        async get(key) {
            const r = await window.api.storageGet(`${ns}::${key}`)
            return r.value
        },
        async delete(key) { return window.api.storageDelete(`${ns}::${key}`) },
        async keys() {
            const r = await window.api.storageKeys()
            const prefix = `${ns}::`
            return (r.keys || [])
                .filter(k => k.startsWith(prefix))
                .map(k => k.slice(prefix.length))
        },
    }
}

function _sdkUI(sdk) {
    return {
        createScreen({ title = "Расширение" } = {}) {
            const screen = document.createElement("div")
            screen.classList.add("screen", "hidden", "miniapp")

            const nav = document.createElement("div")
            nav.className = "module-nav"
            nav.innerHTML = `
                <div class="module-back" id="sdk-back-${sdk._id}"></div>
                <div class="module-title">${escSdk(title)}</div>
            `
            nav.querySelector(`#sdk-back-${sdk._id}`).addEventListener("click", () => sdk.ui.back())

            const body = document.createElement("div")
            body.className = "module-body"

            screen.appendChild(nav)
            screen.appendChild(body)
            document.body.appendChild(screen)
            sdk._screen = screen

            return { element: screen, body, nav }
        },
        navigate(screenObj) {
            const el = screenObj.element || screenObj
            document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"))
            el.classList.remove("hidden")
        },
        back() {
            if (sdk._screen) sdk._screen.classList.add("hidden")
            document.querySelector(".screen[scr='homeboard']").classList.remove("hidden")
        },
        toast(message, duration = 2500) {
            const t = document.createElement("div")
            t.style.cssText = `
                position:fixed;bottom:100px;left:50%;transform:translateX(-50%);
                background:rgba(0,0,0,0.75);color:white;padding:10px 20px;
                border-radius:100px;font-family:Nunito,sans-serif;font-size:14px;
                z-index:9999;white-space:nowrap;transition:opacity 0.3s;
            `
            t.textContent = message
            document.body.appendChild(t)
            setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.remove(), 350) }, duration)
        },
    }
}

function _sdkEvents(sdk) {
    return {
        on(event, cb) {
            if (!sdk._callbacks[event]) sdk._callbacks[event] = []
            sdk._callbacks[event].push(cb)
        },
        off(event, cb) {
            sdk._callbacks[event] = (sdk._callbacks[event] || []).filter(f => f !== cb)
        },
    }
}

function escSdk(str) {
    return String(str || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
}


// ══════════════════════════════════════════════════════════
//  Разрешения — категории доступа к данным
// ══════════════════════════════════════════════════════════

const ADDON_PERM_LABELS = {
    schedule:      { label: "Расписание",    desc: "Просмотр вашего расписания занятий" },
    user:          { label: "Профиль",       desc: "Доступ к имени и ролям пользователя" },
    storage:       { label: "Хранилище",     desc: "Сохранение данных расширения на сервере" },
    http:          { label: "Внешние запросы", desc: "Запросы на сторонние серверы от вашего имени (с токеном доступа)" },
    autostart:     { label: "Автозапуск",    desc: "Выполнение кода при запуске приложения" },
    notifications: { label: "Уведомления",   desc: "Отправка push-уведомлений от имени расширения" },
}

// ── Методы SDK и требуемые разрешения ─────────────────────
const _PERM_MAP = {
    'schedule.getWeek':  'schedule',
    'schedule.getToday': 'schedule',
    'user.name':         'user',
    'user.is_admin':     'user',
    'user.is_developer': 'user',
    'storage.set':       'storage',
    'storage.get':       'storage',
    'storage.delete':    'storage',
    'http.fetch':        'http',
}

function _getGrantedPerms(addonId) {
    const raw = localStorage.getItem(`vsu_perms_${addonId}`)
    if (raw === null) return null  // null = не установлено, backwards compat
    try { return JSON.parse(raw) } catch { return [] }
}

// ══════════════════════════════════════════════════════════
//  Sandbox — запуск кода расширения в изолированной среде
//  Код аддона загружается через API и инлайнится в srcdoc.
// ══════════════════════════════════════════════════════════

class VSUBoxSandbox {
    constructor(addonId, entryCode, addonToken = null) {
        this.addonId    = addonId
        this.entryCode  = entryCode   // JS-код аддона (строка)
        this._addonToken = addonToken  // JWT для запросов на сторонние серверы
        this._sdk       = new VSUBoxSDKInstance(addonId)
        this._iframe    = null
        this._msgId     = 0

        this._screenCounter  = 0
        this._screens        = []
        this._menuButtons    = []
        this._addonOpened    = false
        this._contentWatching = false

        this._onMessage = this._handleMessage.bind(this)
        window.addEventListener("message", this._onMessage)
    }

    launch() {
        const iframe = document.createElement("iframe")
        iframe.style.display = "none"
        iframe.setAttribute("sandbox", "allow-scripts")
        iframe.srcdoc = this._buildSrcdoc()
        document.body.appendChild(iframe)
        this._iframe = iframe
        return this
    }

    destroy() {
        window.removeEventListener("message", this._onMessage)
        if (this._iframe) { this._iframe.remove(); this._iframe = null }
        this._screens.forEach(s => s.remove())
        this._menuButtons.forEach(b => b.remove())
        this._screens = []
        this._menuButtons = []
    }

    _buildSrcdoc() {
        const id = JSON.stringify(this.addonId)
        const safeCode = this.entryCode.replace(/<\/script/gi, '<\\/script')

        return `<!DOCTYPE html><html><head>
<script>
const _addonId = ${id};
const _parent  = window.parent;
let   _msgId   = 0;
const _pending = {};
const _actions = {};

function _call(method, args) {
    return new Promise((resolve, reject) => {
        const id = ++_msgId;
        _pending[id] = { resolve, reject };
        _parent.postMessage({ __vsu: true, id, addonId: _addonId, method, args }, "*");
    });
}

function _h(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;") }
function _a(s) { return String(s||"").replace(/&/g,"&amp;").replace(/"/g,"&quot;") }

window.VSUBoxSDK = {
    ready(cb) {
        if (document.readyState !== 'loading') {
            setTimeout(() => cb(window.VSUBoxSDK), 0);
        } else {
            document.addEventListener('DOMContentLoaded', () => cb(window.VSUBoxSDK));
        }
    },
    app: {
        get version() { return _call("app.version"); },
        get build()   { return _call("app.build"); },
    },
    user: {
        get name()         { return _call("user.name"); },
        get firstname()    { return _call("user.firstname"); },
        get lastname()     { return _call("user.lastname"); },
        get is_admin()     { return _call("user.is_admin"); },
        get is_developer() { return _call("user.is_developer"); },
        get group()        { return _call("user.group"); },
        get faculty()      { return _call("user.faculty"); },
    },
    schedule: {
        getWeek:  (off) => _call("schedule.getWeek",  [off ?? 0]),
        getToday: ()    => _call("schedule.getToday", []),
    },
    storage: {
        set:    (k,v) => _call("storage.set",    [k,v]),
        get:    (k)   => _call("storage.get",    [k]),
        delete: (k)   => _call("storage.delete", [k]),
        keys:   ()    => _call("storage.keys",   []),
    },
    http: {
        // Запрос на сторонний HTTPS-сервер с addon-токеном в Authorization.
        // Аддон-код НЕ имеет доступа к самому токену — он добавляется хост-приложением.
        fetch: (url, opts) => _call("http.fetch", [url, opts || {}]),
    },
    ui: {
        toast:         (msg, dur)          => _call("ui.toast",         [msg, dur]),
        back:          ()                  => _call("ui.back",          []),
        createScreen:  (opts)              => _call("ui.createScreen",  [opts]),
        setContent:    (sid, html)         => _call("ui.setContent",    [sid, html]),
        updateElement: (sid, eid, html)    => _call("ui.updateElement", [sid, eid, html]),
        navigate:      async (sid) => { await _call("ui.navigate", [sid]); _call("ui.watchActions", [sid]); },
        addMenuButton: (opts)              => _call("ui.addMenuButton", [opts]),
        setTitle:      (sid, t)            => _call("ui.setTitle",      [sid, t]),
        showAlert:     (msg)               => _call("ui.showAlert",     [msg]),
        showConfirm:   (msg)               => _call("ui.showConfirm",   [msg]),
        showInput:     (opts)              => _call("ui.showInput",     [opts]),
        showRating:    (opts)              => _call("ui.showRating",    [opts]),
        onAction(actionId, cb) { _actions[actionId] = cb },
        watchActions: (sid) => _call("ui.watchActions", [sid]),
        getTheme:  ()       => _call("ui.getTheme",     []),
        loadHtml: (path)    => _call("ui.loadHtml",     [path]),
        icon(name, opts = {}) {
            const { size=22, color="currentColor" } = opts
            return \`<div style="width:\${size}px;height:\${size}px;flex-shrink:0;background:\${_a(color)};mask-image:url(/app/assets/\${_a(name)}.png);mask-size:contain;mask-repeat:no-repeat;mask-position:center;display:inline-block"></div>\`
        },
        components: {
            button(text, opts = {}) {
                const id = opts.id ? \`data-sdk-action="\${_a(opts.id)}"\` : ""
                const style = opts.primary
                    ? "background:rgb(0,122,255);color:#fff;border:none;border-radius:12px;padding:10px 20px;font-size:14px;font-weight:700;cursor:pointer;font-family:Nunito,sans-serif;display:inline-block"
                    : "background:rgba(0,0,0,0.07);color:inherit;border:none;border-radius:12px;padding:10px 20px;font-size:14px;font-weight:600;cursor:pointer;font-family:Nunito,sans-serif;display:inline-block"
                return \`<button \${id} style="\${style}">\${_h(text)}</button>\`
            },
            card(opts = {}) {
                const { title="", desc="", icon="", actionId="" } = opts
                const act = actionId ? \`data-sdk-action="\${_a(actionId)}" style="cursor:pointer"\` : ""
                return \`<div \${act} style="background:rgba(255,255,255,0.85);border-radius:16px;padding:16px;margin:8px 0;display:flex;gap:12px;align-items:flex-start">
                    \${icon ? \`<img src="\${_a(icon)}" style="width:44px;height:44px;border-radius:10px;object-fit:cover;flex-shrink:0">\` : ""}
                    <div style="flex:1;min-width:0">
                        \${title ? \`<div style="font-size:15px;font-weight:700;margin-bottom:2px">\${_h(title)}</div>\` : ""}
                        \${desc  ? \`<div style="font-size:13px;color:rgba(0,0,0,0.5);line-height:1.4">\${_h(desc)}</div>\`  : ""}
                    </div>
                </div>\`
            },
            text(content, opts = {}) {
                const { size=14, bold=false, muted=false, center=false } = opts
                return \`<p style="font-size:\${size}px;font-weight:\${bold?700:400};color:\${muted?"rgba(0,0,0,0.5)":"inherit"};text-align:\${center?"center":"left"};margin:4px 0;line-height:1.5;font-family:Nunito,sans-serif">\${_h(content)}</p>\`
            },
            heading(text, level = 2) {
                const sizes = { 1: 22, 2: 18, 3: 15 }
                return \`<div style="font-size:\${sizes[level]||18}px;font-weight:800;margin:14px 0 6px;font-family:Nunito,sans-serif">\${_h(text)}</div>\`
            },
            image(src, opts = {}) {
                const { alt="", radius=12, width="100%" } = opts
                return \`<img src="\${_a(src)}" alt="\${_a(alt)}" style="width:\${width};border-radius:\${radius}px;display:block;margin:8px 0;object-fit:cover">\`
            },
            input(opts = {}) {
                const { id="", placeholder="", type="text", value="" } = opts
                return \`<input data-sdk-action="\${_a(id)}" type="\${_a(type)}" placeholder="\${_a(placeholder)}" value="\${_a(value)}" style="width:100%;box-sizing:border-box;border:none;background:rgba(0,0,0,0.06);border-radius:12px;padding:12px 14px;font-size:14px;font-family:Nunito,sans-serif;outline:none;margin:4px 0">\`
            },
            list(items = []) {
                const rows = items.map(item => {
                    const t = typeof item === "string" ? item : item.title || ""
                    const s = typeof item === "object" ? item.subtitle || "" : ""
                    const a = typeof item === "object" ? item.actionId || "" : ""
                    return \`<div \${a?\`data-sdk-action="\${_a(a)}"\`:""} style="padding:12px 14px;border-bottom:1px solid rgba(0,0,0,0.06);display:flex;align-items:center;gap:8px;\${a?"cursor:pointer":""}">
                        <div style="flex:1;min-width:0">
                            <div style="font-size:14px;font-weight:600">\${_h(t)}</div>
                            \${s?\`<div style="font-size:12px;color:rgba(0,0,0,0.45)">\${_h(s)}</div>\`:""}
                        </div>
                        \${a?\`<div style="width:7px;height:7px;border-right:2px solid rgba(0,0,0,0.25);border-top:2px solid rgba(0,0,0,0.25);transform:rotate(45deg);flex-shrink:0"></div>\`:""}
                    </div>\`
                }).join("")
                return \`<div style="background:rgba(255,255,255,0.85);border-radius:16px;overflow:hidden;margin:8px 0">\${rows}</div>\`
            },
            divider() {
                return \`<div style="height:1px;background:rgba(0,0,0,0.1);margin:12px 0"></div>\`
            },
            spacer(h = 16) {
                return \`<div style="height:\${+h||16}px"></div>\`
            },
            badge(text, opts = {}) {
                const { color="rgba(0,0,0,0.1)", textColor="inherit" } = opts
                return \`<span style="display:inline-block;padding:2px 10px;border-radius:100px;background:\${_a(color)};color:\${_a(textColor)};font-size:12px;font-weight:600;font-family:Nunito,sans-serif">\${_h(text)}</span>\`
            },
        },
    },
    fs: {
        list:   (path)           => _call("fs.list",   [path || ""]),
        read:   (path)           => _call("fs.read",   [path]),
        write:  (path, content)  => _call("fs.write",  [path, content]),
        delete: (path)           => _call("fs.delete", [path]),
        info:   ()               => _call("fs.info",   []),
    },
    events: {
        on(name, cb)      { _actions[\`__evt:\${name}\`] = cb },
        off(name)         { delete _actions[\`__evt:\${name}\`] },
        // Отправить событие всем другим расширениям
        emit(name, data)  { return _call("events.emit", [name, data]) },
    },
};

window.addEventListener("message", (e) => {
    if (e.data?.__vsu_event) {
        const { action, value, event: evtName, data: evtData } = e.data;
        if (evtName !== undefined && _actions[\`__evt:\${evtName}\`]) {
            _actions[\`__evt:\${evtName}\`](evtData);
        } else if (action && _actions[action]) {
            _actions[action](value);
        }
        return;
    }
    if (!e.data?.__vsu_reply) return;
    const { id, result, error } = e.data;
    if (!_pending[id]) return;
    if (error) _pending[id].reject(new Error(error));
    else       _pending[id].resolve(result);
    delete _pending[id];
});
<\/script>
<script>
${safeCode}
<\/script>
</head><body></body></html>`
    }

    async _handleMessage(event) {
        if (event.source !== this._iframe?.contentWindow) return
        const msg = event.data
        if (!msg?.__vsu || msg.addonId !== this.addonId) return

        let result, error
        try {
            result = await this._dispatch(msg.method, msg.args || [])
        } catch (e) {
            error = e.message
        }
        event.source.postMessage({ __vsu_reply: true, id: msg.id, result, error }, "*")
    }

    async _dispatch(method, args) {
        // Проверка разрешений
        const req = _PERM_MAP[method]
        if (req) {
            const granted = _getGrantedPerms(this.addonId)
            if (granted !== null && !granted.includes(req)) {
                throw new Error(`Нет разрешения: ${req}`)
            }
        }

        const sdk = this._sdk
        switch(method) {
            case "app.version":          return sdk.app.version
            case "app.build":            return sdk.app.build
            case "user.name":            return sdk.user.name
            case "user.firstname":       return sdk.user.firstname
            case "user.lastname":        return sdk.user.lastname
            case "user.is_admin":        return sdk.user.is_admin
            case "user.is_developer":    return sdk.user.is_developer
            case "user.group":           return sdk.user.group
            case "user.faculty":         return sdk.user.faculty
            case "schedule.getWeek":     return sdk.schedule.getWeek(args[0])
            case "schedule.getToday":    return sdk.schedule.getToday()
            case "storage.set":          return sdk.storage.set(args[0], args[1])
            case "storage.get":          return sdk.storage.get(args[0])
            case "storage.delete":       return sdk.storage.delete(args[0])
            case "storage.keys":         return sdk.storage.keys()

            case "http.fetch": {
                const [url, opts] = args
                if (!this._addonToken) throw new Error("Addon token недоступен")
                // Разрешаем только HTTPS или localhost (для разработки)
                if (!url.startsWith("https://") && !/^http:\/\/localhost/.test(url) && !/^http:\/\/127\./.test(url)) {
                    throw new Error("http.fetch: разрешён только HTTPS или localhost")
                }
                const headers = { "Authorization": `Bearer ${this._addonToken}`, ...(opts.headers || {}) }
                const res = await fetch(url, {
                    method:  opts.method  || "GET",
                    headers,
                    body:    opts.body !== undefined ? (typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body)) : undefined,
                    signal:  AbortSignal.timeout(15000),
                })
                let body
                const ct = res.headers.get("content-type") || ""
                if (ct.includes("json")) { try { body = await res.json() } catch { body = null } }
                else body = await res.text()
                return { ok: res.ok, status: res.status, body }
            }

            case "events.emit": {
                const [name, data] = args
                window.vsuAddons.triggerAll(name, data)
                return true
            }

            case "ui.toast":   sdk.ui.toast(args[0], args[1]); return true
            case "ui.back":    sdk.ui.back(); return true
            case "ui.createScreen": {
                const opts  = args[0] || {}
                const title = String(opts.title || "Расширение")
                const sid   = `vsusdk-${this.addonId}-${++this._screenCounter}`
                const screen = document.createElement("div")
                screen.classList.add("screen", "hidden", "miniapp")
                screen.id = sid
                const nav = document.createElement("div")
                nav.className = "module-nav"
                nav.innerHTML = `<div class="module-back" id="back-${sid}"></div><div class="module-title" id="title-${sid}">${escSdk(title)}</div>`
                nav.querySelector(`#back-${sid}`).addEventListener("click", () => {
                    screen.classList.add("hidden")
                    document.querySelector(".screen[scr='homeboard']").classList.remove("hidden")
                })
                const body = document.createElement("div")
                body.className = "module-body"
                body.id = `body-${sid}`
                body.style.cssText = "padding:0;overflow:hidden;display:flex;flex-direction:column"
                const cframe = document.createElement("iframe")
                cframe.id = `cframe-${sid}`
                cframe.setAttribute("sandbox", "allow-scripts")
                cframe.style.cssText = "width:100%;flex:1;min-height:0;border:none;background:var(--bg-2)"
                body.appendChild(cframe)
                screen.appendChild(nav)
                screen.appendChild(body)
                document.body.appendChild(screen)
                this._screens.push(screen)
                return sid
            }
            case "ui.setContent": {
                const [sid, html] = args
                const frame = document.getElementById(`cframe-${sid}`)
                if (!frame) return true
                const aid = String(this.addonId).replace(/['"\\<>]/g, "")
                const bridge = `<script>(function(){
var _A='${aid}';
function _f(a,v){parent.postMessage({__vsu_content_action:true,addonId:_A,action:a,value:v},'*')}
document.addEventListener('click',function(e){
  var el=e.target.closest('[data-sdk-action]');if(!el)return;
  var t=el.tagName;if(t==='INPUT'||t==='TEXTAREA'||t==='SELECT')return;
  _f(el.dataset.sdkAction,el.dataset.sdkValue!==undefined?el.dataset.sdkValue:null);
},true);
document.addEventListener('input',function(e){
  var el=e.target.closest('[data-sdk-action]');if(!el)return;
  var t=el.tagName;if(t!=='INPUT'&&t!=='TEXTAREA'&&t!=='SELECT')return;
  _f(el.dataset.sdkAction,el.value);
},true);
document.addEventListener('change',function(e){
  var el=e.target.closest('[data-sdk-action]');if(!el||el.tagName!=='SELECT')return;
  _f(el.dataset.sdkAction,el.value);
},true);
window.addEventListener('message',function(e){
  if(e.data&&e.data.__vsu_update_element){
    var el=document.getElementById(e.data.elementId);
    if(el)el.innerHTML=e.data.html;
  }
});
})();<\/script>`
                const _isDark = document.documentElement.getAttribute('data-theme') === 'dark'
                const _bodyBg = _isDark ? 'rgb(28,28,30)' : 'rgb(244,244,246)'
                const _bodyColor = _isDark ? 'white' : 'black'
                frame.srcdoc = `<!DOCTYPE html><html style="height:100%;overflow:hidden"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet"><style>*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}body{margin:0;font-family:Nunito,sans-serif;background:${_bodyBg};color:${_bodyColor};height:100%;overflow-y:auto;-webkit-overflow-scrolling:touch}</style>${bridge}</head><body>${html}</body></html>`
                return true
            }
            case "ui.updateElement": {
                // Обновить один элемент внутри content-iframe по id без полной перерисовки
                const [sid, elementId, html] = args
                const frame = document.getElementById(`cframe-${sid}`)
                if (!frame) return false
                frame.contentWindow?.postMessage({ __vsu_update_element: true, elementId, html }, "*")
                return true
            }
            case "ui.navigate": {
                if (!this._addonOpened) return true
                const [sid] = args
                document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"))
                const el = document.getElementById(sid)
                if (el) el.classList.remove("hidden")
                return true
            }
            case "ui.addMenuButton": {
                const opts     = args[0] || {}
                const label    = String(opts.label || "Расширение")
                const screenId = opts.screenId || null
                const iconName = opts.icon ? String(opts.icon) : "exclamationmark.circle.fill"
                const block    = document.createElement("div")
                block.classList.add("button")
                const iconEl = document.createElement("div")
                iconEl.classList.add("icon")
                const iconUrl = (iconName.startsWith("http") || iconName.startsWith("/") || iconName.startsWith("."))
                    ? iconName
                    : `/app/assets/${iconName}.png`
                iconEl.style.cssText = `mask-image:url(${iconUrl});mask-repeat:no-repeat;mask-size:contain;mask-position:center;-webkit-mask-image:url(${iconUrl});-webkit-mask-repeat:no-repeat;-webkit-mask-size:contain;-webkit-mask-position:center`
                const nameEl = document.createElement("div")
                nameEl.classList.add("name")
                nameEl.textContent = label
                block.appendChild(iconEl)
                block.appendChild(nameEl)
                if (screenId) {
                    const self = this
                    block.addEventListener("click", () => {
                        self._addonOpened = true
                        document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"))
                        const el = document.getElementById(screenId)
                        if (el) el.classList.remove("hidden")
                    })
                }
                const menuData = document.querySelector(".screen[scr='homeboard'] .screen-part[src='menu'] .data")
                if (menuData) menuData.appendChild(block)
                this._menuButtons.push(block)
                return true
            }
            case "ui.setTitle": {
                const [sid, title] = args
                const titleEl = document.getElementById(`title-${sid}`)
                if (titleEl) titleEl.textContent = title
                return true
            }
            case "ui.showAlert":
                alert(String(args[0] || ""))
                return true
            case "ui.showConfirm":
                return confirm(String(args[0] || ""))
            case "ui.showInput": {
                const opts = args[0] || {}
                return new Promise(resolve => {
                    const uid = `sdk-inp-${this.addonId}-${Date.now()}`
                    const overlay = document.createElement("div")
                    overlay.className = "diary-modal-overlay"
                    overlay.style.zIndex = "5000"
                    overlay.innerHTML = `
                        <div class="diary-modal" style="max-width:340px;margin:auto;align-self:center">
                            ${opts.title ? `<div style="font-size:17px;font-weight:800;margin-bottom:12px">${escSdk(opts.title)}</div>` : ""}
                            ${opts.message ? `<div style="font-size:13px;color:rgba(0,0,0,0.5);margin-bottom:10px">${escSdk(opts.message)}</div>` : ""}
                            <input id="${uid}" type="${escSdk(opts.type||"text")}" placeholder="${escSdk(opts.placeholder||"")}" value="${escSdk(opts.default||"")}"
                                style="width:100%;box-sizing:border-box;border:none;background:rgba(0,0,0,0.06);border-radius:12px;padding:12px 14px;font-size:14px;font-family:Nunito,sans-serif;outline:none;margin-bottom:12px">
                            <div style="display:flex;gap:8px">
                                <button id="${uid}-cancel" style="flex:1;height:44px;border:none;border-radius:12px;background:rgba(0,0,0,0.07);font-size:15px;font-weight:600;cursor:pointer">${escSdk(opts.cancel||"Отмена")}</button>
                                <button id="${uid}-ok" style="flex:2;height:44px;border:none;border-radius:12px;background:rgb(0,122,255);color:white;font-size:15px;font-weight:700;cursor:pointer">${escSdk(opts.confirm||"ОК")}</button>
                            </div>
                        </div>`
                    overlay.querySelector(`#${uid}-cancel`).addEventListener("click", () => { overlay.remove(); resolve(null) })
                    overlay.querySelector(`#${uid}-ok`).addEventListener("click", () => { resolve(overlay.querySelector(`#${uid}`).value); overlay.remove() })
                    overlay.querySelector(`#${uid}`).addEventListener("keydown", e => { if (e.key==="Enter") { overlay.querySelector(`#${uid}-ok`).click() } })
                    document.body.appendChild(overlay)
                    overlay.querySelector(`#${uid}`).focus()
                })
            }
            case "ui.showRating": {
                const opts = args[0] || {}
                return new Promise(resolve => {
                    const uid = `sdk-rat-${this.addonId}-${Date.now()}`
                    const n = Math.min(10, Math.max(2, opts.stars || 5))
                    const overlay = document.createElement("div")
                    overlay.className = "diary-modal-overlay"
                    overlay.style.zIndex = "5000"
                    overlay.innerHTML = `
                        <div class="diary-modal" style="max-width:340px;margin:auto;align-self:center;text-align:center">
                            ${opts.title ? `<div style="font-size:17px;font-weight:800;margin-bottom:16px">${escSdk(opts.title)}</div>` : ""}
                            <div id="${uid}-stars" style="display:flex;justify-content:center;gap:8px;margin-bottom:20px">
                                ${Array.from({length:n},(_,i)=>`<div data-star="${i+1}" style="width:40px;height:40px;background:rgba(0,0,0,0.08);border-radius:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:24px;transition:background 0.12s">★</div>`).join("")}
                            </div>
                            <div style="display:flex;gap:8px">
                                <button id="${uid}-cancel" style="flex:1;height:44px;border:none;border-radius:12px;background:rgba(0,0,0,0.07);font-size:15px;font-weight:600;cursor:pointer">${escSdk(opts.cancel||"Отмена")}</button>
                                <button id="${uid}-ok" style="flex:2;height:44px;border:none;border-radius:12px;background:rgb(0,122,255);color:white;font-size:15px;font-weight:700;cursor:pointer" disabled>${escSdk(opts.confirm||"Оценить")}</button>
                            </div>
                        </div>`
                    let selected = 0
                    const starsEl = overlay.querySelector(`#${uid}-stars`)
                    starsEl.querySelectorAll("[data-star]").forEach(star => {
                        star.addEventListener("click", () => {
                            selected = parseInt(star.dataset.star)
                            starsEl.querySelectorAll("[data-star]").forEach((s,i) => {
                                s.style.background = i < selected ? "rgb(255,196,0)" : "rgba(0,0,0,0.08)"
                            })
                            overlay.querySelector(`#${uid}-ok`).disabled = false
                        })
                    })
                    overlay.querySelector(`#${uid}-cancel`).addEventListener("click", () => { overlay.remove(); resolve(null) })
                    overlay.querySelector(`#${uid}-ok`).addEventListener("click", () => { overlay.remove(); resolve(selected) })
                    document.body.appendChild(overlay)
                })
            }
            case "ui.watchActions": {
                if (this._contentWatching) return false
                this._contentWatching = true
                const aid  = String(this.addonId)
                const self = this
                window.addEventListener("message", e => {
                    if (!e.data?.__vsu_content_action || e.data.addonId !== aid) return
                    self._iframe?.contentWindow?.postMessage({
                        __vsu_event: true,
                        action: e.data.action,
                        value:  e.data.value
                    }, "*")
                })
                return true
            }
            case "ui.getTheme": {
                return document.documentElement.getAttribute('data-theme') || 'light'
            }
            case "ui.loadHtml": {
                const [path] = args
                const { content } = await window.api.storeAddonFile(this.addonId, path)
                return content
            }
            case "fs.list":   return window.api.addonFsList(this.addonId, args[0])
            case "fs.read":   return window.api.addonFsRead(this.addonId, args[0])
            case "fs.write":  return window.api.addonFsWrite(this.addonId, args[0], args[1])
            case "fs.delete": return window.api.addonFsDelete(this.addonId, args[0])
            case "fs.info":   return window.api.addonFsInfo(this.addonId)
            default: throw new Error(`Неизвестный метод: ${method}`)
        }
    }

    trigger(eventName, data = null) {
        this._iframe?.contentWindow?.postMessage({ __vsu_event: true, event: eventName, data }, "*")
    }
}

// ══════════════════════════════════════════════════════════
//  Менеджер расширений
// ══════════════════════════════════════════════════════════

window.vsuAddons = {
    _sandboxes: [],

    async loadInstalled() {
        try {
            const { addons } = await window.api.storeMyAddons()
            for (const addon of (addons || []).filter(a => a.is_active)) {
                try {
                    const manifest = addon.manifest_json
                        ? (typeof addon.manifest_json === "string" ? JSON.parse(addon.manifest_json) : addon.manifest_json)
                        : {}
                    const devUrl = manifest.dev_url

                    let content
                    if (devUrl && /^https?:\/\/localhost|^https?:\/\/127\./.test(devUrl) && window.app.user?.is_developer) {
                        // Загрузить с локального dev-сервера (только для разработчиков, только localhost)
                        try {
                            const res = await fetch(devUrl)
                            content = await res.text()
                        } catch {
                            const data = await window.api.storeAddonFile(addon.id, addon.entry_file)
                            content = data.content
                        }
                    } else {
                        const data = await window.api.storeAddonFile(addon.id, addon.entry_file)
                        content = data.content
                    }

                    const sandbox = new VSUBoxSandbox(addon.id, content, addon.addon_token || null)
                    sandbox.launch()
                    this._sandboxes.push(sandbox)
                } catch (e) {
                    console.warn(`vsuAddons: не удалось загрузить "${addon.name || addon.id}":`, e.message)
                }
            }
        } catch (e) {
            console.warn("vsuAddons: ошибка загрузки расширений:", e.message)
        }

        // Даём время всем sandbox-ам инициализироваться, затем шлём app:start
        setTimeout(() => {
            this._sandboxes.forEach(s => {
                const perms = _getGrantedPerms(s.addonId) || []
                if (perms.includes("autostart")) {
                    s.trigger("app:start", { timestamp: Date.now() })
                }
            })
        }, 600)

        this._bindPWAEvents()
    },

    _bindPWAEvents() {
        window.addEventListener("beforeinstallprompt", () => {
            this.triggerAll("pwa:install_available", {})
        })
        window.addEventListener("appinstalled", () => {
            this.triggerAll("pwa:installed", {})
        })
        document.addEventListener("visibilitychange", () => {
            this.triggerAll("app:visibility", { visible: !document.hidden })
        })
        document.addEventListener("vsu-theme-change", (e) => {
            this.triggerAll("theme:change", { theme: e.detail.theme })
        })
    },

    triggerAll(eventName, data) {
        this._sandboxes.forEach(s => s.trigger(eventName, data))
    },

    destroyAll() {
        this._sandboxes.forEach(s => s.destroy())
        this._sandboxes = []
    },
}
