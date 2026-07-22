import { motion } from 'framer-motion';
import { FileText, RefreshCw, Search, Plus, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '../StatusBadge';
import { RENTING_CONTRATOS, RENTING_RENOVAR } from '../tourData';
import { staggerContainer, staggerRow } from '../motionVariants';

const FILTROS = [
  { label: 'Estação', value: 'Todas as estações' },
  { label: 'Data início', value: 'dd/mm/aaaa' },
  { label: 'Data fim', value: 'dd/mm/aaaa' },
  { label: 'Estado operacional', value: 'Todos' },
  { label: 'Estado financeiro', value: 'Todos' },
];

export const AnimatedRenting = () => {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-border px-8 py-5">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <div>
            <h2 className="font-display text-xl font-semibold text-foreground">Contratos</h2>
            <p className="text-sm text-muted-foreground">Lista de contratos de renting — dados de demonstração.</p>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4 px-8 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <span className="flex items-center gap-2 text-sm">
            <RefreshCw className="h-4 w-4 text-amber-500" />
            <span className="font-medium text-amber-500">{RENTING_RENOVAR.total} contratos por renovar</span>
            <span className="text-muted-foreground">·</span>
            <span className="font-medium text-red-500">{RENTING_RENOVAR.atraso} em atraso</span>
          </span>
          <button className="rounded-md border border-amber-500/40 px-3 py-1.5 text-sm font-medium text-amber-500">
            Ver contratos
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-1 min-w-[220px] items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
            <Search className="h-4 w-4" />
            Pesquisar por código, matrícula, motorista ou contribuinte...
          </div>
          <button className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
            <Plus className="h-4 w-4" />
            Criar Contrato
          </button>
          <button className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground">
            <Download className="h-4 w-4" />
            Exportar
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {FILTROS.map((filtro) => (
            <div key={filtro.label} className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {filtro.label}
              </p>
              <div className="rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground">
                {filtro.value}
              </div>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Matrícula</TableHead>
                <TableHead>Grupo</TableHead>
                <TableHead>Estação entrega</TableHead>
                <TableHead>Data início</TableHead>
                <TableHead>Data fim</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Condutor</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Faturação</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <motion.tbody initial="hidden" animate="visible" variants={staggerContainer}>
              {RENTING_CONTRATOS.map((row) => (
                <motion.tr
                  key={row.codigo}
                  variants={staggerRow}
                  className="border-b transition-colors hover:bg-muted/40 last:border-0"
                >
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-1.5">
                      {row.codigo}
                      {row.versao && (
                        <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal">
                          {row.versao}
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.matricula}</TableCell>
                  <TableCell className="text-muted-foreground">{row.grupo}</TableCell>
                  <TableCell className="text-muted-foreground">{row.estacaoEntrega}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{row.dataInicio}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{row.dataFim}</TableCell>
                  <TableCell className="text-foreground">{row.cliente}</TableCell>
                  <TableCell className="text-muted-foreground">{row.condutor}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.estadoOperacional} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={row.estadoFinanceiro} />
                  </TableCell>
                  <TableCell className="text-right font-medium">{row.total}</TableCell>
                </motion.tr>
              ))}
            </motion.tbody>
          </Table>
        </div>
      </div>
    </div>
  );
};
