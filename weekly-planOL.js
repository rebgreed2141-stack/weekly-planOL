(() => {
  "use strict";

  const jpDow = ["日", "月", "火", "水", "木", "金", "土"];
  // v9: class checkbox is calendar-mark display only. Sync/class selection code is not affected.
  const classToAge = {
    "もみじ": 0,
    "どんぐり": 1,
    "こぐま": 2,
    "りす": 3,
    "のうさぎ": 4,
    "かもしか": 5
  };
  const classMarks = {
    "もみじ": "も",
    "どんぐり": "ど",
    "こぐま": "こ",
    "りす": "り",
    "のうさぎ": "の",
    "かもしか": "か"
  };
  const classOrder = ["もみじ", "どんぐり", "こぐま", "りす", "のうさぎ", "かもしか"];
  const STORAGE_PREFIX = "weekly_";
  const BACKUP_HEADERS = [
    "classKey",
    "startDate",
    "weeklyAim",
    "events",
    "day0Date",
    "day0Activity",
    "day0Evaluation",
    "day0Attendance",
    "day1Date",
    "day1Activity",
    "day1Evaluation",
    "day1Attendance",
    "day2Date",
    "day2Activity",
    "day2Evaluation",
    "day2Attendance",
    "day3Date",
    "day3Activity",
    "day3Evaluation",
    "day3Attendance",
    "day4Date",
    "day4Activity",
    "day4Evaluation",
    "day4Attendance",
    "day5Date",
    "day5Activity",
    "day5Evaluation",
    "day5Attendance",
    "weeklyEvaluation",
    "case1Date",
    "case1Text",
    "case2Date",
    "case2Text"
  ];

  const el = {
    classSelect: document.getElementById("classSelect"),
    weekLabel: document.getElementById("weekLabel"),
    classLabel: document.getElementById("classLabel"),
    weeklyAim: document.getElementById("weeklyAim"),
    events: document.getElementById("events"),
    journalBody: document.getElementById("journalBody"),
    weeklyEvaluation: document.getElementById("weeklyEvaluation"),
    case1Date: document.getElementById("case1Date"),
    case1Text: document.getElementById("case1Text"),
    case2Date: document.getElementById("case2Date"),
    case2Text: document.getElementById("case2Text"),
    weekKeyView: document.getElementById("weekKeyView"),
    lastSavedView: document.getElementById("lastSavedView"),
    syncStatusView: document.getElementById("syncStatusView"),
    serverApiUrl: document.getElementById("serverApiUrl"),
    btnSaveServerUrl: document.getElementById("btnSaveServerUrl"),
    btnReceiveFromServer: document.getElementById("btnReceiveFromServer"),
    btnSendToServer: document.getElementById("btnSendToServer"),
    btnTopReceive: document.getElementById("btnTopReceive"),
    btnTopSend: document.getElementById("btnTopSend"),
    btnClear: document.getElementById("btnClear"),
    btnBackup: document.getElementById("btnBackup"),
    btnRestore: document.getElementById("btnRestore"),
    btnDeleteAll: document.getElementById("btnDeleteAll"),
    restoreFileInput: document.getElementById("restoreFileInput"),
    tabMainBtn: document.getElementById("tabMainBtn"),
    tabCalendarBtn: document.getElementById("tabCalendarBtn"),
    tabManageBtn: document.getElementById("tabManageBtn"),
    tabVersionBtn: document.getElementById("tabVersionBtn"),
    tabMain: document.getElementById("tabMain"),
    tabCalendar: document.getElementById("tabCalendar"),
    tabManage: document.getElementById("tabManage"),
    tabVersion: document.getElementById("tabVersion"),
    currentVersionView: document.getElementById("currentVersionView"),
    latestVersionView: document.getElementById("latestVersionView"),
    btnApplyUpdate: document.getElementById("btnApplyUpdate"),
    btnPrevMonth: document.getElementById("btnPrevMonth"),
    btnNextMonth: document.getElementById("btnNextMonth"),
    calendarTitle: document.getElementById("calendarTitle"),
    calendarGrid: document.getElementById("calendarGrid"),
    classFilterBox: document.getElementById("classFilterBox")
  };

  const calendarState = (() => {
    const today = new Date();
    return {
      year: today.getFullYear(),
      month: today.getMonth() + 1
    };
  })();

  let currentStartDateIso = "";
  let saveTimer = null;
  let suppressAutosave = false;
  let classPickerResolve = null;
  let currentVersion = "";
  let latestVersion = "";
  let swRegistration = null;
  const CURRENT_VERSION_STORAGE_KEY = "weekly_plan_current_version";
  const SERVER_URL_STORAGE_KEY = "weekly_plan_server_url";
  const DEFAULT_SERVER_URL = "http://192.168.1.60:3000";
  const CLIENT_ID_STORAGE_KEY = "weekly_plan_client_id";
  const LOCK_RENEW_INTERVAL_MS = 30000;
  const ENABLED_CLASSES_STORAGE_KEY = "weekly_plan_enabled_classes_v8";

  let currentLock = null;
  let lockRenewTimer = null;
  let isReadOnlyMode = false;
  let isLoadingWeek = false;

  const pad2 = (n) => String(n).padStart(2, "0");

  function createLocalDate(year, month, day) {
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  function parseISODate(value) {
    if (!value) return null;
    const m = String(value).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return null;
    return createLocalDate(Number(m[1]), Number(m[2]), Number(m[3]));
  }

  function toISO(dateObj) {
    return `${dateObj.getFullYear()}-${pad2(dateObj.getMonth() + 1)}-${pad2(dateObj.getDate())}`;
  }

  function addDays(dateObj, days) {
    const d = new Date(dateObj.getTime());
    d.setDate(d.getDate() + days);
    return d;
  }

  function formatMD(dateObj) {
    return `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
  }

  function formatMDJpDow(dateObj) {
    return `${formatMD(dateObj)}（${jpDow[dateObj.getDay()]}）`;
  }

  function nowIso() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  }

  function excelSerialToDate(serial) {
    const n = Number(serial);
    if (!Number.isFinite(n)) return null;
    const utcDays = Math.floor(n - 25569);
    const utcValue = utcDays * 86400 * 1000;
    const date = new Date(utcValue);
    if (Number.isNaN(date.getTime())) return null;
    return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12, 0, 0, 0);
  }

  function normalizeDateValue(value) {
    if (value == null) return null;
    const s = String(value).trim();
    if (!s) return null;

    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
      return parseISODate(s);
    }
    if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(s)) {
      const [y, m, d] = s.split("/").map(Number);
      return createLocalDate(y, m, d);
    }
    if (/^\d{4}\.\d{1,2}\.\d{1,2}$/.test(s)) {
      const [y, m, d] = s.split(".").map(Number);
      return createLocalDate(y, m, d);
    }
    if (/^\d{8}$/.test(s)) {
      return createLocalDate(Number(s.slice(0, 4)), Number(s.slice(4, 6)), Number(s.slice(6, 8)));
    }
    if (/^\d+(\.\d+)?$/.test(s)) {
      return excelSerialToDate(s);
    }
    return null;
  }

  function normalizeDateToISO(value) {
    const dateObj = normalizeDateValue(value);
    return dateObj ? toISO(dateObj) : "";
  }

  function toSlashDate(value) {
    const dateObj = normalizeDateValue(value);
    if (!dateObj) return "";
    return `${dateObj.getFullYear()}/${pad2(dateObj.getMonth() + 1)}/${pad2(dateObj.getDate())}`;
  }

  function getFiscalYearFromDate(dateObj) {
    if (!dateObj) return "";
    const year = dateObj.getFullYear();
    return dateObj.getMonth() + 1 >= 4 ? year : year - 1;
  }

  function getFiscalYearFromIso(iso) {
    const dateObj = parseISODate(iso);
    return getFiscalYearFromDate(dateObj);
  }

  function getClassLabel(classKey) {
    if (!classKey) return "";
    return `${classToAge[classKey]}歳児${classKey}組`;
  }

  function getEnabledClasses() {
    // チェックを入れた直後でも反映するため、画面上のチェック状態を最優先で読む。
    if (el.classFilterBox) {
      const boxes = Array.from(el.classFilterBox.querySelectorAll('input[type="checkbox"]'));
      if (boxes.length > 0) {
        const checkedSet = new Set(boxes.filter((box) => box.checked).map((box) => box.value));
        return classOrder.filter((classKey) => checkedSet.has(classKey));
      }
    }

    let saved = [];
    try {
      saved = JSON.parse(localStorage.getItem(ENABLED_CLASSES_STORAGE_KEY) || "[]");
    } catch (_) {
      saved = [];
    }

    // 初期状態は「チェックなし」。
    if (!Array.isArray(saved)) return [];

    const set = new Set(saved.filter((classKey) => classOrder.includes(classKey)));
    return classOrder.filter((classKey) => set.has(classKey));
  }

  function isClassEnabled(classKey) {
    return getEnabledClasses().includes(classKey);
  }

  function saveEnabledClasses(list) {
    const safe = classOrder.filter((classKey) => Array.isArray(list) && list.includes(classKey));
    localStorage.setItem(ENABLED_CLASSES_STORAGE_KEY, JSON.stringify(safe));
  }

  function renderClassFilter() {
    if (!el.classFilterBox) return;
    const enabled = new Set(getEnabledClasses());
    el.classFilterBox.innerHTML = "";

    classOrder.forEach((classKey) => {
      const label = document.createElement("label");
      label.className = "classCheckItem";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = classKey;
      cb.checked = enabled.has(classKey);

      const text = document.createElement("span");
      text.textContent = getClassLabel(classKey);

      cb.addEventListener("change", () => {
        const checked = Array.from(el.classFilterBox.querySelectorAll('input[type="checkbox"]:checked')).map((item) => item.value);
        saveEnabledClasses(checked);

        // チェックボックスはカレンダー上の表示マークだけに使う。
        // クラス選択・保存・送受信・現在編集中のデータには影響させない。
        renderCalendar();
      });

      label.appendChild(cb);
      label.appendChild(text);
      el.classFilterBox.appendChild(label);
    });
  }

  function isFiscalStartException(dateObj) {
    if (!dateObj) return false;
    return dateObj.getMonth() + 1 === 4 && dateObj.getDate() === 1 && dateObj.getDay() >= 2 && dateObj.getDay() <= 6;
  }

  function isSelectableStartDate(dateObj) {
    if (!dateObj) return false;
    return dateObj.getDay() === 1 || isFiscalStartException(dateObj);
  }

  function getWeekInfoByStartDateIso(startDateIso) {
    const startDate = parseISODate(startDateIso);
    if (!startDate) {
      return { month: "", week: "", weekLabel: "" };
    }

    const year = startDate.getFullYear();
    const month = startDate.getMonth() + 1;
    let week = 0;
    const monthLastDay = new Date(year, month, 0).getDate();

    for (let day = 1; day <= monthLastDay; day++) {
      const d = createLocalDate(year, month, day);
      if (isSelectableStartDate(d)) {
        week += 1;
      }
      if (toISO(d) === startDateIso) {
        return {
          month,
          week,
          weekLabel: `${month}月第${week}週`
        };
      }
    }

    return { month, week: "", weekLabel: "" };
  }

  function setCalendarMonthByIso(iso) {
    const dateObj = parseISODate(iso);
    if (!dateObj) return;
    calendarState.year = dateObj.getFullYear();
    calendarState.month = dateObj.getMonth() + 1;
  }

  function makeStorageKey(startDateIso, classKey) {
    if (!startDateIso || !classKey) return "";
    return `${STORAGE_PREFIX}${classKey}_${startDateIso}`;
  }

  function currentStorageKey() {
    return makeStorageKey(currentStartDateIso, el.classSelect.value || "");
  }

  function refreshTopLabels() {
    const weekInfo = getWeekInfoByStartDateIso(currentStartDateIso);
    el.weekLabel.textContent = weekInfo.weekLabel || "—";
    el.classLabel.textContent = getClassLabel(el.classSelect.value || "") || "—";
    el.weekKeyView.textContent = currentStorageKey() || "未設定";
  }

  function getJournalDateSlots(startDateIso) {
    const slots = Array(6).fill("");
    const startDate = parseISODate(startDateIso);
    if (!startDate) return slots;

    const fiscalYear = getFiscalYearFromDate(startDate);
    const startDow = startDate.getDay();
    let startIndex = 0;

    if (isFiscalStartException(startDate)) {
      startIndex = startDow - 1;
    }

    for (let i = startIndex; i < 6; i++) {
      const offset = i - startIndex;
      const dateObj = addDays(startDate, offset);
      if (getFiscalYearFromDate(dateObj) !== fiscalYear) break;
      slots[i] = toISO(dateObj);
    }

    return slots;
  }

  function buildJournalRows(startDateIso) {
    el.journalBody.innerHTML = "";
    const slotDates = getJournalDateSlots(startDateIso);

    for (let i = 0; i < 6; i++) {
      const card = document.createElement("section");
      card.className = "dayCard";
      card.dataset.dayIndex = String(i);

      const slotIso = slotDates[i];
      const slotDateObj = parseISODate(slotIso);
      const hasDate = Boolean(slotDateObj);

      if (!hasDate) card.classList.add("disabledDay");
      if (i === 0 && hasDate) card.classList.add("open");

      const head = document.createElement("button");
      head.type = "button";
      head.className = "dayCardHead";

      const left = document.createElement("div");
      left.className = "dayTitle";

      const icon = document.createElement("span");
      icon.className = "dayIcon";
      icon.textContent = "▣";

      const dateText = document.createElement("span");
      dateText.className = "dayDate";
      dateText.textContent = hasDate ? formatMDJpDow(slotDateObj) : "—";

      left.appendChild(icon);
      left.appendChild(dateText);

      const badge = document.createElement("span");
      badge.className = "dayBadge";
      badge.textContent = hasDate ? "未入力" : "対象外";
      badge.dataset.badgeFor = String(i);

      const arrow = document.createElement("span");
      arrow.className = "dayArrow";
      arrow.textContent = "⌄";

      head.appendChild(left);
      head.appendChild(badge);
      head.appendChild(arrow);
      card.appendChild(head);

      const body = document.createElement("div");
      body.className = "dayCardBody";

      const makeField = (kind, labelText, mark, placeholder, colorClass) => {
        const wrap = document.createElement("div");
        wrap.className = "dayField";

        const label = document.createElement("div");
        label.className = `dayFieldLabel ${colorClass}`;
        const m = document.createElement("span");
        m.className = "fieldMark";
        m.textContent = mark;
        const t = document.createElement("span");
        t.textContent = labelText;
        label.appendChild(m);
        label.appendChild(t);

        const ta = document.createElement("textarea");
        ta.className = "tarea mobileTarea";
        ta.placeholder = hasDate ? placeholder : "";
        ta.dataset.field = `day${i}_${kind}`;
        ta.disabled = !hasDate;
        ta.maxLength = 500;

        const count = document.createElement("div");
        count.className = "charCount";
        count.textContent = "0 / 500";
        count.dataset.countFor = `day${i}_${kind}`;

        wrap.appendChild(label);
        wrap.appendChild(ta);
        wrap.appendChild(count);
        return wrap;
      };

      body.appendChild(makeField("activity", "子どもの活動", "♟", "子どもの活動を入力してください", "blueLabel"));
      body.appendChild(makeField("evaluation", "保育評価（日誌）", "▣", "保育評価（日誌）を入力してください", "pinkLabel"));
      body.appendChild(makeField("attendance", "出欠状況", "☻", "出欠状況を入力してください（例：風邪で○○ちゃん休み）", "greenLabel"));

      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "daySaveBtn";
      saveBtn.textContent = "💾 この日の内容を保存";
      saveBtn.disabled = !hasDate;
      saveBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        flushAutosave();
        setSyncStatus("端末内保存");
      });
      body.appendChild(saveBtn);
      card.appendChild(body);

      head.addEventListener("click", () => {
        if (!hasDate) return;
        card.classList.toggle("open");
      });

      el.journalBody.appendChild(card);
    }

    Array.from(el.journalBody.querySelectorAll("textarea")).forEach((t) => {
      t.addEventListener("input", () => {
        updateTextareaCounter(t);
        updateDayBadgeFromTextarea(t);
        scheduleAutosave();
      });
      t.addEventListener("change", () => {
        updateTextareaCounter(t);
        updateDayBadgeFromTextarea(t);
        scheduleAutosave();
      });
      updateTextareaCounter(t);
    });
    updateAllDayBadges();
  }

  function updateTextareaCounter(textarea) {
    if (!textarea || !textarea.dataset.field) return;
    const counter = el.journalBody.querySelector(`[data-count-for="${textarea.dataset.field}"]`);
    if (counter) counter.textContent = `${String(textarea.value || "").length} / 500`;
  }

  function updateDayBadgeFromTextarea(textarea) {
    const m = String(textarea?.dataset?.field || "").match(/^day(\d+)_/);
    if (m) updateDayBadge(Number(m[1]));
  }

  function updateDayBadge(index) {
    const badge = el.journalBody.querySelector(`[data-badge-for="${index}"]`);
    if (!badge) return;
    const els = getJournalRowElements(index);
    const hasText = [els.activity, els.evaluation, els.attendance].some((node) => String(node?.value || "").trim());
    badge.textContent = hasText ? "入力中" : "未入力";
    badge.classList.toggle("active", hasText);
  }

  function updateAllDayBadges() {
    for (let i = 0; i < 6; i++) {
      updateDayBadge(i);
      const els = getJournalRowElements(i);
      [els.activity, els.evaluation, els.attendance].forEach(updateTextareaCounter);
    }
  }

  function getJournalRowElements(index) {
    return {
      activity: el.journalBody.querySelector(`textarea[data-field="day${index}_activity"]`),
      evaluation: el.journalBody.querySelector(`textarea[data-field="day${index}_evaluation"]`),
      attendance: el.journalBody.querySelector(`textarea[data-field="day${index}_attendance"]`)
    };
  }

  function setEditingEnabled(enabled) {
    const slotDates = getJournalDateSlots(currentStartDateIso);
    const canEdit = Boolean(enabled) && !isReadOnlyMode && Boolean(currentLock);

    [
      el.weeklyAim,
      el.events,
      el.weeklyEvaluation,
      el.case1Date,
      el.case1Text,
      el.case2Date,
      el.case2Text,
      el.btnClear
    ].forEach((node) => {
      node.disabled = !canEdit;
    });

    for (let i = 0; i < 6; i++) {
      const slotExists = Boolean(slotDates[i]);
      const rowEls = getJournalRowElements(i);
      if (rowEls.activity) rowEls.activity.disabled = !canEdit || !slotExists;
      if (rowEls.evaluation) rowEls.evaluation.disabled = !canEdit || !slotExists;
      if (rowEls.attendance) rowEls.attendance.disabled = !canEdit || !slotExists;
    }
  }

  function collectData(startDateIso) {
    const slotDates = getJournalDateSlots(startDateIso);

    const data = {
      classKey: el.classSelect.value || "",
      startDate: startDateIso || "",
      weeklyAim: el.weeklyAim.value || "",
      events: el.events.value || "",
      journal: [],
      weeklyEvaluation: el.weeklyEvaluation.value || "",
      individual: [
        { dateIso: el.case1Date.value || "", text: el.case1Text.value || "" },
        { dateIso: el.case2Date.value || "", text: el.case2Text.value || "" }
      ],
      updatedAt: nowIso()
    };

    for (let i = 0; i < 6; i++) {
      const rowDateIso = slotDates[i] || "";
      const rowDate = parseISODate(rowDateIso);
      const els = getJournalRowElements(i);
      data.journal.push({
        dateIso: rowDateIso,
        datePretty: rowDate ? formatMDJpDow(rowDate) : "",
        activity: rowDateIso && els.activity ? els.activity.value : "",
        evaluation: rowDateIso && els.evaluation ? els.evaluation.value : "",
        attendance: rowDateIso && els.attendance ? els.attendance.value : ""
      });
    }

    return data;
  }

  function clearCurrentInputs(keepClass = true) {
    const classValue = keepClass ? (el.classSelect.value || "") : "";
    el.weeklyAim.value = "";
    el.events.value = "";
    el.weeklyEvaluation.value = "";
    el.case1Date.value = "";
    el.case1Text.value = "";
    el.case2Date.value = "";
    el.case2Text.value = "";

    for (let i = 0; i < 6; i++) {
      const els = getJournalRowElements(i);
      if (els.activity) els.activity.value = "";
      if (els.evaluation) els.evaluation.value = "";
      if (els.attendance) els.attendance.value = "";
    }

    if (!keepClass) {
      el.classSelect.value = "";
    } else {
      el.classSelect.value = classValue;
    }

    el.lastSavedView.textContent = "—";
    refreshTopLabels();
  }

  function withSuppressedAutosave(fn) {
    suppressAutosave = true;
    try {
      return fn();
    } finally {
      suppressAutosave = false;
    }
  }


  function getServerBaseUrl() {
    const saved = String(localStorage.getItem(SERVER_URL_STORAGE_KEY) || "").trim().replace(/\/+$/, "");
    if (saved) return saved;
    return String(DEFAULT_SERVER_URL || window.location.origin).trim().replace(/\/+$/, "");
  }

  function setSyncStatus(text) {
    if (el.syncStatusView) el.syncStatusView.textContent = text || "—";
  }

  function saveServerUrlSetting() {
    const value = String(el.serverApiUrl?.value || "").trim().replace(/\/+$/, "");
    if (!value) {
      alert("サーバーURLを入力してください。");
      return;
    }
    localStorage.setItem(SERVER_URL_STORAGE_KEY, value);
    setSyncStatus("接続先を保存しました");
  }

  function apiUrl(path, params = {}) {
    const url = new URL(path, getServerBaseUrl());
    Object.entries(params).forEach(([key, value]) => {
      if (value != null && value !== "") url.searchParams.set(key, value);
    });
    return url.toString();
  }

  function getClientId() {
    let id = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
    if (!id) {
      id = `client_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(CLIENT_ID_STORAGE_KEY, id);
    }
    return id;
  }

  function getDeviceName() {
    const ua = navigator.userAgent || "";
    if (/Android/i.test(ua)) return "Android端末";
    if (/iPhone|iPad/i.test(ua)) return "iPhone/iPad";
    if (/Windows/i.test(ua)) return "Windows PC";
    return "端末";
  }

  function stopLockRenew() {
    if (lockRenewTimer) {
      clearInterval(lockRenewTimer);
      lockRenewTimer = null;
    }
  }

  function startLockRenew() {
    stopLockRenew();
    lockRenewTimer = setInterval(() => {
      if (currentLock) {
        acquireLock(currentLock.startDate, currentLock.classKey, true).catch(() => {});
      }
    }, LOCK_RENEW_INTERVAL_MS);
  }

  async function acquireLock(startDateIso, classKey, silent = false) {
    const response = await fetch(apiUrl("/api/lock"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: startDateIso,
        classKey,
        clientId: getClientId(),
        deviceName: getDeviceName(),
        token: currentLock && currentLock.startDate === startDateIso && currentLock.classKey === classKey ? currentLock.token : ""
      })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
      if (!silent) {
        currentLock = null;
        stopLockRenew();
      }
      return { ok: false, lockedBy: result.lockedBy || "別端末" };
    }

    currentLock = { startDate: startDateIso, classKey, token: result.token || "" };
    isReadOnlyMode = false;
    startLockRenew();
    return { ok: true };
  }

  async function releaseCurrentLock() {
    if (!currentLock) return;
    const lock = currentLock;
    currentLock = null;
    stopLockRenew();

    const payload = JSON.stringify({
      startDate: lock.startDate,
      classKey: lock.classKey,
      clientId: getClientId(),
      token: lock.token
    });

    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(apiUrl("/api/unlock"), new Blob([payload], { type: "application/json" }));
      } else {
        await fetch(apiUrl("/api/unlock"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true
        });
      }
    } catch (_) {}
  }

  function applyDataToInputs(data) {
    el.weeklyAim.value = data.weeklyAim ?? "";
    el.events.value = data.events ?? "";

    const journal = Array.isArray(data.journal) ? data.journal : [];
    const slotDates = getJournalDateSlots(currentStartDateIso);
    for (let i = 0; i < 6; i++) {
      const row = journal[i] || {};
      const rowEls = getJournalRowElements(i);
      const isActiveSlot = Boolean(slotDates[i]);
      if (rowEls.activity) rowEls.activity.value = isActiveSlot ? (row.activity || "") : "";
      if (rowEls.evaluation) rowEls.evaluation.value = isActiveSlot ? (row.evaluation || "") : "";
      if (rowEls.attendance) rowEls.attendance.value = isActiveSlot ? (row.attendance || "") : "";
    }

    el.weeklyEvaluation.value = data.weeklyEvaluation ?? "";
    el.case1Date.value = normalizeDateToISO(data.individual?.[0]?.dateIso ?? "");
    el.case1Text.value = data.individual?.[0]?.text ?? "";
    el.case2Date.value = normalizeDateToISO(data.individual?.[1]?.dateIso ?? "");
    el.case2Text.value = data.individual?.[1]?.text ?? "";
    el.lastSavedView.textContent = data.updatedAt || "—";
    updateAllDayBadges();
  }

  async function saveDataToServer(data) {
    const response = await fetch(apiUrl("/api/week"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Client-Id": getClientId(),
        "X-Lock-Token": currentLock.token || ""
      },
      body: JSON.stringify(data)
    });

    if (response.status === 423) {
      isReadOnlyMode = true;
      currentLock = null;
      stopLockRenew();
      setEditingEnabled(false);
      throw new Error("locked by another client");
    }

    if (!response.ok) throw new Error("server save failed");
    return response.json().catch(() => ({}));
  }

  async function loadDataFromServer(startDateIso, classKey) {
    const response = await fetch(apiUrl("/api/week", { startDate: startDateIso, classKey }), {
      method: "GET",
      cache: "no-store"
    });
    if (!response.ok) throw new Error("server load failed");
    const result = await response.json();
    return result && result.data ? result.data : null;
  }

  async function deleteDataFromServer(startDateIso, classKey) {
    const response = await fetch(apiUrl("/api/week", { startDate: startDateIso, classKey }), {
      method: "DELETE",
      headers: {
        "X-Client-Id": getClientId(),
        "X-Lock-Token": currentLock ? currentLock.token || "" : ""
      }
    });
    if (!response.ok) throw new Error("server delete failed");
  }

  async function pullListFromServerToLocal() {
    try {
      const response = await fetch(apiUrl("/api/weeks"), { method: "GET", cache: "no-store" });
      if (!response.ok) throw new Error("server list failed");
      const result = await response.json();
      const items = Array.isArray(result.items) ? result.items : [];

      // サーバーの一覧を正として、端末内の週案キャッシュを作り直す
      const oldKeys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_PREFIX)) oldKeys.push(key);
      }
      oldKeys.forEach((key) => localStorage.removeItem(key));

      items.forEach((data) => {
        if (data && data.startDate && data.classKey) {
          localStorage.setItem(makeStorageKey(data.startDate, data.classKey), JSON.stringify(data));
        }
      });

      renderCalendar();
      setSyncStatus("同期完了");
    } catch (_) {
      setSyncStatus("サーバー未接続：端末内に一時保存");
    }
  }

  async function autosave() {
    if (suppressAutosave || isLoadingWeek) return;
    if (!currentStartDateIso) return;

    const classKey = el.classSelect.value || "";
    if (!classKey) {
      refreshTopLabels();
      renderCalendar();
      return;
    }

    const key = makeStorageKey(currentStartDateIso, classKey);
    const data = collectData(currentStartDateIso);
    localStorage.setItem(key, JSON.stringify(data));
    el.lastSavedView.textContent = data.updatedAt;
    setSyncStatus("端末内保存");
    refreshTopLabels();
    renderCalendar();
  }

  function flushAutosave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (suppressAutosave) return;
    try {
      autosave();
    } catch (_) {}
  }

  function scheduleAutosave() {
    if (suppressAutosave || isLoadingWeek || isReadOnlyMode) return;
    refreshTopLabels();
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        autosave();
      } catch (_) {}
    }, 3000);
  }

  function getStoredDataList() {
    const list = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(STORAGE_PREFIX)) continue;
      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const data = JSON.parse(raw);
        if (data && data.startDate && data.classKey) {
          list.push(data);
        }
      } catch (_) {}
    }
    return list;
  }

  function closeClassPicker(selectedClassKey) {
    const overlay = document.getElementById("classPickerOverlay");
    if (overlay) overlay.remove();
    const resolver = classPickerResolve;
    classPickerResolve = null;
    if (resolver) resolver(selectedClassKey || "");
  }

  function showClassPicker(startDateIso) {
    closeClassPicker("");

    return new Promise((resolve) => {
      classPickerResolve = resolve;

      const overlay = document.createElement("div");
      overlay.id = "classPickerOverlay";
      overlay.style.position = "fixed";
      overlay.style.inset = "0";
      overlay.style.background = "rgba(0,0,0,0.35)";
      overlay.style.display = "flex";
      overlay.style.alignItems = "center";
      overlay.style.justifyContent = "center";
      overlay.style.zIndex = "9999";

      const panel = document.createElement("div");
      panel.style.width = "min(92vw, 420px)";
      panel.style.background = "#fff";
      panel.style.borderRadius = "14px";
      panel.style.padding = "20px";
      panel.style.boxShadow = "0 10px 30px rgba(0,0,0,0.22)";

      const title = document.createElement("div");
      title.textContent = `${startDateIso} のクラスを選択`;
      title.style.fontWeight = "700";
      title.style.marginBottom = "14px";
      panel.appendChild(title);

      const list = document.createElement("div");
      list.style.display = "grid";
      list.style.gap = "10px";

      // クラス選択一覧は、管理タブでチェックONのクラスだけを出す。
      // ここで絞るのは「表示する選択肢」だけ。保存・送受信のキーは変更しない。
      const enabledClasses = getEnabledClasses();

      if (enabledClasses.length === 0) {
        const empty = document.createElement("div");
        empty.textContent = "管理画面で表示するクラスにチェックを入れてください。";
        empty.style.padding = "12px 14px";
        empty.style.border = "1px solid #cfd8dc";
        empty.style.borderRadius = "10px";
        empty.style.background = "#fff";
        list.appendChild(empty);
      }

      enabledClasses.forEach((classKey) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = getClassLabel(classKey);
        btn.style.padding = "12px 14px";
        btn.style.border = "1px solid #cfd8dc";
        btn.style.borderRadius = "10px";
        btn.style.background = "#f8fafc";
        btn.style.cursor = "pointer";
        btn.addEventListener("click", () => closeClassPicker(classKey));
        list.appendChild(btn);
      });

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.textContent = "キャンセル";
      cancelBtn.style.marginTop = "14px";
      cancelBtn.style.padding = "12px 14px";
      cancelBtn.style.width = "100%";
      cancelBtn.style.border = "1px solid #cfd8dc";
      cancelBtn.style.borderRadius = "10px";
      cancelBtn.style.background = "#fff";
      cancelBtn.style.cursor = "pointer";
      cancelBtn.addEventListener("click", () => closeClassPicker(""));

      panel.appendChild(list);
      panel.appendChild(cancelBtn);
      overlay.appendChild(panel);
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
          closeClassPicker("");
        }
      });

      document.body.appendChild(overlay);
    });
  }

  async function loadWeek(startDateIso) {
    isLoadingWeek = true;
    suppressAutosave = true;

    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }

    currentStartDateIso = startDateIso || "";
    currentLock = { startDate: currentStartDateIso, classKey: el.classSelect.value || "", token: "offline" };
    isReadOnlyMode = false;

    buildJournalRows(currentStartDateIso);
    refreshTopLabels();
    el.lastSavedView.textContent = "—";

    if (currentStartDateIso) {
      setCalendarMonthByIso(currentStartDateIso);
    }

    if (!currentStartDateIso) {
      clearCurrentInputs(false);
      setEditingEnabled(false);
      renderCalendar();
      suppressAutosave = false;
      isLoadingWeek = false;
      return;
    }

    const classKey = el.classSelect.value || "";
    if (!classKey) {
      clearCurrentInputs(true);
      setEditingEnabled(false);
      renderCalendar();
      suppressAutosave = false;
      isLoadingWeek = false;
      return;
    }

    const localKey = makeStorageKey(currentStartDateIso, classKey);
    const raw = localStorage.getItem(localKey);
    if (raw) {
      try {
        applyDataToInputs(JSON.parse(raw));
      } catch (_) {
        clearCurrentInputs(true);
      }
    } else {
      clearCurrentInputs(true);
    }

    isReadOnlyMode = false;
    currentLock = { startDate: currentStartDateIso, classKey, token: "offline" };
    setEditingEnabled(true);
    setSyncStatus("端末内データを表示");
    refreshTopLabels();
    renderCalendar();
    suppressAutosave = false;
    isLoadingWeek = false;
  }

  async function openWeekFromCalendar(startDateIso) {
    flushAutosave();

    const selectedClassKey = await showClassPicker(startDateIso);
    if (!selectedClassKey) return;

    withSuppressedAutosave(() => {
      el.classSelect.value = selectedClassKey;
    });

    await loadWeek(startDateIso);
    activateTab("main");
  }

  function clearThisWeek() {
    if (!currentStartDateIso) {
      alert("カレンダーで週の開始日を先に選んでください。");
      return;
    }
    const classKey = el.classSelect.value || "";
    if (!classKey) {
      alert("先にクラスを選択してください。");
      return;
    }

    const key = makeStorageKey(currentStartDateIso, classKey);
    if (!confirm("この週の保存データを消去します。よろしいですか？")) return;

    localStorage.removeItem(key);
    withSuppressedAutosave(() => clearCurrentInputs(true));
    setEditingEnabled(true);
    refreshTopLabels();
    renderCalendar();
  }

  function resetAppToInitialState(options = {}) {
    const skipFlush = Boolean(options.skipFlush);

    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }

    if (!skipFlush) {
      flushAutosave();
    }

    withSuppressedAutosave(() => {
      currentStartDateIso = "";
      buildJournalRows("");
      el.classSelect.value = "";
      clearCurrentInputs(false);
      el.restoreFileInput.value = "";
    });

    el.weekKeyView.textContent = "未設定";
    el.lastSavedView.textContent = "—";
    setEditingEnabled(false);
    activateTab("calendar");
    renderCalendar();
  }

  function deleteAllData() {
    const confirmed = window.prompt("初期化を実行するには「削除」と入力してください。", "");
    if (confirmed !== "削除") {
      alert("初期化を中止しました。");
      return;
    }

    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }

    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) {
        keys.push(k);
      }
    }

    withSuppressedAutosave(() => {
      keys.forEach((k) => localStorage.removeItem(k));
      resetAppToInitialState({ skipFlush: true });
    });

    alert("初期化しました。必要ならバックアップCSVから復元してください。");
  }

  function csvEscape(v) {
    const s = String(v ?? "");
    if (/[",\n\r]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  function dataToBackupRow(data) {
    const row = {
      classKey: data.classKey ?? "",
      startDate: toSlashDate(data.startDate),
      weeklyAim: data.weeklyAim ?? "",
      events: data.events ?? "",
      weeklyEvaluation: data.weeklyEvaluation ?? "",
      case1Date: toSlashDate(data.individual?.[0]?.dateIso ?? ""),
      case1Text: data.individual?.[0]?.text ?? "",
      case2Date: toSlashDate(data.individual?.[1]?.dateIso ?? ""),
      case2Text: data.individual?.[1]?.text ?? ""
    };

    for (let i = 0; i < 6; i++) {
      row[`day${i}Date`] = toSlashDate(data.journal?.[i]?.dateIso ?? "");
      row[`day${i}Activity`] = data.journal?.[i]?.activity ?? "";
      row[`day${i}Evaluation`] = data.journal?.[i]?.evaluation ?? "";
      row[`day${i}Attendance`] = data.journal?.[i]?.attendance ?? "";
    }

    return row;
  }

  function rowsToCsv(rows) {
    const lines = [];
    lines.push(BACKUP_HEADERS.map(csvEscape).join(","));
    rows.forEach((rowObj) => {
      lines.push(BACKUP_HEADERS.map((h) => csvEscape(rowObj[h] ?? "")).join(","));
    });
    return lines.join("\r\n");
  }

  function sortRowsByStartDate(rows) {
    rows.sort((a, b) => {
      const aIso = normalizeDateToISO(a.startDate);
      const bIso = normalizeDateToISO(b.startDate);
      if (aIso !== bIso) return aIso.localeCompare(bIso);
      return (a.classKey || "").localeCompare(b.classKey || "", "ja");
    });
    return rows;
  }

  async function backupAllData() {
    flushAutosave();

    const baseIso = currentStartDateIso || toISO(createLocalDate(calendarState.year, calendarState.month, 1));
    const fiscalYear = getFiscalYearFromIso(baseIso);
    const allData = getStoredDataList().filter((data) => getFiscalYearFromIso(data.startDate) === fiscalYear);

    const zip = new JSZip();

    classOrder.forEach((classKey) => {
      const rows = allData
        .filter((data) => data.classKey === classKey)
        .map((data) => dataToBackupRow(data));

      sortRowsByStartDate(rows);
      const csv = rowsToCsv(rows);
      zip.file(`weekly_${classKey}_${fiscalYear}.csv`, "\uFEFF" + csv);
    });

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `weekly-plan_backup_${fiscalYear}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function parseCSV(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            cell += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          cell += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          row.push(cell);
          cell = "";
        } else if (ch === "\n") {
          row.push(cell);
          rows.push(row);
          row = [];
          cell = "";
        } else if (ch === "\r") {
        } else {
          cell += ch;
        }
      }
    }

    if (cell.length > 0 || row.length > 0) {
      row.push(cell);
      rows.push(row);
    }

    return rows.filter((r) => !(r.length === 1 && r[0] === ""));
  }

  function rowToObject(headers, row) {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] ?? "";
    });
    return obj;
  }

  function objectToStoredData(obj) {
    const classKey = String(obj.classKey || "").trim();
    const startDate = normalizeDateToISO(obj.startDate);
    if (!classKey || !startDate) return null;

    const slotDates = getJournalDateSlots(startDate);
    const journal = [];
    for (let i = 0; i < 6; i++) {
      const slotDateIso = slotDates[i] || "";
      const providedDateIso = normalizeDateToISO(obj[`day${i}Date`]);
      const dateIso = slotDateIso || providedDateIso || "";
      const dateObj = parseISODate(dateIso);
      journal.push({
        dateIso,
        datePretty: dateObj ? formatMDJpDow(dateObj) : "",
        activity: slotDateIso ? (obj[`day${i}Activity`] ?? "") : "",
        evaluation: slotDateIso ? (obj[`day${i}Evaluation`] ?? "") : "",
        attendance: slotDateIso ? (obj[`day${i}Attendance`] ?? "") : ""
      });
    }

    return {
      classKey,
      startDate,
      weeklyAim: obj.weeklyAim || "",
      events: obj.events || "",
      journal,
      weeklyEvaluation: obj.weeklyEvaluation || "",
      individual: [
        { dateIso: normalizeDateToISO(obj.case1Date), text: obj.case1Text || "" },
        { dateIso: normalizeDateToISO(obj.case2Date), text: obj.case2Text || "" }
      ],
      updatedAt: nowIso()
    };
  }

  function restoreFromCSVText(text) {
    const rows = parseCSV(text);
    if (!rows.length) return 0;

    const headers = rows[0].map((h) => String(h || "").trim().replace(/^\uFEFF/, ""));
    const missing = BACKUP_HEADERS.filter((h) => !headers.includes(h));
    if (missing.length) {
      throw new Error("復元用CSVの項目が不足しています。");
    }

    let count = 0;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every((v) => String(v || "").trim() === "")) continue;
      const obj = rowToObject(headers, row);
      const data = objectToStoredData(obj);
      if (!data) continue;
      localStorage.setItem(makeStorageKey(data.startDate, data.classKey), JSON.stringify(data));
      saveDataToServer(data).catch(() => {});
      count += 1;
    }
    return count;
  }

  function decodeArrayBuffer(buffer, encoding) {
    try {
      return new TextDecoder(encoding).decode(buffer);
    } catch (_) {
      return "";
    }
  }

  function scoreJapaneseText(text) {
    if (!text) return -999999;
    let score = 0;
    if (text.includes("classKey")) score += 30;
    if (text.includes("startDate")) score += 30;
    if (text.includes("weeklyAim")) score += 30;
    if (text.includes("case1Text")) score += 30;

    const mojibakeMatches = text.match(/[�Ã¢ã¤æ¥œ]/g);
    if (mojibakeMatches) score -= mojibakeMatches.length * 2;

    const japaneseMatches = text.match(/[ぁ-んァ-ヶ一-龠]/g);
    if (japaneseMatches) score += japaneseMatches.length;

    return score;
  }

  function chooseDecodedCsvText(buffer) {
    const utf8Text = decodeArrayBuffer(buffer, "utf-8");
    const sjisText = decodeArrayBuffer(buffer, "shift_jis");
    return scoreJapaneseText(sjisText) > scoreJapaneseText(utf8Text) ? sjisText : utf8Text;
  }

  async function handleRestoreFile(file) {
    if (!file) return;
    const lowerName = String(file.name || "").toLowerCase();

    try {
      let count = 0;

      if (lowerName.endsWith(".zip")) {
        const arrayBuffer = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuffer);
        const csvEntries = Object.values(zip.files).filter((f) => !f.dir && f.name.toLowerCase().endsWith(".csv"));
        if (!csvEntries.length) {
          alert("ZIP内にCSVがありません。");
          el.restoreFileInput.value = "";
          return;
        }

        for (const entry of csvEntries) {
          const uint8 = await entry.async("uint8array");
          const text = chooseDecodedCsvText(uint8.buffer);
          count += restoreFromCSVText(text);
        }
      } else {
        const arrayBuffer = await file.arrayBuffer();
        const text = chooseDecodedCsvText(arrayBuffer);
        count += restoreFromCSVText(text);
      }

      if (currentStartDateIso) {
        loadWeek(currentStartDateIso);
      } else {
        renderCalendar();
      }
      alert(`復元完了：${count}件`);
    } catch (error) {
      alert(error && error.message ? error.message : "復元に失敗しました。");
    } finally {
      el.restoreFileInput.value = "";
    }
  }

  function hasAnyWeekContent(week) {
    if (!week) return false;
    if (String(week.weeklyAim || "").trim()) return true;
    if (String(week.events || "").trim()) return true;
    if (String(week.weeklyEvaluation || "").trim()) return true;

    const individual = Array.isArray(week.individual) ? week.individual : [];
    if (individual.some((item) => String(item?.dateIso || "").trim() || String(item?.text || "").trim())) return true;

    const journal = Array.isArray(week.journal) ? week.journal : [];
    return journal.some((row) => {
      return String(row?.activity || "").trim()
        || String(row?.evaluation || "").trim()
        || String(row?.attendance || "").trim();
    });
  }

  function getMarksByDate() {
    const map = new Map();
    const appendMark = (dateIso, classKey) => {
      if (!dateIso || !classKey || !classMarks[classKey]) return;
      if (!isClassEnabled(classKey)) return;
      if (!map.has(dateIso)) map.set(dateIso, new Set());
      map.get(dateIso).add(classMarks[classKey]);
    };

    getStoredDataList().forEach((week) => {
      if (!week || !week.startDate || !week.classKey) return;

      // 週案データが1つでも入っていれば、週の開始日に「か」「の」等を表示する
      if (hasAnyWeekContent(week)) {
        appendMark(week.startDate, week.classKey);
      }

      // 日ごとの活動欄に入力がある場合は、その日にも従来通り表示する
      (Array.isArray(week.journal) ? week.journal : []).forEach((row) => {
        if (row && row.dateIso && String(row.activity || "").trim()) {
          appendMark(row.dateIso, week.classKey);
        }
      });
    });

    if (currentStartDateIso && el.classSelect.value) {
      const currentData = collectData(currentStartDateIso);
      if (hasAnyWeekContent(currentData)) {
        appendMark(currentData.startDate, currentData.classKey);
      }
      currentData.journal.forEach((row) => {
        if (row && row.dateIso && String(row.activity || "").trim()) {
          appendMark(row.dateIso, currentData.classKey);
        }
      });
    }

    return map;
  }

  function renderCalendar() {
    const year = calendarState.year;
    const month = calendarState.month;
    const firstDay = createLocalDate(year, month, 1);
    const firstDow = firstDay.getDay();
    const startDate = addDays(firstDay, -firstDow);
    const marksByDate = getMarksByDate();

    el.calendarTitle.textContent = `${year}年${month}月`;
    el.calendarGrid.innerHTML = "";

    for (let i = 0; i < 42; i++) {
      const cellDate = addDays(startDate, i);
      const cellIso = toISO(cellDate);
      const inCurrentMonth = cellDate.getMonth() + 1 === month;
      const selectable = isSelectableStartDate(cellDate);
      const isSelected = currentStartDateIso === cellIso;
      const marks = Array.from(marksByDate.get(cellIso) || []);
      marks.sort((a, b) => {
        const aIndex = classOrder.findIndex((key) => classMarks[key] === a);
        const bIndex = classOrder.findIndex((key) => classMarks[key] === b);
        return aIndex - bIndex;
      });

      const cell = document.createElement("div");
      cell.className = "calendarCell";
      if (!inCurrentMonth) cell.classList.add("otherMonth");
      if (isSelected) cell.classList.add("isSelected");

      let inner;
      if (selectable) {
        inner = document.createElement("button");
        inner.type = "button";
        inner.className = "calendarCellInner isMonday";
        inner.addEventListener("click", () => {
          openWeekFromCalendar(cellIso);
        });
      } else {
        inner = document.createElement("div");
        inner.className = "calendarCellInner";
      }

      const dayNum = document.createElement("div");
      dayNum.className = "calendarDayNum";
      dayNum.textContent = String(cellDate.getDate());
      inner.appendChild(dayNum);

      if (selectable) {
        const startMark = document.createElement("div");
        startMark.className = "calendarMondayMark";
        startMark.textContent = cellDate.getDay() === 1 ? "開始日" : "年度初日";
        inner.appendChild(startMark);
      }

      cell.appendChild(inner);

      const markRow = document.createElement("div");
      markRow.className = "calendarDotRow";
      marks.forEach((mark) => {
        const span = document.createElement("span");
        span.className = "calendarDot";
        span.textContent = mark;
        markRow.appendChild(span);
      });
      cell.appendChild(markRow);

      el.calendarGrid.appendChild(cell);
    }
  }

  function activateTab(tabName) {
    flushAutosave();

    const isMain = tabName === "main";
    const isCalendar = tabName === "calendar";
    const isManage = tabName === "manage";
    const isVersion = tabName === "version";

    el.tabMain.classList.toggle("active", isMain);
    el.tabCalendar.classList.toggle("active", isCalendar);
    el.tabManage.classList.toggle("active", isManage);
    el.tabVersion.classList.toggle("active", isVersion);

    el.tabMainBtn.classList.toggle("active", isMain);
    el.tabCalendarBtn.classList.toggle("active", isCalendar);
    el.tabManageBtn.classList.toggle("active", isManage);
    el.tabVersionBtn.classList.toggle("active", isVersion);

    if (isCalendar) {
      renderCalendar();
      pullListFromServerToLocal();
    }
    if (isVersion) {
      refreshLatestVersionInfo();
    }
  }


  async function fetchVersionJson(options = {}) {
    const url = options.noStore ? `./version.json?ts=${Date.now()}` : "./version.json";
    const response = await fetch(url, {
      cache: options.noStore ? "no-store" : "default"
    });
    if (!response.ok) {
      throw new Error("version.json を読み込めません。");
    }
    const json = await response.json();
    return String((json && json.version) || "").trim();
  }

  function updateVersionButtonState() {
    const canUpdate = !!latestVersion && !!currentVersion && latestVersion !== currentVersion;
    el.btnApplyUpdate.disabled = !canUpdate;
  }

  function reflectVersionViews() {
    el.currentVersionView.textContent = currentVersion || "—";
    if (!latestVersion || latestVersion === currentVersion) {
      el.latestVersionView.textContent = "最新です";
    } else {
      el.latestVersionView.textContent = latestVersion;
    }
    updateVersionButtonState();
  }

  async function refreshVersionViews() {
    currentVersion = String(localStorage.getItem(CURRENT_VERSION_STORAGE_KEY) || "").trim();

    if (!currentVersion) {
      try {
        const cache = await caches.open("weekly-plan-v10");
        const response = await cache.match("./version.json", { ignoreSearch: true }) || await cache.match("version.json", { ignoreSearch: true });
        if (response) {
          const json = await response.json();
          currentVersion = String((json && json.version) || "").trim();
        }
      } catch (_) {}

      if (currentVersion) {
        localStorage.setItem(CURRENT_VERSION_STORAGE_KEY, currentVersion);
      }
    }

    latestVersion = currentVersion;
    reflectVersionViews();
  }


  async function refreshLatestVersionInfo() {
    try {
      latestVersion = await fetchVersionJson({ noStore: true });
    } catch (_) {
      latestVersion = currentVersion;
    }
    reflectVersionViews();
  }

  function bindWaitingWorker(registration) {
    swRegistration = registration || null;
    updateVersionButtonState();
  }

  async function setupVersionManagement() {
    await refreshVersionViews();

    if (!("serviceWorker" in navigator)) {
      return;
    }

    try {
      let registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        registration = await navigator.serviceWorker.register("./sw.js");
      }

      bindWaitingWorker(registration);
    } catch (_) {
      updateVersionButtonState();
    }
  }

  async function waitForWaitingWorker(registration) {
    if (registration.waiting) return registration.waiting;

    return await new Promise((resolve) => {
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        resolve(registration.waiting || null);
      };

      const installingWorker = registration.installing;
      if (installingWorker) {
        installingWorker.addEventListener("statechange", () => {
          if (installingWorker.state === "installed") {
            finish();
          }
        });
      }

      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) {
          finish();
          return;
        }
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed") {
            finish();
          }
        });
      }, { once: true });

      setTimeout(finish, 8000);
    });
  }

  async function applyWaitingUpdate() {
    if (!swRegistration || el.btnApplyUpdate.disabled) return;

    el.btnApplyUpdate.disabled = true;

    try {
      try {
        latestVersion = await fetchVersionJson({ noStore: true });
      } catch (_) {}

      await swRegistration.update();
      bindWaitingWorker(swRegistration);

      const waitingWorker = await waitForWaitingWorker(swRegistration);
      if (!waitingWorker) {
        reflectVersionViews();
        return;
      }

      await new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };

        navigator.serviceWorker.addEventListener("controllerchange", finish, { once: true });
        waitingWorker.postMessage({ type: "SKIP_WAITING" });
        setTimeout(finish, 8000);
      });

      if (latestVersion) {
        currentVersion = latestVersion;
        localStorage.setItem(CURRENT_VERSION_STORAGE_KEY, currentVersion);
      }

      window.location.reload();
    } catch (_) {
      reflectVersionViews();
    }
  }


  async function receiveCurrentWeekFromServer() {
    if (!currentStartDateIso) {
      alert("カレンダーで週を選択してください。");
      return;
    }
    const classKey = el.classSelect.value || "";
    if (!classKey) {
      alert("クラスを選択してください。");
      return;
    }
    try {
      setSyncStatus("受信中...");
      const data = await loadDataFromServer(currentStartDateIso, classKey);
      const key = makeStorageKey(currentStartDateIso, classKey);
      if (data) {
        localStorage.setItem(key, JSON.stringify(data));
        withSuppressedAutosave(() => applyDataToInputs(data));
        setSyncStatus("受信完了");
        renderCalendar();
      } else {
        alert("サーバーにこの週のデータはありません。");
        setSyncStatus("受信データなし");
      }
    } catch (_) {
      alert("受信できません。園内Wi-Fi接続とサーバーURLを確認してください。");
      setSyncStatus("受信失敗");
    }
  }

  async function sendCurrentWeekToServer() {
    if (!currentStartDateIso) {
      alert("カレンダーで週を選択してください。");
      return;
    }
    const classKey = el.classSelect.value || "";
    if (!classKey) {
      alert("クラスを選択してください。");
      return;
    }

    flushAutosave();
    const data = collectData(currentStartDateIso);
    localStorage.setItem(makeStorageKey(currentStartDateIso, classKey), JSON.stringify(data));

    if (!confirm("端末内のこの週データで、園内サーバーを上書きします。よろしいですか？")) return;

    try {
      setSyncStatus("送信中...");
      await saveDataToServer(data);
      setSyncStatus("送信完了");
      alert("送信しました。");
    } catch (_) {
      alert("送信できません。園内Wi-Fi接続とサーバーURLを確認してください。");
      setSyncStatus("送信失敗");
    }
  }

  function moveCalendarMonth(diff) {
    let y = calendarState.year;
    let m = calendarState.month + diff;
    if (m <= 0) {
      y -= 1;
      m = 12;
    } else if (m >= 13) {
      y += 1;
      m = 1;
    }
    calendarState.year = y;
    calendarState.month = m;
    renderCalendar();
  }

  el.tabMainBtn.addEventListener("click", () => activateTab("main"));
  el.tabCalendarBtn.addEventListener("click", () => activateTab("calendar"));
  el.tabManageBtn.addEventListener("click", () => activateTab("manage"));
  el.tabVersionBtn.addEventListener("click", () => activateTab("version"));
  el.btnApplyUpdate.addEventListener("click", applyWaitingUpdate);
  el.btnPrevMonth.addEventListener("click", () => moveCalendarMonth(-1));
  el.btnNextMonth.addEventListener("click", () => moveCalendarMonth(1));
  el.btnClear.addEventListener("click", clearThisWeek);
  el.btnBackup.addEventListener("click", backupAllData);
  el.btnRestore.addEventListener("click", () => el.restoreFileInput.click());
  el.btnDeleteAll.addEventListener("click", deleteAllData);
  if (el.serverApiUrl) el.serverApiUrl.value = getServerBaseUrl();
  if (el.btnSaveServerUrl) el.btnSaveServerUrl.addEventListener("click", saveServerUrlSetting);
  if (el.btnReceiveFromServer) el.btnReceiveFromServer.addEventListener("click", receiveCurrentWeekFromServer);
  if (el.btnSendToServer) el.btnSendToServer.addEventListener("click", sendCurrentWeekToServer);
  if (el.btnTopReceive) el.btnTopReceive.addEventListener("click", receiveCurrentWeekFromServer);
  if (el.btnTopSend) el.btnTopSend.addEventListener("click", sendCurrentWeekToServer);

  el.restoreFileInput.addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    await handleRestoreFile(file);
  });

  [
    el.weeklyAim,
    el.events,
    el.weeklyEvaluation,
    el.case1Date,
    el.case1Text,
    el.case2Date,
    el.case2Text
  ].forEach((inp) => {
    inp.addEventListener("input", scheduleAutosave);
    inp.addEventListener("change", scheduleAutosave);
  });

  el.classSelect.disabled = true;
  if (el.classSelect.options.length > 0) {
    el.classSelect.options[0].textContent = "クラス（カレンダーで選択）";
  }

  renderClassFilter();
  buildJournalRows("");
  refreshTopLabels();
  loadWeek("");
  renderCalendar();
  activateTab("calendar");
  setEditingEnabled(false);
  window.addEventListener("load", () => {
    setupVersionManagement();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushAutosave();
    }
  });
})();