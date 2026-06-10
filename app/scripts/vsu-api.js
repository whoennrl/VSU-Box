/**
 * @typedef {Object} VSUConfig
 * @property {string} baseUrl - URL к index.php (например, 'https://vsu-box.whoennrl.ru')
 * @property {string} [secret] - Секрет для cron-эндпоинтов (PARSER_SECRET)
 * @property {string} [accessToken] - Сохранённый access_token
 * @property {string} [refreshToken] - Сохранённый refresh_token
 * @property {Function} [onTokenUpdate] - Коллбек при обновлении токенов (newAccess, newRefresh)
 * @property {Function} [onLogout] - Коллбек при выходе/отзыве сессии
 */

/**
 * @class VSUApi
 * @description Клиент для API расписания ВГУ v4.0
 */
class VSUApi {
  /** @param {VSUConfig} config */
  constructor(config) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.secret = config.secret || null;
    this.accessToken = config.accessToken || null;
    this.refreshToken = config.refreshToken || null;
    this.onTokenUpdate = config.onTokenUpdate || (() => {});
    this.onLogout = config.onLogout || (() => {});
    this._isRefreshing = false;
    this._refreshQueue = [];
  }

  /**
   * Базовый метод запроса
   * @param {string} type 
   * @param {Object} params 
   * @param {Object} [options] 
   * @param {'GET'|'POST'} [options.method='POST']
   * @param {boolean} [options.skipAuth=false]
   */
  async _request(type, params = {}, options = {}) {
    const method = options.method || 'POST';
    const headers = {};
    if (!options.skipAuth) headers['Content-Type'] = 'application/json';

    let url = `${this.baseUrl}/index.php`;
    let body = undefined;

    if (method === 'POST') {
      body = JSON.stringify({ type, ...params, secret: this.secret });
    } else {
      const query = new URLSearchParams({ type, ...params, secret: this.secret });
      url += `?${query.toString()}`;
    }

    if (this.accessToken) headers['Authorization'] = `Bearer ${this.accessToken}`;

    let res = await fetch(url, { method, headers, body });

    // Автоматическое обновление токена при 401
    if (res.status === 401 && this.refreshToken && !options.skipAuth) {
      try { await this._refreshToken(); } catch (e) { this._handleLogout(); throw e; }
      if (this.accessToken) headers['Authorization'] = `Bearer ${this.accessToken}`;
      res = await fetch(url, { method, headers, body });
    }

    const data = await res.json();
    if (data.error) throw new VSUApiError(data.error, res.status);
    return data;
  }

  async _refreshToken() {
    if (this._isRefreshing) {
      return new Promise((resolve, reject) => this._refreshQueue.push({ resolve, reject }));
    }
    this._isRefreshing = true;
    try {
      const res = await this._request('refresh', { refresh_token: this.refreshToken }, { skipAuth: true });
      this.accessToken = res.access_token;
      this.onTokenUpdate(res.access_token, this.refreshToken);
      this._refreshQueue.forEach(cb => cb.resolve(res));
    } catch (err) {
      this._refreshQueue.forEach(cb => cb.reject(err));
      throw err;
    } finally {
      this._isRefreshing = false;
      this._refreshQueue = [];
    }
  }

  _handleLogout() {
    this.accessToken = null;
    this.refreshToken = null;
    this.onLogout();
  }

  // ================= AUTH =================
  async login(username, password, device = {}) {
    const data = await this._request('login', {
      username: username.trim(),
      password,
      device_name: device.name || navigator.userAgent.slice(0, 100),
      device_type: device.type || 'web'
    });
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    this.onTokenUpdate(data.access_token, data.refresh_token);
    return data;
  }

  async verify2fa(username, code, device = {}) {
    const data = await this._request('verify_2fa', {
      username: username.trim(),
      code,
      device_name: device.name || navigator.userAgent.slice(0, 100),
      device_type: device.type || 'web'
    });
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    this.onTokenUpdate(data.access_token, data.refresh_token);
    return data;
  }

  async logout() {
    if (this.refreshToken) {
      await this._request('logout', { refresh_token: this.refreshToken });
    }
    this._handleLogout();
  }

  // ================= 2FA =================
  enable2fa() { return this._request('enable_2fa'); }
  confirm2fa(code) { return this._request('confirm_2fa', { code }); }
  disable2fa(password) { return this._request('disable_2fa', { password }); }

  // ================= PUBLIC CONFIG =================
  appConfig() { return this._request('app_config', {}, { skipAuth: true }); }

  // ================= USER & SESSIONS =================
  me() { return this._request('me'); }
  getSessions() { return this._request('sessions'); }
  revokeSession(sessionId) { return this._request('revoke_session', { session_id: sessionId }); }
  revokeAllSessions() { return this._request('revoke_all_sessions', { refresh_token: this.refreshToken }); }

  // ================= PUSH & NOTIFY =================
  pushSubscribe(subscription) {
    return this._request('push_subscribe', {
      refresh_token: this.refreshToken,
      subscription: typeof subscription === 'string' ? subscription : JSON.stringify(subscription)
    });
  }
  pushUnsubscribe() { return this._request('push_unsubscribe', { refresh_token: this.refreshToken }); }
  notifySubscribe(faculty, group, minBefore = 15) {
    return this._request('notify_subscribe', { faculty, group, min_before: minBefore });
  }
  notifyUnsubscribe(group) { return this._request('notify_unsubscribe', { group }); }
  notifyList() { return this._request('notify_list'); }

  // ================= SCHEDULE =================
  getFaculties() { return this._request('get_faculties'); }
  getGroups(faculty) { return this._request('get_groups', { faculty }); }
  getWeek(faculty, group, weekOffset = 0) {
    return this._request('get_week', { faculty, group, week_offset: weekOffset });
  }
  getDay(faculty, group, day) { return this._request('get_day', { faculty, group, day }); }
  getDate(faculty, group, date) { return this._request('get_date', { faculty, group, date }); }
  getCurrentLesson(faculty, group) { return this._request('get_current_lesson', { faculty, group }); }
  getHistory(faculty, group, date) { return this._request('get_history', { faculty, group, date }); }

  // ================= CLASSROOMS =================
  getClassroomStatus(classroom, date, lessonNum) {
    const params = { classroom };
    if (date) params.date = date;
    if (lessonNum) params.lesson_num = lessonNum;
    return this._request('classroom_status', params);
  }
  getClassroomSchedule(classroom, date) {
    const params = { classroom };
    if (date) params.date = date;
    return this._request('classroom_schedule', params);
  }
  getFreeClassrooms(date, lessonNum) {
    return this._request('free_classrooms', { date, lesson_num: lessonNum });
  }

  // ================= TEACHERS =================
  getTeachers() { return this._request('get_teachers'); }
  getTeacherInfo(teacher) { return this._request('get_teacher_info', { teacher }); }
  getTeacherSchedule(teacher, weekOffset = 0) {
    return this._request('get_teacher_schedule', { teacher, week_offset: weekOffset });
  }

  // ================= NEWS =================
  getNewsList(limit = 20, offset = 0) { return this._request('news_list', { limit, offset }); }
  getNews(id) { return this._request('news_get', { id }); }
  saveNews(data) { return this._request('news_save', data); }
  deleteNews(id) { return this._request('news_delete', { id }); }
  uploadMedia(contentBase64, filename, newsId = null) {
    return this._request('news_upload_media', { content_base64: contentBase64, filename, news_id: newsId });
  }

  // ================= STORAGE =================
  storageSet(key, value) { return this._request('storage_set', { key, value }); }
  storageGet(key) {
    if (Array.isArray(key)) return this._request('storage_get', { keys: key });
    return this._request('storage_get', { key });
  }
  storageDelete(key) { return this._request('storage_delete', { key }); }
  storageKeys() { return this._request('storage_keys'); }

  // ================= STORE & ADDONS =================
  storeList(search = '') { return this._request('store_list', search ? { search } : {}); }
  storeInstall(addonId) { return this._request('store_install', { addon_id: addonId }); }
  storeToggle(addonId, isActive = true) { return this._request('store_toggle', { addon_id: addonId, is_active: isActive }); }
  storeUninstall(addonId) { return this._request('store_uninstall', { addon_id: addonId }); }
  storeMyAddons() { return this._request('store_my_addons'); }
  storeAddonFile(addonId, path) { return this._request('store_addon_file', { addon_id: addonId, path }); }

  // ================= ADDON FILESYSTEM =================
  addonFsList(addonId, path = '')  { return this._request('addon_fs_list',   { addon_id: addonId, path }); }
  addonFsRead(addonId, path)       { return this._request('addon_fs_read',   { addon_id: addonId, path }); }
  addonFsWrite(addonId, path, content) { return this._request('addon_fs_write', { addon_id: addonId, path, content }); }
  addonFsDelete(addonId, path)     { return this._request('addon_fs_delete', { addon_id: addonId, path }); }
  addonFsInfo(addonId)             { return this._request('addon_fs_info',   { addon_id: addonId }); }

  // ================= ADMIN & DEV =================
  adminUsers() { return this._request('admin_users'); }
  adminBan(userId) { return this._request('admin_ban', { user_id: userId }); }
  adminUnban(userId) { return this._request('admin_unban', { user_id: userId }); }
  adminGrantDeveloper(userId) { return this._request('admin_grant_developer', { user_id: userId }); }
  adminRevokeDeveloper(userId) { return this._request('admin_revoke_developer', { user_id: userId }); }
  adminBroadcast(title, body, options = {}) {
    return this._request('admin_broadcast', { title, body, ...options });
  }
  stats() { return this._request('stats'); }

  // Dev Addons
  devAddonSave(data) { return this._request('dev_addon_save', data); }
  devAddonSubmit(addonId) { return this._request('dev_addon_submit', { addon_id: addonId }); }
  devMyAddons() { return this._request('dev_my_addons'); }

  // ================= DEV FILES =================
  devFileList(addonId) { return this._request('dev_file_list', { addon_id: addonId }); }
  devFileGet(addonId, path) { return this._request('dev_file_get', { addon_id: addonId, path }); }
  devFileSave(addonId, path, content) { return this._request('dev_file_save', { addon_id: addonId, path, content }); }
  devFileDelete(addonId, path) { return this._request('dev_file_delete', { addon_id: addonId, path }); }
  devFileUpload(addonId, path, contentBase64) { return this._request('dev_file_upload', { addon_id: addonId, path, content_base64: contentBase64 }); }
  adminAddonsPending() { return this._request('admin_addons_pending'); }
  adminAddonsAll(status = null) { return this._request('admin_addons_all', status ? { status } : {}); }
  adminAddonFiles(addonId) { return this._request('admin_addon_files', { addon_id: addonId }); }
  adminAddonDelete(addonId) { return this._request('admin_addon_delete', { addon_id: addonId }); }
  adminNewsList(limit = 50, offset = 0) { return this._request('admin_news_list', { limit, offset }); }
  adminNewsGet(id) { return this._request('admin_news_get', { id }); }
  adminAddonReview(addonId, action, reason = '') {
    return this._request('admin_addon_review', { addon_id: addonId, action, reason });
  }
  adminSetTeacher(data) { return this._request('admin_set_teacher', data); }
  adminDeleteTeacher(name) { return this._request('admin_delete_teacher', { name }); }

  // ================= EMOJI =================
  emojiList() { return this._request('emoji_list'); }
  emojiAdd(slug, imageUrl, title) { return this._request('emoji_add', { slug, image_url: imageUrl, title }); }
  emojiDelete(slug) { return this._request('emoji_delete', { slug }); }

  // ================= CRON (Требует secret) =================
  runParser() { return this._request('run_parser', {}, { skipAuth: true }); }
  updateSchedule() { return this._request('update', {}, { method: 'GET', skipAuth: true }); } // Только GET
  processNotifyQueue() { return this._request('process_notify_queue', {}, { skipAuth: true }); }
  scheduleNotifications() { return this._request('schedule_notifications', {}, { skipAuth: true }); }
}

// Вспомогательный класс ошибок
class VSUApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'VSUApiError';
    this.status = status;
  }
}