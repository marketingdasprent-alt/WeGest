import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Repeat } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { descreverSemanaDoMes } from '@/lib/recorrenciaFinanceira';
import { NotaDataMovimento } from './NotaDataMovimento';

export interface MovimentoRepeticaoFieldsProps {
  isEdicao: boolean;
  isAcordo: boolean;
  numSemanas: string;
  onNumSemanasChange: (value: string) => void;
  semanaInicio: string;
  onSemanaInicioChange: (value: string) => void;
  isRecurring: boolean;
  valorNum: number;
  repeticao: 'nenhuma' | 'parcelas' | 'semanal' | 'mensal';
  onRepeticaoChange: (value: 'nenhuma' | 'parcelas' | 'semanal' | 'mensal') => void;
  isRecorrenciaAutomatica: boolean;
  duracaoTipo: 'indefinida' | 'data' | 'ocorrencias';
  onDuracaoTipoChange: (value: 'indefinida' | 'data' | 'ocorrencias') => void;
  dataFim: string;
  onDataFimChange: (value: string) => void;
  maxOcorrencias: string;
  onMaxOcorrenciasChange: (value: string) => void;
}

/** Preview do valor por parcela/período — partilhado pelos dois fluxos abaixo. */
function ResumoParcelas({
  numSemanas,
  semanaInicio,
  valorNum,
}: {
  numSemanas: string;
  semanaInicio: string;
  valorNum: number;
}) {
  return (
    <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 p-3">
      <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
        {numSemanas}x parcelas de <strong>€{(valorNum / parseInt(numSemanas)).toFixed(2)}</strong> =
        €{valorNum.toFixed(2)} total
      </p>
      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
        Início: {format(parseISO(semanaInicio), 'dd/MM/yyyy', { locale: pt })}
      </p>
    </div>
  );
}

export function MovimentoRepeticaoFields({
  isEdicao,
  isAcordo,
  numSemanas,
  onNumSemanasChange,
  semanaInicio,
  onSemanaInicioChange,
  isRecurring,
  valorNum,
  repeticao,
  onRepeticaoChange,
  isRecorrenciaAutomatica,
  duracaoTipo,
  onDuracaoTipoChange,
  dataFim,
  onDataFimChange,
  maxOcorrencias,
  onMaxOcorrenciasChange,
}: MovimentoRepeticaoFieldsProps) {
  if (isEdicao) return null;

  // Plano de parcelamento — exclusivo do fluxo de acordo de reparação
  if (isAcordo) {
    return (
      <div className="space-y-4 rounded-lg border border-border p-4">
        <h2 className="text-sm font-semibold">Plano de Parcelamento Semanal</h2>
        <p className="text-xs text-muted-foreground">
          Defina em quantas semanas o motorista irá pagar. O valor total será dividido igualmente.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Nº de Semanas / Parcelas</Label>
            <Input
              type="number"
              min="1"
              value={numSemanas}
              onChange={(e) => onNumSemanasChange(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>{isRecurring ? 'Semana de Início' : 'Data do Movimento'}</Label>
            <Input
              type="date"
              value={semanaInicio}
              onChange={(e) => onSemanaInicioChange(e.target.value)}
            />
          </div>
        </div>

        <NotaDataMovimento />

        {isRecurring && valorNum > 0 && (
          <ResumoParcelas numSemanas={numSemanas} semanaInicio={semanaInicio} valorNum={valorNum} />
        )}
      </div>
    );
  }

  // Repetição — movimentos normais (não acordo)
  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <Repeat className="h-4 w-4 text-muted-foreground" />
        Repetição
      </h2>

      <div className="space-y-1.5">
        <Label>Este lançamento repete-se?</Label>
        <Select value={repeticao} onValueChange={(v) => onRepeticaoChange(v as typeof repeticao)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nenhuma">Não — lançamento único</SelectItem>
            <SelectItem value="parcelas">Parcelas fixas (gera já N semanas)</SelectItem>
            <SelectItem value="semanal">Recorrência semanal (automática)</SelectItem>
            <SelectItem value="mensal">Recorrência mensal (semana fixa do mês)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {repeticao === 'parcelas' && (
          <div className="space-y-1.5">
            <Label>Nº de Semanas / Parcelas</Label>
            <Input
              type="number"
              min="1"
              value={numSemanas}
              onChange={(e) => onNumSemanasChange(e.target.value)}
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label>{repeticao === 'nenhuma' ? 'Data do Movimento' : 'Semana de início'}</Label>
          <Input
            type="date"
            value={semanaInicio}
            onChange={(e) => onSemanaInicioChange(e.target.value)}
          />
        </div>
      </div>

      {repeticao === 'mensal' && semanaInicio && (
        <p className="text-xs text-muted-foreground">
          Vai repetir {descreverSemanaDoMes(parseISO(semanaInicio))}.
        </p>
      )}

      {isRecurring && valorNum > 0 && (
        <ResumoParcelas numSemanas={numSemanas} semanaInicio={semanaInicio} valorNum={valorNum} />
      )}

      {isRecorrenciaAutomatica && (
        <>
          <div className="space-y-1.5">
            <Label>Duração</Label>
            <Select
              value={duracaoTipo}
              onValueChange={(v) => onDuracaoTipoChange(v as typeof duracaoTipo)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="indefinida">Sem data de fim (até cancelar)</SelectItem>
                <SelectItem value="data">Até uma data</SelectItem>
                <SelectItem value="ocorrencias">Número de ocorrências</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {duracaoTipo === 'data' && (
            <div className="space-y-1.5">
              <Label>Data de fim</Label>
              <Input
                type="date"
                value={dataFim}
                min={semanaInicio}
                onChange={(e) => onDataFimChange(e.target.value)}
              />
            </div>
          )}
          {duracaoTipo === 'ocorrencias' && (
            <div className="space-y-1.5">
              <Label>Número de ocorrências</Label>
              <Input
                type="number"
                min="1"
                value={maxOcorrencias}
                onChange={(e) => onMaxOcorrenciasChange(e.target.value)}
              />
            </div>
          )}

          {valorNum > 0 && semanaInicio && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 p-3">
              <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                €{valorNum.toFixed(2)} / {repeticao === 'semanal' ? 'semana' : 'mês'}
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                1ª cobrança: {format(parseISO(semanaInicio), 'dd/MM/yyyy', { locale: pt })}
                {duracaoTipo === 'data' && dataFim
                  ? ` · até ${format(parseISO(dataFim), 'dd/MM/yyyy', { locale: pt })}`
                  : ''}
                {duracaoTipo === 'ocorrencias' ? ` · ${maxOcorrencias || 0} ocorrências` : ''}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
