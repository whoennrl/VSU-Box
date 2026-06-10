function initAdminModule(user) {
    const app = new MiniApp("system-admin", "1.0.0", "system")
    app.addMenuButton("./assets/person.2.badge.gearshape.png", "Администрирование")

    app.setContent(`
        <div class="module-nav">
            <div class="module-back" id="adm-back"></div>
            <div class="module-title">Администрирование</div>
        </div>
        <div class="adm-tabs" id="adm-tabs">
            <div class="adm-tab active" data-t="overview">Обзор</div>
            <div class="adm-tab" data-t="news">Новости</div>
            <div class="adm-tab" data-t="addons">Расширения</div>
            <div class="adm-tab" data-t="users">Пользователи</div>
            <div class="adm-tab" data-t="teachers">Преподаватели</div>
            <div class="adm-tab" data-t="broadcast">Рассылка</div>
        </div>
        <div class="module-body" id="adm-body">
            <div class="module-empty">Загрузка...</div>
        </div>
    `)

    app.$(".module-nav .module-back").addEventListener("click", () => app.closeScreen())

    let currentTab = "overview"

    app.$$(".adm-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            app.$$(".adm-tab").forEach(t => t.classList.remove("active"))
            tab.classList.add("active")
            currentTab = tab.dataset.t
            loadTab(currentTab)
        })
    })

    const origOpen = app.openScreen.bind(app)
    app.openScreen = function() { origOpen(); loadTab(currentTab) }

    async function loadTab(tab) {
        const body = app.$("#adm-body")
        body.innerHTML = `<div class="module-empty">Загрузка...</div>`
        try {
            switch (tab) {
                case "overview":  await renderOverview(body); break
                case "news":      await renderNews(body); break
                case "addons":    await renderAddons(body); break
                case "users":     await renderUsers(body); break
                case "teachers":  await renderTeachers(body); break
                case "broadcast": renderBroadcast(body); break
            }
        } catch (e) {
            body.innerHTML = `<div class="module-empty">Ошибка: ${esc(e.message)}</div>`
        }
    }

    // ── ОБЗОР ────────────────────────────────────────
    async function renderOverview(body) {
        const st = await window.api.stats()
        body.innerHTML = `
            <div class="module-label">Статистика</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div class="adm-stat-card">
                    <div class="adm-stat-value">${st.users ?? "—"}</div>
                    <div class="adm-stat-label">Пользователи</div>
                </div>
                <div class="adm-stat-card">
                    <div class="adm-stat-value">${st.active_sessions ?? "—"}</div>
                    <div class="adm-stat-label">Активных сессий</div>
                </div>
                <div class="adm-stat-card">
                    <div class="adm-stat-value">${st.push_subs ?? "—"}</div>
                    <div class="adm-stat-label">Push-подписок</div>
                </div>
                <div class="adm-stat-card">
                    <div class="adm-stat-value">${st.schedule_rows ?? "—"}</div>
                    <div class="adm-stat-label">Расп. записей</div>
                </div>
                <div class="adm-stat-card">
                    <div class="adm-stat-value">${st.addons_approved ?? "—"}</div>
                    <div class="adm-stat-label">Расширений</div>
                </div>
                <div class="adm-stat-card">
                    <div class="adm-stat-value">${st.news_published ?? "—"}</div>
                    <div class="adm-stat-label">Новостей</div>
                </div>
            </div>
            ${st.last_update ? `<div class="module-card" style="margin-top:20px"><div class="card-meta">Обновление расписания: ${esc(st.last_update)}</div></div>` : ""}
        `
    }

    // ── НОВОСТИ ──────────────────────────────────────
    async function renderNews(body) {
        body.innerHTML = `
            <div style="display:flex;justify-content:flex-end;margin-bottom:2px">
                <div class="module-btn primary" style="height:38px;font-size:14px;width:auto;padding:0 18px" id="news-create-btn">+ Новость</div>
            </div>
            <div id="adm-news-list"><div class="module-empty">Загрузка...</div></div>
        `
        body.querySelector("#news-create-btn").addEventListener("click", () => openNewsEditor(null, body))
        await loadNewsList(body.querySelector("#adm-news-list"), body)
    }

    async function loadNewsList(container, body) {
        container.innerHTML = `<div class="module-empty">Загрузка...</div>`
        try {
            const data = await window.api.adminNewsList(50, 0)
            const items = data.news || []
            if (!items.length) { container.innerHTML = `<div class="module-empty">Новостей нет</div>`; return }

            container.innerHTML = ""
            items.forEach(news => {
                const STATUS_LABEL = { draft: "Черновик", published: "Опубликовано", archived: "Архив" }
                const STATUS_CLS   = { draft: "gray", published: "green", archived: "gray" }
                const d = news.published_at
                    ? new Date(news.published_at * 1000).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })
                    : new Date(news.created_at * 1000).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })

                const card = document.createElement("div")
                card.className = "module-card"
                card.innerHTML = `
                    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
                        <div style="font-size:15px;font-weight:700;flex:1;line-height:1.3; color: var(--text)">${esc(news.title)}</div>
                        <span class="badge-pill ${STATUS_CLS[news.status] || "gray"}" style="flex-shrink:0">${STATUS_LABEL[news.status] || news.status}</span>
                    </div>
                    ${news.preview_text ? `<div class="card-desc" style="-webkit-line-clamp:2;display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden">${esc(news.preview_text)}</div>` : ""}
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
                        <div class="card-meta">${d}</div>
                        <div style="display:flex;gap:6px">
                            <div class="module-btn" style="height:32px;font-size:13px;padding:0 12px" data-edit="${news.id}">Изменить</div>
                            <div class="module-btn danger" style="height:32px;font-size:13px;padding:0 12px;background:rgba(255,59,48,0.12);color:rgb(255,59,48);box-shadow:none" data-del="${news.id}">Удалить</div>
                        </div>
                    </div>
                `
                card.querySelector(`[data-edit]`).addEventListener("click", async () => {
                    const full = await window.api.adminNewsGet(news.id).catch(() => news)
                    openNewsEditor(full, body)
                })
                card.querySelector(`[data-del]`).addEventListener("click", async () => {
                    if (!confirm(`Архивировать «${news.title}»?`)) return
                    await window.api.deleteNews(news.id)
                    card.remove()
                })
                container.appendChild(card)
            })
        } catch (e) {
            container.innerHTML = `<div class="module-empty">Ошибка: ${esc(e.message)}</div>`
        }
    }

    function openNewsEditor(existingNews, parentBody) {
        const overlay = document.createElement("div")
        overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box"

        overlay.innerHTML = `
            <div class="adm-news-editor">
                <div class="adm-editor-header">
                    <div class="adm-editor-title">${existingNews ? "Редактирование новости" : "Новая новость"}</div>
                    <div class="adm-editor-close" id="ae-close">✕</div>
                </div>
                <div class="adm-editor-body">
                    <div class="adm-editor-left">
                        <input class="module-input" id="ae-title" type="text" placeholder="Заголовок" value="${esc(existingNews?.title || "")}">
                        <div class="adm-cover-row">
                            <input class="module-input" id="ae-cover" type="url" placeholder="URL обложки...">
                            <label class="dev-btn dev-btn--primary adm-upload-btn">
                                Загрузить
                                <input type="file" id="ae-cover-file" accept="image/*" style="display:none">
                            </label>
                        </div>
                        <div id="ae-cover-preview" style="display:none">
                            <img id="ae-cover-img" src="" style="width:100%;max-height:130px;object-fit:cover;border-radius:12px">
                        </div>
                        <div class="adm-editor-toolbar">
                            <button class="ae-tool" data-cmd="bold" title="Жирный"><div class="ae-tool-icon" style="mask-image:url(./assets/bold.png);-webkit-mask-image:url(./assets/bold.png)"></div></button>
                            <button class="ae-tool" data-cmd="italic" title="Курсив"><div class="ae-tool-icon" style="mask-image:url(./assets/italic.png);-webkit-mask-image:url(./assets/italic.png)"></div></button>
                            <button class="ae-tool" data-cmd="underline" title="Подчёркнутый"><div class="ae-tool-icon" style="mask-image:url(./assets/underline.png);-webkit-mask-image:url(./assets/underline.png)"></div></button>
                            <button class="ae-tool" data-cmd="strikeThrough" title="Зачёркнутый"><div class="ae-tool-icon" style="mask-image:url(./assets/strikethrough.png);-webkit-mask-image:url(./assets/strikethrough.png)"></div></button>
                            <div class="ae-tool-sep"></div>
                            <button class="ae-tool" data-cmd="h2" title="H2" style="font-weight:800;font-size:12px">H2</button>
                            <button class="ae-tool" data-cmd="h3" title="H3" style="font-weight:700;font-size:11px">H3</button>
                            <button class="ae-tool" data-cmd="blockquote" title="Цитата"><div class="ae-tool-icon" style="mask-image:url(./assets/text.quote.png);-webkit-mask-image:url(./assets/text.quote.png)"></div></button>
                            <button class="ae-tool" data-cmd="code" title="Код"><div class="ae-tool-icon" style="mask-image:url(./assets/curlybraces.png);-webkit-mask-image:url(./assets/curlybraces.png)"></div></button>
                            <div class="ae-tool-sep"></div>
                            <button class="ae-tool" data-cmd="insertUnorderedList" title="Маркированный список"><div class="ae-tool-icon" style="mask-image:url(./assets/list.bullet.png);-webkit-mask-image:url(./assets/list.bullet.png)"></div></button>
                            <button class="ae-tool" data-cmd="insertOrderedList" title="Нумерованный список"><div class="ae-tool-icon" style="mask-image:url(./assets/list.number.png);-webkit-mask-image:url(./assets/list.number.png)"></div></button>
                            <button class="ae-tool" data-cmd="hr" title="Горизонтальная линия"><div class="ae-tool-icon" style="mask-image:url(./assets/minus.png);-webkit-mask-image:url(./assets/minus.png)"></div></button>
                            <div class="ae-tool-sep"></div>
                            <button class="ae-tool" id="ae-insert-link" title="Вставить ссылку"><div class="ae-tool-icon" style="mask-image:url(./assets/link.png);-webkit-mask-image:url(./assets/link.png)"></div></button>
                            <button class="ae-tool" id="ae-insert-img" title="Вставить изображение"><div class="ae-tool-icon" style="mask-image:url(./assets/photo.fill.png);-webkit-mask-image:url(./assets/photo.fill.png)"></div></button>
                            <button class="ae-tool" id="ae-insert-vid" title="Вставить видео"><div class="ae-tool-icon" style="mask-image:url(./assets/video.fill.png);-webkit-mask-image:url(./assets/video.fill.png)"></div></button>
                            <div class="ae-tool-sep"></div>
                            <button class="ae-tool" id="ae-insert-sf" title="Вставить SF Symbol"><div class="ae-tool-icon" style="mask-image:url(./assets/sparkles.png);-webkit-mask-image:url(./assets/sparkles.png)"></div></button>
                            <input type="file" id="ae-img-file" accept="image/*" style="display:none">
                            <input type="file" id="ae-vid-file" accept="video/*" style="display:none">
                        </div>
                        <div class="adm-editor-content" id="ae-content" contenteditable="true" data-placeholder="Содержание новости..."></div>
                        <div style="display:flex;gap:10px">
                            <select class="module-select" id="ae-status" style="flex:1">
                                <option value="draft" ${(!existingNews || existingNews.status === "draft") ? "selected" : ""}>Черновик</option>
                                <option value="published" ${existingNews?.status === "published" ? "selected" : ""}>Опубликовать</option>
                            </select>
                            <div class="module-btn primary" id="ae-save" style="flex:2">Сохранить</div>
                        </div>
                    </div>
                    <div class="adm-editor-preview">
                        <div class="adm-preview-label">Предпросмотр</div>
                        <div id="ae-preview-body" class="adm-preview-content"></div>
                    </div>
                </div>
            </div>
        `

        document.body.appendChild(overlay)

        const coverInput = overlay.querySelector("#ae-cover")
        coverInput.value = existingNews?.cover_url || ""

        const contentEl = overlay.querySelector("#ae-content")
        if (existingNews?.content) contentEl.innerHTML = existingNews.content

        const previewEl = overlay.querySelector("#ae-preview-body")

        function updatePreview() {
            const title = overlay.querySelector("#ae-title").value
            const cover = overlay.querySelector("#ae-cover").value.trim()
            previewEl.innerHTML = ""
            if (cover) {
                const img = document.createElement("img")
                img.src = cover
                img.style.cssText = "width:100%;border-radius:10px;max-height:160px;object-fit:cover;margin-bottom:8px"
                previewEl.appendChild(img)
            }
            if (title) {
                const t = document.createElement("div")
                t.style.cssText = "font-size:16px;font-weight:800;margin-bottom:8px;line-height:1.3"
                t.textContent = title
                previewEl.appendChild(t)
            }
            const c = document.createElement("div")
            c.innerHTML = contentEl.innerHTML
            previewEl.appendChild(c)
        }

        if (existingNews?.cover_url) {
            const prev = overlay.querySelector("#ae-cover-preview")
            const img  = overlay.querySelector("#ae-cover-img")
            prev.style.display = ""
            img.src = existingNews.cover_url
        }

        contentEl.addEventListener("input", updatePreview)
        overlay.querySelector("#ae-title").addEventListener("input", updatePreview)
        coverInput.addEventListener("input", e => {
            const url = e.target.value.trim()
            const prev = overlay.querySelector("#ae-cover-preview")
            const img  = overlay.querySelector("#ae-cover-img")
            if (url) { prev.style.display = ""; img.src = url }
            else prev.style.display = "none"
            updatePreview()
        })
        updatePreview()

        overlay.querySelector("#ae-close").addEventListener("click", () => overlay.remove())
        overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove() })

        overlay.querySelectorAll(".ae-tool[data-cmd]").forEach(btn => {
            btn.addEventListener("click", e => {
                e.preventDefault()
                const cmd = btn.dataset.cmd
                if (cmd === "h2") document.execCommand("formatBlock", false, "H2")
                else if (cmd === "h3") document.execCommand("formatBlock", false, "H3")
                else if (cmd === "blockquote") document.execCommand("formatBlock", false, "BLOCKQUOTE")
                else if (cmd === "code") {
                    const sel = window.getSelection()
                    if (sel && sel.toString()) {
                        document.execCommand("insertHTML", false, `<code>${sel.toString()}</code>`)
                    } else {
                        document.execCommand("insertHTML", false, `<pre><code>код здесь</code></pre>`)
                    }
                }
                else if (cmd === "hr") document.execCommand("insertHTML", false, "<hr>")
                else document.execCommand(cmd, false, null)
                contentEl.focus()
                updatePreview()
            })
        })

        overlay.querySelector("#ae-insert-link").addEventListener("click", () => {
            const sel = window.getSelection()
            const selText = sel ? sel.toString() : ""
            const url = prompt("URL ссылки:", "https://")
            if (!url) return
            const text = selText || url
            contentEl.focus()
            document.execCommand("insertHTML", false, `<a href="${url.replace(/"/g, "&quot;")}" target="_blank" rel="noopener">${esc(text)}</a>`)
            updatePreview()
        })

        const imgFile = overlay.querySelector("#ae-img-file")
        overlay.querySelector("#ae-insert-img").addEventListener("click", () => imgFile.click())
        imgFile.addEventListener("change", async () => {
            const file = imgFile.files[0]; if (!file) return
            const base64 = await readBase64(file)
            try {
                const data = await window.api.uploadMedia(base64.split(",")[1], file.name, existingNews?.id || null)
                contentEl.focus()
                document.execCommand("insertHTML", false, `<img src="${data.url}" style="max-width:100%;border-radius:8px;margin:8px 0;display:block" alt="">`)
                updatePreview()
            } catch (e) { alert("Ошибка загрузки: " + e.message) }
            imgFile.value = ""
        })

        const vidFile = overlay.querySelector("#ae-vid-file")
        overlay.querySelector("#ae-insert-vid").addEventListener("click", () => vidFile.click())
        vidFile.addEventListener("change", async () => {
            const file = vidFile.files[0]; if (!file) return
            const base64 = await readBase64(file)
            try {
                const data = await window.api.uploadMedia(base64.split(",")[1], file.name, existingNews?.id || null)
                contentEl.focus()
                document.execCommand("insertHTML", false, `<video src="${data.url}" controls style="max-width:100%;border-radius:8px;margin:8px 0;display:block"></video>`)
                updatePreview()
            } catch (e) { alert("Ошибка загрузки видео: " + e.message) }
            vidFile.value = ""
        })

        overlay.querySelector("#ae-insert-sf").addEventListener("click", (e) => {
            openSFPicker(e.currentTarget, contentEl, updatePreview)
        })

        const coverFile = overlay.querySelector("#ae-cover-file")
        coverFile.addEventListener("change", async () => {
            const file = coverFile.files[0]; if (!file) return
            const base64 = await readBase64(file)
            try {
                const data = await window.api.uploadMedia(base64.split(",")[1], file.name, null)
                overlay.querySelector("#ae-cover").value = data.url
                overlay.querySelector("#ae-cover-img").src = data.url
                overlay.querySelector("#ae-cover-preview").style.display = ""
                updatePreview()
            } catch (e) { alert("Ошибка загрузки: " + e.message) }
            coverFile.value = ""
        })

        const saveBtn = overlay.querySelector("#ae-save")
        saveBtn.addEventListener("click", async () => {
            const title   = overlay.querySelector("#ae-title").value.trim()
            const cover   = overlay.querySelector("#ae-cover").value.trim()
            const content = contentEl.innerHTML
            const status  = overlay.querySelector("#ae-status").value
            if (!title) { alert("Укажите заголовок"); return }

            saveBtn.textContent = "Сохранение..."
            saveBtn.style.opacity = "0.7"
            try {
                await window.api.saveNews({ id: existingNews?.id, title, content, cover_url: cover || undefined, status })
                overlay.remove()
                await renderNews(parentBody)
            } catch (e) {
                alert("Ошибка: " + e.message)
                saveBtn.textContent = "Сохранить"
                saveBtn.style.opacity = ""
            }
        })
    }

    // ── РАСШИРЕНИЯ ────────────────────────────────────
    async function renderAddons(body) {
        body.innerHTML = `
            <div class="adm-addons-filter" id="adm-addons-filter">
                <div class="adm-filter-btn active" data-f="all">Все</div>
                <div class="adm-filter-btn" data-f="pending">Ожидают</div>
                <div class="adm-filter-btn" data-f="approved">Одобрены</div>
                <div class="adm-filter-btn" data-f="rejected">Отклонены</div>
                <div class="adm-filter-btn" data-f="draft">Черновики</div>
            </div>
            <div id="adm-addons-list"><div class="module-empty">Загрузка...</div></div>
        `

        let allAddons = []
        let currentFilter = "all"

        body.querySelectorAll(".adm-filter-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                body.querySelectorAll(".adm-filter-btn").forEach(b => b.classList.remove("active"))
                btn.classList.add("active")
                currentFilter = btn.dataset.f
                renderAddonList()
            })
        })

        try {
            const data = await window.api.adminAddonsAll()
            allAddons = data.addons || []
        } catch (e) {
            body.querySelector("#adm-addons-list").innerHTML = `<div class="module-empty">Ошибка: ${esc(e.message)}</div>`
            return
        }

        function renderAddonList() {
            const listEl = body.querySelector("#adm-addons-list")
            const filtered = currentFilter === "all"
                ? allAddons
                : allAddons.filter(a => a.status === currentFilter)

            if (!filtered.length) {
                listEl.innerHTML = `<div class="module-empty">Нет расширений</div>`
                return
            }

            const STATUS_LABEL = { draft: "Черновик", pending: "Ожидает", approved: "Одобрено", rejected: "Отклонено" }
            const STATUS_CLS   = { draft: "gray", pending: "yellow", approved: "green", rejected: "red" }

            listEl.innerHTML = ""
            filtered.forEach(addon => {
                const isPending = addon.status === "pending"
                const card = document.createElement("div")
                card.className = "module-card"
                card.innerHTML = `
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
                        <div style="font-size:15px;font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; color: var(--text)">${esc(addon.name)}</div>
                        <span class="badge-pill ${STATUS_CLS[addon.status] || "gray"}" style="flex-shrink:0">${STATUS_LABEL[addon.status] || addon.status}</span>
                    </div>
                    ${addon.description ? `<div class="card-desc" style="-webkit-line-clamp:2;display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden">${esc(addon.description)}</div>` : ""}
                    <div class="card-meta">@${esc(addon.dev_name)} · v${esc(addon.version)} · ${esc(addon.slug)}</div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap">
                        <div class="module-btn" style="height:34px;font-size:13px;padding:0 12px" data-action="files">Файлы</div>
                        ${isPending ? `
                            <div class="module-btn success" style="height:34px;font-size:13px;padding:0 12px" data-action="approve">Одобрить</div>
                            <div class="module-btn danger"  style="height:34px;font-size:13px;padding:0 12px" data-action="reject">Отклонить</div>
                        ` : ""}
                        <div class="module-btn danger" style="height:34px;font-size:13px;padding:0 12px;background:rgba(255,59,48,0.08);color:rgb(255,59,48);box-shadow:none;margin-left:auto" data-action="delete">Удалить</div>
                    </div>
                `
                card.querySelector("[data-action='files']").addEventListener("click", () => openAddonFileViewer(addon))
                if (isPending) {
                    card.querySelector("[data-action='approve']").addEventListener("click", async () => {
                        if (!confirm(`Одобрить «${addon.name}»?`)) return
                        await window.api.adminAddonReview(addon.id, "approve").catch(e => { alert(e.message); throw e })
                        addon.status = "approved"
                        renderAddonList()
                    })
                    card.querySelector("[data-action='reject']").addEventListener("click", async () => {
                        const reason = prompt("Причина отклонения:")
                        if (reason === null) return
                        await window.api.adminAddonReview(addon.id, "reject", reason || "").catch(e => { alert(e.message); throw e })
                        addon.status = "rejected"
                        renderAddonList()
                    })
                }
                card.querySelector("[data-action='delete']").addEventListener("click", async () => {
                    if (!confirm(`Удалить расширение «${addon.name}» и все его файлы? Это действие необратимо.`)) return
                    await window.api.adminAddonDelete(addon.id).catch(e => { alert(e.message); throw e })
                    allAddons = allAddons.filter(a => a.id !== addon.id)
                    renderAddonList()
                })
                listEl.appendChild(card)
            })
        }

        renderAddonList()
    }

    function openAddonFileViewer(addon) {
        const overlay = document.createElement("div")
        overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box"

        overlay.innerHTML = `
            <div class="adm-file-viewer">
                <div class="adm-editor-header">
                    <div class="adm-editor-title" style="font-size:15px">
                        Файлы: ${esc(addon.name)} <span style="font-weight:400;opacity:0.5">v${esc(addon.version)}</span>
                    </div>
                    <div class="adm-editor-close" id="afv-close">✕</div>
                </div>
                <div class="adm-fv-body">
                    <div class="adm-fv-tree" id="afv-tree"><div class="module-empty" style="font-size:13px">Загрузка...</div></div>
                    <div class="adm-fv-code" id="afv-code"><div class="module-empty" style="font-size:13px">Выберите файл</div></div>
                </div>
            </div>
        `

        document.body.appendChild(overlay)
        overlay.querySelector("#afv-close").addEventListener("click", () => overlay.remove())
        overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove() })

        window.api.adminAddonFiles(addon.id).then(data => {
            const files = data.files || []
            const treeEl = overlay.querySelector("#afv-tree")
            const codeEl = overlay.querySelector("#afv-code")

            if (!files.length) {
                treeEl.innerHTML = `<div class="module-empty" style="font-size:13px">Нет файлов</div>`
                return
            }

            treeEl.innerHTML = ""
            let activeItem = null

            files.forEach(file => {
                const item = document.createElement("div")
                item.className = "afv-file-item"
                const depth = (file.name.match(/\//g) || []).length
                const basename = file.name.split("/").pop()
                const ext = basename.split(".").pop().toLowerCase()
                const EXT_ICON = { js: "JS", css: "CS", html: "HT", json: "{}",
                    png: "IMG", jpg: "IMG", gif: "IMG", svg: "SVG" }
                const icon = EXT_ICON[ext] || "  "
                item.innerHTML = `
                    <span class="afv-ext" style="background:${ext==="js"?"rgba(255,193,7,0.2)":ext==="css"?"rgba(0,122,255,0.15)":ext==="html"?"rgba(255,69,58,0.15)":"rgba(0,0,0,0.06)"};color:${ext==="js"?"rgb(153,102,0)":ext==="css"?"rgb(0,80,180)":ext==="html"?"rgb(200,40,30)":"rgba(0,0,0,0.4)"}">${icon}</span>
                    <span style="margin-left:${depth*10}px;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(basename)}</span>
                    <span class="afv-size">${(file.size/1024).toFixed(1)}K</span>
                `
                item.addEventListener("click", () => {
                    if (activeItem) activeItem.classList.remove("active")
                    item.classList.add("active")
                    activeItem = item

                    if (file.is_binary) {
                        const isImg = ["png","jpg","gif","webp","svg"].includes(ext)
                        codeEl.innerHTML = isImg
                            ? `<div style="padding:16px;text-align:center"><img src="${esc(window.api.baseUrl)}/store/dev/${addon.dev_user_id || "?"}/${addon.id}/${esc(file.name)}" style="max-width:100%;border-radius:8px"></div>`
                            : `<div class="module-empty" style="font-size:13px">Бинарный файл</div>`
                    } else {
                        const lang = { js: "javascript", css: "css", html: "html", json: "json" }[ext] || "plaintext"
                        const code = (file.content || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
                        codeEl.innerHTML = `<pre class="afv-code-pre" data-lang="${lang}"><code>${code}</code></pre>`
                        codeEl.scrollTop = 0
                    }
                })
                treeEl.appendChild(item)
            })

            if (files.length > 0) treeEl.querySelector(".afv-file-item")?.click()
        }).catch(e => {
            overlay.querySelector("#afv-tree").innerHTML = `<div class="module-empty" style="font-size:13px">Ошибка: ${esc(e.message)}</div>`
        })
    }

    // ── ПОЛЬЗОВАТЕЛИ ──────────────────────────────────
    async function renderUsers(body) {
        const data = await window.api.adminUsers()
        const users = data.users || []

        body.innerHTML = `
            <input class="module-input" id="adm-user-search" type="text" placeholder="Поиск по имени или логину..." style="margin-bottom:4px">
            <div id="adm-users-list"></div>
        `

        const searchInput = body.querySelector("#adm-user-search")
        const listEl = body.querySelector("#adm-users-list")

        function renderList(filter) {
            const q = filter.toLowerCase()
            const filtered = users.filter(u => {
                const name = (u.name || "").toLowerCase()
                const uname = (u.moodle_username || "").toLowerCase()
                return !q || name.includes(q) || uname.includes(q)
            })

            if (!filtered.length) {
                listEl.innerHTML = `<div class="module-empty">Не найдено</div>`
                return
            }

            const rows = document.createElement("div")
            rows.className = "module-rows"

            filtered.forEach(u => {
                const row = document.createElement("div")
                row.className = "module-row"
                row.style.cssText = "flex-wrap:wrap;min-height:60px;padding:10px 16px;gap:6px;align-items:center"

                const badges = [
                    u.is_admin     ? `<span class="badge-pill blue">Админ</span>` : "",
                    u.is_developer ? `<span class="badge-pill green">Разраб.</span>` : "",
                    u.is_banned    ? `<span class="badge-pill red">Бан</span>` : "",
                ].join("")

                row.innerHTML = `
                    <div class="row-body" style="flex:1;min-width:120px">
                        <div class="row-label">${esc(u.name || u.moodle_username)}</div>
                        ${u.moodle_username && u.name ? `<div style="font-size:12px;color:var(--text-3)">@${esc(u.moodle_username)}</div>` : ""}
                        <div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">${badges}</div>
                    </div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;flex-shrink:0">
                        <div class="module-btn" style="height:32px;font-size:12px;padding:0 10px;border-radius:100px" data-action="${u.is_banned ? "unban" : "ban"}">
                            ${u.is_banned ? "Разбанить" : "Забанить"}
                        </div>
                        <div class="module-btn" style="height:32px;font-size:12px;padding:0 10px;border-radius:100px" data-action="${u.is_developer ? "revoke_dev" : "grant_dev"}">
                            ${u.is_developer ? "Снять разраб." : "Разработчик"}
                        </div>
                    </div>
                `

                row.querySelectorAll("[data-action]").forEach(btn => {
                    btn.addEventListener("click", () => {
                        const action = btn.dataset.action
                        const calls = {
                            ban:        ["заблокировать",             () => window.api.adminBan(u.id)],
                            unban:      ["разбанить",                 () => window.api.adminUnban(u.id)],
                            grant_dev:  ["выдать права разработчика", () => window.api.adminGrantDeveloper(u.id)],
                            revoke_dev: ["снять права разработчика",  () => window.api.adminRevokeDeveloper(u.id)],
                        }
                        const [label, apiCall] = calls[action] || []
                        if (!apiCall) return
                        if (!confirm(`${label}: ${u.name || u.moodle_username}?`)) return
                        btn.style.opacity = "0.5"
                        apiCall().then(() => {
                            if (action === "ban") u.is_banned = 1
                            if (action === "unban") u.is_banned = 0
                            if (action === "grant_dev") u.is_developer = 1
                            if (action === "revoke_dev") u.is_developer = 0
                            renderList(searchInput.value)
                        }).catch(e => { alert("Ошибка: " + e.message); btn.style.opacity = "" })
                    })
                })
                rows.appendChild(row)
            })

            listEl.innerHTML = ""
            listEl.appendChild(rows)
        }

        renderList("")

        let t
        searchInput.addEventListener("input", () => {
            clearTimeout(t)
            t = setTimeout(() => renderList(searchInput.value), 180)
        })
    }

    // ── ПРЕПОДАВАТЕЛИ ─────────────────────────────────
    async function renderTeachers(body) {
        body.innerHTML = `
            <input class="module-input" id="adm-tch-search" type="text" placeholder="Поиск по имени или кафедре..." style="margin-bottom:6px">
            <div class="adm-addons-filter" id="adm-tch-filter">
                <div class="adm-filter-btn active" data-f="all">Все</div>
                <div class="adm-filter-btn" data-f="none">Нет инфо</div>
                <div class="adm-filter-btn" data-f="partial">Неполная</div>
                <div class="adm-filter-btn" data-f="full">Полная</div>
            </div>
            <div id="adm-tch-list"><div class="module-empty">Загрузка...</div></div>
        `

        let allTeachers = []
        let currentFilter = "all"
        let searchQuery = ""

        const searchInput = body.querySelector("#adm-tch-search")
        body.querySelectorAll(".adm-filter-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                body.querySelectorAll(".adm-filter-btn").forEach(b => b.classList.remove("active"))
                btn.classList.add("active")
                currentFilter = btn.dataset.f
                renderList()
            })
        })

        let searchTimer
        searchInput.addEventListener("input", () => {
            clearTimeout(searchTimer)
            searchTimer = setTimeout(() => { searchQuery = searchInput.value; renderList() }, 180)
        })

        function getCompleteness(t) {
            const hasPhoto = !!t.photo_url
            const hasDesc  = !!t.description
            const hasDept  = !!t.department
            if (!hasPhoto && !hasDesc && !hasDept && !t.email && !t.phone) return "none"
            if (hasPhoto && hasDesc && hasDept) return "full"
            return "partial"
        }

        function renderList() {
            const listEl = body.querySelector("#adm-tch-list")
            const q = searchQuery.trim().toLowerCase()
            let filtered = allTeachers
            if (q) filtered = filtered.filter(t =>
                (t.teacher || "").toLowerCase().includes(q) ||
                (t.department || "").toLowerCase().includes(q)
            )
            if (currentFilter !== "all") filtered = filtered.filter(t => getCompleteness(t) === currentFilter)

            if (!filtered.length) { listEl.innerHTML = `<div class="module-empty">Нет преподавателей</div>`; return }

            const COMPL_LABEL = { none: "Нет инфо", partial: "Неполная", full: "Полная" }
            const COMPL_CLS   = { none: "red", partial: "yellow", full: "green" }

            const rows = document.createElement("div")
            rows.className = "module-rows"

            filtered.forEach(t => {
                const compl = getCompleteness(t)
                const row = document.createElement("div")
                row.className = "module-row"
                row.style.cssText = "flex-wrap:wrap;min-height:60px;padding:10px 16px;gap:6px;align-items:center"

                const meta = [
                    t.department ? esc(t.department) : null,
                    `${t.lessons_count ?? 0} пар`,
                ].filter(Boolean).join(" · ")

                row.innerHTML = `
                    <div class="row-body" style="flex:1;min-width:0">
                        <div class="row-label" style="display:flex;align-items:center;gap:8px">
                            ${t.photo_url ? `<img src="${esc(t.photo_url)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0">` : `<div style="width:32px;height:32px;border-radius:50%;background:var(--bg-card);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">${esc((t.full_name||t.teacher||"?")[0])}</div>`}
                            <div>
                                <div>${esc(t.full_name || t.teacher)}</div>
                                ${t.full_name ? `<div style="font-size:11px;color:var(--text-3)">${esc(t.teacher)}</div>` : ""}
                            </div>
                        </div>
                        <div style="font-size:12px;color:var(--text-3);margin-top:3px;padding-left:40px">${meta}</div>
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
                        <span class="badge-pill ${COMPL_CLS[compl]}">${COMPL_LABEL[compl]}</span>
                        <div class="module-btn" style="height:32px;font-size:12px;padding:0 12px;border-radius:100px" data-action="edit">Изменить</div>
                        ${compl !== "none" ? `<div class="module-btn danger" style="height:32px;font-size:12px;padding:0 10px;border-radius:100px;background:rgba(255,59,48,0.08);color:rgb(255,59,48);box-shadow:none" data-action="clear">Очистить</div>` : ""}
                    </div>
                `

                row.querySelector("[data-action='edit']").addEventListener("click", () => {
                    openTeacherEditor(t, async updated => {
                        Object.assign(t, updated)
                        // full_name хранится под ключом full_name в объекте преподавателя
                        renderList()
                    })
                })
                row.querySelector("[data-action='clear']")?.addEventListener("click", async () => {
                    if (!confirm(`Удалить информацию о «${t.teacher}»?`)) return
                    await window.api.adminDeleteTeacher(t.teacher).catch(e => { alert(e.message); throw e })
                    t.photo_url = null; t.description = null; t.department = null
                    t.email = null; t.phone = null; t.emoji_id = null
                    renderList()
                })
                rows.appendChild(row)
            })

            listEl.innerHTML = ""
            listEl.appendChild(rows)

            const counts = { all: allTeachers.length, none: 0, partial: 0, full: 0 }
            allTeachers.forEach(t => counts[getCompleteness(t)]++)
            body.querySelectorAll(".adm-filter-btn").forEach(btn => {
                const f = btn.dataset.f
                const n = f === "all" ? counts.all : (counts[f] ?? 0)
                btn.textContent = { all: "Все", none: "Нет инфо", partial: "Неполная", full: "Полная" }[f] + ` (${n})`
            })
        }

        try {
            const data = await window.api.getTeachers()
            allTeachers = data.teachers || []
            renderList()
        } catch (e) {
            body.querySelector("#adm-tch-list").innerHTML = `<div class="module-empty">Ошибка: ${esc(e.message)}</div>`
        }
    }

    function openTeacherEditor(teacher, onSaved) {
        const overlay = document.createElement("div")
        overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:flex-end;justify-content:center;padding:0;box-sizing:border-box"

        overlay.innerHTML = `
            <div style="background:var(--bg-card);border-radius:24px 24px 0 0;width:100%;max-width:600px;max-height:90vh;overflow-y:auto;padding:24px 20px 32px">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
                    <div>
                        <div style="font-size:17px;font-weight:800; color: var(--text)">${esc(teacher.full_name || teacher.teacher)}</div>
                        ${teacher.full_name ? `<div style="font-size:12px;color:var(--text-3);margin-top:2px">${esc(teacher.teacher)}</div>` : ""}
                    </div>
                    <div id="te-close" style="width:30px;height:30px;border-radius:50%;background:var(--bg-card);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:16px;color:var(--text-2)">✕</div>
                </div>

                <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px">
                    <div id="te-avatar" style="width:64px;height:64px;border-radius:50%;overflow:hidden;background:var(--bg-card);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;color:var(--text-2)">
                        ${teacher.photo_url ? `<img src="${esc(teacher.photo_url)}" style="width:100%;height:100%;object-fit:cover" id="te-avatar-img">` : `<span id="te-avatar-initials">${esc((teacher.teacher||"?")[0])}</span>`}
                    </div>
                    <div style="flex:1">
                        <input class="module-input" id="te-photo" type="url" placeholder="URL фото..." value="${esc(teacher.photo_url || "")}" style="margin-bottom:6px">
                        <label class="module-btn" style="height:34px;font-size:13px;padding:0 14px;display:inline-flex;align-items:center;cursor:pointer">
                            Загрузить фото
                            <input type="file" id="te-photo-file" accept="image/*" style="display:none">
                        </label>
                    </div>
                </div>

                <div class="module-label" style="margin-bottom:6px">Полное ФИО</div>
                <input class="module-input" id="te-fullname" type="text" placeholder="Иванов Иван Иванович" value="${esc(teacher.full_name || "")}" style="margin-bottom:10px">

                <div class="module-label" style="margin-bottom:6px">Кафедра / должность</div>
                <input class="module-input" id="te-dept" type="text" placeholder="Кафедра или должность..." value="${esc(teacher.department || "")}" style="margin-bottom:10px">

                <div class="module-label" style="margin-bottom:6px">Описание</div>
                <textarea class="module-textarea" id="te-desc" placeholder="Краткая биография, научные интересы...">${esc(teacher.description || "")}</textarea>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
                    <div>
                        <div class="module-label" style="margin-bottom:6px">Email</div>
                        <input class="module-input" id="te-email" type="email" placeholder="email@vsu.by" value="${esc(teacher.email || "")}">
                    </div>
                    <div>
                        <div class="module-label" style="margin-bottom:6px">Телефон</div>
                        <input class="module-input" id="te-phone" type="tel" placeholder="+375 (XX) XXX-XX-XX" value="${esc(teacher.phone || "")}">
                    </div>
                </div>

                <div style="margin-top:16px">
                    <div class="module-btn primary" id="te-save" style="width:100%">Сохранить</div>
                </div>
            </div>
        `

        document.body.appendChild(overlay)

        const photoInput = overlay.querySelector("#te-photo")
        const avatarEl   = overlay.querySelector("#te-avatar")

        function updateAvatar(url) {
            if (url) {
                avatarEl.innerHTML = `<img src="${esc(url)}" style="width:100%;height:100%;object-fit:cover">`
            } else {
                avatarEl.innerHTML = `<span>${esc((teacher.teacher||"?")[0])}</span>`
            }
        }

        photoInput.addEventListener("input", () => updateAvatar(photoInput.value.trim()))

        const photoFile = overlay.querySelector("#te-photo-file")
        photoFile.addEventListener("change", async () => {
            const file = photoFile.files[0]; if (!file) return
            const base64 = await readBase64(file)
            try {
                const data = await window.api.uploadMedia(base64.split(",")[1], file.name, null)
                photoInput.value = data.url
                updateAvatar(data.url)
            } catch (e) { alert("Ошибка загрузки: " + e.message) }
            photoFile.value = ""
        })

        overlay.querySelector("#te-close").addEventListener("click", () => overlay.remove())
        overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove() })

        const saveBtn = overlay.querySelector("#te-save")
        saveBtn.addEventListener("click", async () => {
            const payload = {
                name:        teacher.teacher,
                full_name:   overlay.querySelector("#te-fullname").value.trim() || null,
                photo_url:   overlay.querySelector("#te-photo").value.trim() || null,
                department:  overlay.querySelector("#te-dept").value.trim() || null,
                description: overlay.querySelector("#te-desc").value.trim() || null,
                email:       overlay.querySelector("#te-email").value.trim() || null,
                phone:       overlay.querySelector("#te-phone").value.trim() || null,
            }
            saveBtn.textContent = "Сохранение..."
            saveBtn.style.opacity = "0.7"
            try {
                await window.api.adminSetTeacher(payload)
                onSaved(payload)
                overlay.remove()
            } catch (e) {
                alert("Ошибка: " + e.message)
                saveBtn.textContent = "Сохранить"
                saveBtn.style.opacity = ""
            }
        })
    }

    // ── РАССЫЛКА ──────────────────────────────────────
    function renderBroadcast(body) {
        body.innerHTML = `
            <div class="module-label">Push-рассылка</div>
            <div class="module-card">
                <input class="module-input" id="bc-title" type="text" placeholder="Заголовок уведомления">
                <textarea class="module-textarea" id="bc-body" placeholder="Текст уведомления..."></textarea>
                <div class="module-btn primary" id="bc-send">Отправить всем</div>
            </div>
        `
        body.querySelector("#bc-send").addEventListener("click", () => {
            const title = body.querySelector("#bc-title").value.trim()
            const text  = body.querySelector("#bc-body").value.trim()
            if (!title || !text) { alert("Заполните заголовок и текст"); return }
            if (!confirm(`Отправить уведомление всем пользователям?\n\n${title}`)) return

            const btn = body.querySelector("#bc-send")
            btn.textContent = "Отправка..."
            btn.style.opacity = "0.7"

            window.api.adminBroadcast(title, text).then(data => {
                btn.textContent = `Отправлено (${data.queued || 0} устройств)`
                setTimeout(() => { btn.textContent = "Отправить всем"; btn.style.opacity = "" }, 3000)
            }).catch(e => {
                alert("Ошибка: " + e.message)
                btn.textContent = "Отправить всем"
                btn.style.opacity = ""
            })
        })
    }

    // ── SF SYMBOL PICKER ──────────────────────────────
    let _sfIcons = null

    async function openSFPicker(btn, contentEl, updatePreview) {
        // Закрыть уже открытый пикер
        const existing = document.getElementById("ae-sf-picker")
        if (existing) { existing.remove(); return }

        // Ленивая загрузка списка иконок
        if (!_sfIcons) {
            try {
                const r = await fetch("./sf-icons.json")
                _sfIcons = await r.json()
            } catch { return }
        }

        // Сохраняем выделение перед открытием пикера
        const sel = window.getSelection()
        let savedRange = null
        if (sel && sel.rangeCount) savedRange = sel.getRangeAt(0).cloneRange()

        const picker = document.createElement("div")
        picker.id = "ae-sf-picker"
        picker.className = "ae-sf-picker"
        document.body.appendChild(picker)

        // Позиционирование под кнопкой
        const rect = btn.getBoundingClientRect()
        const spaceBelow = window.innerHeight - rect.bottom
        if (spaceBelow < 320) {
            picker.style.bottom = (window.innerHeight - rect.top + 4) + "px"
        } else {
            picker.style.top = (rect.bottom + 4) + "px"
        }
        picker.style.left = Math.min(rect.left, window.innerWidth - 296) + "px"

        picker.innerHTML = `
            <div class="ae-sf-search-wrap">
                <div class="ae-sf-search-icon"></div>
                <input class="ae-sf-search" placeholder="Поиск символа..." autocomplete="off" spellcheck="false">
            </div>
            <div class="ae-sf-grid"></div>
        `

        const searchEl = picker.querySelector(".ae-sf-search")
        const gridEl   = picker.querySelector(".ae-sf-grid")

        // Виртуальный скролл: рендерим только видимые строки
        const COLS   = 6
        const ITEM_H = 44
        const VIS_H  = 264

        function insertSymbol(name) {
            picker.remove()
            contentEl.focus()

            const sel = window.getSelection()
            let range

            // Восстановить сохранённую позицию курсора (если она внутри редактора)
            try {
                if (savedRange && contentEl.contains(savedRange.commonAncestorContainer)) {
                    sel.removeAllRanges()
                    sel.addRange(savedRange)
                    range = sel.getRangeAt(0)
                }
            } catch (_) {}

            // Если курсора нет — вставляем в конец редактора
            if (!range || !sel.rangeCount) {
                range = document.createRange()
                range.selectNodeContents(contentEl)
                range.collapse(false)
                sel.removeAllRanges()
                sel.addRange(range)
                range = sel.getRangeAt(0)
            }

            // Создаём span напрямую через DOM
            const span = document.createElement("span")
            span.className = "sf-sym"
            span.dataset.n = name
            span.setAttribute("contenteditable", "false")
            span.style.cssText = `display:inline-block;width:1.15em;height:1.15em;vertical-align:middle;background:currentColor;-webkit-mask:url(./assets/${name}.png) center/contain no-repeat;mask:url(./assets/${name}.png) center/contain no-repeat`
            span.textContent = "​"  // zero-width space как содержимое

            range.deleteContents()
            range.insertNode(span)

            // Ставим курсор после вставленного символа
            const after = document.createRange()
            after.setStartAfter(span)
            after.collapse(true)
            sel.removeAllRanges()
            sel.addRange(after)

            updatePreview()
        }

        let currentIcons = []
        let scrollHandler = null

        function setupVGrid(icons) {
            if (scrollHandler) gridEl.removeEventListener("scroll", scrollHandler)
            currentIcons = icons

            if (!icons.length) {
                gridEl.innerHTML = `<div class="ae-sf-empty">Ничего не найдено</div>`
                return
            }

            const totalRows = Math.ceil(icons.length / COLS)
            const totalH    = totalRows * ITEM_H
            const BUFFER    = 2

            // Контейнер с полной высотой + вьюпорт для видимых элементов
            gridEl.innerHTML = ""
            gridEl.style.position = "relative"

            const spacer   = document.createElement("div")
            spacer.style.cssText = `height:${totalH}px;pointer-events:none`
            gridEl.appendChild(spacer)

            const viewport = document.createElement("div")
            viewport.style.cssText = "position:absolute;top:0;left:0;right:0"
            gridEl.appendChild(viewport)

            // Делегирование кликов
            viewport.addEventListener("mousedown", e => {
                e.preventDefault()
                const item = e.target.closest(".ae-sf-item")
                if (item) insertSymbol(item.dataset.n)
            })

            let lastFirst = -1
            function render() {
                const scrollTop = gridEl.scrollTop
                const firstRow = Math.max(0, Math.floor(scrollTop / ITEM_H) - BUFFER)
                const visRows  = Math.ceil(VIS_H / ITEM_H) + BUFFER * 2
                const lastRow  = Math.min(totalRows - 1, firstRow + visRows)
                if (firstRow === lastFirst) return
                lastFirst = firstRow

                viewport.style.top = firstRow * ITEM_H + "px"
                let html = ""
                for (let row = firstRow; row <= lastRow; row++) {
                    html += `<div class="ae-sf-row">`
                    for (let col = 0; col < COLS; col++) {
                        const idx = row * COLS + col
                        if (idx >= icons.length) break
                        const n = icons[idx]
                        html += `<div class="ae-sf-item" data-n="${n}" title="${n}"><div class="ae-sf-icon" style="-webkit-mask-image:url(./assets/${n}.png);mask-image:url(./assets/${n}.png)"></div></div>`
                    }
                    html += `</div>`
                }
                viewport.innerHTML = html
            }

            scrollHandler = render
            gridEl.addEventListener("scroll", render, { passive: true })
            render()
        }

        setupVGrid(_sfIcons)
        searchEl.addEventListener("input", () => {
            const q = searchEl.value.trim().toLowerCase()
            setupVGrid(q ? _sfIcons.filter(n => n.includes(q)) : _sfIcons)
        })
        searchEl.focus()

        // Закрытие по клику вне пикера
        function onOutside(e) {
            if (!picker.contains(e.target) && e.target !== btn) {
                picker.remove()
                document.removeEventListener("mousedown", onOutside)
            }
        }
        setTimeout(() => document.addEventListener("mousedown", onOutside), 0)
    }

    // ── УТИЛИТЫ ───────────────────────────────────────
    function readBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = e => resolve(e.target.result)
            reader.onerror = reject
            reader.readAsDataURL(file)
        })
    }

    function esc(str) {
        if (!str) return ""
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    }

    return app
}
