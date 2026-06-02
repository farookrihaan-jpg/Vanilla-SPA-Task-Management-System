let allTasks = [];
let currentFilter = 'all';

const taskList      = document.getElementById('task-list');
const taskInput     = document.getElementById('task-input');
const addBtn        = document.getElementById('add-btn');
const formError     = document.getElementById('form-error');
const loadingOverlay = document.getElementById('loading-overlay');
const statTotal     = document.getElementById('stat-total');
const statDone      = document.getElementById('stat-done');
const statPending   = document.getElementById('stat-pending');
const progressFill  = document.getElementById('progress-fill');

(async function init() {
  try {
    const data = await apiFetch('/api/tasks');
    allTasks = data.tasks;
    renderList();
    updateStats();
  } catch (err) {
    showToast('Could not load tasks from server', 'error');
  }
})();

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'API error');
  return data;
}

async function createTask(event) {
  event.preventDefault();
  const title = taskInput.value.trim();
  if (!title) return showFormError('Please enter a task title.');

  hideFormError();
  setLoading(true);

  try {
    const data = await apiFetch('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title }),
    });

    allTasks.unshift(data.task);
    taskInput.value = '';
    renderList();
    updateStats();
    showToast('Task added!', 'success');
    taskInput.focus();
  } catch (err) {
    showFormError(err.message || 'Failed to create task. Try again.');
  } finally {
    setLoading(false);
  }
}

async function toggleTask(id, newStatus) {
  const taskEl = document.querySelector(`.task-item[data-id="${id}"]`);
  if (taskEl) taskEl.style.opacity = '0.5';

  try {
    const data = await apiFetch(`/api/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status: newStatus }),
    });

    const idx = allTasks.findIndex((t) => t.id === id);
    if (idx !== -1) allTasks[idx] = data.task;
    renderList();
    updateStats();
    showToast(newStatus ? 'Marked complete ✓' : 'Marked pending', 'success');
  } catch (err) {
    if (taskEl) taskEl.style.opacity = '';
    showToast(err.message || 'Failed to update task', 'error');
  }
}

async function deleteTask(id) {
  const taskEl = document.querySelector(`.task-item[data-id="${id}"]`);

  // Animate out
  if (taskEl) {
    taskEl.classList.add('removing');
    await new Promise((r) => setTimeout(r, 240));
  }

  try {
    await apiFetch(`/api/tasks/${id}`, { method: 'DELETE' });
    allTasks = allTasks.filter((t) => t.id !== id);
    renderList();
    updateStats();
    showToast('Task deleted', 'success');
  } catch (err) {
    if (taskEl) taskEl.classList.remove('removing');
    showToast(err.message || 'Failed to delete task', 'error');
  }
}

function filterTasks(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll('.filter-btn').forEach((b) =>
    b.classList.remove('active')
  );
  btn.classList.add('active');
  renderList();
}

function getFilteredTasks() {
  if (currentFilter === 'done')    return allTasks.filter((t) => t.status);
  if (currentFilter === 'pending') return allTasks.filter((t) => !t.status);
  return allTasks;
}

function renderList() {
  const tasks = getFilteredTasks();
  taskList.innerHTML = '';

  if (!tasks.length) {
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.innerHTML = `<span>${
      currentFilter === 'done'
        ? 'No completed tasks yet.'
        : currentFilter === 'pending'
        ? 'All caught up! No pending tasks.'
        : 'No tasks yet — add one above ↑'
    }</span>`;
    taskList.appendChild(li);
    return;
  }

  tasks.forEach((task, i) => {
    const li = document.createElement('li');
    li.className = `task-item${task.status ? ' done' : ''}`;
    li.dataset.id = task.id;
    li.style.animationDelay = `${i * 40}ms`;

    const date = new Date(task.created_at).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    li.innerHTML = `
      <button class="toggle-btn"
              onclick="toggleTask(${task.id}, ${task.status ? 0 : 1})"
              title="${task.status ? 'Mark pending' : 'Mark complete'}">
        <span class="check-icon">${task.status ? '✓' : ''}</span>
      </button>
      <span class="task-title">${escapeHtml(task.title)}</span>
      <span class="task-date">${date}</span>
      <button class="delete-btn"
              onclick="deleteTask(${task.id})"
              title="Delete task">✕</button>
    `;

    taskList.appendChild(li);
  });
}

function updateStats() {
  const total   = allTasks.length;
  const done    = allTasks.filter((t) => t.status).length;
  const pending = total - done;
  const pct     = total ? Math.round((done / total) * 100) : 0;

  animateNumber(statTotal,   parseInt(statTotal.textContent),   total);
  animateNumber(statDone,    parseInt(statDone.textContent),    done);
  animateNumber(statPending, parseInt(statPending.textContent), pending);

  progressFill.style.width = pct + '%';
}

function animateNumber(el, from, to) {
  if (from === to) { el.textContent = to; return; }
  const step = (to - from) / 12;
  let cur = from;
  const t = setInterval(() => {
    cur += step;
    const rounded = Math.round(cur);
    el.textContent = rounded;
    if ((step > 0 && rounded >= to) || (step < 0 && rounded <= to)) {
      el.textContent = to;
      clearInterval(t);
    }
  }, 30);
}
function setLoading(on) {
  addBtn.disabled = on;
  loadingOverlay.hidden = !on;
}

function showFormError(msg) {
  formError.textContent = msg;
  formError.hidden = false;
}

function hideFormError() {
  formError.hidden = true;
}

function showToast(message, type = 'success') {
  const existing = document.querySelectorAll('.toast');
  existing.forEach((t) => t.remove());

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.activeElement === taskInput) {
    taskInput.value = '';
    hideFormError();
  }
});
