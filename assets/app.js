const STORAGE_KEY = "docktodo.pro.state.v1";
const todayKey = formatDate(new Date());

const defaultState = {
  activeMode: "tasks",
  activeView: "today",
  selectedTaskId: null,
  theme: "light",
  calendarMonth: todayKey.slice(0, 7),
  lists: [
    { id: "inbox", name: "收集箱", color: "#4778ff" },
    { id: "work", name: "认真工作", color: "#d94d4d" },
    { id: "life", name: "生活备忘", color: "#25a769" },
    { id: "plan", name: "九月计划", color: "#e49a2f" },
  ],
  filters: [
    { id: "filter-high", name: "高优先级", type: "high" },
    { id: "filter-reminder", name: "有提醒", type: "reminder" },
    { id: "filter-nodate", name: "无日期", type: "nodate" },
  ],
  tasks: [
    makeTask("整理 DockTodo 高级版", "work", todayKey, addDays(todayKey, 1), "high", {
      reminder: `${todayKey}T09:30`,
      estimatePomos: 3,
      actualPomos: 1,
      notes: "覆盖日历、筛选、统计、历史、检查项提醒和番茄预估。",
      subtasks: [
        makeSubtask("完成三栏任务工作台", true, ""),
        makeSubtask("补齐高级版详情字段", false, `${todayKey}T16:00`),
      ],
    }),
    makeTask("买牛奶和面包", "life", todayKey, todayKey, "medium", {
      estimatePomos: 1,
      subtasks: [makeSubtask("牛奶", false, ""), makeSubtask("面包", false, "")],
    }),
    makeTask("主持项目会议", "work", addDays(todayKey, 1), addDays(todayKey, 1), "none", {
      reminder: `${addDays(todayKey, 1)}T08:45`,
      notes: "会前确认议程和待决事项。",
    }),
    makeTask("复盘本周任务", "plan", addDays(todayKey, -2), addDays(todayKey, -1), "low", {
      completed: true,
      actualPomos: 2,
    }),
  ],
};

const els = {
  body: document.body,
  railButtons: [...document.querySelectorAll(".rail-btn[data-mode]")],
  smartLists: document.querySelector("#smartLists"),
  projectList: document.querySelector("#projectList"),
  filterList: document.querySelector("#filterList"),
  addList: document.querySelector("#addList"),
  addFilter: document.querySelector("#addFilter"),
  quickAdd: document.querySelector("#quickAdd"),
  quickAddTop: document.querySelector("#quickAddTop"),
  clearDone: document.querySelector("#clearDone"),
  exportData: document.querySelector("#exportData"),
  themeToggle: document.querySelector("#themeToggle"),
  taskForm: document.querySelector("#taskForm"),
  taskInput: document.querySelector("#taskInput"),
  taskStart: document.querySelector("#taskStart"),
  taskDue: document.querySelector("#taskDue"),
  taskPriority: document.querySelector("#taskPriority"),
  taskView: document.querySelector("#taskView"),
  calendarView: document.querySelector("#calendarView"),
  focusView: document.querySelector("#focusView"),
  statsView: document.querySelector("#statsView"),
  taskList: document.querySelector("#taskList"),
  taskTemplate: document.querySelector("#taskTemplate"),
  emptyState: document.querySelector("#emptyState"),
  statsLine: document.querySelector("#statsLine"),
  viewTitle: document.querySelector("#viewTitle"),
  viewMeta: document.querySelector("#viewMeta"),
  calendarTitle: document.querySelector("#calendarTitle"),
  calendarGrid: document.querySelector("#calendarGrid"),
  prevMonth: document.querySelector("#prevMonth"),
  nextMonth: document.querySelector("#nextMonth"),
  focusTime: document.querySelector("#focusTime"),
  focusTask: document.querySelector("#focusTask"),
  startFocus: document.querySelector("#startFocus"),
  resetFocus: document.querySelector("#resetFocus"),
  completePomo: document.querySelector("#completePomo"),
  detailEmpty: document.querySelector("#detailEmpty"),
  detailForm: document.querySelector("#detailForm"),
  detailCompleted: document.querySelector("#detailCompleted"),
  detailTitle: document.querySelector("#detailTitle"),
  detailList: document.querySelector("#detailList"),
  detailStart: document.querySelector("#detailStart"),
  detailDue: document.querySelector("#detailDue"),
  detailReminder: document.querySelector("#detailReminder"),
  detailPriority: document.querySelector("#detailPriority"),
  detailEstimate: document.querySelector("#detailEstimate"),
  detailNotes: document.querySelector("#detailNotes"),
  addSubtask: document.querySelector("#addSubtask"),
  subtaskList: document.querySelector("#subtaskList"),
  subtaskTemplate: document.querySelector("#subtaskTemplate"),
  historyList: document.querySelector("#historyList"),
  deleteTask: document.querySelector("#deleteTask"),
};

let state = normalizeState(loadState());
let focusSeconds = 25 * 60;
let focusTimer = null;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.tasks && saved?.lists) {
      return saved;
    }
  } catch {
    return structuredClone(defaultState);
  }

  return structuredClone(defaultState);
}

function normalizeState(nextState) {
  nextState.activeMode ??= "tasks";
  nextState.activeView ??= "today";
  nextState.theme ??= "light";
  nextState.calendarMonth ??= todayKey.slice(0, 7);
  nextState.filters ??= structuredClone(defaultState.filters);
  nextState.tasks = nextState.tasks.map((task) => ({
    startDate: "",
    dueDate: "",
    reminder: "",
    estimatePomos: 0,
    actualPomos: 0,
    history: [],
    subtasks: [],
    ...task,
  }));
  return nextState;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function createId() {
  if (window.crypto?.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeSubtask(title, completed = false, reminder = "") {
  return { id: createId(), title, completed, reminder };
}

function makeTask(title, listId, startDate, dueDate, priority, options = {}) {
  const now = Date.now();
  return {
    id: createId(),
    title,
    listId,
    startDate,
    dueDate,
    priority,
    completed: Boolean(options.completed),
    reminder: options.reminder ?? "",
    estimatePomos: options.estimatePomos ?? 0,
    actualPomos: options.actualPomos ?? 0,
    notes: options.notes ?? "",
    subtasks: options.subtasks ?? [],
    history: [{ at: now, text: "创建任务" }],
    createdAt: now,
    updatedAt: now,
  };
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

function dateLabel(dateKey) {
  if (!dateKey) return "无日期";
  if (dateKey === todayKey) return "今天";
  if (dateKey === addDays(todayKey, 1)) return "明天";
  return dateKey.slice(5).replace("-", "/");
}

function dateTimeLabel(value) {
  if (!value) return "";
  return value.replace("T", " ").slice(5);
}

function isWithinNextSevenDays(dateKey) {
  return Boolean(dateKey) && dateKey >= todayKey && dateKey <= addDays(todayKey, 6);
}

function taskDate(task) {
  return task.dueDate || task.startDate || "";
}

function selectedTask() {
  return state.tasks.find((task) => task.id === state.selectedTaskId) ?? null;
}

function smartDefinitions() {
  return [
    { id: "today", icon: "☑", title: "今天", count: countTasks((task) => !task.completed && taskDate(task) === todayKey) },
    { id: "next7", icon: "▣", title: "最近 7 天", count: countTasks((task) => !task.completed && isWithinNextSevenDays(taskDate(task))) },
    { id: "calendar", icon: "▦", title: "日历", count: countTasks((task) => !task.completed && Boolean(taskDate(task))) },
    { id: "inbox", icon: "⌂", title: "收集箱", count: countTasks((task) => !task.completed && task.listId === "inbox") },
    { id: "all", icon: "≡", title: "全部", count: countTasks((task) => !task.completed) },
    { id: "completed", icon: "✓", title: "已完成", count: countTasks((task) => task.completed) },
  ];
}

function countTasks(predicate) {
  return state.tasks.filter(predicate).length;
}

function priorityLabel(priority) {
  return { high: "高优先级", medium: "中优先级", low: "低优先级", none: "无优先级" }[priority] ?? "无优先级";
}

function getActiveTitle() {
  const smart = smartDefinitions().find((item) => item.id === state.activeView);
  if (smart) return smart.title;
  const list = state.lists.find((item) => item.id === state.activeView);
  if (list) return list.name;
  const filter = state.filters.find((item) => item.id === state.activeView);
  return filter?.name ?? "任务";
}

function getViewType(view = state.activeView) {
  if (state.lists.some((item) => item.id === view)) return "list";
  if (state.filters.some((item) => item.id === view)) return "filter";
  return "smart";
}

function visibleTasks() {
  const view = state.activeView;
  return state.tasks
    .filter((task) => {
      const date = taskDate(task);
      if (view === "today") return date === todayKey && !task.completed;
      if (view === "next7") return isWithinNextSevenDays(date) && !task.completed;
      if (view === "calendar") return Boolean(date) && !task.completed;
      if (view === "all") return !task.completed;
      if (view === "completed") return task.completed;
      if (view === "inbox") return task.listId === "inbox" && !task.completed;
      if (state.lists.some((list) => list.id === view)) return task.listId === view && !task.completed;
      return matchesFilter(task, state.filters.find((item) => item.id === view));
    })
    .sort(sortTasks);
}

function matchesFilter(task, filter) {
  if (!filter) return false;
  if (filter.type === "high") return !task.completed && task.priority === "high";
  if (filter.type === "reminder") return !task.completed && Boolean(task.reminder || task.subtasks.some((item) => item.reminder));
  if (filter.type === "nodate") return !task.completed && !taskDate(task);
  if (filter.type === "overdue") return !task.completed && taskDate(task) && taskDate(task) < todayKey;
  return false;
}

function sortTasks(a, b) {
  if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
  const priorityRank = { high: 0, medium: 1, low: 2, none: 3 };
  const dateCompare = (taskDate(a) || "9999").localeCompare(taskDate(b) || "9999");
  if (dateCompare !== 0) return dateCompare;
  return priorityRank[a.priority] - priorityRank[b.priority] || b.createdAt - a.createdAt;
}

function groupedTasks(tasks) {
  return tasks.reduce((groups, task) => {
    const key = groupName(task);
    groups[key] ??= [];
    groups[key].push(task);
    return groups;
  }, {});
}

function groupName(task) {
  if (task.completed) return "已完成";
  const date = taskDate(task);
  if (!date) return "无日期";
  if (date < todayKey) return "已逾期";
  if (date === todayKey) return "今天";
  if (date === addDays(todayKey, 1)) return "明天";
  return "之后";
}

function currentDefaultListId() {
  return getViewType() === "list" ? state.activeView : "inbox";
}

function currentDefaultDate() {
  return state.activeView === "today" || state.activeView === "next7" ? todayKey : "";
}

function addHistory(task, text) {
  task.history.unshift({ at: Date.now(), text });
  task.history = task.history.slice(0, 30);
  task.updatedAt = Date.now();
}

function setMode(mode) {
  state.activeMode = mode;
  if (mode === "calendar") state.activeView = "calendar";
  saveState();
  render();
}

function setView(view) {
  state.activeView = view;
  if (view === "calendar") state.activeMode = "calendar";
  if (state.activeMode === "calendar" && view !== "calendar") state.activeMode = "tasks";
  state.selectedTaskId = visibleTasks()[0]?.id ?? null;
  saveState();
  render();
}

function addTask(title, startDate, dueDate, priority) {
  const task = makeTask(title, currentDefaultListId(), startDate, dueDate, priority);
  state.tasks.unshift(task);
  state.selectedTaskId = task.id;
  saveState();
  render();
}

function updateTask(id, patch, historyText) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  Object.assign(task, patch);
  if (historyText) addHistory(task, historyText);
  saveState();
  render();
}

function render() {
  renderTheme();
  renderModes();
  renderNav();
  renderHeader();
  renderTasks();
  renderCalendar();
  renderFocus();
  renderStats();
  renderDetail();
}

function renderTheme() {
  els.body.className = "";
  if (state.theme !== "light") els.body.classList.add(`theme-${state.theme}`);
}

function renderModes() {
  els.railButtons.forEach((button) => button.classList.toggle("active", button.dataset.mode === state.activeMode));
  els.taskView.classList.toggle("hidden", state.activeMode !== "tasks");
  els.calendarView.classList.toggle("hidden", state.activeMode !== "calendar");
  els.focusView.classList.toggle("hidden", state.activeMode !== "focus");
  els.statsView.classList.toggle("hidden", state.activeMode !== "stats");
}

function renderHeader() {
  const open = countTasks((task) => !task.completed);
  const todayOpen = countTasks((task) => !task.completed && taskDate(task) === todayKey);
  const reminders = countTasks((task) => !task.completed && Boolean(task.reminder));
  const modeTitle = { tasks: getActiveTitle(), calendar: "日历", focus: "专注", stats: "统计" }[state.activeMode];
  els.viewTitle.textContent = modeTitle;
  els.viewMeta.textContent = `${todayOpen} 个今天待办 · ${open} 个未完成 · ${reminders} 个提醒`;
  els.taskStart.value = currentDefaultDate();
  els.taskDue.value = currentDefaultDate();
}

function renderNav() {
  els.smartLists.replaceChildren();
  els.projectList.replaceChildren();
  els.filterList.replaceChildren();
  smartDefinitions().forEach((item) => els.smartLists.append(navButton(item.id, item.icon, item.title, item.count)));
  state.lists.forEach((list) => {
    const count = countTasks((task) => task.listId === list.id && !task.completed);
    els.projectList.append(navButton(list.id, "●", list.name, count, list.color));
  });
  state.filters.forEach((filter) => {
    const count = countTasks((task) => matchesFilter(task, filter));
    els.filterList.append(navButton(filter.id, "◇", filter.name, count));
  });
}

function navButton(id, icon, title, count, color) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "nav-item";
  button.classList.toggle("active", state.activeView === id);
  button.innerHTML = `
    <span style="color:${color ?? "currentColor"}">${icon}</span>
    <span>${title}</span>
    <span class="nav-count">${count}</span>
  `;
  button.addEventListener("click", () => setView(id));
  return button;
}

function renderTasks() {
  const tasks = visibleTasks();
  const done = countTasks((task) => task.completed);
  const estimate = state.tasks.reduce((total, task) => total + Number(task.estimatePomos || 0), 0);
  const actual = state.tasks.reduce((total, task) => total + Number(task.actualPomos || 0), 0);
  els.statsLine.textContent = `${tasks.length} 个当前任务 · ${done} 个已完成 · 番茄 ${actual}/${estimate}`;
  els.taskList.replaceChildren();
  els.emptyState.classList.toggle("visible", tasks.length === 0);
  Object.entries(groupedTasks(tasks)).forEach(([title, items]) => {
    const heading = document.createElement("div");
    heading.className = "group-title";
    heading.textContent = `${title} ${items.length}`;
    els.taskList.append(heading);
    items.forEach((task) => els.taskList.append(taskRow(task)));
  });
}

function taskRow(task) {
  const row = els.taskTemplate.content.firstElementChild.cloneNode(true);
  const title = row.querySelector("strong");
  const meta = row.querySelector("small");
  const date = row.querySelector(".task-date");
  const list = state.lists.find((item) => item.id === task.listId);
  const subDone = task.subtasks.filter((item) => item.completed).length;
  const subText = task.subtasks.length ? ` · 检查项 ${subDone}/${task.subtasks.length}` : "";
  const reminderText = task.reminder ? ` · 提醒 ${dateTimeLabel(task.reminder)}` : "";
  const pomoText = task.estimatePomos ? ` · 番茄 ${task.actualPomos}/${task.estimatePomos}` : "";

  row.classList.toggle("selected", state.selectedTaskId === task.id);
  row.classList.toggle("done", task.completed);
  row.addEventListener("click", () => {
    state.selectedTaskId = task.id;
    saveState();
    render();
  });

  title.textContent = task.title;
  title.className = `priority-${task.priority}`;
  meta.textContent = `${list?.name ?? "清单"} · ${priorityLabel(task.priority)}${subText}${reminderText}${pomoText}`;
  date.textContent = dateLabel(taskDate(task));

  row.querySelector(".task-check").addEventListener("click", (event) => {
    event.stopPropagation();
    updateTask(task.id, { completed: !task.completed }, task.completed ? "重新打开任务" : "完成任务");
  });

  return row;
}

function renderCalendar() {
  const [year, month] = state.calendarMonth.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const start = new Date(first);
  start.setDate(start.getDate() - start.getDay());
  els.calendarTitle.textContent = `${year} 年 ${month} 月`;
  els.calendarGrid.replaceChildren();
  ["日", "一", "二", "三", "四", "五", "六"].forEach((weekday) => {
    const cell = document.createElement("div");
    cell.className = "calendar-day muted";
    cell.innerHTML = `<div class="calendar-date">${weekday}</div>`;
    els.calendarGrid.append(cell);
  });

  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const key = formatDate(date);
    const cell = document.createElement("div");
    cell.className = "calendar-day";
    cell.classList.toggle("muted", date.getMonth() !== month - 1);
    cell.classList.toggle("today", key === todayKey);
    cell.innerHTML = `<div class="calendar-date"><span>${date.getDate()}</span><span>${countTasks((task) => taskDate(task) === key)}</span></div>`;
    state.tasks.filter((task) => taskDate(task) === key).slice(0, 3).forEach((task) => {
      const item = document.createElement("div");
      item.className = "calendar-task";
      item.textContent = task.title;
      item.style.background = state.lists.find((list) => list.id === task.listId)?.color ?? "var(--blue)";
      item.addEventListener("click", () => {
        state.selectedTaskId = task.id;
        state.activeMode = "tasks";
        state.activeView = "all";
        saveState();
        render();
      });
      cell.append(item);
    });
    els.calendarGrid.append(cell);
  }
}

function renderFocus() {
  const openTasks = state.tasks.filter((task) => !task.completed);
  els.focusTask.replaceChildren();
  openTasks.forEach((task) => {
    const option = document.createElement("option");
    option.value = task.id;
    option.textContent = task.title;
    els.focusTask.append(option);
  });
  if (state.selectedTaskId) els.focusTask.value = state.selectedTaskId;
  renderFocusTime();
}

function renderFocusTime() {
  const minutes = String(Math.floor(focusSeconds / 60)).padStart(2, "0");
  const seconds = String(focusSeconds % 60).padStart(2, "0");
  els.focusTime.textContent = `${minutes}:${seconds}`;
}

function renderStats() {
  const total = state.tasks.length;
  const done = countTasks((task) => task.completed);
  const open = total - done;
  const overdue = countTasks((task) => !task.completed && taskDate(task) && taskDate(task) < todayKey);
  const estimate = state.tasks.reduce((sum, task) => sum + Number(task.estimatePomos || 0), 0);
  const actual = state.tasks.reduce((sum, task) => sum + Number(task.actualPomos || 0), 0);
  const rate = total ? Math.round((done / total) * 100) : 0;
  els.statsView.innerHTML = `
    <div class="stats-board">
      ${statCard("完成率", `${rate}%`, rate)}
      ${statCard("未完成", `${open}`, Math.min(open * 12, 100))}
      ${statCard("已逾期", `${overdue}`, Math.min(overdue * 20, 100))}
      ${statCard("番茄进度", `${actual}/${estimate}`, estimate ? Math.round((actual / estimate) * 100) : 0)}
    </div>
  `;
}

function statCard(label, value, percent) {
  const width = Math.max(0, Math.min(100, percent));
  return `
    <div class="stat-card">
      <span>${label}</span>
      <strong>${value}</strong>
      <div class="bar"><i style="width:${width}%"></i></div>
    </div>
  `;
}

function renderDetail() {
  const task = selectedTask();
  els.detailEmpty.classList.toggle("hidden", Boolean(task));
  els.detailForm.classList.toggle("hidden", !task);
  els.detailList.replaceChildren();
  els.subtaskList.replaceChildren();
  els.historyList.replaceChildren();
  if (!task) return;

  state.lists.forEach((list) => {
    const option = document.createElement("option");
    option.value = list.id;
    option.textContent = list.name;
    els.detailList.append(option);
  });

  els.detailCompleted.checked = task.completed;
  els.detailTitle.value = task.title;
  els.detailList.value = task.listId;
  els.detailStart.value = task.startDate;
  els.detailDue.value = task.dueDate;
  els.detailReminder.value = task.reminder;
  els.detailPriority.value = task.priority;
  els.detailEstimate.value = task.estimatePomos;
  els.detailNotes.value = task.notes;
  task.subtasks.forEach((subtask) => els.subtaskList.append(subtaskRow(task, subtask)));
  task.history.slice(0, 8).forEach((item) => {
    const row = document.createElement("div");
    row.className = "history-item";
    row.textContent = `${new Date(item.at).toLocaleString("zh-CN")} · ${item.text}`;
    els.historyList.append(row);
  });
}

function subtaskRow(task, subtask) {
  const row = els.subtaskTemplate.content.firstElementChild.cloneNode(true);
  const done = row.querySelector(".subtask-done");
  const title = row.querySelector(".subtask-title");
  const reminder = row.querySelector(".subtask-reminder");
  const remove = row.querySelector(".subtask-delete");
  done.checked = subtask.completed;
  title.value = subtask.title;
  reminder.value = subtask.reminder;
  done.addEventListener("change", () => {
    subtask.completed = done.checked;
    addHistory(task, done.checked ? `完成检查项：${subtask.title}` : `重新打开检查项：${subtask.title}`);
    saveState();
    render();
  });
  title.addEventListener("change", () => {
    subtask.title = title.value.trim() || subtask.title;
    addHistory(task, "更新检查项");
    saveState();
    render();
  });
  reminder.addEventListener("change", () => {
    subtask.reminder = reminder.value;
    addHistory(task, "设置检查项提醒");
    saveState();
    render();
  });
  remove.addEventListener("click", () => {
    task.subtasks = task.subtasks.filter((item) => item.id !== subtask.id);
    addHistory(task, `删除检查项：${subtask.title}`);
    saveState();
    render();
  });
  return row;
}

els.railButtons.forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
els.quickAdd.addEventListener("click", () => {
  state.activeMode = "tasks";
  render();
  els.taskInput.focus();
});
els.quickAddTop.addEventListener("click", () => els.quickAdd.click());

els.taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = els.taskInput.value.trim();
  if (!title) {
    els.taskInput.focus();
    return;
  }
  addTask(title, els.taskStart.value, els.taskDue.value, els.taskPriority.value);
  els.taskInput.value = "";
  els.taskPriority.value = "none";
});

els.clearDone.addEventListener("click", () => {
  state.tasks = state.tasks.filter((task) => !task.completed);
  state.selectedTaskId = visibleTasks()[0]?.id ?? null;
  saveState();
  render();
});

els.exportData.addEventListener("click", async () => {
  const data = JSON.stringify(state, null, 2);
  try {
    await navigator.clipboard.writeText(data);
    alert("DockTodo 数据已复制到剪贴板。");
  } catch {
    const blob = new Blob([data], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `docktodo-${todayKey}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
});

els.addList.addEventListener("click", () => {
  const name = prompt("清单名称");
  if (!name?.trim()) return;
  const id = createId();
  state.lists.push({ id, name: name.trim(), color: "#4778ff" });
  state.activeView = id;
  saveState();
  render();
});

els.addFilter.addEventListener("click", () => {
  const name = prompt("筛选器名称，例如：已逾期");
  if (!name?.trim()) return;
  const type = prompt("筛选类型：high / reminder / nodate / overdue", "overdue");
  const allowed = ["high", "reminder", "nodate", "overdue"];
  state.filters.push({ id: createId(), name: name.trim(), type: allowed.includes(type) ? type : "overdue" });
  saveState();
  render();
});

els.themeToggle.addEventListener("click", () => {
  const themes = ["light", "dark", "mint", "sunrise"];
  state.theme = themes[(themes.indexOf(state.theme) + 1) % themes.length];
  saveState();
  render();
});

els.prevMonth.addEventListener("click", () => {
  const [year, month] = state.calendarMonth.split("-").map(Number);
  state.calendarMonth = formatDate(new Date(year, month - 2, 1)).slice(0, 7);
  saveState();
  render();
});

els.nextMonth.addEventListener("click", () => {
  const [year, month] = state.calendarMonth.split("-").map(Number);
  state.calendarMonth = formatDate(new Date(year, month, 1)).slice(0, 7);
  saveState();
  render();
});

els.startFocus.addEventListener("click", () => {
  if (focusTimer) {
    clearInterval(focusTimer);
    focusTimer = null;
    els.startFocus.textContent = "继续";
    return;
  }
  els.startFocus.textContent = "暂停";
  focusTimer = setInterval(() => {
    focusSeconds -= 1;
    renderFocusTime();
    if (focusSeconds <= 0) {
      clearInterval(focusTimer);
      focusTimer = null;
      focusSeconds = 25 * 60;
      recordPomo();
      alert("一个番茄已完成。");
    }
  }, 1000);
});

els.resetFocus.addEventListener("click", () => {
  clearInterval(focusTimer);
  focusTimer = null;
  focusSeconds = 25 * 60;
  els.startFocus.textContent = "开始";
  renderFocusTime();
});

els.completePomo.addEventListener("click", recordPomo);
els.focusTask.addEventListener("change", () => {
  state.selectedTaskId = els.focusTask.value;
  saveState();
  render();
});

function recordPomo() {
  const id = els.focusTask.value || state.selectedTaskId;
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  task.actualPomos = Number(task.actualPomos || 0) + 1;
  addHistory(task, "完成 1 个番茄");
  state.selectedTaskId = task.id;
  saveState();
  render();
}

els.detailCompleted.addEventListener("change", () => updateTask(state.selectedTaskId, { completed: els.detailCompleted.checked }, els.detailCompleted.checked ? "完成任务" : "重新打开任务"));
els.detailTitle.addEventListener("change", () => {
  const title = els.detailTitle.value.trim();
  if (title) updateTask(state.selectedTaskId, { title }, "更新标题");
});
els.detailList.addEventListener("change", () => updateTask(state.selectedTaskId, { listId: els.detailList.value }, "移动到其他清单"));
els.detailStart.addEventListener("change", () => updateTask(state.selectedTaskId, { startDate: els.detailStart.value }, "更新开始日期"));
els.detailDue.addEventListener("change", () => updateTask(state.selectedTaskId, { dueDate: els.detailDue.value }, "更新截止日期"));
els.detailReminder.addEventListener("change", () => updateTask(state.selectedTaskId, { reminder: els.detailReminder.value }, "设置任务提醒"));
els.detailPriority.addEventListener("change", () => updateTask(state.selectedTaskId, { priority: els.detailPriority.value }, "更新优先级"));
els.detailEstimate.addEventListener("change", () => updateTask(state.selectedTaskId, { estimatePomos: Number(els.detailEstimate.value || 0) }, "更新预计番茄"));
els.detailNotes.addEventListener("change", () => updateTask(state.selectedTaskId, { notes: els.detailNotes.value }, "更新备注"));

els.addSubtask.addEventListener("click", () => {
  const task = selectedTask();
  if (!task) return;
  task.subtasks.push(makeSubtask("新检查项", false, ""));
  addHistory(task, "添加检查项");
  saveState();
  render();
});

els.deleteTask.addEventListener("click", () => {
  const task = selectedTask();
  if (!task) return;
  state.tasks = state.tasks.filter((item) => item.id !== task.id);
  state.selectedTaskId = visibleTasks()[0]?.id ?? null;
  saveState();
  render();
});

render();
