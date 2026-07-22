import { motion } from 'framer-motion';
import { Search, Car, User as UserIcon, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '../StatusBadge';
import { ASSISTENCIA_STATS, ASSISTENCIA_TICKETS } from '../tourData';
import { staggerContainer, staggerRow } from '../motionVariants';
import { useCountUp } from '@/hooks/useCountUp';
import { cn } from '@/lib/utils';

const STAT_VALUE_CLASSES: Record<(typeof ASSISTENCIA_STATS)[number]['tone'], string> = {
  red: 'text-red-500',
  amber: 'text-amber-500',
  blue: 'text-blue-500',
  green: 'text-green-500',
};

const AnimatedStat = ({ stat }: { stat: (typeof ASSISTENCIA_STATS)[number] }) => {
  const ref = useCountUp(stat.value);
  return (
    <Card className={cn(stat.highlighted && 'border-2 border-primary')}>
      <CardContent className="pt-5 pb-4 text-center">
        <div className={cn('text-2xl font-bold', STAT_VALUE_CLASSES[stat.tone])}>
          <span ref={ref}>0</span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{stat.label}</div>
      </CardContent>
    </Card>
  );
};

const FILTROS = ['Pendentes', 'Todas prioridades', 'Todas categorias', 'Todos os criadores'];

export const AnimatedAssistencia = () => {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-8 py-5">
        <div>
          <h2 className="font-display text-xl font-semibold text-foreground">Gestão de Assistência</h2>
          <p className="text-sm text-muted-foreground">
            Gerir e resolver tickets de suporte e reparações — dados de demonstração.
          </p>
        </div>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          <Plus className="h-4 w-4" />
          Nova Assistência
        </button>
      </div>

      <div className="flex-1 space-y-4 px-8 py-6">
        <motion.div
          className="grid grid-cols-2 gap-3 lg:grid-cols-4"
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
        >
          {ASSISTENCIA_STATS.map((stat) => (
            <AnimatedStat key={stat.label} stat={stat} />
          ))}
        </motion.div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-1 min-w-[200px] items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
            <Search className="h-4 w-4" />
            Pesquisar por título, matrícula, número...
          </div>
          {FILTROS.map((filtro) => (
            <div
              key={filtro}
              className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground"
            >
              {filtro}
            </div>
          ))}
        </div>

        <motion.div
          className="divide-y divide-border rounded-lg border border-border"
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
        >
          {ASSISTENCIA_TICKETS.map((ticket) => (
            <motion.div
              key={ticket.id}
              variants={staggerRow}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
            >
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-xs text-muted-foreground">{ticket.id}</span>
                <StatusBadge status={ticket.prioridade} />
                <div>
                  <p className="text-sm font-medium text-foreground">{ticket.titulo}</p>
                  <p className="text-xs text-muted-foreground">
                    Criado por: <span className="text-primary">{ticket.criador}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Car className="h-3.5 w-3.5" />
                  {ticket.matricula}
                </span>
                <span className="flex items-center gap-1">
                  <UserIcon className="h-3.5 w-3.5" />
                  {ticket.responsavel}
                </span>
                <span>{ticket.data}</span>
                <StatusBadge status={ticket.estado} />
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
};
