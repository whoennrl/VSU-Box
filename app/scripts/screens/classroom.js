function initClassroomModule(user) {
    const app = new MiniApp("system-classroom", "1.0.0", "system")
    app.addMenuButton("./assets/door.left.hand.open.png", "Аудитории")

    app.setContent(`
        <div class="module-nav">
            <div class="module-back" id="cls-back"></div>
            <div class="module-title">Аудитории</div>
        </div>
        <div class="module-body" id="cls-body">
            <div class="cls-seg" id="cls-seg">
                <div class="cls-seg-btn active" data-mode="free">Свободные</div>
                <div class="cls-seg-btn" data-mode="schedule">Расписание аудитории</div>
            </div>
            <div id="cls-form-free">
                <div class="module-label">Дата и пара</div>
                <input class="module-input" id="cls-date-free" type="date">
                <div class="module-label">Номер пары</div>
                <div class="cls-num-grid" id="cls-num-grid">
                    ${[1,2,3,4,5,6,7,8].map(n => `<div class="cls-num-btn" data-n="${n}">${n}</div>`).join("")}
                </div>
                <div class="module-btn primary" id="cls-find-free">Найти свободные</div>
            </div>
            <div id="cls-form-sched" style="display:none">
                <div class="module-label">Аудитория</div>
                <input class="module-input" id="cls-room-input" type="text" placeholder="Например: 302">
                <div class="module-label">Дата</div>
                <input class="module-input" id="cls-date-sched" type="date">
                <div class="module-btn primary" id="cls-find-sched">Показать расписание</div>
            </div>
            <div id="cls-results"></div>
        </div>
    `)

    app.$(".module-back").addEventListener("click", () => app.closeScreen())

    // Установить сегодняшнюю дату
    const today = new Date().toISOString().split("T")[0]
    app.$("#cls-date-free").value = today
    app.$("#cls-date-sched").value = today

    // Выбор пары
    let selectedLesson = 0
    app.$$("#cls-num-grid .cls-num-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            app.$$("#cls-num-grid .cls-num-btn").forEach(b => b.classList.remove("active"))
            btn.classList.add("active")
            selectedLesson = parseInt(btn.dataset.n)
        })
    })

    // Переключение режима
    let mode = "free"
    app.$$("#cls-seg .cls-seg-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            app.$$("#cls-seg .cls-seg-btn").forEach(b => b.classList.remove("active"))
            btn.classList.add("active")
            mode = btn.dataset.mode
            app.$("#cls-form-free").style.display = mode === "free" ? "" : "none"
            app.$("#cls-form-sched").style.display = mode === "schedule" ? "" : "none"
            app.$("#cls-results").innerHTML = ""
        })
    })

    // Найти свободные
    app.$("#cls-find-free").addEventListener("click", async () => {
        const date = app.$("#cls-date-free").value
        if (!date) { alert("Выберите дату"); return }
        if (!selectedLesson) { alert("Выберите номер пары"); return }

        const btn = app.$("#cls-find-free")
        btn.textContent = "Поиск..."
        btn.style.opacity = "0.7"

        try {
            const data = await window.api.getFreeClassrooms(date, selectedLesson)
            renderFreeRooms(data)
        } catch (e) {
            app.$("#cls-results").innerHTML = `<div class="module-empty">Ошибка: ${escCls(e.message)}</div>`
        } finally {
            btn.textContent = "Найти свободные"
            btn.style.opacity = ""
        }
    })

    // Расписание аудитории
    app.$("#cls-find-sched").addEventListener("click", async () => {
        const room = app.$("#cls-room-input").value.trim()
        const date = app.$("#cls-date-sched").value
        if (!room) { alert("Введите название аудитории"); return }
        if (!date) { alert("Выберите дату"); return }

        const btn = app.$("#cls-find-sched")
        btn.textContent = "Загрузка..."
        btn.style.opacity = "0.7"

        try {
            const data = await window.api.getClassroomSchedule(room, date)
            renderRoomSchedule(room, date, data)
        } catch (e) {
            app.$("#cls-results").innerHTML = `<div class="module-empty">Ошибка: ${escCls(e.message)}</div>`
        } finally {
            btn.textContent = "Показать расписание"
            btn.style.opacity = ""
        }
    })

    function renderFreeRooms(data) {
        const results = app.$("#cls-results")
        const free = data.free || []
        const busy = data.busy || []
        const time = data.time ? `${data.time[0]}–${data.time[1]}` : ""

        results.innerHTML = ""

        const header = document.createElement("div")
        header.className = "module-label"
        header.textContent = `${data.lesson_num} пара${time ? " · " + time : ""} · ${formatDate(data.date)}`
        results.appendChild(header)

        if (!free.length) {
            const empty = document.createElement("div")
            empty.className = "module-empty"
            empty.style.marginTop = "0"
            empty.textContent = "Свободных аудиторий не найдено"
            results.appendChild(empty)
            return
        }

        const lbl = document.createElement("div")
        lbl.style.cssText = "font-size:13px;color:var(--text-2);margin:0 0 8px"
        lbl.textContent = `Свободны ${free.length} из ${free.length + busy.length}`
        results.appendChild(lbl)

        const grid = document.createElement("div")
        grid.className = "cls-free-grid"
        free.forEach(room => {
            const chip = document.createElement("div")
            chip.className = "cls-free-chip"
            chip.textContent = room
            chip.addEventListener("click", () => {
                app.$$("#cls-seg .cls-seg-btn").forEach(b => b.classList.remove("active"))
                app.$(".cls-seg-btn[data-mode='schedule']").classList.add("active")
                mode = "schedule"
                app.$("#cls-form-free").style.display = "none"
                app.$("#cls-form-sched").style.display = ""
                app.$("#cls-room-input").value = room
                app.$("#cls-date-sched").value = data.date || today
                app.$("#cls-results").innerHTML = ""
            })
            grid.appendChild(chip)
        })
        results.appendChild(grid)
    }

    function renderRoomSchedule(room, date, data) {
        const results = app.$("#cls-results")
        const lessons = data.lessons || data.schedule || []

        results.innerHTML = ""

        const header = document.createElement("div")
        header.className = "module-label"
        header.textContent = `Аудитория ${room} · ${formatDate(date)}`
        results.appendChild(header)

        if (!lessons.length) {
            const empty = document.createElement("div")
            empty.className = "module-empty"
            empty.style.marginTop = "0"
            empty.textContent = "Занятий не найдено — аудитория свободна весь день"
            results.appendChild(empty)
            return
        }

        const now = new Date()
        const nowMin = now.getHours() * 60 + now.getMinutes()
        const isToday = date === new Date().toISOString().split("T")[0]

        const rows = document.createElement("div")
        rows.className = "module-rows"

        lessons.forEach(lesson => {
            const row = document.createElement("div")
            row.className = "module-row"
            row.style.cssText = "padding:12px 16px;min-height:0;align-items:flex-start;gap:12px"

            const timeStr = lesson.time_start ? `${lesson.time_start}–${lesson.time_end || ""}` : ""
            let isCurrent = false
            if (isToday && lesson.time_start && lesson.time_end) {
                const [sh, sm] = lesson.time_start.split(":").map(Number)
                const [eh, em] = lesson.time_end.split(":").map(Number)
                isCurrent = nowMin >= sh * 60 + sm && nowMin <= eh * 60 + em
            }
            if (isCurrent) row.style.outline = "2px solid rgb(0,122,255)"

            row.innerHTML = `
                <div class="cls-lesson-num">${lesson.number || "?"}</div>
                <div style="flex:1;min-width:0">
                    <div style="font-size:14px;font-weight:700;line-height:1.3">${escCls(lesson.subject || lesson.title || "")}</div>
                    ${lesson.group ? `<div class="card-meta" style="margin-top:2px">${escCls(lesson.group)}</div>` : ""}
                    ${lesson.teacher ? `<div class="card-meta">${escCls(lesson.teacher)}</div>` : ""}
                </div>
                ${timeStr ? `<div style="font-size:12px;color:var(--text-2);white-space:nowrap;flex-shrink:0">${escCls(timeStr)}</div>` : ""}
            `
            rows.appendChild(row)
        })
        results.appendChild(rows)
    }

    function formatDate(dateStr) {
        if (!dateStr) return ""
        const d = new Date(dateStr)
        return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })
    }

    function escCls(str) {
        if (!str) return ""
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    }

    return app
}
