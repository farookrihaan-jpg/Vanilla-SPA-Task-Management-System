const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DB_CONFIG = {
  host: 'localhost',
  user: 'root',
  password: 'admin',
  database: 'taskmanager',
  waitForConnections: true,
  connectionLimit: 10,
};

let pool;

async function initDB() {
  const tempConn = await mysql.createConnection({
    host: DB_CONFIG.host,
    user: DB_CONFIG.user,
    password: DB_CONFIG.password,
  });

  await tempConn.execute(
    `CREATE DATABASE IF NOT EXISTS \`${DB_CONFIG.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await tempConn.end();

  pool = mysql.createPool(DB_CONFIG);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id          INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
      title       VARCHAR(500)  NOT NULL,
      status      TINYINT(1)    NOT NULL DEFAULT 0,
      created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  console.log('Database & table ready');
}

function renderHTML(tasks) {
  const taskRows = tasks.length
    ? tasks
        .map(
          (t) => `
      <li class="task-item ${t.status ? 'done' : ''}" data-id="${t.id}">
        <button class="toggle-btn" onclick="toggleTask(${t.id}, ${t.status ? 0 : 1})" title="${t.status ? 'Mark pending' : 'Mark complete'}">
          <span class="check-icon">${t.status ? '✓' : ''}</span>
        </button>
        <span class="task-title">${escapeHtml(t.title)}</span>
        <span class="task-date">${new Date(t.created_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</span>
        <button class="delete-btn" onclick="deleteTask(${t.id})" title="Delete task">✕</button>
      </li>`
        )
        .join('')
    : '<li class="empty-state"><span>No tasks yet — add one above ↑</span></li>';

  const total = tasks.length;
  const done = tasks.filter((t) => t.status).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Taskr — Task Manager</title>
  <link rel="stylesheet" href="/style.css" />
</head>
<body>

  <div class="noise"></div>

  <header class="app-header">
    <div class="header-inner">
      <div class="brand">
        <span class="brand-mark">✦</span>
        <h1 class="brand-name">Taskr</h1>
      </div>
      <div class="stats-bar">
        <div class="stat">
          <span class="stat-val" id="stat-total">${total}</span>
          <span class="stat-label">Total</span>
        </div>
        <div class="stat">
          <span class="stat-val" id="stat-done">${done}</span>
          <span class="stat-label">Done</span>
        </div>
        <div class="stat">
          <span class="stat-val" id="stat-pending">${total - done}</span>
          <span class="stat-label">Pending</span>
        </div>
      </div>
    </div>
    <div class="progress-track">
      <div class="progress-fill" id="progress-fill" style="width:${pct}%"></div>
    </div>
  </header>

  <main class="main-content">

    <section class="add-section">
      <form id="task-form" onsubmit="createTask(event)">
        <div class="input-group">
          <input
            type="text"
            id="task-input"
            placeholder="What needs to be done?"
            maxlength="500"
            autocomplete="off"
            required
          />
          <button type="submit" class="add-btn" id="add-btn">
            <span class="btn-text">Add Task</span>
            <span class="btn-icon">+</span>
          </button>
        </div>
        <div id="form-error" class="form-error" hidden></div>
      </form>
    </section>

    <section class="tasks-section">
      <div class="section-header">
        <h2 class="section-title">Tasks</h2>
        <div class="filter-tabs">
          <button class="filter-btn active" data-filter="all" onclick="filterTasks('all', this)">All</button>
          <button class="filter-btn" data-filter="pending" onclick="filterTasks('pending', this)">Pending</button>
          <button class="filter-btn" data-filter="done" onclick="filterTasks('done', this)">Done</button>
        </div>
      </div>

      <div id="loading-overlay" class="loading-overlay" hidden>
        <div class="spinner"></div>
      </div>

      <ul class="task-list" id="task-list">
        ${taskRows}
      </ul>
    </section>

  </main>

  <footer class="app-footer">
    <span>Server-side rendered · SPA after load · REST API</span>
  </footer>

  <script src="/app.js"></script>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

app.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM tasks ORDER BY created_at DESC'
    );
    res.send(renderHTML(rows));
  } catch (err) {
    console.error('SSR error:', err);
    res.status(500).send('<h1>Server error — check DB connection</h1>');
  }
});

app.get('/api/tasks', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM tasks ORDER BY created_at DESC'
    );
    res.json({ success: true, tasks: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to fetch tasks' });
  }
});

app.post('/api/tasks', async (req, res) => {
  const { title } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ success: false, error: 'Title is required' });
  }
  const clean = title.trim().slice(0, 500);
  try {
    const [result] = await pool.execute(
      'INSERT INTO tasks (title, status) VALUES (?, 0)',
      [clean]
    );
    const [rows] = await pool.execute('SELECT * FROM tasks WHERE id = ?', [
      result.insertId,
    ]);
    res.status(201).json({ success: true, task: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to create task' });
  }
});

app.put('/api/tasks/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { status } = req.body;
  if (isNaN(id) || status === undefined) {
    return res
      .status(400)
      .json({ success: false, error: 'Invalid id or status' });
  }
  try {
    const [result] = await pool.execute(
      'UPDATE tasks SET status = ? WHERE id = ?',
      [status ? 1 : 0, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }
    const [rows] = await pool.execute('SELECT * FROM tasks WHERE id = ?', [id]);
    res.json({ success: true, task: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to update task' });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ success: false, error: 'Invalid id' });
  }
  try {
    const [result] = await pool.execute('DELETE FROM tasks WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }
    res.json({ success: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to delete task' });
  }
});

initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Taskr running → http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ DB init failed:', err.message);
    process.exit(1);
  });
