import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Loader2, TrendingUp, TrendingDown, Calculator } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { SlotMensalidadeCard } from '../../SlotMensalidadeCard';
import type { SlotPeriodo } from '../../MotoristaResumoDialog';

/* ───────── helper Row ───────── */
function Row({
  label,
  value,
  bold,
  colored,
}: {
  label: string;
  value: string;
  bold?: boolean;
  colored?: string;
}) {
  return (
    <div className={`flex justify-between items-center print:text-xs ${bold ? 'font-bold' : ''}`}>
      <span>{label}</span>
      <span className={colored}>{value}</span>
    </div>
  );
}

/* ───────── types ───────── */
interface InfoField {
  key: string;
  label: string;
  value: string | null;
  always?: boolean;
  show?: boolean;
  colored?: string;
}

interface ResumoReportContentProps {
  logoSrc: string;
  infoFields: InfoField[];
  loading: boolean;
  fmt: (value: number) => string;
  isImportado: boolean;
  receitas: { bolt: number; uber: number; outras_receitas: number };
  gorjeta: number;
  totalReceitas: number;
  receitaAjustada: number;
  despesas: {
    aluguer: number;
    combustivel: number;
    portagens: number;
    outros_custos: number;
    caucao: number;
    seguros: number;
    reparacoes: number;
  };
  totalDespesas: number;
  slotPeriodos: SlotPeriodo[];
  totalSlot: number;
  valoresSemanaAnterior: number;
  totalAReceber: number;
  liquido: number;
  motoristaId?: string;
}

export function ResumoReportContent({
  logoSrc,
  infoFields,
  loading,
  fmt,
  isImportado,
  receitas,
  gorjeta,
  totalReceitas,
  receitaAjustada,
  despesas,
  totalDespesas,
  slotPeriodos,
  totalSlot,
  valoresSemanaAnterior,
  totalAReceber,
  liquido,
  motoristaId,
}: ResumoReportContentProps) {
  return (
    <div
      className="space-y-4 print:space-y-3 print-content"
      id="relatorio-motorista"
      style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
    >
      {/* Cabeçalho */}
      <div className="text-center border-b pb-4 print:pb-2">
        <img src={logoSrc} alt="Logo" className="h-24 mx-auto mb-3 print:h-16 print:mb-2" />
        <h1 className="text-2xl print:text-base font-bold">RESUMO FINANCEIRO DO MOTORISTA</h1>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-3 gap-3 print:gap-2">
        <div
          className="rounded-xl p-4 print:p-3 print:rounded-lg text-center"
          style={{ backgroundColor: '#22c55e', color: '#fff' }}
        >
          <p className="text-xs font-medium uppercase tracking-wide print:text-[10px]" style={{ opacity: 0.85 }}>
            Total Receitas
          </p>
          <p className="text-2xl print:text-lg font-bold mt-1">
            {fmt(isImportado ? totalReceitas : receitaAjustada)}
          </p>
        </div>
        <div
          className="rounded-xl p-4 print:p-3 print:rounded-lg text-center"
          style={{ backgroundColor: '#ef4444', color: '#fff' }}
        >
          <p className="text-xs font-medium uppercase tracking-wide print:text-[10px]" style={{ opacity: 0.85 }}>
            Total Despesas
          </p>
          <p className="text-2xl print:text-lg font-bold mt-1">{fmt(totalDespesas)}</p>
        </div>
        <div
          className="rounded-xl p-4 print:p-3 print:rounded-lg text-center"
          style={{ backgroundColor: liquido >= 0 ? '#2563eb' : '#f97316', color: '#fff' }}
        >
          <p className="text-xs font-medium uppercase tracking-wide print:text-[10px]" style={{ opacity: 0.85 }}>
            Líquido a Receber
          </p>
          <p className="text-2xl print:text-lg font-bold mt-1">{fmt(liquido)}</p>
        </div>
      </div>

      {/* Informações do Motorista */}
      <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 print:p-3 print:bg-slate-50 border">
        <div
          className={`grid gap-3 print:gap-2 ${infoFields.length <= 4 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}
        >
          {infoFields.map((f) => (
            <div key={f.key}>
              <span className="text-xs text-muted-foreground print:text-[10px]">
                {f.label}
              </span>
              {f.value === null ? (
                <Loader2 className="h-4 w-4 animate-spin mt-1" />
              ) : (
                <p className={`font-semibold print:text-xs ${f.colored || 'text-foreground'}`}>
                  {f.value}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Receitas e Despesas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:gap-3 print:grid-cols-2">
        {/* Receitas */}
        <div className="rounded-lg overflow-hidden border border-green-200 print:border-green-300">
          <div className="px-4 py-2 print:px-3 print:py-1.5" style={{ backgroundColor: '#22c55e' }}>
            <h2 className="font-semibold flex items-center gap-2 text-sm print:text-xs" style={{ color: '#fff' }}>
              <TrendingUp className="h-4 w-4" />
              RECEITAS
            </h2>
          </div>
          <div className="p-4 print:p-3 space-y-2 print:space-y-1 bg-green-50 dark:bg-green-950/20 print:bg-green-50">
            <Row label="Bolt" value={fmt(receitas.bolt)} colored="text-green-700 dark:text-green-300" />
            <Row label="Uber" value={fmt(receitas.uber)} colored="text-green-700 dark:text-green-300" />
            <Row label="Outras Receitas" value={fmt(receitas.outras_receitas)} colored="text-green-700 dark:text-green-300" />
            {gorjeta > 0 && (
              <Row label="Gorjetas (sem IVA)" value={fmt(gorjeta)} colored="text-green-700 dark:text-green-300" />
            )}
            <Separator className="bg-green-200 dark:bg-green-800" />
            <Row label="TOTAL RECEITAS" value={fmt(isImportado ? totalReceitas : receitaAjustada)} bold colored="text-green-700 dark:text-green-300" />
          </div>
        </div>

        {/* Despesas */}
        <div className="rounded-lg overflow-hidden border border-red-200 print:border-red-300">
          <div className="px-4 py-2 print:px-3 print:py-1.5" style={{ backgroundColor: '#ef4444' }}>
            <h2 className="font-semibold flex items-center gap-2 text-sm print:text-xs" style={{ color: '#fff' }}>
              <TrendingDown className="h-4 w-4" />
              DESPESAS
            </h2>
          </div>
          <div className="p-4 print:p-3 space-y-2 print:space-y-1 bg-red-50 dark:bg-red-950/20 print:bg-red-50">
            <Row label="Aluguer" value={fmt(despesas.aluguer)} colored="text-red-700 dark:text-red-300" />
            <Row label="Combustível" value={fmt(despesas.combustivel)} colored="text-red-700 dark:text-red-300" />
            <Row label="Portagens" value={fmt(despesas.portagens)} colored="text-red-700 dark:text-red-300" />
            <Row label="Outros Custos" value={fmt(despesas.outros_custos)} colored="text-red-700 dark:text-red-300" />
            <Row label="Caução" value={fmt(despesas.caucao)} colored="text-red-700 dark:text-red-300" />
            <Row label="Seguros" value={fmt(despesas.seguros)} colored="text-red-700 dark:text-red-300" />
            <Row label="Reparações" value={fmt(despesas.reparacoes)} colored="text-red-700 dark:text-red-300" />
            <Separator className="bg-red-200 dark:bg-red-800" />
            <Row label="TOTAL DESPESAS" value={fmt(totalDespesas)} bold colored="text-red-700 dark:text-red-300" />
          </div>
        </div>
      </div>

      {/* Aluguer — detalhe pro-rata */}
      {slotPeriodos.length > 0 && (
        <div className="rounded-lg overflow-hidden border border-amber-200 print:border-amber-300">
          <div className="px-4 py-2 print:px-3 print:py-1.5" style={{ backgroundColor: '#f59e0b' }}>
            <h2 className="font-semibold flex items-center gap-2 text-sm print:text-xs" style={{ color: '#fff' }}>
              ALUGUER — DETALHE
            </h2>
          </div>
          <div className="p-4 print:p-3 space-y-2 print:space-y-1 bg-amber-50 dark:bg-amber-950/20 print:bg-amber-50">
            {slotPeriodos.map((p, i) => (
              <Row
                key={i}
                label={`${p.matricula} (${p.dataInicioStr}–${p.dataFimStr}): ${p.dias} dias × ${fmt(p.taxaDiaria)}/dia`}
                value={fmt(p.custo)}
                colored="text-amber-700 dark:text-amber-300"
              />
            ))}
            {slotPeriodos.length > 1 && (
              <>
                <Separator className="bg-amber-200 dark:bg-amber-800" />
                <Row label="TOTAL ALUGUER" value={fmt(totalSlot)} bold colored="text-amber-700 dark:text-amber-300" />
              </>
            )}
          </div>
        </div>
      )}

      <SlotMensalidadeCard motoristaId={motoristaId} />

      {/* Resumo Final */}
      <div className="rounded-lg overflow-hidden border border-blue-200 print:border-blue-300">
        <div className="px-4 py-2 print:px-3 print:py-1.5" style={{ backgroundColor: '#2563eb' }}>
          <h2 className="font-semibold flex items-center gap-2 text-sm print:text-xs" style={{ color: '#fff' }}>
            <Calculator className="h-4 w-4" />
            RESUMO FINAL
          </h2>
        </div>
        <div className="p-4 print:p-3 space-y-2 print:space-y-1 bg-blue-50 dark:bg-blue-950/20 print:bg-blue-50">
          <Row label="Valores a Transportar (Semana Anterior)" value={fmt(valoresSemanaAnterior)} colored="text-blue-700 dark:text-blue-300" />
          <Separator className="bg-blue-200 dark:bg-blue-800" />
          <Row
            label="Total a Receber"
            value={fmt(totalAReceber)}
            colored={totalAReceber >= 0 ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}
          />
          <Separator className="my-2 print:my-1 bg-blue-200 dark:bg-blue-800" />
          <div
            className="flex justify-between items-center -mx-4 px-4 py-3 print:py-2 print:-mx-3 print:px-3"
            style={{ backgroundColor: '#2563eb' }}
          >
            <span className="font-bold text-sm print:text-xs" style={{ color: '#fff' }}>
              VALOR LÍQUIDO A RECEBER
            </span>
            <span className="font-bold text-xl print:text-base" style={{ color: '#fff' }}>
              {fmt(liquido)}
            </span>
          </div>
        </div>
      </div>

      {/* Rodapé */}
      <div className="hidden print:block text-center text-[10px] text-gray-400 pt-4 border-t print:pt-2">
        <p>
          Documento gerado em {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: pt })}
        </p>
        <p className="mt-0.5">WeGest, Lda. • NIF: 515127850</p>
      </div>
    </div>
  );
}
