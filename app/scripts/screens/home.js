function escH(str) {
    if (!str) return ""
    return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
}

const HOME_LESSON_TIMES = {
    1:"08:00-09:25", 2:"09:35-11:00", 3:"11:30-12:55",
    4:"13:05-14:30", 5:"14:40-16:05", 6:"16:35-18:00",
    7:"18:10-19:35", 8:"19:45-21:10"
}

// ══════════════════════════════════════════════════════════
// buildHomeLessonWidget — виджет текущей / следующей пары
// lesson — объект пары из API
// type   — "current" | "next"
// Возвращает готовый DOM-элемент .home-lesson-widget
// ══════════════════════════════════════════════════════════
function buildHomeLessonWidget(lesson, type) {
    const time = lesson.time || HOME_LESSON_TIMES[lesson.number] || ""
    const [tStart, tEnd] = time.split("-")

    const widget = document.createElement("div")
    widget.className = "home-lesson-widget"
    widget.id = "home-lesson-widget"

    const avatarStyle = lesson.teacher_photo
        ? `background-image:url('${escH(lesson.teacher_photo)}')`
        : ""

    const teacherDisplayName = lesson.teacher_full_name || lesson.teacher
    const teacherHtml = lesson.teacher ? `
        <div class="home-lesson-teacher home-lesson-teacher--clickable" data-teacher="${escH(lesson.teacher)}">
            <div class="home-lesson-teacher-avatar" style="${avatarStyle}"></div>
            ${escH(teacherDisplayName)}
        </div>` : ""

    const metaChips = [
        lesson.lesson_type ? `<span class="home-lesson-type">${escH(lesson.lesson_type)}</span>` : "",
        lesson.classroom   ? `<span class="home-lesson-room">${escH(lesson.classroom)}</span>`   : "",
    ].join("")

    widget.innerHTML = `
        <div class="home-lesson-label" id="home-lesson-label">${
            type === "current" ? "Сейчас идёт" : "Следующая пара"
        }</div>
        <div class="home-lesson-row">
            <div class="home-lesson-subject">${escH(lesson.subject)}</div>
            <div class="home-lesson-time">
                <div class="home-lesson-time-start">${tStart || ""}</div>
                <div class="home-lesson-time-end">${tEnd || ""}</div>
            </div>
        </div>
        ${metaChips ? `<div class="home-lesson-meta">${metaChips}</div>` : ""}
        ${teacherHtml}
        <div class="home-countdown" id="home-countdown"></div>
    `

    if (lesson.teacher) {
        widget.querySelector(".home-lesson-teacher--clickable").addEventListener("click", () => {
            openTeacherSheet(lesson.teacher, lesson)
        })
    }

    return widget
}

// ══════════════════════════════════════════════════════════

function initHomeModule(user) {
    const part = document.querySelector(".screen[scr='homeboard'] .screen-part[src='home']")
    const dataEl = part.querySelector(".data")

    // ── Приветствие (заменяем titleBox) ──────────────

    const titleBox = dataEl.querySelector(".titleBox")
    const hour = new Date().getHours()
    const greeting = hour < 6  ? "Доброй ночи" :
                     hour < 12 ? "Доброе утро" :
                     hour < 18 ? "Добрый день" :
                                 "Добрый вечер"

    const greetingEl = document.createElement("div")
    greetingEl.className = "home-greeting"
    greetingEl.innerHTML = `
        <div class="home-greeting-time">${greeting}</div>
        <div class="home-greeting-name">${escH(user.lastname)}</div>
    `
    if (titleBox) titleBox.replaceWith(greetingEl)
    else dataEl.prepend(greetingEl)

    // ── Placeholder-элементы ──────────────────────────

    const lessonSection = document.createElement("div")
    lessonSection.id = "home-lesson-section"
    dataEl.appendChild(lessonSection)

    const scheduleBtn = document.createElement("div")
    scheduleBtn.className = "home-pill-btn"
    scheduleBtn.textContent = "Расписание на неделю"
    scheduleBtn.addEventListener("click", () => {
        const btn = document.querySelector(".screen[scr='homeboard'] .bottomMenu .item[tp='schedule']")
        if (btn) btn.click()
    })
    dataEl.appendChild(scheduleBtn)

    const newsTitleEl = document.createElement("div")
    newsTitleEl.className = "home-section-title"
    newsTitleEl.textContent = "Новости"
    dataEl.appendChild(newsTitleEl)

    const newsSection = document.createElement("div")
    newsSection.id = "home-news-section"
    newsSection.innerHTML = `<div class="diary-loading">Загрузка...</div>`
    dataEl.appendChild(newsSection)

    let countdownTimer = null

    // ── Загрузка данных ───────────────────────────────

    function refresh() {
        clearInterval(countdownTimer)
        loadLesson()
        loadNews()
    }

    async function loadLesson() {
        lessonSection.innerHTML = ""
        try {
            const s = await window.api.storageGet(["mode","faculty","group","teacher"])
            if (!s.mode) { showNoSchedule(); return }
            if (s.mode === "student" && (!s.faculty || !s.group)) { showNoSchedule(); return }

            let current = null, next = null

            if (s.mode === "student") {
                const data = await window.api.getCurrentLesson(s.faculty, s.group)
                current = data.current
                next    = data.next
            } else {
                const data = await window.api.getTeacherSchedule(s.teacher, 0)
                const lessons = data.schedule || []
                const now = new Date()
                const jsDay = now.getDay()
                const todayName = ["Воскресенье","Понедельник","Вторник","Среда","Четверг","Пятница","Суббота"][jsDay]

                for (const l of lessons) {
                    if (l.day !== todayName) continue
                    const time = l.time || HOME_LESSON_TIMES[l.number] || ""
                    const [t1, t2] = time.split("-")
                    const [h1,m1] = (t1||"").split(":").map(Number)
                    const [h2,m2] = (t2||"").split(":").map(Number)
                    const start = new Date(); start.setHours(h1,m1,0,0)
                    const end   = new Date(); end.setHours(h2,m2,0,0)
                    if (now >= start && now <= end) {
                        current = { ...l, ends_at: t2 }; break
                    }
                    if (now < start && !next) next = { ...l, starts_at: t1 }
                }
            }

            if (current) {
                renderLesson(current, "current")
                startCountdown(current, "current")
            } else if (next) {
                renderLesson(next, "next")
                startCountdown(next, "next")
            } else {
                renderNoPairs()
            }
        } catch (err) {
            lessonSection.innerHTML = ""
        }
    }

    function renderLesson(lesson, type) {
        const widget = buildHomeLessonWidget(lesson, type)
        lessonSection.innerHTML = ""
        lessonSection.appendChild(widget)
    }

    function startCountdown(lesson, type) {
        clearInterval(countdownTimer)
        const time = lesson.time || HOME_LESSON_TIMES[lesson.number] || ""
        const [t1, t2] = time.split("-")
        const targetTime = type === "current" ? t2 : t1
        if (!targetTime) return

        function update() {
            const el = document.getElementById("home-countdown")
            if (!el) { clearInterval(countdownTimer); return }

            const now = new Date()
            const [h, m] = targetTime.split(":").map(Number)
            const target = new Date(); target.setHours(h, m, 0, 0)
            const diff = Math.round((target - now) / 1000)

            if (diff <= 0) {
                clearInterval(countdownTimer)
                el.textContent = ""
                loadLesson()
                return
            }

            const mm = Math.floor(diff / 60)
            const ss = diff % 60
            el.textContent = type === "current"
                ? `Осталось ${mm}:${String(ss).padStart(2,"0")}`
                : `Начнётся через ${mm} мин ${ss} сек`
        }

        update()
        countdownTimer = setInterval(update, 1000)
    }

    function showNoSchedule() {
        lessonSection.innerHTML = `
            <div class="home-no-schedule">
                <div class="home-no-schedule-title">Расписание не настроено</div>
                <div class="home-no-schedule-sub">Перейдите в Меню → «Режим работы»</div>
            </div>
        `
    }

    function renderNoPairs() {
        lessonSection.innerHTML = `
            <div class="home-no-schedule">
                <div class="home-no-schedule-title">Сегодня пар нет</div>
                <div class="home-no-schedule-sub">Хорошего отдыха!</div>
            </div>
        `
    }

    async function loadNews() {
        newsSection.innerHTML = `<div class="diary-loading">Загрузка...</div>`
        try {
            const data = await window.api.getNewsList(1, 0)
            const items = data.news || []
            newsSection.innerHTML = ""

            if (items.length === 0) {
                newsSection.innerHTML = `<div class="diary-loading">Новостей пока нет</div>`
                return
            }

            const news = items[0]
            const d = news.published_at
                ? new Date(news.published_at * 1000).toLocaleDateString("ru-RU", {
                    day: "numeric", month: "short", year: "numeric"
                  })
                : ""

            const card = document.createElement("div")
            card.className = "home-news-card"
            card.innerHTML = `
                ${news.cover_url ? `<img src="${escH(news.cover_url)}" style="width:100%;border-radius:10px;max-height:140px;object-fit:cover;margin-bottom:8px">` : ""}
                <div class="home-news-title">${escH(news.title)}</div>
                ${news.preview_text ? `<div class="home-news-preview">${escH(news.preview_text)}</div>` : ""}
                <div class="home-news-footer">
                    <div class="home-news-read">Читать далее →</div>
                    <div class="home-news-date">${d}</div>
                </div>
            `
            card.addEventListener("click", () => openNewsModal(news.id))
            newsSection.appendChild(card)

            if (data.total > 1) {
                const allBtn = document.createElement("div")
                allBtn.className = "home-pill-btn secondary"
                allBtn.textContent = `Все новости (${data.total})`
                allBtn.addEventListener("click", () => openAllNews())
                newsSection.appendChild(allBtn)
            }
        } catch {
            newsSection.innerHTML = `<div class="diary-loading">Не удалось загрузить</div>`
        }
    }

    // ── Просмотр новости (full screen) ───────────────────

    function openNewsModal(id) {
        const reader = document.createElement("div")
        reader.className = "news-reader-screen"
        reader.innerHTML = `
            <div class="module-nav">
                <div class="module-back" id="nr-back-${id}"></div>
                <div class="module-title">Новость</div>
            </div>
            <div class="news-reader-body" id="nr-body-${id}">
                <div class="diary-loading">Загрузка...</div>
            </div>
        `
        document.body.appendChild(reader)

        reader.querySelector(`#nr-back-${id}`).addEventListener("click", () => {
            reader.style.transform = "translateX(100%)"
            setTimeout(() => reader.remove(), 320)
        })

        requestAnimationFrame(() => requestAnimationFrame(() => {
            reader.style.transform = "translateX(0)"
        }))

        window.api.getNews(id).then(news => {
            const body = reader.querySelector(`#nr-body-${id}`)
            const d = news.published_at
                ? new Date(news.published_at * 1000).toLocaleDateString("ru-RU", {
                    day: "numeric", month: "long", year: "numeric"
                  })
                : ""
            body.innerHTML = `
                ${news.cover_url ? `<img src="${escH(news.cover_url)}" class="nr-cover">` : ""}
                <div class="nr-meta-date">${d}</div>
                <div class="nr-title">${escH(news.title)}</div>
                <div class="nr-author">${escH(news.author_name || "")}</div>
                <div class="nr-content"></div>
            `
            body.querySelector(".nr-content").innerHTML = news.content || escH(news.preview_text || "")
        }).catch(() => {
            reader.querySelector(`#nr-body-${id}`).innerHTML =
                `<div class="diary-loading">Ошибка загрузки</div>`
        })
    }

    function openAllNews() {
        const reader = document.createElement("div")
        reader.className = "news-reader-screen"
        reader.innerHTML = `
            <div class="module-nav">
                <div class="module-back" id="nr-all-back"></div>
                <div class="module-title">Все новости</div>
            </div>
            <div class="news-reader-body" id="nr-all-body">
                <div class="diary-loading">Загрузка...</div>
            </div>
        `
        document.body.appendChild(reader)

        reader.querySelector("#nr-all-back").addEventListener("click", () => {
            reader.style.transform = "translateX(100%)"
            setTimeout(() => reader.remove(), 320)
        })

        requestAnimationFrame(() => requestAnimationFrame(() => {
            reader.style.transform = "translateX(0)"
        }))

        window.api.getNewsList(20, 0).then(data => {
            const list = reader.querySelector("#nr-all-body")
            list.innerHTML = ""
            ;(data.news || []).forEach(news => {
                const item = document.createElement("div")
                item.className = "home-news-card"
                item.style.background = "var(--bg-card)"
                const d = news.published_at
                    ? new Date(news.published_at * 1000).toLocaleDateString("ru-RU", { day:"numeric", month:"short" })
                    : ""
                item.innerHTML = `
                    <div class="home-news-title">${escH(news.title)}</div>
                    ${news.preview_text ? `<div class="home-news-preview">${escH(news.preview_text)}</div>` : ""}
                    <div class="home-news-footer">
                        <div class="home-news-read">Читать</div>
                        <div class="home-news-date">${d}</div>
                    </div>
                `
                item.addEventListener("click", () => openNewsModal(news.id))
                list.appendChild(item)
            })
            if (!data.news?.length) {
                list.innerHTML = `<div class="diary-loading">Новостей нет</div>`
            }
        }).catch(() => {
            reader.querySelector("#nr-all-body").innerHTML = `<div class="diary-loading">Ошибка</div>`
        })
    }

    // Хук — обновлять при переключении на вкладку home
    window.app.homeModule = { onShow: refresh }

    // Первичная загрузка
    refresh()
}
