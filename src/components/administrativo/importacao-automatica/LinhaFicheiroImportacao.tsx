import { AlertTriangle, CheckCircle2, CircleX, FileText, RefreshCw, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ResultadoFicheiro } from '@/hooks/useImportacaoAutomatica';
import {
  PLATAFORMAS_SEMANAIS,
  ROTULO_PLATAFORMA,
  rotuloSemana,
  type ContaImportacao,
  type Periodo,
  type PlataformaImportacao,
} from '@/utils/importacaoAutomatica';

interface LinhaFicheiroImportacaoProps {
  nome: string;
  plataforma: PlataformaImportacao | null;
  contaId: string | null;
  periodo: Periodo | null;
  /** Porque se escolheu esta conta, ou porque não se escolheu. */
  motivo: string;
  /** O que falta para importar; nulo quando está pronto. */
  falta: string | null;
  contas: ContaImportacao[];
  semanas: Periodo[];
  substitui: boolean;
  repetido: boolean;
  resultado?: ResultadoFicheiro;
  bloqueada: boolean;
  onContaChange: (id: string) => void;
  onPeriodoChange: (p: Periodo) => void;
  onRetirar: () => void;
}

function Estado({ falta, motivo, repetido, substitui, resultado }: LinhaFicheiroImportacaoProps) {
  if (resultado && 'resultado' in resultado) {
    const r = resultado.resultado;
    return (
      <p className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        {r.gravados} gravados
        {r.substituidas > 0 && `, ${r.substituidas} da importação anterior substituídos`}
        {r.semTitular > 0 && `, ${r.semTitular} sem titular`}
      </p>
    );
  }
  if (resultado && 'erro' in resultado) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-destructive">
        <CircleX className="h-3.5 w-3.5" aria-hidden="true" />
        {resultado.erro}
      </p>
    );
  }
  const problema = repetido
    ? 'Outro ficheiro deste lote é da mesma conta e semana: retire um.'
    : falta;
  return (
    <div className="space-y-0.5 text-xs">
      <p className={problema ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}>
        {problema && <AlertTriangle className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />}
        {motivo} {problema && motivo !== problema ? problema : ''}
      </p>
      {substitui && !problema && (
        <p className="flex items-center gap-1 text-muted-foreground">
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
          Esta conta já tem dados desta semana: vão ser substituídos por este ficheiro.
        </p>
      )}
    </div>
  );
}

/** Um ficheiro largado: o que se detectou, o que se pode corrigir e o resultado. */
export function LinhaFicheiroImportacao(props: LinhaFicheiroImportacaoProps) {
  const { nome, plataforma, contaId, periodo, contas, semanas, bloqueada } = props;
  const semanal = !!plataforma && PLATAFORMAS_SEMANAIS.includes(plataforma);
  return (
    <div className="space-y-2 rounded-lg border p-3" data-testid="linha-importacao">
      <div className="flex items-start justify-between gap-2">
        <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate" title={nome}>
            {nome}
          </span>
          {plataforma && (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px]">
              {ROTULO_PLATAFORMA[plataforma]}
            </span>
          )}
        </p>
        {!bloqueada && !props.resultado && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={props.onRetirar}
            aria-label={`Retirar ${nome}`}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      {plataforma && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Select
            value={contaId ?? undefined}
            onValueChange={props.onContaChange}
            disabled={bloqueada}
          >
            <SelectTrigger className="h-8 text-xs" aria-label="Conta">
              <SelectValue placeholder="Escolha a conta" />
            </SelectTrigger>
            <SelectContent>
              {contas.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {semanal ? (
            <Select
              value={periodo?.inicio}
              onValueChange={(v) => props.onPeriodoChange(semanas.find((s) => s.inicio === v)!)}
              disabled={bloqueada}
            >
              <SelectTrigger className="h-8 text-xs" aria-label="Semana">
                <SelectValue placeholder="Escolha a semana">
                  {periodo && rotuloSemana(periodo)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {semanas.map((s) => (
                  <SelectItem key={s.inicio} value={s.inicio}>
                    {rotuloSemana(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="self-center text-xs text-muted-foreground">
              Datas de cada linha do ficheiro
            </p>
          )}
        </div>
      )}
      <Estado {...props} />
    </div>
  );
}
