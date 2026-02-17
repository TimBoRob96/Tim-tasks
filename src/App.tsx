import { FormEvent, useEffect, useMemo, useState } from 'react';

type ColumnId = 'todo' | 'doing' | 'done';

type Task = {
  id: string;
  title: string;
  project: string;
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
  const [newProject, setNewProject] = useState('General');
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [projectFiltersReady, setProjectFiltersReady] = useState(false);

  const [password, setPassword] = useState('');
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [canWrite, setCanWrite] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const projects = useMemo(() => {
    const unique = [...new Set(tasks.map((task) => task.project))];
    return unique.sort((a, b) => a.localeCompare(b));
  }, [tasks]);

  const visibleTasks = useMemo(() => {
    if (!selectedProjects.length) return tasks;
    return tasks.filter((task) => selectedProjects.includes(task.project));
  }, [tasks, selectedProjects]);

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

  useEffect(() => {
    if (!projectFiltersReady) {
      setSelectedProjects(projects);
      setProjectFiltersReady(true);
      return;
    }

    setSelectedProjects((prev) => {
      const retained = prev.filter((project) => projects.includes(project));
      const additions = projects.filter((project) => !retained.includes(project));
      return [...retained, ...additions];
    });
  }, [projects, projectFiltersReady]);

  const counts = useMemo(() => {
    return columns.reduce<Record<ColumnId, number>>(
      (acc, column) => {
        acc[column.id] = visibleTasks.filter((task) => task.column === column.id).length;
        return acc;
      },
      { todo: 0, doing: 0, done: 0 }
    );
  }, [visibleTasks]);

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
      // no-op
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
      setIsLoginOpen(false);
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
    const pendingProject = newProject.trim() || 'General';
    setNewTask('');

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: pendingTitle, project: pendingProject })
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

  const handleDeleteTask = async (taskId: string) => {
    if (!canWrite) {
      setError('Login required to delete tasks.');
      return;
    }

    const previous = tasks;
    setTasks((prev) => prev.filter((task) => task.id !== taskId));

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error(await parseError(response, 'Failed to delete task.'));
      }
      setError(null);
    } catch (err) {
      setTasks(previous);
      setError(err instanceof Error ? err.message : 'Failed to delete task.');
    }
  };

  const toggleProject = (project: string) => {
    setSelectedProjects((prev) => {
      if (prev.includes(project)) {
        return prev.filter((item) => item !== project);
      }
      return [...prev, project];
    });
  };

  const selectAllProjects = () => setSelectedProjects(projects);
  const clearProjects = () => setSelectedProjects([]);

  return (
    <div className="page">
      <header className="header">
        <div>
          <h1>Tim Tasks</h1>
          <p>Have a look at what I am working on!</p>
        </div>
        <div className="header-actions">
          {canWrite ? (
            <button type="button" className="auth-btn" onClick={handleLogout}>
              Logout
            </button>
          ) : (
            <button
              type="button"
              className="auth-btn"
              onClick={() => setIsLoginOpen(true)}
            >
              Login
            </button>
          )}
        </div>
      </header>

      {isLoginOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setIsLoginOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Login</h2>
            <form onSubmit={handleLogin} className="modal-form">
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter password"
                aria-label="Write password"
                autoFocus
              />
              <div className="modal-actions">
                <button type="button" className="secondary-btn" onClick={() => setIsLoginOpen(false)}>
                  Cancel
                </button>
                <button type="submit">Sign in</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <form className="task-form" onSubmit={handleAddTask}>
        <input
          value={newTask}
          onChange={(event) => setNewTask(event.target.value)}
          placeholder="Add a task"
          aria-label="Task title"
        />
        <input
          value={newProject}
          onChange={(event) => setNewProject(event.target.value)}
          placeholder="Project"
          list="project-suggestions"
          aria-label="Project"
        />
        <datalist id="project-suggestions">
          {projects.map((project) => (
            <option key={project} value={project} />
          ))}
        </datalist>
        <button type="submit" disabled={!canWrite}>
          Add
        </button>
      </form>

      <section className="project-filter">
        <div className="filter-head">
          <strong>Projects</strong>
          <div className="filter-actions">
            <button type="button" className="link-btn" onClick={selectAllProjects}>
              Show all
            </button>
            <button type="button" className="link-btn" onClick={clearProjects}>
              Hide all
            </button>
          </div>
        </div>

        <div className="filter-list">
          {projects.length ? (
            projects.map((project) => (
              <label key={project} className="filter-item">
                <input
                  type="checkbox"
                  checked={selectedProjects.includes(project)}
                  onChange={() => toggleProject(project)}
                />
                <span>{project}</span>
              </label>
            ))
          ) : (
            <span className="muted">No projects yet</span>
          )}
        </div>
      </section>

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
              {visibleTasks
                .filter((task) => task.column === column.id)
                .map((task) => (
                  <div
                    key={task.id}
                    className="card"
                    draggable={canWrite}
                    onDragStart={(event) => event.dataTransfer.setData('taskId', task.id)}
                  >
                    {canWrite ? (
                      <button
                        type="button"
                        className="delete-btn"
                        aria-label={`Delete ${task.title}`}
                        onClick={() => void handleDeleteTask(task.id)}
                      >
                        ×
                      </button>
                    ) : null}
                    <div className="card-title">{task.title}</div>
                    <div className="card-project">{task.project}</div>
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
