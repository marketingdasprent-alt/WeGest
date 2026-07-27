/**
 * Diferenciação ESTRUTURAL entre documentos fiscais e não-fiscais (spec §7.1).
 *
 * Um Aviso de vencimento sai da app por email e é reencaminhado a
 * contabilistas — a distinção tem de sobreviver fora de contexto, por isso
 * não basta uma cor diferente. Quatro sinais redundantes: traço (contínuo vs.
 * tracejado), ícone, cor, e o chip/texto FISCAL vs. NÃO FISCAL. A redundância
 * é o que faz a distinção sobreviver a impressão a preto e branco, daltonismo
 * e leitores de ecrã.
 */
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/utils/formatters';

export type DocumentoTokenTipo = 'fiscal' | 'nao_fiscal';

export interface DocumentoTokenProps {
  tipo: DocumentoTokenTipo;
  icone: LucideIcon;
  /** Ex.: "FT 2026/143" (fiscal, com série) ou "Aviso 2/6" (não-fiscal, NUNCA tem série). */
  titulo: string;
  /** Ex.: "Fatura original · 12/07/2026". */
  subtitulo: string;
  valor: number;
}

export function DocumentoToken({ tipo, icone: Icone, titulo, subtitulo, valor }: DocumentoTokenProps) {
  const fiscal = tipo === 'fiscal';
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-md border p-3',
        fiscal
          ? 'border-solid border-slate-300 dark:border-slate-700'
          : 'border-dashed border-amber-400 dark:border-amber-600'
      )}
    >
      <Icone
        className={cn('h-5 w-5 shrink-0 mt-0.5', fiscal ? 'text-slate-600 dark:text-slate-400' : 'text-amber-600 dark:text-amber-400')}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{titulo}</span>
          <span
            className={cn(
              'text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5',
              fiscal
                ? 'bg-slate-500/10 text-slate-700 dark:text-slate-300'
                : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
            )}
          >
            {fiscal ? 'FISCAL' : 'NÃO FISCAL'}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {subtitulo} · <span className="tabular-nums">{formatCurrency(valor)}</span>
        </p>
        {!fiscal && (
          <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
            Não substitui fatura nem recibo
          </p>
        )}
      </div>
    </div>
  );
}
