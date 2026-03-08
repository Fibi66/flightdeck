import { useMemo, useState } from 'react';
import {
  Clock,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Pause,
  SkipForward,
  Play,
  Lock,
  ChevronDown,
  ChevronRight,
  User,
  GitBranch,
  FileText,
} from 'lucide-react';
import type { DagStatus, DagTask, DagTaskStatus } from '../../types';

// ── Column Definitions ──────────────────────────────────────────────

interface ColumnDef {
  status: DagTaskStatus;
  label: string;
  icon: React.ReactNode;
  accentClass: string;
  borderClass: string;
}

const COLUMNS: ColumnDef[] = [
  { status: 'pending',  label: 'Pending',  icon: <Clock size={14} />,        accentClass: 'text-th-text-muted',  borderClass: 'border-th-border' },
  { status: 'ready',    label: 'Ready',    icon: <Play size={14} />,         accentClass: 'text-green-400',      borderClass: 'border-green-500/30' },
  { status: 'running',  label: 'Running',  icon: <AlertCircle size={14} />,  accentClass: 'text-blue-400',       borderClass: 'border-blue-500/30' },
  { status: 'blocked',  label: 'Blocked',  icon: <Lock size={14} />,         accentClass: 'text-orange-400',     borderClass: 'border-orange-500/30' },
  { status: 'done',     label: 'Done',     icon: <CheckCircle2 size={14} />, accentClass: 'text-purple-400',     borderClass: 'border-purple-500/30' },
  { status: 'failed',   label: 'Failed',   icon: <XCircle size={14} />,      accentClass: 'text-red-400',        borderClass: 'border-red-500/30' },
  { status: 'paused',   label: 'Paused',   icon: <Pause size={14} />,        accentClass: 'text-yellow-400',     borderClass: 'border-yellow-500/30' },
  { status: 'skipped',  label: 'Skipped',  icon: <SkipForward size={14} />,  accentClass: 'text-th-text-muted',  borderClass: 'border-th-border' },
];

// ── Status background styles (matches DagGraph conventions) ─────────

const STATUS_BG: Record<DagTaskStatus, string> = {
  pending:  'bg-th-bg-muted/50',
  ready:    'bg-green-500/5',
  running:  'bg-blue-500/5',
  blocked:  'bg-orange-500/5',
  done:     'bg-purple-500/5',
  failed:   'bg-red-500/5',
  paused:   'bg-yellow-500/5',
  skipped:  'bg-th-bg-muted/30',
};

// ── Helpers ──────────────────────────────────────────────────────────

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text;
}

function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp.endsWith('Z') ? timestamp : timestamp.replace(' ', 'T') + 'Z').getTime();
  const diffMs = now - then;

  if (diffMs < 60_000) return 'just now';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return `${Math.floor(diffMs / 86_400_000)}d ago`;
}

function priorityBadge(priority: number): React.ReactNode {
  if (priority <= 0) return null;
  const colors = priority >= 3 ? 'bg-red-500/20 text-red-400' :
                 priority === 2 ? 'bg-orange-500/20 text-orange-400' :
                 'bg-blue-500/20 text-blue-400';
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${colors}`}>
      P{priority}
    </span>
  );
}

// ── Task Card Component ─────────────────────────────────────────────

interface TaskCardProps {
  task: DagTask;
  allTasks: DagTask[];
}

function TaskCard({ task, allTasks }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const title = task.title || task.description || task.id;
  const hasDetails = task.dependsOn.length > 0 || task.files.length > 0 || task.assignedAgentId;

  const dependencyNames = useMemo(() => {
    if (task.dependsOn.length === 0) return [];
    return task.dependsOn.map(depId => {
      const dep = allTasks.find(t => t.id === depId);
      return { id: depId, label: dep?.title || dep?.id || depId, status: dep?.dagStatus };
    });
  }, [task.dependsOn, allTasks]);

  return (
    <div
      className="bg-th-bg rounded-md border border-th-border p-2.5 shadow-sm hover:border-th-text-muted/30 transition-colors cursor-pointer"
      onClick={() => hasDetails && setExpanded(!expanded)}
      data-testid={`kanban-card-${task.id}`}
    >
      {/* Header row: title + priority */}
      <div className="flex items-start justify-between gap-1.5">
        <div className="flex items-start gap-1 min-w-0 flex-1">
          {hasDetails && (
            <span className="mt-0.5 text-th-text-muted flex-shrink-0">
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </span>
          )}
          <span className="text-xs font-medium text-th-text leading-tight break-words">
            {truncate(title, 80)}
          </span>
        </div>
        {priorityBadge(task.priority)}
      </div>

      {/* Meta row: role + timestamp */}
      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-th-text-muted">
        <span className="bg-th-bg-muted px-1.5 py-0.5 rounded text-th-text-alt">{task.role}</span>
        {task.createdAt && (
          <span title={task.createdAt}>{formatRelativeTime(task.createdAt)}</span>
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-2 pt-2 border-t border-th-border space-y-1.5">
          {/* Assigned agent */}
          {task.assignedAgentId && (
            <div className="flex items-center gap-1 text-[10px] text-th-text-muted">
              <User size={10} />
              <span>Agent: {truncate(task.assignedAgentId, 12)}</span>
            </div>
          )}

          {/* Dependencies */}
          {dependencyNames.length > 0 && (
            <div className="space-y-0.5">
              <div className="flex items-center gap-1 text-[10px] text-th-text-muted">
                <GitBranch size={10} />
                <span>Dependencies:</span>
              </div>
              {dependencyNames.map(dep => (
                <div key={dep.id} className="ml-3 text-[10px] text-th-text-alt flex items-center gap-1">
                  <span className={dep.status === 'done' ? 'text-purple-400' : dep.status === 'running' ? 'text-blue-400' : 'text-th-text-muted'}>
                    {dep.status === 'done' ? '✓' : dep.status === 'running' ? '●' : '○'}
                  </span>
                  {truncate(dep.label, 40)}
                </div>
              ))}
            </div>
          )}

          {/* Files */}
          {task.files.length > 0 && (
            <div className="space-y-0.5">
              <div className="flex items-center gap-1 text-[10px] text-th-text-muted">
                <FileText size={10} />
                <span>Files ({task.files.length}):</span>
              </div>
              {task.files.slice(0, 3).map(file => (
                <div key={file} className="ml-3 text-[10px] text-th-text-alt font-mono">
                  {truncate(file, 40)}
                </div>
              ))}
              {task.files.length > 3 && (
                <div className="ml-3 text-[10px] text-th-text-muted">
                  +{task.files.length - 3} more
                </div>
              )}
            </div>
          )}

          {/* Full description if different from title */}
          {task.description && task.description !== title && (
            <div className="text-[10px] text-th-text-alt mt-1">
              {truncate(task.description, 200)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Kanban Column Component ─────────────────────────────────────────

interface KanbanColumnProps {
  column: ColumnDef;
  tasks: DagTask[];
  allTasks: DagTask[];
  collapsed: boolean;
  onToggleCollapse: () => void;
}

function KanbanColumn({ column, tasks, allTasks, collapsed, onToggleCollapse }: KanbanColumnProps) {
  return (
    <div
      className={`flex flex-col rounded-lg border ${column.borderClass} ${STATUS_BG[column.status]} min-w-[220px] max-w-[300px] flex-1`}
      data-testid={`kanban-column-${column.status}`}
    >
      {/* Column header */}
      <button
        className="flex items-center gap-2 px-3 py-2.5 border-b border-th-border/50 w-full text-left"
        onClick={onToggleCollapse}
      >
        <span className={column.accentClass}>{column.icon}</span>
        <span className="text-xs font-medium text-th-text">{column.label}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tasks.length > 0 ? column.accentClass + ' bg-th-bg-muted' : 'text-th-text-muted'}`}>
          {tasks.length}
        </span>
        <span className="ml-auto text-th-text-muted">
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </span>
      </button>

      {/* Task cards */}
      {!collapsed && (
        <div className="p-2 space-y-2 overflow-y-auto flex-1" style={{ maxHeight: 480 }}>
          {tasks.length === 0 ? (
            <div className="text-[10px] text-th-text-muted text-center py-4 italic">
              No tasks
            </div>
          ) : (
            tasks.map(task => (
              <TaskCard key={task.id} task={task} allTasks={allTasks} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Main KanbanBoard Component ──────────────────────────────────────

interface KanbanBoardProps {
  dagStatus: DagStatus | null;
}

export function KanbanBoard({ dagStatus }: KanbanBoardProps) {
  const [collapsedColumns, setCollapsedColumns] = useState<Set<DagTaskStatus>>(new Set());
  const [hideEmpty, setHideEmpty] = useState(false);

  const tasksByStatus = useMemo(() => {
    const map = new Map<DagTaskStatus, DagTask[]>();
    for (const col of COLUMNS) {
      map.set(col.status, []);
    }
    if (dagStatus?.tasks) {
      for (const task of dagStatus.tasks) {
        const list = map.get(task.dagStatus);
        if (list) {
          list.push(task);
        }
      }
    }
    // Sort tasks within each column: by priority (desc), then createdAt (asc)
    for (const [, tasks] of map) {
      tasks.sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return a.createdAt.localeCompare(b.createdAt);
      });
    }
    return map;
  }, [dagStatus?.tasks]);

  const allTasks = dagStatus?.tasks ?? [];

  const visibleColumns = useMemo(() => {
    if (!hideEmpty) return COLUMNS;
    return COLUMNS.filter(col => (tasksByStatus.get(col.status)?.length ?? 0) > 0);
  }, [hideEmpty, tasksByStatus]);

  const toggleCollapse = (status: DagTaskStatus) => {
    setCollapsedColumns(prev => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  if (!dagStatus || dagStatus.tasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-th-text-muted text-sm">
        No tasks to display
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-th-border/50">
        <div className="text-[11px] text-th-text-muted">
          {dagStatus.tasks.length} tasks across {visibleColumns.length} columns
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-th-text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={hideEmpty}
            onChange={(e) => setHideEmpty(e.target.checked)}
            className="rounded border-th-border"
          />
          Hide empty columns
        </label>
      </div>

      {/* Column grid */}
      <div className="flex gap-3 p-3 overflow-x-auto flex-1 items-start">
        {visibleColumns.map(col => (
          <KanbanColumn
            key={col.status}
            column={col}
            tasks={tasksByStatus.get(col.status) ?? []}
            allTasks={allTasks}
            collapsed={collapsedColumns.has(col.status)}
            onToggleCollapse={() => toggleCollapse(col.status)}
          />
        ))}
      </div>
    </div>
  );
}
