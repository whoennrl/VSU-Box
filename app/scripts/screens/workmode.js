function initWorkmodeModule(user) {
    const app = new MiniApp("system-workmode", "1.0.0", "system")
    app.addMenuButton("./assets/person.and.background.dotted.png", "Режим работы")

    app.setContent(`
        <div class="module-nav">
            <div class="module-back" id="wm-back"></div>
            <div class="module-title">Режим работы</div>
        </div>
        <div class="module-body">

            <div class="module-label">Выберите режим</div>
            <div class="module-mode-row">
                <div class="module-mode-btn" id="wm-btn-student" data-mode="student">
                    <div class="mode-icon" style="mask-image:url(./assets/person.and.background.dotted.png)"></div>
                    <div class="mode-label">Студент</div>
                </div>
                <div class="module-mode-btn" id="wm-btn-teacher" data-mode="teacher">
                    <div class="mode-icon" style="mask-image:url(./assets/person.2.badge.gearshape.png)"></div>
                    <div class="mode-label">Преподаватель</div>
                </div>
            </div>

            <div id="wm-student-fields" style="display:none;flex-direction:column;gap:12px">
                <div class="module-label">Факультет</div>
                <select class="module-select" id="wm-faculty">
                    <option value="">Выберите факультет...</option>
                </select>
                <div class="module-label">Группа</div>
                <select class="module-select" id="wm-group" disabled>
                    <option value="">Сначала выберите факультет</option>
                </select>
            </div>

            <div id="wm-teacher-fields" style="display:none;flex-direction:column;gap:12px">
                <div class="module-label">ФИО преподавателя</div>
                <input class="module-input" id="wm-teacher-name" type="text"
                    placeholder="Фамилия И.О. (как в расписании)">
                <div style="font-size:13px;color:rgba(0,0,0,0.4);padding-left:4px">
                    Введите точное написание, как оно отображается в расписании
                </div>
            </div>

            <div class="module-btn primary" id="wm-save">Сохранить</div>

        </div>
    `)

    const back       = app.$("#wm-back")
    const btnStudent = app.$("#wm-btn-student")
    const btnTeacher = app.$("#wm-btn-teacher")
    const sfFields   = app.$("#wm-student-fields")
    const tfFields   = app.$("#wm-teacher-fields")
    const facultySel = app.$("#wm-faculty")
    const groupSel   = app.$("#wm-group")
    const teacherInp = app.$("#wm-teacher-name")
    const saveBtn    = app.$("#wm-save")

    let currentMode = null

    back.addEventListener("click", () => app.closeScreen())

    function selectMode(mode) {
        currentMode = mode
        btnStudent.classList.toggle("active", mode === "student")
        btnTeacher.classList.toggle("active", mode === "teacher")

        sfFields.style.display = mode === "student" ? "flex" : "none"
        tfFields.style.display = mode === "teacher" ? "flex" : "none"

        if (mode === "student" && facultySel.options.length <= 1) {
            loadFaculties(null, null)
        }
    }

    btnStudent.addEventListener("click", () => selectMode("student"))
    btnTeacher.addEventListener("click", () => selectMode("teacher"))

    function loadFaculties(selectedFaculty, selectedGroup) {
        facultySel.innerHTML = '<option value="">Загрузка...</option>'
        facultySel.disabled = true
        window.api.getFaculties().then(data => {
            const faculties = data.faculties || []
            facultySel.innerHTML = '<option value="">Выберите факультет...</option>'
            facultySel.disabled = false
            faculties.forEach(f => {
                const opt = document.createElement("option")
                opt.value = f.name
                opt.textContent = f.name
                facultySel.appendChild(opt)
            })
            if (selectedFaculty) {
                facultySel.value = selectedFaculty
                loadGroups(selectedFaculty, selectedGroup)
            }
        }).catch(() => {
            facultySel.innerHTML = '<option value="">Ошибка загрузки</option>'
            facultySel.disabled = false
        })
    }

    function loadGroups(facultyName, selectedGroup) {
        groupSel.disabled = true
        groupSel.innerHTML = '<option value="">Загрузка...</option>'
        window.api.getGroups(facultyName).then(data => {
            const groups = data.groups || []
            groupSel.disabled = false
            groupSel.innerHTML = '<option value="">Выберите группу...</option>'
            groups.forEach(g => {
                const opt = document.createElement("option")
                opt.value = g.name
                opt.textContent = g.name
                groupSel.appendChild(opt)
            })
            if (selectedGroup) groupSel.value = selectedGroup
        }).catch(() => {
            groupSel.innerHTML = '<option value="">Ошибка загрузки</option>'
            groupSel.disabled = false
        })
    }

    facultySel.addEventListener("change", () => {
        if (facultySel.value) {
            loadGroups(facultySel.value, null)
        } else {
            groupSel.innerHTML = '<option value="">Сначала выберите факультет</option>'
            groupSel.disabled = true
        }
    })

    async function save() {
        if (!currentMode) { alert("Выберите режим"); return }

        if (currentMode === "student") {
            if (!facultySel.value) { alert("Выберите факультет"); return }
            if (!groupSel.value)   { alert("Выберите группу"); return }
        } else {
            if (!teacherInp.value.trim()) { alert("Введите ФИО преподавателя"); return }
        }

        saveBtn.textContent = "Сохранение..."
        saveBtn.style.opacity = "0.7"
        saveBtn.style.pointerEvents = "none"

        try {
            await window.api.storageSet("mode", currentMode)
            if (currentMode === "student") {
                await window.api.storageSet("faculty", facultySel.value)
                await window.api.storageSet("group",   groupSel.value)
                await window.api.storageDelete("teacher")
            } else {
                await window.api.storageSet("teacher", teacherInp.value.trim())
                await window.api.storageDelete("faculty")
                await window.api.storageDelete("group")
            }

            saveBtn.textContent = "Сохранено ✓"
            saveBtn.classList.replace("primary", "success")
            setTimeout(() => {
                saveBtn.textContent = "Сохранить"
                saveBtn.classList.replace("success", "primary")
                saveBtn.style.opacity = ""
                saveBtn.style.pointerEvents = ""
                app.closeScreen()
            }, 900)
        } catch (e) {
            alert("Ошибка: " + e.message)
            saveBtn.textContent = "Сохранить"
            saveBtn.style.opacity = ""
            saveBtn.style.pointerEvents = ""
        }
    }
    saveBtn.addEventListener("click", save)

    const origOpen = app.openScreen.bind(app)
    app.openScreen = function() {
        origOpen()
        window.api.storageGet(["mode", "faculty", "group", "teacher"]).then(data => {
            if (data.mode) selectMode(data.mode)
            if (data.mode === "teacher" && data.teacher) teacherInp.value = data.teacher
            if (data.mode === "student") loadFaculties(data.faculty || null, data.group || null)
        }).catch(() => {})
    }

    return app
}
