import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';

interface ColumnContainerProps {
  id: string;
  title: string;
  color: string;
  icon: string;
  count: number;
  children: React.ReactNode;
}

export const ColumnContainer: React.FC<ColumnContainerProps> = ({
  id,
  title,
  color,
  icon,
  count,
  children,
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: {
      type: 'column',
      accepts: ['lead'],
      status: id,
    },
  });

  const getTitleColor = (columnId: string) => {
    const colors: Record<string, string> = {
      novo: 'text-blue-700 dark:text-blue-400',
      contactado: 'text-purple-700 dark:text-purple-400',
      interessado: 'text-yellow-700 dark:text-yellow-400',
      convertido: 'text-green-700 dark:text-green-400',
      perdido: 'text-red-700 dark:text-red-400',
    };
    return colors[columnId] || 'text-foreground';
  };

  return (
    <motion.div
      ref={setNodeRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`
        border border-l-4 rounded-lg p-5 min-h-[600px] transition-all duration-200
        ${color} relative
        ${
          id === 'novo'
            ? 'border-l-blue-400 dark:border-l-blue-500'
            : id === 'contactado'
              ? 'border-l-purple-400 dark:border-l-purple-500'
              : id === 'interessado'
                ? 'border-l-yellow-400 dark:border-l-yellow-500'
                : id === 'convertido'
                  ? 'border-l-green-400 dark:border-l-green-500'
                  : 'border-l-red-400 dark:border-l-red-500'
        }
        ${isOver ? 'shadow-lg scale-[1.01]' : ''}
      `}
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{icon}</span>
          <div>
            <h3 className={`font-bold text-lg ${getTitleColor(id)}`}>{title}</h3>
            <p className="text-muted-foreground text-sm">Pipeline ativo</p>
          </div>
        </div>
        <Badge
          variant="secondary"
          className={`text-base px-3 py-1 font-bold ${
            id === 'novo'
              ? 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
              : id === 'contactado'
                ? 'bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                : id === 'interessado'
                  ? 'bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800'
                  : id === 'convertido'
                    ? 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800'
                    : 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
          }`}
        >
          {count}
        </Badge>
      </div>

      <div className="space-y-4 min-h-[400px] relative">
        {children}

        {/* Drop zone indicator when dragging over */}
        {isOver && (
          <div className="absolute inset-0 border-2 border-dashed border-primary rounded-lg bg-primary/5 pointer-events-none flex items-center justify-center">
            <p className="text-primary font-semibold">Soltar aqui</p>
          </div>
        )}
      </div>

      {count === 0 && !isOver && (
        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
          <p className="text-sm text-center">Nenhum lead nesta fase</p>
        </div>
      )}
    </motion.div>
  );
};
