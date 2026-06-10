const LESSON_TIMES_JS = {
    1:"08:00-09:25", 2:"09:35-11:00", 3:"11:30-12:55",
    4:"13:05-14:30", 5:"14:40-16:05", 6:"16:35-18:00",
    7:"18:10-19:35", 8:"19:45-21:10"
}

const SCH_DAY_NAMES  = ["Понедельник","Вторник","Среда","Четверг","Пятница","Суббота"]
const SCH_BTN_LABELS = ["Пн","Вт","Ср","Чт","Пт","Сб"]

function escSch(str) {
    if (!str) return ""
    return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
}

// ══════════════════════════════════════════════════════════
// buildSchCard — карточка одной пары в расписании
// lesson       — объект пары из API
// isCurrentWeek — true если смотрим текущую неделю
//                 (нужно для индикаторов «Идёт сейчас»)
// ══════════════════════════════════════════════════════════
function buildSchCard(lesson, isCurrentWeek) {
    const card = document.createElement("div")
    card.className = "sch-card"

    const timeStr = lesson.time || LESSON_TIMES_JS[lesson.number] || ""
    const [tStart, tEnd] = timeStr.split("-")

    let groupsHtml = ""
    if (lesson.mains && lesson.mains.length > 0) {
        groupsHtml = `<span class="sch-chip sch-chip--group">${escSch(lesson.mains.join(", "))}</span>`
    } else if (lesson.combined_main_groups && lesson.combined_main_groups.length > 0) {
        groupsHtml = `<span class="sch-chip sch-chip--group">${escSch(lesson.combined_main_groups.join(", "))}</span>`
    }

    const typeHtml = lesson.lesson_type
        ? `<span class="sch-chip sch-chip--type">${escSch(lesson.lesson_type)}</span>`
        : ""
    const roomHtml = lesson.classroom
        ? `<span class="sch-chip sch-chip--room">${escSch(lesson.classroom)}</span>`
        : ""

    const teacherDisplayName = lesson.teacher_full_name || lesson.teacher
    const teacherHtml = lesson.teacher ? `
        <div class="sch-teacher sch-teacher--clickable" data-teacher="${escSch(lesson.teacher)}">
            ${lesson.teacher_photo
                ? `<img class="sch-teacher-avatar" src="${escSch(lesson.teacher_photo)}" alt="">`
                : `<div class="sch-teacher-avatar sch-teacher-avatar--initials">${escSch((teacherDisplayName||"?")[0].toUpperCase())}</div>`}
            <span>${escSch(teacherDisplayName)}</span>
        </div>` : ""

    card.innerHTML = `
        <div class="sch-num-col">
            <div class="sch-num">${lesson.number || "?"}</div>
            <div class="sch-time-start">${tStart || ""}</div>
            <div class="sch-time-end">${tEnd || ""}</div>
        </div>
        <div class="sch-body">
            <div class="sch-subject">${escSch(lesson.subject)}</div>
            ${teacherHtml}
            <div class="sch-chips">${roomHtml}${typeHtml}${groupsHtml}</div>
        </div>
    `

    if (lesson.teacher) {
        card.querySelector(".sch-teacher--clickable").addEventListener("click", e => {
            e.stopPropagation()
            openTeacherSheet(lesson.teacher, lesson)
        })
    }

    if (isCurrentWeek) {
        const jsDay = new Date().getDay()
        const todayName = jsDay === 0 ? null : SCH_DAY_NAMES[jsDay - 1]
        if (todayName && lesson.day === todayName) {
            const now = new Date()
            //const now = new Date(2026, 5, 10, 9, 50, 0, 0)
            const [h1, m1] = (tStart || "").split(":").map(Number)
            const [h2, m2] = (tEnd   || "").split(":").map(Number)
            const st = new Date(); st.setHours(h1, m1, 0, 0)
            const en = new Date(); en.setHours(h2, m2, 0, 0)
            if (!isNaN(st) && now >= st && now <= en) {
                card.classList.add("current")
                const lbl = document.createElement("div")
                lbl.className = "sch-status-label"
                lbl.textContent = "Идёт сейчас"
                card.querySelector(".sch-body").prepend(lbl)
            }
        }
    }

    return card
}

// Метка «Следующая» на карточке
function markSchNextCard(card) {
    card.classList.add("next")
    const lbl = document.createElement("div")
    lbl.className = "sch-status-label"
    lbl.textContent = "Следующая"
    card.querySelector(".sch-body").prepend(lbl)
}

// ══════════════════════════════════════════════════════════

function initScheduleModule(user) {
    const part       = document.querySelector(".screen[scr='homeboard'] .screen-part[src='schedule']")
    const scheduleEl = part.querySelector(".dataI .schedule")
    const topEl      = part.querySelector(".top")
    const titleEl    = part.querySelector(".title")

    // ── Week navigation bar ───────────────────────────────
    const weekNavEl = document.createElement("div")
    weekNavEl.className = "sch-week-nav"
    weekNavEl.innerHTML = `
        <button class="sch-week-btn sch-week-prev" aria-label="Предыдущая неделя"><div class="sch-week-btn-icon"></div></button>
        <span class="sch-week-label">Эта неделя</span>
        <button class="sch-week-btn sch-week-next" aria-label="Следующая неделя"><div class="sch-week-btn-icon"></div></button>
    `
    titleEl.before(weekNavEl)
    const prevBtn     = weekNavEl.querySelector(".sch-week-prev")
    const nextBtn     = weekNavEl.querySelector(".sch-week-next")
    const weekLabelEl = weekNavEl.querySelector(".sch-week-label")

    // Вставляем баннер «следующая неделя» сразу после заголовка
    const nextWeekBanner = document.createElement("div")
    nextWeekBanner.className = "sch-next-week-banner"
    nextWeekBanner.style.display = "none"
    nextWeekBanner.textContent = "На текущей неделе пар нет — показана следующая"
    titleEl.after(nextWeekBanner)

    // Пересобираем кнопки дней
    topEl.innerHTML = SCH_BTN_LABELS.map((lbl, i) =>
        `<div class="btn" data-idx="${i}">${lbl}</div>`
    ).join("")
    const dayBtns = topEl.querySelectorAll(".btn")

    const jsDay    = new Date().getDay()
    const todayIdx = jsDay === 0 ? -1 : jsDay - 1
    const initialIdx = todayIdx >= 0 ? todayIdx : 0

    let currentDayIdx  = initialIdx
    let weekSchedule   = null
    let isLoaded       = false
    let weekMondayDate = null
    let weekOffset     = 0
    let isAutoJumped   = false
    const MAX_WEEK_OFFSET = 1

    if (todayIdx >= 0) dayBtns[todayIdx].classList.add("today")

    dayBtns.forEach(btn => {
        btn.addEventListener("click", () => selectDay(parseInt(btn.dataset.idx)))
    })

    prevBtn.addEventListener("click", () => {
        weekOffset--
        isAutoJumped = false
        weekSchedule = null
        weekMondayDate = null
        isLoaded = false
        updateNavButtons()
        load()
    })

    nextBtn.addEventListener("click", () => {
        if (weekOffset >= MAX_WEEK_OFFSET) return
        weekOffset++
        isAutoJumped = false
        weekSchedule = null
        weekMondayDate = null
        isLoaded = false
        updateNavButtons()
        load()
    })

    function isDesktop() { return window.innerWidth >= 760 }

    function updateNavButtons() {
        nextBtn.disabled = weekOffset >= MAX_WEEK_OFFSET
    }

    function selectDay(idx) {
        currentDayIdx = idx
        dayBtns.forEach((b, i) => b.classList.toggle("active", i === idx))
        if (weekSchedule !== null) {
            if (isDesktop()) renderDesktopGrid()
            else renderDay(idx)
        }
        if (isDesktop()) updateTitleDesktop()
        else updateTitle(idx)
    }

    function updateWeekLabel() {
        const months = ["янв","фев","мар","апр","мая","июн","июл","авг","сен","окт","ноя","дек"]
        if (weekMondayDate) {
            const sat = new Date(weekMondayDate.getTime() + 5 * 86400000)
            weekLabelEl.textContent = `${weekMondayDate.getDate()} ${months[weekMondayDate.getMonth()]} – ${sat.getDate()} ${months[sat.getMonth()]}`
        } else if (weekOffset === 0)  { weekLabelEl.textContent = "Эта неделя" }
          else if (weekOffset === 1)  { weekLabelEl.textContent = "Следующая неделя" }
          else if (weekOffset === -1) { weekLabelEl.textContent = "Прошлая неделя" }
          else { weekLabelEl.textContent = weekOffset > 0 ? `+${weekOffset} нед.` : `${weekOffset} нед.` }
    }

    function updateTitle(dayIdx) {
        const months = ["янв","фев","мар","апр","мая","июн","июл","авг","сен","окт","ноя","дек"]
        if (weekMondayDate) {
            const d = new Date(weekMondayDate.getTime() + dayIdx * 86400000)
            titleEl.textContent = `${SCH_BTN_LABELS[dayIdx]}, ${d.getDate()} ${months[d.getMonth()]}`
        } else {
            titleEl.textContent = `Расписание · ${SCH_DAY_NAMES[dayIdx]}`
        }
        updateWeekLabel()
        nextWeekBanner.style.display = isAutoJumped ? "" : "none"
    }

    function updateTitleDesktop() {
        updateWeekLabel()
        nextWeekBanner.style.display = isAutoJumped ? "" : "none"
    }

    // ── Загрузка расписания ───────────────────────────────

    function load() {
        window.api.storageGet(["mode","faculty","group","teacher"]).then(s => {
            if (!s.mode) { showNotConfigured(); return }
            if (s.mode === "student" && (!s.faculty || !s.group)) { showNotConfigured(); return }
            if (s.mode === "teacher" && !s.teacher) { showNotConfigured(); return }

            showLoading()
            updateWeekLabel()

            const req = s.mode === "teacher"
                ? window.api.getTeacherSchedule(s.teacher, weekOffset)
                : window.api.getWeek(s.faculty, s.group, weekOffset)

            req.then(data => {
                weekSchedule = data.schedule || []
                isLoaded = true
                if (data.week_info?.monday) {
                    weekMondayDate = new Date(data.week_info.monday + "T00:00:00")
                }

                if (weekSchedule.length === 0 && weekOffset === 0) {
                    isAutoJumped = true
                    weekOffset = 1
                    weekMondayDate = null
                    updateNavButtons()
                    load()
                    return
                }

                updateWeekLabel()
                selectDay(currentDayIdx)
            }).catch(err => {
                scheduleEl.innerHTML = `<div class="schBox none-pairs">
                    <div class="titleS">Ошибка загрузки</div>
                    <div class="text">${escSch(err.message || "Попробуйте позже")}</div>
                </div>`
            })
        }).catch(() => showNotConfigured())
    }

    // ── Рендер дня ────────────────────────────────────────

    function renderDay(idx) {
        const dayName = SCH_DAY_NAMES[idx]
        const lessons = (weekSchedule || [])
            .filter(l => l.day === dayName)
            .sort((a, b) => (a.number || 0) - (b.number || 0))

        if (lessons.length === 0) {
            const dname = ["понедельник", "вторник", "среду", "четверг", "пятницу", "субботу"][idx]
            scheduleEl.innerHTML = `<div class="schBox none-pairs">
                <div class="titleS">Нет пар</div>
                <div class="text">В ${dname.toLowerCase()} занятий нет</div>
            </div>`
            return
        }

        scheduleEl.innerHTML = ""
        lessons.forEach(lesson => scheduleEl.appendChild(buildSchCard(lesson, weekOffset === 0)))

        if (weekOffset === 0) {
            const jsDay = new Date().getDay()
            const todayName = jsDay === 0 ? null : SCH_DAY_NAMES[jsDay - 1]
            if (todayName && dayName === todayName) {
                const now = new Date()
                const cards = [...scheduleEl.querySelectorAll(".sch-card")]
                let nextFound = false
                lessons.forEach((lesson, i) => {
                    if (nextFound || cards[i]?.classList.contains("current")) return
                    const timeStr = lesson.time || LESSON_TIMES_JS[lesson.number] || ""
                    const [tStart] = timeStr.split("-")
                    const [h, m] = (tStart || "").split(":").map(Number)
                    if (!isNaN(h)) {
                        const st = new Date(); st.setHours(h, m, 0, 0)
                        if (now < st) { markSchNextCard(cards[i]); nextFound = true }
                    }
                })
            }
        }
    }

    function renderDesktopGrid() {
        const now = new Date()
        const months = ["янв","фев","мар","апр","мая","июн","июл","авг","сен","окт","ноя","дек"]
        const grid = document.createElement("div")
        grid.className = "sch-desktop-grid"

        let hasAny = false
        SCH_DAY_NAMES.forEach((dayName, idx) => {
            const lessons = (weekSchedule || [])
                .filter(l => l.day === dayName)
                .sort((a, b) => (a.number || 0) - (b.number || 0))
            if (lessons.length === 0) return
            hasAny = true

            const isToday = idx === todayIdx && weekOffset === 0
            const col = document.createElement("div")
            col.className = "sch-grid-col" + (isToday ? " sch-grid-col--today" : "")

            const dateStr = weekMondayDate
                ? (() => { const d = new Date(weekMondayDate.getTime() + idx * 86400000); return `, ${d.getDate()} ${months[d.getMonth()]}` })()
                : ""
            const header = document.createElement("div")
            header.className = "sch-grid-day-header"
            header.textContent = SCH_BTN_LABELS[idx] + dateStr
            col.appendChild(header)

            let nextFound = false
            lessons.forEach(lesson => {
                const card = buildSchCard(lesson, weekOffset === 0)
                if (isToday && !nextFound && !card.classList.contains("current")) {
                    const timeStr = lesson.time || LESSON_TIMES_JS[lesson.number] || ""
                    const [tStart] = timeStr.split("-")
                    const [h, m] = (tStart || "").split(":").map(Number)
                    if (!isNaN(h)) {
                        const st = new Date(); st.setHours(h, m, 0, 0)
                        if (now < st) { markSchNextCard(card); nextFound = true }
                    }
                }
                col.appendChild(card)
            })
            grid.appendChild(col)
        })

        if (!hasAny) {
            scheduleEl.innerHTML = `<div class="schBox none-pairs"><div class="titleS">Нет пар</div><div class="text">На этой неделе занятий нет</div></div>`
            return
        }
        scheduleEl.innerHTML = ""
        scheduleEl.appendChild(grid)
    }

    // ── Утилиты ───────────────────────────────────────────

    function showLoading() {
        scheduleEl.innerHTML = `<div class="schBox loading"><div class="loading_anim"></div></div>`
    }

    function showNotConfigured() {
        scheduleEl.innerHTML = `<div class="schBox none-pairs">
            <div class="titleS">Расписание не настроено</div>
            <div class="text">Перейдите в Меню → «Режим работы» и укажите группу или преподавателя</div>
        </div>`
    }

    updateNavButtons()
    selectDay(initialIdx)

    window.app.scheduleModule = {
        onShow: () => { if (!isLoaded) load() },
        reload: () => {
            isLoaded = false; weekSchedule = null; weekOffset = 0
            isAutoJumped = false; weekMondayDate = null
            updateNavButtons(); updateWeekLabel(); load()
        }
    }
}
