const PERM_LABELS = {
    schedule: { label: "Расписание",   desc: "Просмотр расписания занятий" },
    user:     { label: "Профиль",      desc: "Имя и роли пользователя" },
    storage:  { label: "Хранилище",   desc: "Сохранение данных расширения" },
}

function parseAddonManifest(json) {
    if (!json) return null
    try { return typeof json === 'string' ? JSON.parse(json) : json } catch { return null }
}

function getGrantedPerms(addonId) {
    try { return JSON.parse(localStorage.getItem(`vsu_perms_${addonId}`) || 'null') } catch { return null }
}

function initStoreModule(user) {
    const app = new MiniApp("system-store", "1.0.0", "system")
    app.addMenuButton("./assets/bag.png", "Магазин")

    app.setContent(`
        <div class="module-nav">
            <div class="module-back" id="st2-back"></div>
            <div class="module-title">Магазин</div>
        </div>
        <div class="module-body" id="store-body">
            <div class="module-empty">Загрузка...</div>
        </div>
    `)

    app.$(".module-nav .module-back").addEventListener("click", () => app.closeScreen())

    const origOpen = app.openScreen.bind(app)
    app.openScreen = function() {
        origOpen()
        loadStore()
    }

    async function loadStore() {
        const body = app.$("#store-body")
        body.innerHTML = `<div class="module-empty">Загрузка...</div>`

        try {
            const [allData, myData] = await Promise.all([
                window.api.storeList(),
                window.api.storeMyAddons()
            ])

            const allAddons = allData.addons || []
            const myAddons  = myData.addons  || []
            const myIds     = new Map(myAddons.map(a => [a.id, a]))

            body.innerHTML = ""

            if (myAddons.length > 0) {
                const lbl = document.createElement("div")
                lbl.className = "module-label"
                lbl.textContent = "Установлено"
                body.appendChild(lbl)
                myAddons.forEach(addon => body.appendChild(buildAddonCard(addon, true, addon.is_active)))
            }

            const available = allAddons.filter(a => !myIds.has(a.id))

            const lbl2 = document.createElement("div")
            lbl2.className = "module-label"
            lbl2.textContent = available.length === 0 && myAddons.length > 0
                ? "Все расширения установлены"
                : "Доступные расширения"
            body.appendChild(lbl2)

            if (allAddons.length === 0) {
                const empty = document.createElement("div")
                empty.className = "module-empty"
                empty.textContent = "Расширений пока нет"
                body.appendChild(empty)
            } else {
                available.forEach(addon => body.appendChild(buildAddonCard(addon, false, false)))
            }

        } catch (e) {
            body.innerHTML = `<div class="module-empty">Ошибка загрузки: ${escStore(e.message)}</div>`
        }
    }

    function buildAddonCard(addon, installed, active) {
        const card = document.createElement("div")
        card.className = "module-card"
        card.style.gap = "12px"

        const manifest = parseAddonManifest(addon.manifest_json)
        const reqPerms = manifest?.permissions?.filter(p => PERM_LABELS[p]) || []

        const statusLabel = installed
            ? (active ? `<span class="badge-pill green">Включено</span>` : `<span class="badge-pill gray">Выключено</span>`)
            : `<span class="badge-pill blue">${addon.downloads || 0} уст.</span>`

        // Показываем иконку только если есть URL
        const iconHtml = addon.icon_url
            ? `<div style="width:48px;height:48px;background:rgb(232,232,234);border-radius:12px;flex-shrink:0;overflow:hidden">
                   <img src="${escStore(addon.icon_url)}" style="width:100%;height:100%;object-fit:cover">
               </div>`
            : ""

        // Разрешения: для установленных показываем выданные, для доступных — запрашиваемые
        let permHtml = ""
        if (installed) {
            const granted = getGrantedPerms(addon.id)
            if (granted && granted.length > 0) {
                permHtml = `<div style="display:flex;gap:5px;flex-wrap:wrap">
                    ${granted.map(p => `<span class="badge-pill gray" style="font-size:11px">${escStore(PERM_LABELS[p]?.label || p)}</span>`).join('')}
                </div>`
            }
        } else if (reqPerms.length > 0) {
            permHtml = `<div style="font-size:12px;color: var(--text-2);display:flex;gap:5px;flex-wrap:wrap;align-items:center">
                <span>Доступ:</span>
                ${reqPerms.map(p => `<span class="badge-pill gray" style="font-size:11px">${escStore(PERM_LABELS[p]?.label || p)}</span>`).join('')}
            </div>`
        }

        card.innerHTML = `
            <div style="display:flex;flex-direction:row;align-items:flex-start;gap:12px">
                ${iconHtml}
                <div style="flex:1;min-width:0">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                        <span style="font-size:16px;font-weight:700; color: var(--text)">${escStore(addon.name)}</span>
                        ${statusLabel}
                    </div>
                    <div style="font-size:13px;color:var(--text-2);margin-top:2px">
                        v${escStore(addon.version || "1.0")} · ${escStore(addon.dev_name || "Developer")}
                    </div>
                </div>
            </div>
            ${addon.description ? `<div class="card-desc">${escStore(addon.description)}</div>` : ""}
            ${permHtml}
            <div class="store-card-actions" style="display:flex;flex-direction:row;gap:8px"></div>
        `

        const actions = card.querySelector(".store-card-actions")

        if (installed) {
            const toggleBtn = document.createElement("div")
            toggleBtn.className = "module-btn"
            toggleBtn.style.cssText = "flex:1;height:40px;font-size:14px"
            toggleBtn.textContent = active ? "Выключить" : "Включить"
            toggleBtn.addEventListener("click", () => {
                const newState = !active
                window.api.storeToggle(addon.id, newState).then(() => {
                    active = newState
                    toggleBtn.textContent = newState ? "Выключить" : "Включить"
                    const pill = card.querySelector(".badge-pill")
                    if (pill) {
                        pill.textContent = newState ? "Включено" : "Выключено"
                        pill.className = "badge-pill " + (newState ? "green" : "gray")
                    }
                }).catch(e => alert("Ошибка: " + e.message))
            })
            actions.appendChild(toggleBtn)

            const uninstBtn = document.createElement("div")
            uninstBtn.className = "module-btn danger"
            uninstBtn.style.cssText = "height:40px;font-size:14px;padding:0 16px"
            uninstBtn.textContent = "Удалить"
            uninstBtn.addEventListener("click", () => {
                if (!confirm(`Удалить «${addon.name}»?`)) return
                window.api.storeUninstall(addon.id).then(() => {
                    localStorage.removeItem(`vsu_perms_${addon.id}`)
                    card.remove()
                    loadStore()
                }).catch(e => alert("Ошибка: " + e.message))
            })
            actions.appendChild(uninstBtn)

        } else {
            const installBtn = document.createElement("div")
            installBtn.className = "module-btn primary"
            installBtn.style.cssText = "flex:1;height:40px;font-size:14px"
            installBtn.textContent = "Установить"
            installBtn.addEventListener("click", () => {
                if (reqPerms.length > 0) {
                    showPermDialog(addon, reqPerms, () => doInstall())
                } else {
                    doInstall()
                }
            })

            async function doInstall() {
                installBtn.textContent = "Установка..."
                installBtn.style.opacity = "0.7"
                installBtn.style.pointerEvents = "none"
                try {
                    await window.api.storeInstall(addon.id)
                    localStorage.setItem(`vsu_perms_${addon.id}`, JSON.stringify(reqPerms))
                    loadStore()
                } catch (e) {
                    alert("Ошибка: " + e.message)
                    installBtn.textContent = "Установить"
                    installBtn.style.opacity = ""
                    installBtn.style.pointerEvents = ""
                }
            }
            actions.appendChild(installBtn)
        }

        return card
    }

    function showPermDialog(addon, reqPerms, onConfirm) {
        const overlay = document.createElement("div")
        overlay.className = "diary-modal-overlay"
        overlay.style.zIndex = "3000"

        const ICONS = {
            schedule: { icon:"calendar.png",         color:"rgb(0,122,255)" },
            user:     { icon:"person.fill.png",       color:"rgb(88,86,214)" },
            storage:  { icon:"externaldrive.fill.png",color:"rgb(52,199,89)" },
        }

        function permIcon(p) {
            const ic = ICONS[p]
            if (!ic) return `<div style="width:28px;height:28px;background:rgba(0,0,0,0.2);border-radius:6px;flex-shrink:0;mask-image:url(./assets/key.fill.png);mask-size:contain;mask-repeat:no-repeat;mask-position:center"></div>`
            return `<div style="width:28px;height:28px;flex-shrink:0;background:${ic.color};mask-image:url(./assets/${ic.icon});mask-size:contain;mask-repeat:no-repeat;mask-position:center"></div>`
        }

        overlay.innerHTML = `
            <div class="diary-modal" style="max-width:420px;border-radius:20px;margin:auto;align-self:center">
                ${addon.icon_url ? `<img src="${escStore(addon.icon_url)}" style="width:56px;height:56px;border-radius:14px;display:block;margin:0 auto 12px;object-fit:cover">` : ""}
                <div style="text-align:center;margin-bottom:4px">
                    <div style="font-size:18px;font-weight:800; color: var(--text)">${escStore(addon.name)}</div>
                    <div style="font-size:13px;color:var(--text-2);margin-top:2px">запрашивает доступ</div>
                </div>
                <div style="display:flex;flex-direction:column;gap:8px;margin:14px 0">
                    ${reqPerms.map(p => `
                        <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;
                                    background:rgba(0,0,0,0.04);border-radius:12px">
                            ${permIcon(p)}
                            <div>
                                <div style="font-size:14px;font-weight:600; color: var(--text)">${escStore(PERM_LABELS[p]?.label || p)}</div>
                                <div style="font-size:12px;color:var(--text-2)">${escStore(PERM_LABELS[p]?.desc || "")}</div>
                            </div>
                        </div>`).join("")}
                </div>
                <div style="font-size:12px;color:var(--text-2);text-align:center;margin-bottom:12px;line-height:1.5">
                    Разрешения можно отозвать в любой момент, удалив расширение
                </div>
                <div style="display:flex;gap:8px">
                    <button id="pd-cancel" style="flex:1;height:44px;border:none;border-radius:12px;
                        background:rgba(0,0,0,0.07); color: var(--text); font-size:15px;font-weight:600;cursor:pointer">Отмена</button>
                    <button id="pd-ok" style="flex:2;height:44px;border:none;border-radius:12px;
                        background:rgb(0,122,255);color:white;font-size:15px;font-weight:700;cursor:pointer">
                        Разрешить и установить
                    </button>
                </div>
            </div>
        `

        overlay.querySelector("#pd-cancel").addEventListener("click", () => overlay.remove())
        overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove() })
        overlay.querySelector("#pd-ok").addEventListener("click", () => {
            overlay.remove()
            onConfirm()
        })
        document.body.appendChild(overlay)
    }

    function escStore(str) {
        if (!str) return ""
        return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    }

    return app
}
