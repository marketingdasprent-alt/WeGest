import { motion } from 'framer-motion';
import { Printer, FileSpreadsheet, Plus, Search, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '../StatusBadge';
import { FROTA_STATS, FROTA_CATEGORIAS, FROTA_VIATURAS } from '../tourData';
import { staggerContainer, staggerItem, staggerRow } from '../motionVariants';
import { useCountUp } from '@/hooks/useCountUp';
import { cn } from '@/lib/utils';

const TONE_CLASSES: Record<string, string> = {
  blue: 'bg-blue-500/15 text-blue-500',
  green: 'bg-green-500/15 text-green-500',
  amber: 'bg-amber-500/15 text-amber-500',
  violet: 'bg-violet-500/15 text-violet-500',
};

const AnimatedStat = ({ stat }: { stat: (typeof FROTA_STATS)[number] }) => {
  const ref = useCountUp(stat.value);
  const Icon = stat.icon;
  return (
    <motion.div variants={staggerItem}>
      <Card className={cn(stat.highlighted && 'border-2 border-primary')}>
        <CardContent className="flex items-center gap-3 pt-5 pb-4">
          <div
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-full',
              TONE_CLASSES[stat.tone]
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">
              <span ref={ref}>0</span>
            </div>
            <div className="text-xs text-muted-foreground">{stat.label}</div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

const AnimatedCategoria = ({ cat }: { cat: (typeof FROTA_CATEGORIAS)[number] }) => {
  const ref = useCountUp(cat.value);
  return (
    <motion.div variants={staggerItem}>
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className={cn('text-xl font-bold', TONE_CLASSES[cat.tone].split(' ')[1])}>
            <span ref={ref}>0</span>
          </div>
          <div className="text-xs text-muted-foreground">{cat.label}</div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

const FILTROS = ['Estado', 'Categoria', 'Combustível'];

export const AnimatedFrota = () => {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-8 py-5">
        <div>
          <h2 className="font-display text-xl font-semibold text-foreground">Frota de Viaturas</h2>
          <p className="text-sm text-muted-foreground">
            Gestão completa da frota de veículos — dados de demonstração.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground">
            <Printer className="h-4 w-4" />
            Imprimir
          </button>
          <button className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground">
            <FileSpreadsheet className="h-4 w-4" />
            Exportar
          </button>
          <button className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
            <Plus className="h-4 w-4" />
            Nova Viatura
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-4 px-8 py-6">
        <motion.div
          className="grid grid-cols-2 gap-3 lg:grid-cols-4"
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
        >
          {FROTA_STATS.map((stat) => (
            <AnimatedStat key={stat.label} stat={stat} />
          ))}
        </motion.div>

        <motion.div
          className="grid grid-cols-2 gap-3 lg:w-1/2"
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
        >
          {FROTA_CATEGORIAS.map((cat) => (
            <AnimatedCategoria key={cat.label} cat={cat} />
          ))}
        </motion.div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-1 min-w-[200px] items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
            <Search className="h-4 w-4" />
            Pesquisar por matrícula, marca ou modelo...
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

        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Matrícula</TableHead>
                <TableHead>Marca/Modelo</TableHead>
                <TableHead>Ano</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Combustível</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Km</TableHead>
                <TableHead>Inspeção</TableHead>
              </TableRow>
            </TableHeader>
            <motion.tbody initial="hidden" animate="visible" variants={staggerContainer}>
              {FROTA_VIATURAS.map((row) => (
                <motion.tr
                  key={row.matricula}
                  variants={staggerRow}
                  className="border-b transition-colors hover:bg-muted/40 last:border-0"
                >
                  <TableCell className="font-medium">{row.matricula}</TableCell>
                  <TableCell className="text-muted-foreground">{row.modelo}</TableCell>
                  <TableCell className="text-muted-foreground">{row.ano}</TableCell>
                  <TableCell className="text-muted-foreground">{row.categoria}</TableCell>
                  <TableCell className="text-muted-foreground">{row.combustivel}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.estado} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.km}</TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'flex items-center gap-1 text-xs',
                        row.inspecao.urgente ? 'text-amber-500' : 'text-muted-foreground'
                      )}
                    >
                      {row.inspecao.urgente && <AlertTriangle className="h-3.5 w-3.5" />}
                      {row.inspecao.data}
                    </span>
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
