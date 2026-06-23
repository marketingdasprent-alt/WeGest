import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Car, BarChart3, Receipt, Truck, MessageSquare, LifeBuoy } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActionItemProps {
  icon: React.ElementType;
  label: string;
  onClick?: () => void;
  className?: string;
}

const ActionItem: React.FC<ActionItemProps> = ({ icon: Icon, label, onClick, className }) => (
  <Card
    className={cn(
      'cursor-pointer hover:bg-accent/50 transition-all duration-200 border-border/50 group active:scale-95',
      className
    )}
    onClick={onClick}
  >
    <CardContent className="p-4 flex flex-col items-center justify-center gap-2 text-center">
      <div className="w-12 h-12 rounded-xl bg-teal-500/10 flex items-center justify-center group-hover:bg-teal-500/20 transition-colors">
        <Icon className="w-6 h-6 text-teal-600 dark:text-teal-400" />
      </div>
      <span className="text-xs font-semibold text-muted-foreground group-hover:text-foreground transition-colors uppercase tracking-wider">
        {label}
      </span>
    </CardContent>
  </Card>
);

export const MotoristaActionsPanel: React.FC = () => {
  const actions = [
    { icon: Car, label: 'Minhas Corridas' },
    { icon: BarChart3, label: 'Análise' },
    { icon: Receipt, label: 'Despesas' },
    { icon: Truck, label: 'Veículos' },
    { icon: MessageSquare, label: 'Mensagens' },
    { icon: LifeBuoy, label: 'Suporte' },
  ];

  const handleAction = (label: string) => {
    // Implementar navegação conforme necessário futuramente
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
      {actions.map((action) => (
        <ActionItem
          key={action.label}
          icon={action.icon}
          label={action.label}
          onClick={() => handleAction(action.label)}
        />
      ))}
    </div>
  );
};
