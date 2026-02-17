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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const response = await fetch('/api/tasks');
        if (!response.ok) throw new Error('Failed to load tasks.');

        const data: Task[] = await response.json();
        setTasks(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load tasks.');
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();
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

  const handleAddTask = async (event: FormEvent) => {
    event.preventDefault();
    if (!newTask.trim()) return;

    const pendingTitle = newTask.trim();
    setNewTask('');

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: pendingTitle })
      });

      if (!response.ok) throw new Error('Failed to create task.');
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

      if (!response.ok) throw new Error('Failed to move task.');
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

      <form className="task-form" onSubmit={handleAddTask}>
        <input
          value={newTask}
          onChange={(event) => setNewTask(event.target.value)}
          placeholder="Add a task"
          aria-label="Task title"
        />
        <button type="submit">Add</button>
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
                    draggable
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
