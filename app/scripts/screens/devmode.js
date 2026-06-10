function parseAddonManifest(json) {
    if (!json) return null
    try { return typeof json === 'string' ? JSON.parse(json) : json } catch { return null }
}

function initDevmodeModule(user) {
    const app = new MiniApp("system-devmode", "1.0.0", "system")
    app.addMenuButton("./assets/hammer.fill.png", "Разработчик")

    // ── Проверка: только desktop ──────────────────────

    const isDesktop = !("ontouchstart" in window) ||
                      (window.matchMedia("(pointer: fine)").matches && window.innerWidth >= 900)

    if (!isDesktop) {
        // Mobile — показываем заглушку
        app.setContent(`
            <div class="module-nav">
                <div class="module-back" id="dev-back"></div>
                <div class="module-title">Разработчик</div>
            </div>
            <div class="module-body" style="align-items:center;justify-content:center;text-align:center;gap:16px">
                <div style="width:52px;height:52px;background:rgba(0,0,0,0.15);
                            mask-image:url(./assets/hammer.fill.png);mask-size:contain;
                            mask-repeat:no-repeat;mask-position:center"></div>
                <div style="font-size:20px;font-weight:800">Только на компьютере</div>
                <div style="font-size:15px;color:rgba(0,0,0,0.4);max-width:260px;line-height:1.5">
                    Режим разработчика доступен только с десктопного браузера
                </div>
            </div>
        `)
        app.$(".module-back").addEventListener("click", () => app.closeScreen())
        return app
    }

    // ── IDE-макет (только desktop) ────────────────────

    app.setContent(`
        <div class="dev-topbar">
            <div class="dev-back" id="dev-back"></div>
            <div class="dev-logo">VSU Box <span class="dev-badge">SDK</span></div>
            <div class="dev-topbar-right">
                <div class="dev-btn dev-btn--icon" id="dev-new-addon" title="Новое дополнение">＋</div>
                <div class="dev-user">${escDev(user.name)}</div>
            </div>
        </div>
        <div class="dev-layout">
            <aside class="dev-sidebar" id="dev-sidebar">
                <div class="dev-sidebar-section">МОИ ДОПОЛНЕНИЯ</div>
                <div id="dev-addon-list"><div class="dev-empty-hint">Загрузка...</div></div>
            </aside>
            <div class="dev-main" id="dev-main">
                <div class="dev-welcome">
                    <div class="dev-welcome-icon"></div>
                    <div class="dev-welcome-title">Выберите дополнение</div>
                    <div class="dev-welcome-sub">или создайте новое, нажав ＋</div>
                </div>
            </div>
        </div>
    `)

    app.$(".dev-back").addEventListener("click", () => app.closeScreen())
    app.$("#dev-new-addon").addEventListener("click", () => openAddonMeta(null))

    // ── Состояние ──────────────────────────────────────

    let currentAddon  = null
    let monacoEditor  = null
    let monacoLoaded  = false
    let currentFile   = null
    let addonList     = []
    let previewActive = false

    // ── Загрузка списка дополнений ────────────────────

    const origOpen = app.openScreen.bind(app)
    app.openScreen = function() { origOpen(); loadMyAddons() }

    async function loadMyAddons() {
        const listEl = app.$("#dev-addon-list")
        try {
            const data = await window.api.devMyAddons()
            addonList = data.addons || []

            listEl.innerHTML = ""
            if (addonList.length === 0) {
                listEl.innerHTML = `<div class="dev-empty-hint">Нет дополнений</div>`
                return
            }

            addonList.forEach(addon => {
                const item = document.createElement("div")
                item.className = "dev-addon-item" + (currentAddon?.id === addon.id ? " active" : "")
                item.dataset.id = addon.id

                const STATUS = {draft:"gray",pending:"yellow",approved:"green",rejected:"red"}
                const statusColor = STATUS[addon.status] || "gray"

                item.innerHTML = `
                    <div class="dev-addon-item-icon ${statusColor}"></div>
                    <div class="dev-addon-item-body">
                        <div class="dev-addon-item-name">${escDev(addon.name)}</div>
                        <div class="dev-addon-item-slug">${escDev(addon.slug)}</div>
                    </div>
                `
                item.addEventListener("click", () => openAddon(addon))
                listEl.appendChild(item)
            })
        } catch (e) {
            listEl.innerHTML = `<div class="dev-empty-hint">Ошибка: ${escDev(e.message)}</div>`
        }
    }

    // ── Открытие дополнения ───────────────────────────

    function openAddon(addon) {
        currentAddon  = addon
        currentFile   = null
        previewActive = false

        // Уничтожить предыдущий экземпляр Monaco (его DOM-контейнер будет удалён)
        if (monacoEditor) {
            monacoEditor.dispose()
            monacoEditor = null
        }

        // Подсветить в сайдбаре
        app.$$(".dev-addon-item").forEach(el => el.classList.toggle("active", el.dataset.id == addon.id))

        const STATUS_LABEL = {
            draft:"Черновик",pending:"На проверке",approved:"Одобрено",rejected:"Отклонено"
        }
        const STATUS_COLOR = { draft:"gray",pending:"#f90",approved:"#30c85e",rejected:"#f44" }
        const statusLabel = STATUS_LABEL[addon.status] || addon.status
        const statusColor = STATUS_COLOR[addon.status] || "#aaa"

        const main = app.$("#dev-main")
        main.innerHTML = `
            <div class="dev-panel-header">
                <div class="dev-panel-info">
                    <div class="dev-panel-name">${escDev(addon.name)}</div>
                    <div class="dev-panel-meta">
                        v${escDev(addon.version)} · <span style="color:${statusColor}">${statusLabel}</span>
                        ${addon.status === "rejected" && addon.reject_reason
                            ? ` · <span style="color:#f44">причина: ${escDev(addon.reject_reason)}</span>` : ""}
                    </div>
                </div>
                <div class="dev-panel-actions">
                    <button class="dev-save-btn" id="dev-save-btn" title="Ctrl+S" style="display:none">Сохранить</button>
                    <div class="dev-btn" id="dev-preview-toggle" title="Предпросмотр аддона">▶ Предпросмотр</div>
                    <div class="dev-btn" id="dp-edit">Настройки</div>
                    ${addon.status === "draft" || addon.status === "rejected"
                        ? `<div class="dev-btn dev-btn--primary" id="dp-submit">Отправить на проверку</div>` : ""}
                </div>
            </div>
            <div class="dev-editor-area">
                <div class="dev-file-tabs" id="dev-file-tabs">
                    <div class="dev-tab new-file-tab" id="dev-new-file">＋ Файл</div>
                    <div class="dev-tab new-file-tab" id="dev-upload-file" title="Загрузить изображение или HTML">↑ Загрузить</div>
                    <input type="file" id="dev-upload-input" style="display:none" accept="image/*,.html,.svg">
                </div>
                <div class="dev-editor-body" id="dev-editor-body">
                    <div class="dev-editor-wrap" id="dev-editor-wrap">
                        <div class="dev-welcome">
                            <div class="dev-welcome-icon"></div>
                            <div class="dev-welcome-title">Выберите файл</div>
                            <div class="dev-welcome-sub">или добавьте новый</div>
                        </div>
                    </div>
                </div>
            </div>
        `

        main.querySelector("#dp-edit").addEventListener("click", () => openAddonMeta(addon))
        main.querySelector("#dev-save-btn").addEventListener("click", saveCurrentFile)
        main.querySelector("#dev-preview-toggle").addEventListener("click", togglePreview)

        const submitBtn = main.querySelector("#dp-submit")
        if (submitBtn) {
            submitBtn.addEventListener("click", async () => {
                if (!confirm(`Отправить «${addon.name}» на проверку?`)) return
                submitBtn.textContent = "Отправка..."
                submitBtn.style.opacity = "0.6"
                try {
                    await window.api.devAddonSubmit(addon.id)
                    addon.status = "pending"
                    submitBtn.remove()
                    loadMyAddons()
                } catch (e) {
                    alert("Ошибка: " + e.message)
                    submitBtn.textContent = "Отправить на проверку"
                    submitBtn.style.opacity = ""
                }
            })
        }

        main.querySelector("#dev-new-file").addEventListener("click", () => promptNewFile())
        main.querySelector("#dev-upload-file").addEventListener("click", () => main.querySelector("#dev-upload-input").click())
        main.querySelector("#dev-upload-input").addEventListener("change", e => uploadFile(e.target.files[0]))

        loadFiles(addon)
    }

    // ── Файлы дополнения ──────────────────────────────

    async function loadFiles(addon) {
        const tabsEl = app.$("#dev-file-tabs")
        if (!tabsEl) return

        // Получаем список файлов из хранилища расширения
        let files = []
        try {
            const data = await window.api.devFileList(addon.id)
            files = data.files || []
        } catch {
            // Если API ещё нет файлов — показываем пустой state
        }

        // Удаляем старые вкладки (кроме кнопки ＋)
        tabsEl.querySelectorAll(".dev-tab:not(.new-file-tab)").forEach(t => t.remove())

        files.forEach(f => addFileTab(f.name, f))

        if (files.length > 0 && !currentFile) {
            openFile(files[0])
        }
    }

    function addFileTab(name, fileInfo) {
        const tabsEl = app.$("#dev-file-tabs")
        if (!tabsEl) return
        const tab = document.createElement("div")
        tab.className = "dev-tab" + (currentFile?.name === name ? " active" : "")
        tab.dataset.name = name
        tab.innerHTML = `<span>${escDev(name)}</span><span class="dev-tab-close" data-name="${escDev(name)}">×</span>`
        tab.addEventListener("click", e => {
            if (e.target.classList.contains("dev-tab-close")) return
            openFile(fileInfo || { name })
        })
        tab.querySelector(".dev-tab-close").addEventListener("click", e => {
            e.stopPropagation()
            if (!confirm(`Удалить файл «${name}»?`)) return
            window.api.devFileDelete(currentAddon.id, name).then(() => {
                tab.remove()
                if (currentFile?.name === name) {
                    monacoEditor?.setValue("")
                    currentFile = null
                }
            }).catch(err => alert("Ошибка: " + err.message))
        })
        tabsEl.insertBefore(tab, tabsEl.querySelector(".new-file-tab"))
    }

    async function openFile(fileInfo) {
        currentFile = fileInfo
        const name = fileInfo.name

        // Подсветить вкладку, снять unsaved с предыдущей
        app.$$(".dev-tab").forEach(t => t.classList.toggle("active", t.dataset.name === name))

        const wrap = app.$("#dev-editor-wrap")
        if (!wrap) return

        // Показать кнопку сохранения
        const saveBtn = app.$("#dev-save-btn")
        if (saveBtn) saveBtn.style.display = ""

        // Загружаем Monaco один раз
        if (!monacoLoaded) {
            wrap.innerHTML = `<div class="dev-editor-loading">Загрузка редактора...</div>`
            await loadMonaco()
            monacoLoaded = true
            registerSDKHints()
        }

        // Создаём или переиспользуем редактор
        if (!monacoEditor) {
            wrap.innerHTML = ""
            const container = document.createElement("div")
            container.style.cssText = "width:100%;height:100%"
            wrap.appendChild(container)
            monacoEditor = monaco.editor.create(container, {
                value: "",
                language: "javascript",
                theme: "vs",
                fontSize: 14,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                minimap: { enabled: false },
                lineNumbersMinChars: 3,
                scrollBeyondLastLine: false,
                wordWrap: "on",
                automaticLayout: false
            })

            // Ctrl/Cmd+S → сохранить
            monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, saveCurrentFile)

            // Unsaved indicator при изменении
            monacoEditor.onDidChangeModelContent(() => {
                const activeTab = app.$(".dev-tab.active:not(.new-file-tab)")
                if (activeTab) activeTab.classList.add("unsaved")
                const btn = app.$("#dev-save-btn")
                if (btn) btn.classList.remove("saved")
            })

            // Корректный layout после вставки в DOM
            requestAnimationFrame(() => {
                setTimeout(() => monacoEditor?.layout(), 50)
            })
        }

        // Устанавливаем язык по расширению
        const ext = name.split(".").pop()
        const lang = { js:"javascript", ts:"typescript", css:"css",
                       json:"json", html:"html", md:"markdown" }[ext] || "javascript"
        monaco.editor.setModelLanguage(monacoEditor.getModel(), lang)

        // Загружаем содержимое
        try {
            const data = await window.api.devFileGet(currentAddon.id, name)
            monacoEditor.setValue(data.content || "")
            monacoEditor.setPosition({ lineNumber: 1, column: 1 })
        } catch {
            monacoEditor.setValue(`// Новый файл: ${name}\n`)
        }

        // Снять unsaved с этой вкладки (только что загрузили с сервера)
        const tab = app.$(`.dev-tab[data-name="${CSS.escape(name)}"]`)
        if (tab) tab.classList.remove("unsaved")

        // Принудительный layout (Monaco иногда не замечает смену файла)
        requestAnimationFrame(() => monacoEditor?.layout())
    }

    async function saveCurrentFile() {
        if (!currentAddon || !currentFile || !monacoEditor) return
        const content = monacoEditor.getValue()
        const name = currentFile.name
        const btn = app.$("#dev-save-btn")
        if (btn) { btn.textContent = "Сохранение..."; btn.disabled = true }
        try {
            await window.api.devFileSave(currentAddon.id, name, content)
            const tab = app.$(`.dev-tab[data-name="${CSS.escape(name)}"]`)
            if (tab) tab.classList.remove("unsaved")
            if (btn) {
                btn.textContent = "Сохранено"
                btn.classList.add("saved")
                setTimeout(() => {
                    btn.textContent = "Сохранить"
                    btn.classList.remove("saved")
                    btn.disabled = false
                }, 1500)
            }
            // Авто-обновление предпросмотра после сохранения
            if (previewActive) refreshPreview()
        } catch (e) {
            alert("Ошибка сохранения: " + e.message)
            if (btn) { btn.textContent = "Сохранить"; btn.disabled = false }
        }
    }

    function promptNewFile() {
        const name = prompt("Имя файла (например: index.js, style.css, template.html):")
        if (!name || !name.trim()) return
        const cleanName = name.trim().replace(/[^a-zA-Z0-9._\-]/g, "")
        if (!cleanName) { alert("Недопустимое имя файла"); return }

        window.api.devFileSave(currentAddon.id, cleanName, "").then(() => {
            addFileTab(cleanName, { name: cleanName })
            openFile({ name: cleanName })
        }).catch(e => alert("Ошибка: " + e.message))
    }

    function uploadFile(file) {
        if (!file || !currentAddon) return
        const input = app.$("#dev-upload-input")
        if (input) input.value = ""  // сброс для повторной загрузки того же файла

        const reader = new FileReader()
        reader.onload = async () => {
            const b64 = reader.result.split(",")[1]
            const name = file.name.replace(/[^a-zA-Z0-9._\-]/g, "")
            if (!name) { alert("Недопустимое имя файла"); return }

            const uploadBtn = app.$("#dev-upload-file")
            const origText = uploadBtn?.textContent
            if (uploadBtn) uploadBtn.textContent = "Загрузка..."

            try {
                await window.api.devFileUpload(currentAddon.id, name, b64)
                addFileTab(name, { name })
                if (uploadBtn) uploadBtn.textContent = origText
            } catch (e) {
                alert("Ошибка загрузки: " + e.message)
                if (uploadBtn) uploadBtn.textContent = origText
            }
        }
        reader.readAsDataURL(file)
    }

    // ── Предпросмотр ──────────────────────────────────────

    function togglePreview() {
        const btn  = app.$("#dev-preview-toggle")
        const body = app.$("#dev-editor-body")
        if (!body) return

        previewActive = !previewActive

        if (previewActive) {
            btn?.classList.add("preview-on")
            btn.textContent = "■ Стоп"

            const pane = document.createElement("div")
            pane.className = "dev-preview-pane"
            pane.id = "dev-preview-pane"
            pane.innerHTML = `
                <iframe id="dev-preview-iframe" class="dev-preview-iframe" sandbox="allow-scripts"></iframe>
                <div class="dev-preview-toolbar">
                    <button class="dev-preview-run-btn" id="dev-preview-run">▶ Запустить</button>
                    <span class="dev-preview-status" id="dev-preview-status">Нажмите Запустить или Ctrl+S</span>
                </div>
            `
            body.appendChild(pane)
            pane.querySelector("#dev-preview-run").addEventListener("click", () => refreshPreview())
            requestAnimationFrame(() => monacoEditor?.layout())
        } else {
            btn?.classList.remove("preview-on")
            btn.textContent = "▶ Предпросмотр"
            app.$("#dev-preview-pane")?.remove()
            requestAnimationFrame(() => monacoEditor?.layout())
        }
    }

    function refreshPreview() {
        const iframe = app.$("#dev-preview-iframe")
        if (!iframe) return
        const code      = monacoEditor?.getValue() || ""
        const addonName = currentAddon?.name || "Расширение"
        const statusEl  = app.$("#dev-preview-status")
        if (statusEl) statusEl.textContent = "Запуск..."
        iframe.srcdoc = buildPreviewSrcdoc(code, addonName)
        iframe.onload = () => {
            if (statusEl) {
                const t = new Date()
                statusEl.textContent = "Запущено в " + t.getHours().toString().padStart(2,"0") + ":" + t.getMinutes().toString().padStart(2,"0")
            }
        }
    }

    function buildPreviewSrcdoc(code, addonName) {
        // Экранируем </script> в коде пользователя
        const safeCode = code.replace(/<\/script>/gi, "<\\/script>")
        const now  = new Date()
        const time = now.getHours().toString().padStart(2,"0") + ":" + now.getMinutes().toString().padStart(2,"0")
        const name = addonName.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light'

        return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body{height:100%;overflow:hidden;font-family:Nunito,sans-serif;background:#f2f2f7;color:#000}
#root{display:flex;flex-direction:column;height:100vh}
/* Status bar */
#sb{height:48px;display:flex;align-items:flex-end;padding:0 22px 8px;justify-content:space-between;flex-shrink:0;background:#f2f2f7;position:relative;z-index:2}
.sb-time{font-size:15px;font-weight:800;letter-spacing:-0.3px}
.sb-icons{display:flex;align-items:center;gap:5px}
.sb-signal{display:flex;align-items:flex-end;gap:1.5px;height:11px}
.sb-signal span{display:inline-block;background:currentColor;border-radius:1px;width:3px}
.sb-bat{width:24px;height:12px;border:1.5px solid currentColor;border-radius:3px;padding:1.5px;position:relative}
.sb-bat::after{content:'';position:absolute;right:-5px;top:50%;transform:translateY(-50%);width:2.5px;height:6px;background:currentColor;border-radius:0 1px 1px 0}
.sb-bat-fill{background:currentColor;border-radius:1px;height:100%;width:78%}
/* Nav bar */
#nav{height:44px;display:flex;align-items:center;padding:0 12px;flex-shrink:0;background:#f2f2f7;gap:8px}
#nav-back{font-size:26px;font-weight:300;color:rgb(0,122,255);cursor:pointer;padding:0 6px;line-height:1;display:none;flex-shrink:0;user-select:none}
#nav-title{flex:1;font-size:17px;font-weight:800;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#nav-end{display:flex;align-items:center;gap:4px;flex-shrink:0;min-width:36px;justify-content:flex-end}
/* Scroll content */
#scroll{flex:1;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;min-height:0;position:relative}
#app{min-height:100%;padding:0}
#loading{display:flex;align-items:center;justify-content:center;height:100%;min-height:80px;font-size:14px;color:rgba(0,0,0,.35);flex-direction:column;gap:8px}
/* Home indicator */
#home{height:26px;display:flex;align-items:center;justify-content:center;background:#f2f2f7;flex-shrink:0}
#home::after{content:'';width:120px;height:4px;background:rgba(0,0,0,.18);border-radius:100px}
/* Toast */
#toasts{position:fixed;bottom:36px;left:0;right:0;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;z-index:100}
.toast{background:rgba(28,28,30,.92);color:#fff;padding:10px 20px;border-radius:24px;font-size:14px;font-weight:600;max-width:88%;opacity:0;transform:translateY(8px);transition:.25s;backdrop-filter:blur(8px)}
.toast.show{opacity:1;transform:translateY(0)}
/* Error */
#errbar{position:fixed;top:0;left:0;right:0;z-index:200;background:rgb(255,59,48);color:#fff;font-size:12px;font-weight:700;padding:8px 14px;font-family:monospace;display:none;word-break:break-word}
/* Dialogs */
.dlg-bg{position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:flex-end;z-index:150;backdrop-filter:blur(3px)}
.dlg-sheet{background:#fff;border-radius:22px 22px 0 0;padding:24px 20px 36px;width:100%;animation:suAnim .22s ease}
@keyframes suAnim{from{transform:translateY(50px);opacity:0}to{transform:none;opacity:1}}
.dlg-msg{font-size:15px;color:rgba(0,0,0,.8);margin-bottom:16px;text-align:center;line-height:1.5;font-weight:600}
.dlg-row{display:flex;gap:8px;margin-top:4px}
.dlg-cancel{flex:1;height:44px;border:none;border-radius:12px;background:rgba(0,0,0,.07);font-size:15px;font-weight:600;cursor:pointer;font-family:Nunito,sans-serif}
.dlg-ok{flex:2;height:44px;border:none;border-radius:12px;background:rgb(0,122,255);color:#fff;font-size:15px;font-weight:700;cursor:pointer;font-family:Nunito,sans-serif}
.dlg-ok:disabled{opacity:.4;cursor:default}
.dlg-inp{width:100%;border:none;border-radius:12px;background:rgba(0,0,0,.06);padding:12px 14px;font-size:15px;font-family:Nunito,sans-serif;outline:none;margin-bottom:12px}
.dlg-stars{display:flex;justify-content:center;gap:8px;margin-bottom:16px}
.dlg-star{font-size:30px;cursor:pointer;transition:.1s;user-select:none}
.dlg-star:hover{transform:scale(1.2)}
</style>
</head>
<body>
<div id="root">
  <div id="sb">
    <span class="sb-time">${time}</span>
    <div class="sb-icons">
      <div class="sb-signal">
        <span style="height:3px"></span><span style="height:5px"></span>
        <span style="height:7px"></span><span style="height:9px"></span>
      </div>
      <svg width="15" height="11" viewBox="0 0 15 11" style="margin:0 1px" fill="currentColor">
        <path d="M7.5 2.2C5 2.2 2.8 3.2 1.2 4.8L0 3.6C1.9 1.6 4.6.5 7.5.5s5.6 1.1 7.5 3.1L13.8 4.8C12.2 3.2 10 2.2 7.5 2.2zm0 3c-1.5 0-2.8.6-3.7 1.5L2.6 5.5C3.8 4.3 5.6 3.5 7.5 3.5s3.7.8 4.9 2L11.2 6.7C10.3 5.8 9 5.2 7.5 5.2zm0 3c-.9 0-1.7.4-2.3.9L4 9l3.5 2L11 9l-1.2-1.2c-.6-.5-1.4-.8-2.3-.8z"/>
      </svg>
      <div class="sb-bat"><div class="sb-bat-fill"></div></div>
    </div>
  </div>
  <div id="nav">
    <div id="nav-back" onclick="_back()">‹</div>
    <div id="nav-title">${name}</div>
    <div id="nav-end"></div>
  </div>
  <div id="scroll"><div id="loading"><div style="width:28px;height:28px;border:3px solid rgba(0,0,0,.1);border-top-color:rgb(0,122,255);border-radius:50%;animation:spin .8s linear infinite"></div>Запуск...</div><div id="app"></div></div>
  <div id="home"></div>
  <div id="toasts"></div>
  <div id="errbar"></div>
</div>
<style>@keyframes spin{to{transform:rotate(360deg)}}</style>
<script>
// ── VSU Box Preview Mock SDK ──────────────────────────
function _H(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function _A(s){return String(s??'').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

const _store={},_fs={},_acts={},_evts={}
const _THEME='${currentTheme}'

function _err(msg){const e=document.getElementById('errbar');e.textContent='⚠ '+msg;e.style.display=''}
function _back(){document.getElementById('app').innerHTML='<div style="padding:60px 20px;text-align:center;color:rgba(0,0,0,.3);font-size:32px">←</div>'}

// Единый делегированный обработчик действий
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-sdk-action]')
  if(!el)return
  const tag=el.tagName
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT')return
  const id=el.dataset.sdkAction,val=el.dataset.sdkValue??null
  if(_acts[id])_acts[id](val)
},true)
document.addEventListener('input',e=>{
  const el=e.target.closest('[data-sdk-action]')
  if(!el)return
  const tag=el.tagName
  if(tag!=='INPUT'&&tag!=='TEXTAREA'&&tag!=='SELECT')return
  if(_acts[el.dataset.sdkAction])_acts[el.dataset.sdkAction](el.value)
},true)
document.addEventListener('change',e=>{
  const el=e.target.closest('[data-sdk-action]')
  if(!el||el.tagName!=='SELECT')return
  if(_acts[el.dataset.sdkAction])_acts[el.dataset.sdkAction](el.value)
},true)

function _dialog(type,msg,opts={}){
  return new Promise(res=>{
    const bg=document.createElement('div');bg.className='dlg-bg'
    let body=\`<div class="dlg-msg">\${_H(msg)}</div>\`
    if(type==='input')  body+=\`<input class="dlg-inp" id="dlg-i" placeholder="\${_A(opts.placeholder||'')}"></input>\`
    if(type==='rating') body+=\`<div class="dlg-stars">\${Array.from({length:opts.stars||5},(_,i)=>\`<span class="dlg-star" data-n="\${i+1}">☆</span>\`).join('')}</div>\`
    let btns=''
    if(type==='alert')   btns=\`<div class="dlg-row"><button class="dlg-ok" style="flex:1" data-r="ok">OK</button></div>\`
    if(type==='confirm') btns=\`<div class="dlg-row"><button class="dlg-cancel" data-r="no">Отмена</button><button class="dlg-ok" data-r="yes">OK</button></div>\`
    if(type==='input')   btns=\`<div class="dlg-row"><button class="dlg-cancel" data-r="no">Отмена</button><button class="dlg-ok" data-r="inp">OK</button></div>\`
    if(type==='rating')  btns=\`<div class="dlg-row"><button class="dlg-cancel" data-r="no">Отмена</button><button class="dlg-ok" data-r="rat" disabled id="dlg-rat">Оценить</button></div>\`
    bg.innerHTML=\`<div class="dlg-sheet">\${body}\${btns}</div>\`
    document.body.appendChild(bg)
    let _rat=0
    if(type==='rating'){
      bg.querySelectorAll('.dlg-star').forEach(s=>s.addEventListener('click',()=>{
        _rat=+s.dataset.n
        bg.querySelectorAll('.dlg-star').forEach((x,i)=>x.textContent=i<_rat?'★':'☆')
        const rb=bg.querySelector('#dlg-rat');if(rb)rb.disabled=false
      }))
    }
    if(type==='input') setTimeout(()=>bg.querySelector('#dlg-i')?.focus(),60)
    bg.addEventListener('click',e=>{
      const btn=e.target.closest('[data-r]');if(!btn)return
      const r=btn.dataset.r
      let val=null
      if(r==='yes')val=true
      else if(r==='inp')val=bg.querySelector('#dlg-i')?.value??null
      else if(r==='rat')val=_rat||null
      bg.remove();res(val)
    })
  })
}

function _mockSched(){return[
  {lesson_num:1,time:'08:00–09:25',subject:'Математический анализ',teacher:'Иванова А.П.',classroom:'201'},
  {lesson_num:2,time:'09:35–11:00',subject:'Линейная алгебра',teacher:'Петров И.С.',classroom:'305'},
  {lesson_num:3,time:'11:30–12:55',subject:'Программирование',teacher:'Сидоров К.А.',classroom:'Лаб.12'},
  {lesson_num:4,time:'13:05–14:30',subject:'Английский язык',teacher:'Brown J.',classroom:'104'},
]}


const VSUBoxSDK={
  ready(cb){
    const sdk={
      ui:{
        async createScreen({title='Экран'}={}){
          document.getElementById('loading').style.display='none'
          document.getElementById('nav-title').textContent=title
          document.getElementById('nav-back').style.display=''
          return 'scr-'+Math.random().toString(36).slice(2)
        },
        async setContent(sid,html){document.getElementById('app').innerHTML=html},
        async navigate(sid){document.getElementById('scroll').scrollTop=0},
        async addMenuButton({label=''}={}){
          const e=document.getElementById('nav-end'),c=document.createElement('span')
          c.textContent=label
          c.style.cssText='font-size:10px;background:rgb(0,122,255);color:#fff;border-radius:6px;padding:2px 8px;font-weight:800'
          e.appendChild(c)
        },
        async setTitle(sid,title){document.getElementById('nav-title').textContent=title},
        async toast(msg,dur=2500){
          const a=document.getElementById('toasts'),t=document.createElement('div')
          t.className='toast';t.textContent=msg;a.appendChild(t)
          requestAnimationFrame(()=>t.classList.add('show'))
          setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.remove(),350)},+dur||2500)
        },
        async back(){_back()},
        async showAlert(msg){await _dialog('alert',msg)},
        async showConfirm(msg){return _dialog('confirm',msg)},
        async showInput(o={}){return _dialog('input',o.title||'',{placeholder:o.placeholder||''})},
        async showRating(o={}){return _dialog('rating',o.title||'Оцените',{stars:o.stars||5})},
        onAction(id,cb){_acts[id]=cb},
        watchActions(){},
        async getTheme(){return _THEME},
        async loadHtml(path){return '<p style="padding:20px;color:rgba(0,0,0,.4)">[Файл: '+_H(path)+']</p>'},
        icon(name,{size=22,color='currentColor'}={}){
          return '<div style="width:'+size+'px;height:'+size+'px;background:'+color+';mask-image:url(/app/assets/'+_A(name)+'.png);-webkit-mask-image:url(/app/assets/'+_A(name)+'.png);mask-size:contain;-webkit-mask-size:contain;mask-repeat:no-repeat;-webkit-mask-repeat:no-repeat;mask-position:center;-webkit-mask-position:center;display:inline-block;flex-shrink:0"></div>'
        },
        components:{
          button(text,o={}){
            const id=o.actionId||o.id||'',act=id?'data-sdk-action="'+_A(id)+'"':''
            const bg=o.bg||(o.primary?'rgb(0,122,255)':'rgba(0,0,0,.07)'),clr=o.color||(o.primary?'#fff':'inherit')
            return '<button '+act+' style="border:none;border-radius:12px;padding:10px 20px;font-size:14px;font-weight:700;cursor:pointer;font-family:Nunito,sans-serif;background:'+_A(bg)+';color:'+_A(clr)+(o.full?';width:100%;box-sizing:border-box':'')+'">'+_H(text)+'</button>'
          },
          card(o={}){
            const{title='',desc='',icon='',iconColor='rgb(0,122,255)',actionId=''}=o
            const act=actionId?'data-sdk-action="'+_A(actionId)+'" style="cursor:pointer"':''
            const ico=icon?'<div style="width:40px;height:40px;flex-shrink:0;background:'+_A(iconColor)+';mask-image:url(/app/assets/'+_A(icon)+'.png);-webkit-mask-image:url(/app/assets/'+_A(icon)+'.png);mask-size:contain;mask-repeat:no-repeat;mask-position:center;border-radius:10px"></div>':''
            return '<div '+act+' style="background:rgba(255,255,255,.85);border-radius:16px;padding:14px;margin:6px 0;display:flex;gap:12px;align-items:flex-start">'+ico+'<div style="flex:1;min-width:0">'+(title?'<div style="font-size:15px;font-weight:700;margin-bottom:2px">'+_H(title)+'</div>':'')+(desc?'<div style="font-size:13px;color:rgba(0,0,0,.5);line-height:1.4">'+_H(desc)+'</div>':'')+'</div></div>'
          },
          text(c,o={}){const{size=14,bold=false,muted=false,center=false}=o;return'<p style="font-size:'+size+'px;font-weight:'+(bold?700:400)+';color:'+(muted?'rgba(0,0,0,.5)':'inherit')+';text-align:'+(center?'center':'left')+';margin:4px 0;line-height:1.5;font-family:Nunito,sans-serif">'+_H(c)+'</p>'},
          heading(t,lv=2){const s={1:22,2:18,3:15};return'<div style="font-size:'+(s[+lv]||18)+'px;font-weight:800;margin:14px 0 6px;font-family:Nunito,sans-serif">'+_H(t)+'</div>'},
          image(src,o={}){const{alt='',radius=12,width='100%'}=o;return'<img src="'+_A(src)+'" alt="'+_A(alt)+'" style="width:'+_A(width)+';border-radius:'+radius+'px;display:block;margin:8px 0;object-fit:cover">'},
          input(o={}){const{id='',placeholder='',type='text',value=''}=o;return'<input data-sdk-action="'+_A(id)+'" type="'+_A(type)+'" placeholder="'+_A(placeholder)+'" value="'+_A(value)+'" style="width:100%;box-sizing:border-box;border:none;background:rgba(0,0,0,.06);border-radius:12px;padding:12px 14px;font-size:14px;font-family:Nunito,sans-serif;outline:none;margin:4px 0">'},
          list(items=[]){
            const rows=items.map(item=>{
              const t=typeof item==='string'?item:(item.title||'')
              const s=typeof item==='object'?(item.subtitle||item.desc||''):''
              const a=typeof item==='object'?(item.actionId||''):''
              return'<div '+(a?'data-sdk-action="'+_A(a)+'"':'')+' style="padding:12px 14px;border-bottom:1px solid rgba(0,0,0,.06);display:flex;align-items:center;gap:8px;'+(a?'cursor:pointer;':'')+'"><div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:600">'+_H(t)+'</div>'+(s?'<div style="font-size:12px;color:rgba(0,0,0,.45)">'+_H(s)+'</div>':'')+'</div>'+(a?'<div style="width:7px;height:7px;border-right:2px solid rgba(0,0,0,.25);border-top:2px solid rgba(0,0,0,.25);transform:rotate(45deg);flex-shrink:0"></div>':'')+'</div>'
            }).join('')
            return'<div style="background:rgba(255,255,255,.85);border-radius:16px;overflow:hidden;margin:8px 0">'+rows+'</div>'
          },
          divider(){return'<div style="height:1px;background:rgba(0,0,0,.1);margin:12px 0"></div>'},
          spacer(h=16){return'<div style="height:'+(+h||16)+'px"></div>'},
          badge(t,o={}){const{color='rgba(0,0,0,.1)',textColor='inherit'}=o;return'<span style="display:inline-block;padding:2px 10px;border-radius:100px;background:'+_A(color)+';color:'+_A(textColor)+';font-size:12px;font-weight:600;font-family:Nunito,sans-serif">'+_H(t)+'</span>'},
        }
      },
      user:{
        get name()        {return Promise.resolve('Иван Иванов')},
        get firstname()   {return Promise.resolve('Иван')},
        get lastname()    {return Promise.resolve('Иванов')},
        get is_admin()    {return Promise.resolve(false)},
        get is_developer(){return Promise.resolve(true)},
        get group()       {return Promise.resolve('МА-41')},
        get faculty()     {return Promise.resolve('Математики и ИТ')},
      },
      schedule:{
        async getWeek(o=0){return{schedule:_mockSched()}},
        async getToday()  {return{schedule:_mockSched().slice(0,3)}},
      },
      storage:{
        async set(k,v){_store[k]=v},
        async get(k){return k in _store?_store[k]:null},
        async delete(k){delete _store[k]},
        async keys(){return Object.keys(_store)},
      },
      fs:{
        async list(p=''){return Object.keys(_fs).filter(k=>k.startsWith(p)).map(k=>({name:k,size:_fs[k].length}))},
        async read(p){if(!(p in _fs))throw new Error('Файл не найден: '+p);return _fs[p]},
        async write(p,c){_fs[p]=c},
        async delete(p){delete _fs[p]},
        async info(){const u=Object.values(_fs).reduce((s,v)=>s+v.length,0);return{used_bytes:u,max_bytes:20*1024*1024,files:Object.keys(_fs).length}},
      },
      events:{
        on(e,cb){(_evts[e]=_evts[e]||[]).push(cb)},
        off(e){delete _evts[e]},
      },
      app:{
        get version(){return Promise.resolve('3.0')},
        get build()  {return Promise.resolve('preview')},
      }
    }
    setTimeout(()=>{
      try{
        const r=cb(sdk)
        if(r&&typeof r.catch==='function')r.catch(e=>_err(e?.message||String(e)))
      }catch(e){_err(e?.message||String(e))}
    },80)
  }
}
</script>
<script>
${safeCode}
</script>
</body></html>`
    }

    function loadMonaco() {
        return new Promise(resolve => {
            if (window.monaco) { resolve(); return }
            const script = document.createElement("script")
            script.src = "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js"
            script.onload = () => {
                window.require.config({
                    paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs" }
                })
                window.require(["vs/editor/editor.main"], resolve)
            }
            document.head.appendChild(script)
        })
    }

    // ── Метаданные дополнения ─────────────────────────

    function openAddonMeta(addon) {
        const overlay = document.createElement("div")
        overlay.className = "diary-modal-overlay"
        const manifest    = parseAddonManifest(addon?.manifest_json)
        const savedPerms  = manifest?.permissions || []
        const ALL_PERMS   = [
            { id:"schedule",      label:"Расписание",       desc:"Доступ к расписанию занятий" },
            { id:"user",          label:"Профиль",           desc:"Имя и роли пользователя" },
            { id:"storage",       label:"Хранилище",         desc:"Хранение данных на сервере" },
            { id:"http",          label:"Внешние запросы",   desc:"Запросы на сторонние серверы с addon-токеном пользователя" },
            { id:"autostart",     label:"Автозапуск",        desc:"Получение события app:start при открытии приложения" },
            { id:"notifications", label:"Уведомления",       desc:"Отправка push-уведомлений пользователю со стороннего сервера" },
        ]
        const permChecks  = ALL_PERMS.map(p => `
            <label class="perm-check-row">
                <input type="checkbox" id="am-perm-${p.id}" value="${p.id}" ${savedPerms.includes(p.id) ? "checked" : ""}>
                <div>
                    <div style="font-size:14px;font-weight:600">${p.label}</div>
                    <div style="font-size:12px;color:rgba(0,0,0,0.4)">${p.desc}</div>
                </div>
            </label>`).join("")

        overlay.innerHTML = `
            <div class="diary-modal" style="max-width:600px;border-radius:20px;margin:20px auto;align-self:center">
                <div style="font-size:20px;font-weight:800;text-align:center;margin-bottom:4px">
                    ${addon ? "Настройки дополнения" : "Новое дополнение"}
                </div>
                <input class="modal-input" id="am-name"    type="text" placeholder="Название"    value="${escDev(addon?.name || "")}">
                <input class="modal-input" id="am-slug"    type="text" placeholder="Slug (slug-addon)" value="${escDev(addon?.slug || "")}">
                <input class="modal-input" id="am-version" type="text" placeholder="Версия (1.0.0)"   value="${escDev(addon?.version || "1.0.0")}">
                <textarea class="modal-textarea" id="am-desc" placeholder="Описание">${escDev(addon?.description || "")}</textarea>
                <input class="modal-input" id="am-entry"   type="text" placeholder="Entry file (index.js)"  value="${escDev(addon?.entry_file || "index.js")}">
                <input class="modal-input" id="am-icon"    type="url"  placeholder="URL иконки (необязательно)" value="${escDev(addon?.icon_url || "")}">
                <input class="modal-input" id="am-devurl"  type="url"  placeholder="Dev URL (http://localhost:3000/index.js) — только для разработки" value="${escDev(manifest?.dev_url || "")}">
                <div style="font-size:12px;color:var(--text-3);margin:-6px 0 8px;line-height:1.4">
                    Dev URL: если задан, аддон будет грузить код с локального сервера (только для разработчика-владельца).
                </div>
                <div style="font-size:12px;font-weight:700;color:rgba(0,0,0,0.4);text-transform:uppercase;letter-spacing:0.05em;margin:4px 0 6px">
                    Разрешения
                </div>
                <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px">
                    ${permChecks}
                </div>
                <div style="font-size:12px;color:rgba(0,0,0,0.35);margin-bottom:8px;line-height:1.4">
                    Пользователь подтверждает разрешения при установке. SDK автоматически блокирует вызовы без нужного доступа.
                </div>
                <div class="modal-row modal-actions">
                    <button class="modal-btn-cancel" id="am-cancel">Отмена</button>
                    <button class="modal-btn-ok" id="am-save">Сохранить</button>
                </div>
            </div>
        `
        document.body.appendChild(overlay)
        overlay.querySelector("#am-cancel").addEventListener("click", () => overlay.remove())
        overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove() })

        overlay.querySelector("#am-save").addEventListener("click", async () => {
            const name    = overlay.querySelector("#am-name").value.trim()
            const slug    = overlay.querySelector("#am-slug").value.trim()
            const version = overlay.querySelector("#am-version").value.trim()
            const desc    = overlay.querySelector("#am-desc").value.trim()
            const entry   = overlay.querySelector("#am-entry").value.trim()
            const icon    = overlay.querySelector("#am-icon").value.trim()
            const devUrl  = overlay.querySelector("#am-devurl").value.trim()
            const perms   = ALL_PERMS
                .filter(p => overlay.querySelector(`#am-perm-${p.id}`)?.checked)
                .map(p => p.id)

            if (!name || !slug) { alert("Укажите название и slug"); return }

            const btn = overlay.querySelector("#am-save")
            btn.textContent = "Сохранение..."
            btn.disabled = true

            try {
                const manifestData = { permissions: perms }
                if (devUrl) manifestData.dev_url = devUrl

                const data = await window.api.devAddonSave({
                    id: addon?.id,
                    name, slug, version, description: desc,
                    entry_file: entry || "index.js",
                    icon_url: icon || null,
                    manifest: manifestData
                })
                overlay.remove()

                // При создании нового аддона — сразу создаём шаблонный entry файл
                if (!addon && data.id) {
                    const entryName = entry || "index.js"
                    const template = `/**
 * ${name}
 * Дополнение для VSU Box
 */

VSUBoxSDK.ready(async (sdk) => {
    // Создаём экран расширения
    const screenId = await sdk.ui.createScreen({ title: "${name.replace(/"/g, "")}" })

    // Устанавливаем содержимое
    await sdk.ui.setContent(screenId, \`
        <div style="padding:20px;font-family:Nunito,sans-serif">
            <h2 style="margin-top:0">${name}</h2>
            <p style="color:rgba(0,0,0,0.5)">Привет из расширения!</p>
        </div>
    \`)

    // Добавляем кнопку в меню (иконка — SF Symbol из /app/assets/)
    await sdk.ui.addMenuButton({ label: "${name.replace(/"/g, "")}", screenId, icon: "app.badge" })
})
`
                    await window.api.devFileSave(data.id, entryName, template).catch(() => {})
                }

                await loadMyAddons()
                if (data.id) {
                    const found = addonList.find(a => a.id === data.id)
                    if (found) openAddon(found)
                }
            } catch (e) {
                alert("Ошибка: " + e.message)
                btn.textContent = "Сохранить"
                btn.disabled = false
            }
        })
    }

    function escDev(str) {
        if (!str) return ""
        return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    }

    // ── Monaco SDK Hints ──────────────────────────────────────

    function registerSDKHints() {
        if (!window.monaco) return
        const CIK    = monaco.languages.CompletionItemKind
        const SNIP   = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet

        // ── Dot-triggered completions ──────────────────────────
        monaco.languages.registerCompletionItemProvider('javascript', {
            triggerCharacters: ['.'],
            provideCompletionItems(model, position) {
                // Текст строки до курсора
                const fullLine = model.getValueInRange({
                    startLineNumber: position.lineNumber, startColumn: 1,
                    endLineNumber: position.lineNumber,   endColumn: position.column
                })
                // Слово, которое уже набрано после точки (например "cre" в "sdk.ui.cre")
                const word = model.getWordUntilPosition(position)
                // Префикс без частично набранного слова — именно по нему определяем контекст
                const line = fullLine.slice(0, fullLine.length - word.word.length)
                // Range покрывает уже набранное слово, чтобы оно заменялось completion-ом
                const range = {
                    startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
                    startColumn: word.startColumn, endColumn: position.column
                }

                if (/VSUBoxSDK\.ui\.$/.test(line) || /\bsdk\.ui\.$/.test(line)) {
                    return { suggestions: [
                        { label:'createScreen',  kind:CIK.Method, range,
                          insertText:"createScreen({ title: '${1:Заголовок}' })", insertTextRules:SNIP,
                          detail:'createScreen({title}) → Promise<screenId>',
                          documentation:{value:'Создаёт новый экран и возвращает его `screenId`.\n```js\nconst sid = await sdk.ui.createScreen({ title: "Мой экран" })\n```'} },
                        { label:'setContent', kind:CIK.Method, range,
                          insertText:'setContent(${1:screenId}, ${2:`<div>...</div>`})', insertTextRules:SNIP,
                          detail:'setContent(screenId, html) → установить содержимое экрана',
                          documentation:{value:'Устанавливает HTML в тело экрана.\n```js\nawait sdk.ui.setContent(sid, `<div style="padding:20px"><h2>Привет!</h2></div>`)\n```'} },
                        { label:'navigate', kind:CIK.Method, range,
                          insertText:'navigate(${1:screenId})', insertTextRules:SNIP,
                          detail:'navigate(screenId) → перейти на экран',
                          documentation:{value:'Скрывает все экраны и показывает указанный.\n```js\nawait sdk.ui.navigate(screenId)\n```'} },
                        { label:'addMenuButton', kind:CIK.Method, range,
                          insertText:"addMenuButton({ label: '${1:Название}', screenId: ${2:screenId}, icon: '${3:star.fill}' })", insertTextRules:SNIP,
                          detail:'addMenuButton({label, screenId, icon?}) → кнопка в меню с иконкой',
                          documentation:{value:'Добавляет кнопку в раздел «Меню». Пользователь нажимает её — открывается экран.\n\n**Параметры:**\n- `label` — текст кнопки `string`\n- `screenId` — ID экрана (из `createScreen`) `string`\n- `icon` — имя SF Symbol иконки `string` (по умолч. `"exclamationmark.circle.fill"`)\n\nОткрытие экрана по кнопке меню — единственный способ навигации. `navigate()` при старте игнорируется — аддон не может открыться без действия пользователя.\n\n```js\nawait sdk.ui.addMenuButton({\n  label: "Мой аддон",\n  screenId: sid,\n  icon: "star.fill"       // SF Symbol имя\n})\n```'} },
                        { label:'setTitle', kind:CIK.Method, range,
                          insertText:"setTitle(${1:screenId}, '${2:Заголовок}')", insertTextRules:SNIP,
                          detail:'setTitle(screenId, title) → изменить заголовок экрана',
                          documentation:{value:'**Параметры:**\n- `screenId` — ID экрана (из `createScreen`)\n- `title` — новый заголовок `string`\n\n```js\nconst sid = await sdk.ui.createScreen({ title: "Загрузка..." })\n// ... после загрузки данных:\nawait sdk.ui.setTitle(sid, "Мой профиль")\n```'} },
                        { label:'toast', kind:CIK.Method, range,
                          insertText:"toast('${1:Сообщение}')", insertTextRules:SNIP,
                          detail:'toast(msg, duration?) → всплывающее уведомление',
                          documentation:{value:'Показывает тост снизу экрана.\n```js\nawait sdk.ui.toast("Сохранено!")\nawait sdk.ui.toast("Долгое", 5000)\n```'} },
                        { label:'back', kind:CIK.Method, range,
                          insertText:'back()',
                          detail:'back() → вернуться на главный экран',
                          documentation:{value:'Закрывает текущий экран расширения и возвращает пользователя на главную страницу приложения.\n\n```js\n// Кнопка "Назад" в интерфейсе\nsdk.ui.onAction("close-btn", async () => {\n  await sdk.ui.back()\n})\n```'} },
                        { label:'showAlert', kind:CIK.Method, range,
                          insertText:"showAlert('${1:Сообщение}')", insertTextRules:SNIP,
                          detail:'showAlert(msg) → системный диалог предупреждения',
                          documentation:{value:'Показывает встроенный диалог с сообщением и кнопкой «OK». Приостанавливает выполнение до закрытия.\n\n**Параметры:**\n- `msg` — текст сообщения `string`\n\n```js\nawait sdk.ui.showAlert("Необходимо войти в аккаунт")\n```'} },
                        { label:'showConfirm', kind:CIK.Method, range,
                          insertText:"showConfirm('${1:Вы уверены?}')", insertTextRules:SNIP,
                          detail:'showConfirm(msg) → диалог подтверждения, возвращает true/false',
                          documentation:{value:'```js\nconst ok = await sdk.ui.showConfirm("Удалить?")\nif (ok) { ... }\n```'} },
                        { label:'showInput', kind:CIK.Method, range,
                          insertText:"showInput({ title: '${1:Заголовок}', placeholder: '${2:...}' })", insertTextRules:SNIP,
                          detail:'showInput(opts) → диалог с текстовым полем, возвращает строку или null',
                          documentation:{value:'```js\nconst val = await sdk.ui.showInput({ title: "Введите имя", placeholder: "Имя..." })\nif (val) console.log(val)\n```'} },
                        { label:'showRating', kind:CIK.Method, range,
                          insertText:"showRating({ title: '${1:Оцените}', stars: ${2:5} })", insertTextRules:SNIP,
                          detail:'showRating(opts) → диалог выбора оценки, возвращает число или null',
                          documentation:{value:'```js\nconst rating = await sdk.ui.showRating({ title: "Понравилось?", stars: 5 })\nconsole.log(rating) // 1-5\n```'} },
                        { label:'onAction', kind:CIK.Method, range,
                          insertText:"onAction('${1:actionId}', (value) => {\n\t${2}\n})", insertTextRules:SNIP,
                          detail:'onAction(id, cb) → обработчик кнопки/элемента с data-sdk-action',
                          documentation:{value:'```js\nsdk.ui.onAction("save-btn", (val) => {\n  console.log("Нажато, значение:", val)\n})\n```'} },
                        { label:'watchActions', kind:CIK.Method, range,
                          insertText:"watchActions(${1:screenId})", insertTextRules:SNIP,
                          detail:'watchActions(sid) → запустить слежение за кликами (вызывается автоматически в navigate)',
                          documentation:{value:'Запускает двустороннюю связь между родительским приложением и iframe экрана. Вызывается автоматически внутри `navigate()` — вручную нужен только при ручном управлении экранами.\n\nСлушает элементы с `data-sdk-action` в HTML экрана. Используйте `sdk.ui.onAction()` для обработки кликов.\n\n```js\n// Пример HTML в setContent:\n// <button data-sdk-action="save" data-sdk-value="ok">Сохранить</button>\n// <input data-sdk-action="name-field" />\n\nsdk.ui.onAction("save", (val) => console.log("value:", val))\nsdk.ui.onAction("name-field", (val) => console.log("input:", val))\n```'} },
                        { label:'icon', kind:CIK.Method, range,
                          insertText:"icon('${1:star.fill}', { size: ${2:22}, color: '${3:currentColor}' })", insertTextRules:SNIP,
                          detail:'icon(name, opts?) → HTML-строка с SF Symbol иконкой',
                          documentation:{value:'```js\nconst ic = sdk.ui.icon("star.fill", { size: 24, color: "rgb(0,122,255)" })\nhtml += `<div style="display:flex;gap:8px">${ic} Избранное</div>`\n```'} },
                        { label:'getTheme', kind:CIK.Method, range,
                          insertText:'getTheme()', insertTextRules:SNIP,
                          detail:'getTheme() → Promise<"light"|"dark">: текущая тема',
                          documentation:{value:'Возвращает текущую тему оформления.\n\n```js\nconst theme = await sdk.ui.getTheme()\nconst bg = theme === "dark" ? "#1c1c1e" : "white"\nconst fg = theme === "dark" ? "white" : "black"\n// Реагировать на смену темы:\nsdk.events.on("theme:change", ({ theme }) => render(theme))\n```'} },
                        { label:'components', kind:CIK.Module, range, insertText:'components',
                          detail:'Готовые UI-компоненты: button, card, text, heading, image, input, list, badge, divider, spacer' },
                    ]}
                }

                if (/VSUBoxSDK\.user\.$/.test(line) || /\bsdk\.user\.$/.test(line)) {
                    return { suggestions: [
                        { label:'name',         kind:CIK.Property, range, insertText:'name',
                          detail:'→ Promise<string>: ФИО пользователя',
                          documentation:{value:'Полное имя пользователя в формате «Фамилия Имя Отчество» из профиля Moodle.\n\n```js\nconst name = await sdk.user.name\nawait sdk.ui.setContent(sid, `<h2>Привет, ${name}!</h2>`)\n```'} },
                        { label:'firstname',    kind:CIK.Property, range, insertText:'firstname',
                          detail:'→ Promise<string>: Имя',
                          documentation:{value:'Только имя пользователя (первое слово из полного имени).\n\n```js\nconst firstName = await sdk.user.firstname\nconsole.log("Имя:", firstName) // "Иван"\n```'} },
                        { label:'lastname',     kind:CIK.Property, range, insertText:'lastname',
                          detail:'→ Promise<string>: Фамилия',
                          documentation:{value:'Только фамилия пользователя.\n\n```js\nconst [first, last] = await Promise.all([sdk.user.firstname, sdk.user.lastname])\nconsole.log(`${first} ${last}`)\n```'} },
                        { label:'is_admin',     kind:CIK.Property, range, insertText:'is_admin',
                          detail:'→ Promise<boolean>: является администратором',
                          documentation:{value:'`true` если пользователь — администратор VSU Box. Используйте для скрытия или показа административных функций.\n\n```js\nif (await sdk.user.is_admin) {\n  // показать admin-панель\n}\n```'} },
                        { label:'is_developer', kind:CIK.Property, range, insertText:'is_developer',
                          detail:'→ Promise<boolean>: является разработчиком',
                          documentation:{value:'`true` если пользователю выдана роль разработчика. Разработчики могут публиковать аддоны в Store.\n\n```js\nconst isDev = await sdk.user.is_developer\nif (isDev) showDevTools()\n```'} },
                        { label:'group',        kind:CIK.Property, range, insertText:'group',
                          detail:'→ Promise<string|null>: группа пользователя (из настроек режима)',
                          documentation:{value:'Учебная группа из настроек «Режима» пользователя (например `«МА-41»`). `null` если не задана.\n\n```js\nconst group = await sdk.user.group\nif (!group) {\n  await sdk.ui.showAlert("Укажите группу в настройках")\n  return\n}\nconst { schedule } = await sdk.schedule.getWeek(0)\n```'} },
                        { label:'faculty',      kind:CIK.Property, range, insertText:'faculty',
                          detail:'→ Promise<string|null>: факультет пользователя (из настроек режима)',
                          documentation:{value:'Факультет из настроек «Режима» (например `«Математики и ИТ»`). `null` если не задан.\n\n```js\nconst [faculty, group] = await Promise.all([sdk.user.faculty, sdk.user.group])\nconsole.log(faculty, group)\n```'} },
                    ]}
                }

                if (/VSUBoxSDK\.schedule\.$/.test(line) || /\bsdk\.schedule\.$/.test(line)) {
                    return { suggestions: [
                        { label:'getWeek', kind:CIK.Method, range,
                          insertText:'getWeek(${1:0})', insertTextRules:SNIP,
                          detail:'getWeek(weekOffset?) → расписание на неделю',
                          documentation:{value:'`weekOffset`: 0 = текущая, 1 = следующая, -1 = прошлая\n```js\nconst { schedule } = await sdk.schedule.getWeek(0)\nschedule.forEach(l => console.log(l.subject, l.time))\n```'} },
                        { label:'getToday', kind:CIK.Method, range,
                          insertText:'getToday()',
                          detail:'getToday() → расписание на сегодня',
                          documentation:{value:'Возвращает расписание на текущий день для группы пользователя.\n\n**Возвращает:** `{ schedule: Lesson[] }`\n\nКаждый объект `Lesson`: `{ time, subject, teacher, classroom, lesson_num }`\n\n```js\nconst { schedule } = await sdk.schedule.getToday()\nif (!schedule.length) {\n  await sdk.ui.setContent(sid, "<p>Пар сегодня нет 🎉</p>")\n} else {\n  const html = schedule.map(l =>\n    `<div>${l.time} — ${l.subject}</div>`\n  ).join("")\n  await sdk.ui.setContent(sid, html)\n}\n```'} },
                    ]}
                }

                if (/VSUBoxSDK\.storage\.$/.test(line) || /\bsdk\.storage\.$/.test(line)) {
                    return { suggestions: [
                        { label:'set', kind:CIK.Method, range,
                          insertText:"set('${1:key}', ${2:value})", insertTextRules:SNIP,
                          detail:"set(key, value) → сохранить данные на сервере",
                          documentation:{value:'Данные изолированы по namespace аддона и привязаны к аккаунту.\n```js\nawait sdk.storage.set("counter", 42)\n```'} },
                        { label:'get', kind:CIK.Method, range,
                          insertText:"get('${1:key}')", insertTextRules:SNIP,
                          detail:'get(key) → получить сохранённое значение',
                          documentation:{value:'Читает значение по ключу. Возвращает `null` если ключ не существует. Поддерживает любые JSON-совместимые типы.\n\n```js\nconst settings = await sdk.storage.get("settings")\nconst count = (await sdk.storage.get("counter")) ?? 0\n```'} },
                        { label:'delete', kind:CIK.Method, range,
                          insertText:"delete('${1:key}')", insertTextRules:SNIP,
                          detail:'delete(key) → удалить значение',
                          documentation:{value:'Удаляет значение по ключу. Если ключ не существует — ничего не происходит.\n\n```js\nawait sdk.storage.delete("temp_token")\n// Очистить все данные аддона:\nconst keys = await sdk.storage.keys()\nfor (const k of keys) await sdk.storage.delete(k)\n```'} },
                        { label:'keys', kind:CIK.Method, range,
                          insertText:'keys()',
                          detail:'keys() → Promise<string[]>: список ключей аддона',
                          documentation:{value:'```js\nconst keys = await sdk.storage.keys()\nconsole.log(keys) // ["counter", "settings"]\n```'} },
                    ]}
                }

                if (/VSUBoxSDK\.ui\.components\.$/.test(line) || /\bsdk\.ui\.components\.$/.test(line)) {
                    return { suggestions: [
                        { label:'button', kind:CIK.Method, range,
                          insertText:"button('${1:Текст кнопки}', { actionId: '${2:btn}' })", insertTextRules:SNIP,
                          detail:'button(text, opts?) → HTML кнопки с data-sdk-action',
                          documentation:{value:'Создаёт стилизованную кнопку. Кнопка автоматически получает `data-sdk-action` — обрабатывается через `sdk.ui.onAction()`.\n\n**Опции:**\n- `actionId` — ID действия для `onAction` `string`\n- `color` — цвет текста `string`\n- `bg` — фон кнопки `string`\n- `full` — растянуть на всю ширину `boolean`\n\n```js\nconst html = sdk.ui.components.button("Сохранить", {\n  actionId: "save",\n  bg: "rgb(52,199,89)"\n})\nawait sdk.ui.setContent(sid, html)\nsdk.ui.onAction("save", () => console.log("Нажато!"))\n```'} },
                        { label:'card', kind:CIK.Method, range,
                          insertText:"card({ title: '${1:Заголовок}', desc: '${2:Описание}' })", insertTextRules:SNIP,
                          detail:'card(opts) → HTML карточки (icon, title, desc, actionId)',
                          documentation:{value:'Создаёт карточку в стиле iOS с иконкой, заголовком и описанием.\n\n**Опции:**\n- `title` — заголовок карточки `string`\n- `desc` — описание `string`\n- `icon` — имя SF Symbol иконки `string`\n- `iconColor` — цвет иконки `string`\n- `actionId` — ID для `onAction` (сделает карточку нажимаемой)\n\n```js\nconst html = sdk.ui.components.card({\n  title: "Расписание",\n  desc: "3 пары на сегодня",\n  icon: "calendar",\n  iconColor: "rgb(0,122,255)",\n  actionId: "open-schedule"\n})\n```'} },
                        { label:'text', kind:CIK.Method, range,
                          insertText:"text('${1:Текст}', { size: ${2:15}, muted: ${3:false} })", insertTextRules:SNIP,
                          detail:'text(content, opts?) → параграф (size, bold, muted, center)',
                          documentation:{value:'Создаёт текстовый параграф с опциями оформления.\n\n**Опции:**\n- `size` — размер шрифта в px `number` (по умолч. 15)\n- `bold` — жирный текст `boolean`\n- `muted` — приглушённый (серый) цвет `boolean`\n- `center` — выравнивание по центру `boolean`\n\n```js\nlet html = ""\nhtml += sdk.ui.components.text("Обновлено 5 мин назад", { muted: true, size: 13 })\nhtml += sdk.ui.components.text("Важная информация", { bold: true })\n```'} },
                        { label:'heading', kind:CIK.Method, range,
                          insertText:"heading('${1:Заголовок}', ${2:1})", insertTextRules:SNIP,
                          detail:'heading(text, level?) → заголовок (level 1-3)',
                          documentation:{value:'Создаёт заголовок нужного уровня (аналог `<h1>`–`<h3>`).\n\n**Параметры:**\n- `text` — текст заголовка\n- `level` — уровень `1` | `2` | `3` (по умолч. `1`)\n\n```js\nlet html = ""\nhtml += sdk.ui.components.heading("Мои заметки", 1)\nhtml += sdk.ui.components.heading("Сегодня", 2)\nhtml += sdk.ui.components.text("Здесь пусто")\n```'} },
                        { label:'image', kind:CIK.Method, range,
                          insertText:"image('${1:url}', { width: '${2:100%}', radius: ${3:12} })", insertTextRules:SNIP,
                          detail:'image(src, opts?) → изображение (radius, width, height)',
                          documentation:{value:'Создаёт изображение с опциями стиля.\n\n**Опции:**\n- `width` — ширина (CSS значение) `string` (по умолч. `"100%"`)\n- `height` — высота `string`\n- `radius` — скругление углов в px `number`\n\n```js\n// Загружаем изображение из файлов аддона:\nconst url = await sdk.ui.loadHtml("banner.html") // или путь к картинке\nconst html = sdk.ui.components.image("/store/dev/42/1/banner.png", {\n  width: "100%",\n  radius: 16\n})\n```'} },
                        { label:'input', kind:CIK.Method, range,
                          insertText:"input({ placeholder: '${1:...}', actionId: '${2:field}' })", insertTextRules:SNIP,
                          detail:'input(opts) → текстовое поле (placeholder, type, value, actionId)',
                          documentation:{value:'Создаёт стилизованное поле ввода. Изменения отправляются через `onAction` по событию `input`.\n\n**Опции:**\n- `placeholder` — подсказка `string`\n- `type` — тип (`"text"`, `"number"`, `"email"`) `string`\n- `value` — начальное значение `string`\n- `actionId` — ID для `onAction` `string`\n\n```js\nconst html = sdk.ui.components.input({\n  placeholder: "Введите поисковый запрос...",\n  actionId: "search"\n})\nawait sdk.ui.setContent(sid, html)\nsdk.ui.onAction("search", (val) => doSearch(val))\n```'} },
                        { label:'list', kind:CIK.Method, range,
                          insertText:"list([{ title: '${1:Пункт}', desc: '${2:}', actionId: '${3:}' }])", insertTextRules:SNIP,
                          detail:'list(items) → iOS-стиль список (title, desc, icon, iconColor, actionId)',
                          documentation:{value:'Создаёт список в стиле iOS Settings. Каждый пункт — объект с полями:\n\n- `title` — название строки `string`\n- `desc` — подпись под названием `string`\n- `icon` — SF Symbol иконка `string`\n- `iconColor` — цвет иконки `string`\n- `actionId` — ID для `onAction` (строка становится нажимаемой)\n\n```js\nconst html = sdk.ui.components.list([\n  { title: "Профиль", icon: "person.crop.circle.fill", actionId: "profile" },\n  { title: "Настройки", icon: "slider.horizontal.3", actionId: "settings" },\n  { title: "О приложении", desc: "Версия 3.0", icon: "info.circle.fill" }\n])\nsdk.ui.onAction("profile", () => openProfile())\n```'} },
                        { label:'badge', kind:CIK.Method, range,
                          insertText:"badge('${1:Новое}', { color: '${2:rgb(0,122,255)}' })", insertTextRules:SNIP,
                          detail:'badge(text, opts?) → цветной бейдж-пилюля (color, bg)',
                          documentation:{value:'Создаёт цветной бейдж-пилюлю (метку). Удобен для статусов, счётчиков, тегов.\n\n**Опции:**\n- `color` — цвет текста `string` (по умолч. `"rgb(0,122,255)"`)\n- `bg` — фон `string` (по умолч. полупрозрачный цвет)\n\n```js\nconst html = [\n  sdk.ui.components.badge("Выполнено", { color: "rgb(52,199,89)" }),\n  sdk.ui.components.badge("3 задания", { color: "rgb(255,149,0)" }),\n].join(" ")\n```'} },
                        { label:'divider', kind:CIK.Method, range,
                          insertText:'divider()',
                          detail:'divider() → горизонтальный разделитель',
                          documentation:{value:'Создаёт тонкий горизонтальный разделитель между секциями.\n\n```js\nlet html = ""\nhtml += sdk.ui.components.heading("Раздел 1")\nhtml += sdk.ui.components.text("Контент...")\nhtml += sdk.ui.components.divider()\nhtml += sdk.ui.components.heading("Раздел 2")\n```'} },
                        { label:'spacer', kind:CIK.Method, range,
                          insertText:'spacer(${1:16})', insertTextRules:SNIP,
                          detail:'spacer(h?) → вертикальный отступ в px',
                          documentation:{value:'Добавляет вертикальный отступ нужной высоты.\n\n**Параметры:**\n- `h` — высота в px `number` (по умолч. `16`)\n\n```js\nlet html = ""\nhtml += sdk.ui.components.heading("Заголовок")\nhtml += sdk.ui.components.spacer(8)\nhtml += sdk.ui.components.text("Текст сразу под заголовком")\nhtml += sdk.ui.components.spacer(32)\nhtml += sdk.ui.components.button("Готово", { actionId: "done" })\n```'} },
                    ]}
                }

                if (/VSUBoxSDK\.fs\.$/.test(line) || /\bsdk\.fs\.$/.test(line)) {
                    return { suggestions: [
                        { label:'list', kind:CIK.Method, range,
                          insertText:"list('${1:}')", insertTextRules:SNIP,
                          detail:'list(path?) → список файлов и папок в директории',
                          documentation:{value:'```js\nconst files = await sdk.fs.list("")\nfiles.forEach(f => console.log(f.name, f.size))\n```'} },
                        { label:'read', kind:CIK.Method, range,
                          insertText:"read('${1:data.json}')", insertTextRules:SNIP,
                          detail:'read(path) → содержимое файла (строка)',
                          documentation:{value:'```js\nconst raw = await sdk.fs.read("data.json")\nconst obj = JSON.parse(raw)\n```'} },
                        { label:'write', kind:CIK.Method, range,
                          insertText:"write('${1:data.json}', ${2:content})", insertTextRules:SNIP,
                          detail:'write(path, content) → сохранить файл (создаёт папки автоматически)',
                          documentation:{value:'```js\nawait sdk.fs.write("notes.json", JSON.stringify({ items: [] }))\n```'} },
                        { label:'delete', kind:CIK.Method, range,
                          insertText:"delete('${1:file.txt}')", insertTextRules:SNIP,
                          detail:'delete(path) → удалить файл или папку',
                          documentation:{value:'Удаляет файл или папку (рекурсивно). Операция необратима.\n\n**Параметры:**\n- `path` — путь к файлу или папке `string`\n\n```js\n// Удалить файл:\nawait sdk.fs.delete("cache/data.json")\n\n// Удалить папку со всем содержимым:\nawait sdk.fs.delete("cache")\n```'} },
                        { label:'info', kind:CIK.Method, range,
                          insertText:'info()',
                          detail:'info() → { used_bytes, max_bytes, files } — статистика хранилища',
                          documentation:{value:'```js\nconst { used_bytes, max_bytes } = await sdk.fs.info()\nconsole.log(Math.round(used_bytes/1024), "KB из", max_bytes/1024/1024, "MB")\n```'} },
                    ]}
                }

                if (/VSUBoxSDK\.events\.$/.test(line) || /\bsdk\.events\.$/.test(line)) {
                    return { suggestions: [
                        { label:'on', kind:CIK.Method, range,
                          insertText:"on('${1:pwa:install_available}', (data) => {\n\t${2}\n})", insertTextRules:SNIP,
                          detail:'on(event, cb) → подписаться на системное событие',
                          documentation:{value:'**Доступные события:**\n- `pwa:install_available` — можно добавить на главный экран\n- `pwa:installed` — приложение установлено\n- `app:visibility` — вкладка стала видимой/скрытой\n\n```js\nsdk.events.on("app:visibility", ({ visible }) => {\n  if (visible) refresh()\n})\n```'} },
                        { label:'off', kind:CIK.Method, range,
                          insertText:"off('${1:pwa:install_available}')", insertTextRules:SNIP,
                          detail:'off(event) → отписаться от события',
                          documentation:{value:'Удаляет обработчик системного события.\n\n**Параметры:**\n- `event` — имя события `string`\n\n**Доступные события:**\n- `pwa:install_available` — можно добавить на главный экран\n- `pwa:installed` — приложение установлено\n- `app:visibility` — вкладка стала видимой/скрытой\n\n```js\nconst handler = ({ visible }) => {\n  if (visible) refresh()\n}\nsdk.events.on("app:visibility", handler)\n// позже:\nsdk.events.off("app:visibility")\n```'} },
                    ]}
                }

                if (/VSUBoxSDK\.app\.$/.test(line) || /\bsdk\.app\.$/.test(line)) {
                    return { suggestions: [
                        { label:'version', kind:CIK.Property, range, insertText:'version',
                          detail:'→ Promise<string>: версия приложения (например "3.0")',
                          documentation:{value:'Возвращает строку с номером версии VSU Box (например `"3.0"`). Используйте для проверки совместимости функций.\n\n```js\nconst version = await sdk.app.version\nawait sdk.ui.setContent(sid, `<p>VSU Box v${version}</p>`)\n```'} },
                        { label:'build',   kind:CIK.Property, range, insertText:'build',
                          detail:'→ Promise<string>: номер сборки',
                          documentation:{value:'Возвращает строку с номером сборки (например `"42"`). Полезно для отладки.\n\n```js\nconst [ver, build] = await Promise.all([sdk.app.version, sdk.app.build])\nconsole.log(`VSU Box ${ver} (build ${build})`)\n```'} },
                    ]}
                }

                if (/(?:^|[;\s(])VSUBoxSDK\.$/.test(line)) {
                    return { suggestions: [
                        { label:'ready',    kind:CIK.Method,  range,
                          insertText:'ready(async (sdk) => {\n\t${1}\n})', insertTextRules:SNIP,
                          detail:'ready(callback) → точка входа расширения', sortText:'0',
                          documentation:{value:'**Точка входа любого расширения VSU Box.** Колбек вызывается после полной инициализации SDK. Аргумент `sdk` содержит все модули.\n\nВесь код расширения должен находиться внутри `ready()`.\n\n```js\nVSUBoxSDK.ready(async (sdk) => {\n  const name = await sdk.user.name\n  const sid  = await sdk.ui.createScreen({ title: "Привет, " + name })\n  await sdk.ui.setContent(sid, `<div style="padding:20px"><h2>${name}</h2></div>`)\n  await sdk.ui.addMenuButton({ label: "Привет", screenId: sid })\n  await sdk.ui.navigate(sid)\n})\n```'} },
                        { label:'ui',       kind:CIK.Module,  range, insertText:'ui',
                          detail:'Экраны, меню, тосты, диалоги',
                          documentation:{value:'**Модуль UI** — всё для создания интерфейса расширения.\n\n**Методы:** `createScreen`, `setContent`, `navigate`, `addMenuButton`, `setTitle`, `toast`, `back`, `showAlert`, `showConfirm`, `showInput`, `showRating`, `onAction`, `watchActions`, `icon`, `getTheme`, `loadHtml`\n\n**Подмодуль:** `components` — готовые компоненты'} },
                        { label:'user',     kind:CIK.Module,  range, insertText:'user',
                          detail:'Текущий пользователь',
                          documentation:{value:'**Модуль user** — данные авторизованного пользователя.\n\nВсе свойства возвращают `Promise`.\n\n**Свойства:** `name`, `firstname`, `lastname`, `is_admin`, `is_developer`, `group`, `faculty`\n\n```js\nconst [name, group] = await Promise.all([sdk.user.name, sdk.user.group])\n```'} },
                        { label:'schedule', kind:CIK.Module,  range, insertText:'schedule',
                          detail:'Расписание занятий',
                          documentation:{value:'**Модуль schedule** — доступ к расписанию ВГУ.\n\nИспользует группу и факультет из настроек пользователя.\n\n**Методы:** `getWeek(offset?)`, `getToday()`\n\n```js\nconst { schedule } = await sdk.schedule.getToday()\n// Каждая пара: { time, subject, teacher, classroom, lesson_num }\n```'} },
                        { label:'storage',  kind:CIK.Module,  range, insertText:'storage',
                          detail:'Хранилище данных (серверное, per-user)',
                          documentation:{value:'**Модуль storage** — серверное key-value хранилище.\n\nДанные изолированы по аддону и привязаны к аккаунту. Сохраняются между сессиями.\n\n**Методы:** `set(key, value)`, `get(key)`, `delete(key)`, `keys()`\n\n```js\nawait sdk.storage.set("prefs", { theme: "dark" })\nconst prefs = await sdk.storage.get("prefs")\n```'} },
                        { label:'fs',       kind:CIK.Module,  range, insertText:'fs',
                          detail:'Файловая система пользователя (до 20 МБ на аддон)',
                          documentation:{value:'**Модуль fs** — файловое хранилище на сервере. До 20 МБ на аддон.\n\n**Методы:** `list(path?)`, `read(path)`, `write(path, content)`, `delete(path)`, `info()`\n\n```js\nawait sdk.fs.write("notes.json", JSON.stringify({ items: ["Задача 1"] }))\nconst raw = await sdk.fs.read("notes.json")\nconst data = JSON.parse(raw)\n```'} },
                        { label:'events',   kind:CIK.Module,  range, insertText:'events',
                          detail:'Системные события (PWA, видимость)',
                          documentation:{value:'**Модуль events** — подписка на системные события приложения.\n\n**Методы:** `on(event, callback)`, `off(event)`\n\n**События:** `pwa:install_available`, `pwa:installed`, `app:visibility`\n\n```js\nsdk.events.on("app:visibility", ({ visible }) => {\n  if (visible) refreshData()\n})\n```'} },
                        { label:'app',      kind:CIK.Module,  range, insertText:'app',
                          detail:'Версия и метаданные приложения',
                          documentation:{value:'**Модуль app** — метаданные VSU Box.\n\n**Свойства:** `version` → `Promise<string>`, `build` → `Promise<string>`\n\n```js\nconst version = await sdk.app.version\nconsole.log("VSU Box", version) // "VSU Box 3.0"\n```'} },
                    ]}
                }

                return { suggestions: [] }
            }
        })

        // ── Snippet-completions (без точки) ────────────────────
        monaco.languages.registerCompletionItemProvider('javascript', {
            triggerCharacters: [],
            provideCompletionItems(model, position) {
                const word = model.getWordUntilPosition(position)
                if (word.word.length < 2) return { suggestions: [] }
                const range = new monaco.Range(
                    position.lineNumber, word.startColumn,
                    position.lineNumber, word.endColumn
                )
                return { suggestions: [
                    { label:'VSUBoxSDK', kind:CIK.Class, range, insertText:'VSUBoxSDK',
                      detail:'VSU Box SDK — API расширений', sortText:'0' },
                    { label:'vsu-ready', kind:CIK.Snippet, range, sortText:'1',
                      insertText:'VSUBoxSDK.ready(async (sdk) => {\n\t${1}\n})', insertTextRules:SNIP,
                      detail:'Точка входа SDK',
                      documentation:{value:'Базовая оболочка расширения'} },
                    { label:'vsu-screen', kind:CIK.Snippet, range, sortText:'2',
                      insertText:[
                          'VSUBoxSDK.ready(async (sdk) => {',
                          '\tconst screenId = await sdk.ui.createScreen({ title: \'${1:Заголовок}\' })',
                          '',
                          '\tawait sdk.ui.setContent(screenId, `',
                          '\t\t<div style="padding:20px;font-family:Nunito,sans-serif">',
                          '\t\t\t<h2 style="margin-top:0">${1:Заголовок}</h2>',
                          '\t\t\t${2:<p>Содержимое</p>}',
                          '\t\t</div>',
                          '\t`)',
                          '',
                          '\tawait sdk.ui.addMenuButton({ label: \'${1:Заголовок}\', screenId, icon: \'${3:star.fill}\' })',
                          '})',
                      ].join('\n'), insertTextRules:SNIP,
                      detail:'Экран + кнопка в меню',
                      documentation:{value:'Создаёт полноэкранное расширение с кнопкой в боковом/нижнем меню'} },
                    { label:'vsu-schedule', kind:CIK.Snippet, range, sortText:'3',
                      insertText:[
                          'VSUBoxSDK.ready(async (sdk) => {',
                          '\tconst screenId = await sdk.ui.createScreen({ title: \'Расписание\' })',
                          '',
                          '\ttry {',
                          '\t\tconst { schedule } = await sdk.schedule.getWeek(0)',
                          '\t\tconst html = schedule.length',
                          '\t\t\t? schedule.map(l => [',
                          '\t\t\t\t\'<div style="padding:10px 0;border-bottom:1px solid rgba(0,0,0,0.06)">\',',
                          '\t\t\t\t`<div style="font-weight:600">${l.time} · ${l.subject}</div>`,',
                          '\t\t\t\t`<div style="font-size:13px;color:#888">${l.teacher || \'\'}</div>`,',
                          '\t\t\t\t\'</div>\'',
                          '\t\t\t].join(\'\')).join(\'\')',
                          '\t\t\t: \'<p style="color:#999;text-align:center">Пар нет</p>\'',
                          '\t\tawait sdk.ui.setContent(screenId, `<div style="padding:16px">${html}</div>`)',
                          '\t} catch (e) {',
                          '\t\tawait sdk.ui.setContent(screenId, `<p style="color:red;padding:20px">Ошибка: ${e.message}</p>`)',
                          '\t}',
                          '',
                          '\tawait sdk.ui.addMenuButton({ label: \'Расписание\', screenId })',
                          '\tawait sdk.ui.navigate(screenId)',
                          '})',
                      ].join('\n'), insertTextRules:SNIP,
                      detail:'Отображение расписания',
                      documentation:{value:'Загружает расписание текущей недели и отображает его списком'} },
                    { label:'vsu-storage', kind:CIK.Snippet, range, sortText:'4',
                      insertText:[
                          'VSUBoxSDK.ready(async (sdk) => {',
                          '\t// Читаем сохранённое значение',
                          "\tlet count = (await sdk.storage.get('${1:counter}')) ?? 0",
                          '',
                          '\tconst screenId = await sdk.ui.createScreen({ title: \'${2:Счётчик}\' })',
                          '',
                          '\tfunction render() {',
                          '\t\tsdk.ui.setContent(screenId, `',
                          '\t\t\t<div style="padding:40px;text-align:center;font-family:Nunito,sans-serif">',
                          '\t\t\t\t<div style="font-size:64px;font-weight:800">${count}</div>',
                          '\t\t\t\t<button onclick="parent.postMessage({__vsu_action:\'inc\'},\'*\')"',
                          '\t\t\t\t\tstyle="margin-top:20px;padding:12px 32px;border:none;border-radius:12px;',
                          '\t\t\t\t\t\tbackground:#007AFF;color:white;font-size:16px;cursor:pointer">',
                          '\t\t\t\t\t+1',
                          '\t\t\t\t</button>',
                          '\t\t\t</div>',
                          '\t\t`)',
                          '\t}',
                          '',
                          '\trender()',
                          '\tawait sdk.ui.addMenuButton({ label: \'${2:Счётчик}\', screenId })',
                          '\tawait sdk.ui.navigate(screenId)',
                          '})',
                      ].join('\n'), insertTextRules:SNIP,
                      detail:'Счётчик с хранилищем',
                      documentation:{value:'Шаблон с персистентным хранилищем данных'} },
                    { label:'vsu-user', kind:CIK.Snippet, range, sortText:'5',
                      insertText:[
                          'VSUBoxSDK.ready(async (sdk) => {',
                          '\tconst [name, isAdmin] = await Promise.all([',
                          '\t\tsdk.user.name,',
                          '\t\tsdk.user.is_admin',
                          '\t])',
                          '\t${1}',
                          '})',
                      ].join('\n'), insertTextRules:SNIP,
                      detail:'Данные пользователя',
                      documentation:{value:'Шаблон для получения данных текущего пользователя. `Promise.all` параллельно запрашивает все нужные свойства.\n\nДоступные свойства: `name`, `firstname`, `lastname`, `group`, `faculty`, `is_admin`, `is_developer`'} },
                ]}
            }
        })

        // ── Hover-документация ─────────────────────────────────
        const HOVER = {
            'VSUBoxSDK':   '**VSUBoxSDK** — API расширений VSU Box\n\nВсегда оборачивайте код в `ready()`:\n```js\nVSUBoxSDK.ready(async (sdk) => {\n  // ваш код\n})\n```',
            'ready':       '**VSUBoxSDK.ready(callback)**\n\nТочка входа. Выполняется после инициализации SDK.\n```js\nVSUBoxSDK.ready(async (sdk) => { ... })\n```',
            'createScreen':'**sdk.ui.createScreen({ title })**\n\nСоздаёт экран, возвращает `screenId`.\n```js\nconst sid = await sdk.ui.createScreen({ title: "Привет" })\n```',
            'setContent':  '**sdk.ui.setContent(screenId, html)**\n\nУстанавливает HTML в тело экрана.\n```js\nawait sdk.ui.setContent(sid, `<div style="padding:20px"><h2>Текст</h2></div>`)\n```',
            'navigate':    '**sdk.ui.navigate(screenId)**\n\nОткрывает экран (скрывает все остальные).\n```js\nawait sdk.ui.navigate(screenId)\n```',
            'addMenuButton':'**sdk.ui.addMenuButton({ label, screenId, icon? })**\n\nДобавляет кнопку в раздел «Меню». Открывает экран при нажатии.\n- `icon` — имя SF Symbol (например `"star.fill"`). По умолчанию: `"exclamationmark.circle.fill"`\n```js\nawait sdk.ui.addMenuButton({ label: "Аддон", screenId: sid, icon: "puzzle.piece.fill" })\n```',
            'setTitle':    '**sdk.ui.setTitle(screenId, title)**\n\nМеняет заголовок экрана.\n```js\nawait sdk.ui.setTitle(sid, "Новый заголовок")\n```',
            'toast':       '**sdk.ui.toast(message, duration?)**\n\nВсплывающее уведомление. `duration` в мс (по умолч. 2500).\n```js\nawait sdk.ui.toast("Готово!", 3000)\n```',
            'back':        '**sdk.ui.back()**\n\nВозвращает на главный экран.\n```js\nawait sdk.ui.back()\n```',
            'showAlert':   '**sdk.ui.showAlert(message)**\n\nСистемный диалог предупреждения.\n```js\nawait sdk.ui.showAlert("Что-то пошло не так")\n```',
            'showConfirm': '**sdk.ui.showConfirm(message)**\n\nДиалог подтверждения. Возвращает `true` / `false`.\n```js\nif (await sdk.ui.showConfirm("Удалить?")) { ... }\n```',
            'getWeek':     '**sdk.schedule.getWeek(weekOffset?)**\n\n`0` — текущая неделя, `1` — следующая, `-1` — прошлая.\n```js\nconst { schedule } = await sdk.schedule.getWeek(0)\nschedule.forEach(l => console.log(l.subject, l.time, l.teacher))\n```',
            'getToday':    '**sdk.schedule.getToday()**\n\nРасписание на сегодня.\n```js\nconst { schedule } = await sdk.schedule.getToday()\n```',
            'storage':     '**sdk.storage** — изолированное хранилище\n\nДанные хранятся на сервере, привязаны к аккаунту.\n```js\nawait sdk.storage.set("key", { count: 1 })\nconst val = await sdk.storage.get("key") // { count: 1 }\nawait sdk.storage.delete("key")\n```',
            'showInput':   '**sdk.ui.showInput(opts)**\n\nДиалог с текстовым полем. Возвращает введённую строку или `null` при отмене.\n```js\nconst val = await sdk.ui.showInput({ title: "Введите имя", placeholder: "Имя..." })\nif (val !== null) console.log(val)\n```',
            'showRating':  '**sdk.ui.showRating(opts)**\n\nДиалог выбора оценки. Возвращает число 1–N или `null` при отмене.\n```js\nconst rating = await sdk.ui.showRating({ title: "Оцените", stars: 5 })\nconsole.log(rating) // 1-5\n```',
            'onAction':    '**sdk.ui.onAction(actionId, callback)**\n\nОбработчик `data-sdk-action` элементов в HTML экрана.\n```js\nsdk.ui.onAction("save-btn", (val) => {\n  console.log("Значение:", val)\n})\n```',
            'icon':        '**sdk.ui.icon(name, opts?)**\n\nВозвращает HTML-строку с иконкой SF Symbol.\n- `name` — имя иконки (без `.png`), например `"star.fill"`\n- `opts.size` — размер в px (по умолч. 22)\n- `opts.color` — CSS цвет (по умолч. `"currentColor"`)\n```js\nconst ic = sdk.ui.icon("checkmark.circle", { size: 24, color: "rgb(52,199,89)" })\n```',
            'loadHtml':    '**sdk.ui.loadHtml(path)**\n\nЗагружает HTML-файл из файлов аддона и возвращает его содержимое как строку.\n```js\nconst html = await sdk.ui.loadHtml("views/main.html")\nawait sdk.ui.setContent(screenId, html)\n```',
            'getTheme':    '**sdk.ui.getTheme()** → `Promise<"light" | "dark">`\n\nВозвращает текущую тему оформления приложения.\n```js\nconst theme = await sdk.ui.getTheme()\nconst bg = theme === "dark" ? "#1c1c1e" : "white"\n// Подписаться на смену темы:\nsdk.events.on("theme:change", ({ theme }) => render(theme))\n```',
            'components':  '**sdk.ui.components** — готовые UI-компоненты\n\n`button`, `card`, `text`, `heading`, `image`, `input`, `list`, `badge`, `divider`, `spacer`\n\nВсе методы возвращают HTML-строку.\n```js\nlet html = sdk.ui.components.heading("Список")\nhtml += sdk.ui.components.list([{ title: "Пункт 1" }])\nawait sdk.ui.setContent(sid, html)\n```',
            'list':'**sdk.fs.list(path?)**\n\nСписок файлов и папок. `path` — поддиректория (пусто = корень).\n```js\nconst files = await sdk.fs.list("")\nfiles.forEach(f => console.log(f.name, f.size))\n```',
            'read':        '**sdk.fs.read(path)**\n\nЧитает содержимое файла как строку.\n```js\nconst raw = await sdk.fs.read("data.json")\nconst obj = JSON.parse(raw)\n```',
            'write':       '**sdk.fs.write(path, content)**\n\nЗаписывает строку в файл. Создаёт папки автоматически.\n```js\nawait sdk.fs.write("notes.json", JSON.stringify({ items: [] }))\n```',
            'info':        '**sdk.fs.info()**\n\nСтатистика файлового хранилища аддона.\n```js\nconst { used_bytes, max_bytes } = await sdk.fs.info()\nconsole.log(Math.round(used_bytes/1024) + " KB из " + max_bytes/1024/1024 + " MB")\n```',
            'name':        '**sdk.user.name** → `Promise<string>`\n\nПолное ФИО пользователя из профиля Moodle.',
            'firstname':   '**sdk.user.firstname** → `Promise<string>`\n\nИмя пользователя.',
            'lastname':    '**sdk.user.lastname** → `Promise<string>`\n\nФамилия пользователя.',
            'is_admin':    '**sdk.user.is_admin** → `Promise<boolean>`\n\n`true` если пользователь — администратор.',
            'is_developer':'**sdk.user.is_developer** → `Promise<boolean>`\n\n`true` если пользователю выдана роль разработчика.',
            'group':       '**sdk.user.group** → `Promise<string|null>`\n\nУчебная группа из настроек «Режима». `null` если не задана.',
            'faculty':     '**sdk.user.faculty** → `Promise<string|null>`\n\nФакультет из настроек «Режима». `null` если не задан.',
            'version':     '**sdk.app.version** → `Promise<string>`\n\nВерсия VSU Box (например `"3.0"`).',
            'build':       '**sdk.app.build** → `Promise<string>`\n\nНомер сборки (например `"42"`).',
            'on':          '**sdk.events.on(event, callback)**\n\nПодписка на системное событие.\n\n**События:** `pwa:install_available`, `pwa:installed`, `app:visibility`, `theme:change`\n```js\nsdk.events.on("app:visibility", ({ visible }) => {\n  if (visible) refresh()\n})\nsdk.events.on("theme:change", ({ theme }) => render(theme))\n```',
            'off':         '**sdk.events.off(event)**\n\nОтписка от системного события.\n```js\nsdk.events.off("app:visibility")\n```',
            'fs':          '**sdk.fs** — файловое хранилище (до 20 МБ)\n\n`list(path?)`, `read(path)`, `write(path, content)`, `delete(path)`, `info()`\n```js\nawait sdk.fs.write("data.json", JSON.stringify({}))\n```',
            'events':      '**sdk.events** — системные события\n\n`on(event, cb)`, `off(event)`\n\n**События:** `pwa:install_available`, `pwa:installed`, `app:visibility`',
            'app':         '**sdk.app** — метаданные приложения\n\n`version` → `Promise<string>`, `build` → `Promise<string>`',
            'schedule':    '**sdk.schedule** — расписание занятий\n\n`getWeek(offset?)`, `getToday()`\n```js\nconst { schedule } = await sdk.schedule.getWeek(0)\nschedule.forEach(l => console.log(l.time, l.subject))\n```',
            'user':        '**sdk.user** — текущий пользователь\n\n`name`, `firstname`, `lastname`, `group`, `faculty`, `is_admin`, `is_developer`\n```js\nconst name = await sdk.user.name\n```',
            'ui':          '**sdk.ui** — интерфейс расширения\n\n`createScreen`, `setContent`, `navigate`, `addMenuButton`, `setTitle`, `toast`, `back`, `showAlert`, `showConfirm`, `showInput`, `showRating`, `onAction`, `icon`, `getTheme`, `loadHtml`\n\n**Подмодуль:** `components`',
        }

        monaco.languages.registerHoverProvider('javascript', {
            provideHover(model, position) {
                const word = model.getWordAtPosition(position)
                if (!word) return null
                const doc = HOVER[word.word]
                if (!doc) return null
                return {
                    range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
                    contents: [{ value: doc, isTrusted: true }]
                }
            }
        })
    }

    return app
}
