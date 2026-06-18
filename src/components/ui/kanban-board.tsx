'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Calendar, GripVertical, Plus } from 'lucide-react';

export interface Task {
  id: string;
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  assignee?: {
    name: string;
    avatar?: string;
  };
  tags?: string[];
  dueDate?: string;
  attachments?: number;
  comments?: number;
  email?: string;
  telefone?: string;
  zona?: string;
  observacoes?: string;
  tipo_viatura?: string;
}

export interface Column {
  id: string;
  title: string;
  tasks: Task[];
  color?: string;
}

interface KanbanBoardProps {
  columns: Column[];
  onTaskMove?: (task: Task, sourceColumnId: string, targetColumnId: string) => void;
  onAddTask?: (columnId: string) => void;
  onTaskClick?: (task: Task, columnId: string) => void;
}

export function KanbanBoard({
  columns: initialColumns,
  onTaskMove,
  onAddTask,
  onTaskClick,
}: KanbanBoardProps) {
  const [columns, setColumns] = useState<Column[]>(initialColumns);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, task: Task, columnId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ task, sourceColumnId: columnId }));
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCol(columnId);
  };

  const handleDragLeave = () => setDragOverCol(null);

  const handleDrop = (e: React.DragEvent, targetColumnId: string) => {
    e.preventDefault();
    setDragOverCol(null);
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      const { task, sourceColumnId } = data;
      if (sourceColumnId === targetColumnId) return;
      setColumns((prev) =>
        prev.map((col) => {
          if (col.id === sourceColumnId)
            return { ...col, tasks: col.tasks.filter((t) => t.id !== task.id) };
          if (col.id === targetColumnId) return { ...col, tasks: [...col.tasks, task] };
          return col;
        })
      );
      onTaskMove?.(task, sourceColumnId, targetColumnId);
    } catch {
      // drop ignorado
    }
  };

  return (
    /* Scroll horizontal — colunas nunca encolhem abaixo de 280px */
    <div className="overflow-x-auto pb-3 -mx-1 px-1">
      <div className="flex gap-3" style={{ minWidth: `${columns.length * 292}px` }}>
        {columns.map((column) => (
          <div
            key={column.id}
            className={[
              'w-[280px] shrink-0 rounded-xl p-3 min-h-[560px] flex flex-col transition-colors',
              'bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-700',
              dragOverCol === column.id
                ? 'ring-2 ring-primary/40 border-primary/40 bg-primary/5'
                : '',
            ].join(' ')}
            onDragOver={(e) => handleDragOver(e, column.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, column.id)}
          >
            {/* Cabeçalho da coluna */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 min-w-0">
                {column.color && (
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: column.color }}
                  />
                )}
                <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                  {column.title}
                </h3>
                <span className="shrink-0 min-w-[20px] text-center text-xs font-medium px-1.5 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                  {column.tasks.length}
                </span>
              </div>
              <button
                onClick={() => onAddTask?.(column.id)}
                className="shrink-0 p-1 rounded-md bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                title="Adicionar"
              >
                <Plus className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
              </button>
            </div>

            {/* Cartões */}
            <div className="flex flex-col gap-2 flex-1">
              {column.tasks.map((task) => (
                <Card
                  key={task.id}
                  className="cursor-grab active:cursor-grabbing transition-shadow duration-150 border bg-white dark:bg-slate-800 hover:shadow-md"
                  draggable
                  onDragStart={(e) => handleDragStart(e, task, column.id)}
                  onClick={() => onTaskClick?.(task, column.id)}
                >
                  <CardContent className="p-3 space-y-2">
                    {/* Nome + grip */}
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100 leading-snug flex-1">
                        {task.title}
                      </h4>
                      <GripVertical className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 shrink-0 mt-0.5" />
                    </div>

                    {/* Email */}
                    {task.email && (
                      <p
                        className="text-xs text-slate-500 dark:text-slate-400 truncate"
                        title={task.email}
                      >
                        {task.email}
                      </p>
                    )}

                    {/* Telefone */}
                    {task.telefone && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">{task.telefone}</p>
                    )}

                    {/* Observações (2 linhas máx) */}
                    {task.observacoes && (
                      <p className="text-xs text-slate-400 dark:text-slate-500 line-clamp-2 leading-relaxed">
                        {task.observacoes}
                      </p>
                    )}

                    {/* Tags / campanhas */}
                    {task.tags && task.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {task.tags.slice(0, 2).map((tag) => (
                          <Badge
                            key={tag}
                            className="text-[10px] px-1.5 py-0 h-4 bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/25 font-medium"
                          >
                            {tag}
                          </Badge>
                        ))}
                        {task.tags.length > 2 && (
                          <Badge className="text-[10px] px-1.5 py-0 h-4 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                            +{task.tags.length - 2}
                          </Badge>
                        )}
                      </div>
                    )}

                    {/* Rodapé: data + avatar */}
                    {(task.dueDate || task.assignee) && (
                      <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 dark:border-slate-700">
                        {task.dueDate ? (
                          <span className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
                            <Calendar className="w-3 h-3" />
                            {task.dueDate}
                          </span>
                        ) : (
                          <span />
                        )}
                        {task.assignee && (
                          <Avatar className="w-5 h-5">
                            {task.assignee.avatar && <AvatarImage src={task.assignee.avatar} />}
                            <AvatarFallback className="bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-slate-300 text-[9px] font-medium">
                              {task.assignee.name
                                .split(' ')
                                .map((n) => n[0])
                                .join('')}
                            </AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}

              {column.tasks.length === 0 && (
                <div className="flex items-center justify-center flex-1 text-slate-300 dark:text-slate-600 text-sm select-none">
                  Vazio
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
