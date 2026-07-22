import { motion } from 'framer-motion';
import { Info, ChevronLeft, ChevronRight } from 'lucide-react';
import { MOVIMENTACOES_SEMANAS } from '../tourData';
import { staggerContainer, staggerItem } from '../motionVariants';

const DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const TIPO_CLASSES: Record<string, string> = {
  entrega: 'bg-green-500/20 text-green-300',
  recolha: 'bg-amber-600/25 text-amber-300',
  troca: 'bg-violet-500/20 text-violet-300',
  interna: 'bg-blue-500/20 text-blue-300',
};

const ACOES = [
  { label: 'Entrega', count: 16 },
  { label: 'Recolha/Devolução', count: 39 },
  { label: 'Lista de Espera', count: 7 },
  { label: 'Movimentação Interna', count: null },
];

export const AnimatedMovimentacoes = () => {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-8 py-5">
        <div>
          <h2 className="font-display text-xl font-semibold text-foreground">Movimentações</h2>
          <p className="text-sm text-muted-foreground">
            Agendamento de entregas, devoluções e transferências — dados de demonstração.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {ACOES.map((acao) => (
            <div
              key={acao.label}
              className="relative rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground"
            >
              {acao.label}
              {acao.count !== null && (
                <span className="ml-1.5 rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary">
                  {acao.count}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 space-y-4 px-8 py-6">
        <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>
            Os eventos são <span className="font-medium text-foreground">automáticos</span>. Entregas,
            recolhas e trocas vêm dos <span className="font-medium text-foreground">contratos</span>; as
            transferências internas vêm das movimentações. Aqui só consultas e fazes check-in / check-out.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          <span className="font-display text-sm font-semibold text-foreground">Julho 2026</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>

        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border text-[11px]">
          {DIAS_SEMANA.map((dia) => (
            <div key={dia} className="bg-card px-2 py-1.5 text-center font-medium text-muted-foreground">
              {dia}
            </div>
          ))}

          <motion.div
            className="contents"
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
          >
            {MOVIMENTACOES_SEMANAS.flat().map((cell, index) => (
              <motion.div
                key={index}
                variants={staggerItem}
                className={`min-h-[68px] bg-background px-1.5 py-1.5 ${
                  cell.atual ? 'ring-1 ring-inset ring-primary' : ''
                }`}
              >
                <span className={`text-[11px] ${cell.atual ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
                  {cell.dia}
                </span>
                <div className="mt-1 flex flex-col gap-0.5">
                  {cell.eventos.slice(0, 2).map((evento, i) => (
                    <span
                      key={i}
                      className={`truncate rounded px-1 py-0.5 text-[9px] font-medium ${TIPO_CLASSES[evento.tipo]}`}
                    >
                      {evento.matricula}
                    </span>
                  ))}
                  {cell.eventos.length > 2 && (
                    <span className="text-[9px] text-muted-foreground">+{cell.eventos.length - 2}</span>
                  )}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  );
};
