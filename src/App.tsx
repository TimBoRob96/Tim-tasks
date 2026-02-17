import { FormEvent, useEffect, useMemo, useState } from 'react';

type ColumnId = 'todo' | 'doing' | 'done';

type Task = {
  id: string;
  title: string;
  column: ColumnId;
};

const columns: { id: ColumnId; title: string }[] = [
  { id: 'todo', title: 'To Do' },
  { id: 'doing', title: 'In Progress' },
  { id: 'done', title: 'Done' }
];

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTask, setNewTask] = useState('');
  const [password, setPassword] = useState('');
  const [canWrite, setCanWrite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [tasksResponse, authResponse] = await Promise.all([
          fetch('/api/tasks'),
          fetch('/api/auth-status')
        ]);
        if (!tasksResponse.ok) throw new Error('Failed to load tasks.');
        if (!authResponse.ok) throw new Error('Failed to check auth status.');

        const data: Task[] = await tasksResponse.json();
        const auth: { canWrite: boolean } = await authResponse.json();
        setCanWrite(auth.canWrite);
        setTasks(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load tasks.');
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  const counts = useMemo(() => {
    return columns.reduce<Record<ColumnId, number>>(
      (acc, column) => {
        acc[column.id] = tasks.filter((task) => task.column === column.id).length;
        return acc;
      },
      { todo: 0, doing: 0, done: 0 }
    );
  }, [tasks]);

  const parseError = async (response: Response, fallback: string) => {
    try {
      const payload: unknown = await response.json();
      if (
        payload &&
        typeof payload === 'object' &&
        'error' in payload &&
        typeof payload.error === 'string'
      ) {
        return payload.error;
      }
    } catch {
      // no-op, fallback below
    }
    return fallback;
  };

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    if (!password) {
      setError('Password required.');
      return;
    }

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      if (!response.ok) {
        throw new Error(await parseError(response, 'Login failed.'));
      }
      setPassword('');
      setCanWrite(true);
      setError(null);
    } catch (err) {
      setCanWrite(false);
      setError(err instanceof Error ? err.message : 'Login failed.');
    }
  };

  const handleLogout = async () => {
    await fetch('/api/logout', { method: 'POST' });
    setCanWrite(false);
  };

  const handleAddTask = async (event: FormEvent) => {
    event.preventDefault();
    if (!newTask.trim()) return;
    if (!canWrite) {
      setError('Login required to add tasks.');
      return;
    }

    const pendingTitle = newTask.trim();
    setNewTask('');

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: pendingTitle })
      });

      if (!response.ok) {
        throw new Error(await parseError(response, 'Failed to create task.'));
      }
      const created: Task = await response.json();
      setTasks((prev) => [created, ...prev]);
      setError(null);
    } catch (err) {
      setNewTask(pendingTitle);
      setError(err instanceof Error ? err.message : 'Failed to create task.');
    }
  };

  const handleDrop = async (
    event: React.DragEvent<HTMLElement>,
    targetColumn: ColumnId
  ) => {
    event.preventDefault();
    if (!canWrite) {
      setError('Login required to move tasks.');
      return;
    }
    const taskId = event.dataTransfer.getData('taskId');
    if (!taskId) return;

    const previous = tasks;
    const next = tasks.map((task) =>
      task.id === taskId ? { ...task, column: targetColumn } : task
    );
    setTasks(next);

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ column: targetColumn })
      });

      if (!response.ok) {
        throw new Error(await parseError(response, 'Failed to move task.'));
      }
      setError(null);
    } catch (err) {
      setTasks(previous);
      setError(err instanceof Error ? err.message : 'Failed to move task.');
    }
  };

  return (
    <div className="page">
      <header className="header">
        <h1>TimTasks Kanban</h1>
        <p>React + Vite + Fly.io + Neon Postgres</p>
      </header>

      <form className="write-key-row" onSubmit={handleLogin}>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={canWrite ? 'Write access enabled' : 'Enter write password'}
          aria-label="Write password"
        />
        {canWrite ? (
          <button type="button" onClick={handleLogout}>
            Logout
          </button>
        ) : (
          <button type="submit">Login</button>
        )}
      </form>

      <form className="task-form" onSubmit={handleAddTask}>
        <input
          value={newTask}
          onChange={(event) => setNewTask(event.target.value)}
          placeholder="Add a task"
          aria-label="Task title"
        />
        <button type="submit" disabled={!canWrite}>
          Add
        </button>
      </form>

      {loading ? <p className="status">Loading tasks...</p> : null}
      {error ? <p className="status error">{error}</p> : null}

      <section className="board">
        {columns.map((column) => (
          <article
            key={column.id}
            className="column"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => void handleDrop(event, column.id)}
          >
            <div className="column-head">
              <h2>{column.title}</h2>
              <span>{counts[column.id]}</span>
            </div>

            <div className="cards">
              {tasks
                .filter((task) => task.column === column.id)
                .map((task) => (
                  <div
                    key={task.id}
                    className="card"
                    draggable={canWrite}
                    onDragStart={(event) => event.dataTransfer.setData('taskId', task.id)}
                  >
                    {task.title}
                  </div>
                ))}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

export default App;
