'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Calendar, GripVertical, MessageCircle, Paperclip, Plus } from 'lucide-react';

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

  const handleDragStart = (e: React.DragEvent, task: Task, columnId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ task, sourceColumnId: columnId }));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetColumnId: string) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      const { task, sourceColumnId } = data;

      if (sourceColumnId === targetColumnId) return;

      // Atualizar estado local
      setColumns((prev) =>
        prev.map((col) => {
          if (col.id === sourceColumnId) {
            return { ...col, tasks: col.tasks.filter((t) => t.id !== task.id) };
          }
          if (col.id === targetColumnId) {
            return { ...col, tasks: [...col.tasks, task] };
          }
          return col;
        })
      );

      // Callback opcional para sincronizar com BD
      onTaskMove?.(task, sourceColumnId, targetColumnId);
    } catch (error) {
      console.error('Erro ao processar drop:', error);
    }
  };

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {columns.map((column) => (
          <div
            key={column.id}
            className="bg-slate-50 dark:bg-slate-900/30 rounded-lg p-4 min-h-[600px] transition-all border border-slate-200 dark:border-slate-700"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, column.id)}
          >
            {/* Column Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                {column.color && (
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: column.color }} />
                )}
                <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                  {column.title}
                </h3>
                <Badge className="bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs">
                  {column.tasks.length}
                </Badge>
              </div>
              <button
                onClick={() => onAddTask?.(column.id)}
                className="p-1 rounded-md bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                title="Adicionar tarefa"
              >
                <Plus className="w-4 h-4 text-slate-700 dark:text-slate-300" />
              </button>
            </div>

            {/* Tasks */}
            <div className="space-y-3">
              {column.tasks.map((task) => (
                <Card
                  key={task.id}
                  className="cursor-move transition-all duration-200 border bg-white dark:bg-slate-800 hover:shadow-md"
                  draggable
                  onDragStart={(e) => handleDragStart(e, task, column.id)}
                >
                  <CardContent className="p-3 space-y-2">
                    {/* Title & Grip */}
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100 leading-tight flex-1">
                        {task.title}
                      </h4>
                      <GripVertical className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
                    </div>

                    {/* Email */}
                    {task.email && (
                      <div className="text-xs text-slate-600 dark:text-slate-400">
                        <span className="font-medium">Email:</span> {task.email}
                      </div>
                    )}

                    {/* Telefone */}
                    {task.telefone && (
                      <div className="text-xs text-slate-600 dark:text-slate-400">
                        <span className="font-medium">Tel:</span> {task.telefone}
                      </div>
                    )}

                    {/* Observações */}
                    {task.observacoes && (
                      <div className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                        {task.observacoes}
                      </div>
                    )}

                    {/* Campanhas - Badges only */}
                    {task.tags && task.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {task.tags.slice(0, 2).map((tag) => (
                          <Badge
                            key={tag}
                            className="text-xs bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30"
                          >
                            {tag}
                          </Badge>
                        ))}
                        {task.tags.length > 2 && (
                          <Badge className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                            +{task.tags.length - 2}
                          </Badge>
                        )}
                      </div>
                    )}

                    {/* Footer: Date + Assignee */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
                      <div className="text-xs text-slate-600 dark:text-slate-400">
                        {task.dueDate && <span>{task.dueDate}</span>}
                      </div>

                      {task.assignee && (
                        <Avatar className="w-6 h-6">
                          {task.assignee.avatar && <AvatarImage src={task.assignee.avatar} />}
                          <AvatarFallback className="bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-slate-300 text-xs font-medium">
                            {task.assignee.name
                              .split(' ')
                              .map((n) => n[0])
                              .join('')}
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}

              {column.tasks.length === 0 && (
                <div className="flex items-center justify-center h-24 text-slate-400 dark:text-slate-500 text-sm">
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
