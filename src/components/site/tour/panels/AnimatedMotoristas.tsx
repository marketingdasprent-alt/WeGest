import { motion } from 'framer-motion';
import { Link2, FileWarning, CreditCard, Car, Plus } from 'lucide-react';
import { Table, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '../StatusBadge';
import { MOTORISTAS_ALERTAS, MOTORISTAS_LISTA, MOTORISTAS_TOTAL } from '../tourData';
import { staggerContainer, staggerRow } from '../motionVariants';
import { useCountUp } from '@/hooks/useCountUp';
import { cn } from '@/lib/utils';

const ALERTA_ICONS = [Link2, FileWarning, CreditCard, Car];

const TONE_TEXT: Record<string, string> = {
  amber: 'text-amber-500',
  red: 'text-red-500',
  blue: 'text-blue-500',
};

const AlertaBadge = ({ alerta, icon: Icon }: { alerta: (typeof MOTORISTAS_ALERTAS)[number]; icon: (typeof ALERTA_ICONS)[number] }) => {
  const ref = useCountUp(alerta.valor);
  return (
    <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
      <Icon className={cn('h-4 w-4', TONE_TEXT[alerta.tone])} />
      <span className={cn('font-medium', TONE_TEXT[alerta.tone])}>
        <span ref={ref}>0</span> {alerta.label}
      </span>
      <button className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-foreground">{alerta.acao}</button>
    </div>
  );
};

const FILTROS = [
  { label: 'Estado', value: 'Todos' },
  { label: 'Cidade', value: 'Todas' },
  { label: 'Gestor', value: 'Todos' },
];

export const AnimatedMotoristas = () => {
  const totalRef = useCountUp(MOTORISTAS_TOTAL);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-8 py-5">
        <div>
          <h2 className="font-display text-xl font-semibold text-foreground">Motoristas Ativos</h2>
          <p className="text-sm text-muted-foreground">
            <span ref={totalRef}>0</span> motoristas encontrados — dados de demonstração.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {MOTORISTAS_ALERTAS.map((alerta, index) => (
            <AlertaBadge key={alerta.label} alerta={alerta} icon={ALERTA_ICONS[index]} />
          ))}
          <button className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
            <Plus className="h-4 w-4" />
            Adicionar Motorista
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-4 px-8 py-6">
        <div className="space-y-3 rounded-lg border border-border p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
            Filtros de pesquisa
          </p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="space-y-1 lg:col-span-2">
              <p className="text-xs font-medium text-muted-foreground">Pesquisa rápida</p>
              <div className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
                Código, nome, NIF ou telefone...
              </div>
            </div>
            {FILTROS.map((filtro) => (
              <div key={filtro.label} className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{filtro.label}</p>
                <div className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
                  {filtro.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cód.</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Gestor</TableHead>
                <TableHead>ID Bolt</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <motion.tbody initial="hidden" animate="visible" variants={staggerContainer}>
              {MOTORISTAS_LISTA.map((row) => (
                <motion.tr
                  key={row.codigo}
                  variants={staggerRow}
                  className="border-b transition-colors hover:bg-muted/40 last:border-0"
                >
                  <TableCell className="text-muted-foreground">{row.codigo}</TableCell>
                  <TableCell className="font-medium">{row.nome}</TableCell>
                  <TableCell className="text-muted-foreground">{row.telefone}</TableCell>
                  <TableCell className="text-muted-foreground">{row.gestor}</TableCell>
                  <TableCell>
                    {row.idBolt ? (
                      <span className="font-mono text-xs text-green-500">{row.idBolt}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground/60">Não mapeado</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.cidade}</TableCell>
                  <TableCell className="text-right">
                    <StatusBadge status={row.status} />
                  </TableCell>
                </motion.tr>
              ))}
            </motion.tbody>
          </Table>
        </div>
      </div>
    </div>
  );
};
