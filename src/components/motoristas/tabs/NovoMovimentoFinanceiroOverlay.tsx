import { useState, useRef } from 'react';
import { format, startOfWeek, addWeeks, parseISO } from 'date-fns';
import { TrendingUp, TrendingDown, ArrowLeft, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { MovimentoDetalhesFields } from './MovimentoDetalhesFields';
import { MovimentoRepeticaoFields } from './MovimentoRepeticaoFields';
import { NotaDataMovimento } from './NotaDataMovimento';

export interface MovimentoFinanceiro {
  id: string;
  tipo: 'credito' | 'debito';
  categoria: string | null;
  descricao: string;
  valor: number;
  data_movimento: string;
  data_pagamento: string | null;
  status: 'pendente' | 'pago' | 'cancelado';
  referencia: string | null;
  created_at: string;
  /** Acordo de pagamento (parcelamento) que gerou este movimento. */
  acordo_id?: string | null;
  /** Fatura cedida a este motorista que gerou este movimento. */
  cobranca_id?: string | null;
}

/**
 * Movimento gerido pela faturação (dívida cedida, parcela de um acordo,
 * nota de crédito, estornos) — não pode ser marcado como pago, cancelado
 * nem editado à mão: liquida-se no contrato/fatura de origem.
 *
 * Sem isto, marcar "Fatura cedida — …" como paga aqui punha o saldo do
 * motorista a dizer que a dívida estava liquidada enquanto a fatura
 * continuava por liquidar, e nada assinalava a divergência.
 */
export function isMovimentoDaFaturacao(m: MovimentoFinanceiro): boolean {
  return !!m.acordo_id || !!m.cobranca_id;
}

export interface RecorrenciaFinanceira {
  id: string;
  tipo: 'credito' | 'debito';
  categoria: string | null;
  descricao: string;
  valor: number;
  frequencia: 'semanal' | 'mensal';
  semana_ancora: string;
  data_fim: string | null;
  max_ocorrencias: number | null;
  ocorrencias_geradas: number;
  status: 'ativa' | 'pausada' | 'cancelada' | 'concluida';
}

export const CATEGORIAS = [
  { value: 'salario', label: 'Salário' },
  { value: 'bonus', label: 'Bónus' },
  { value: 'desconto', label: 'Desconto' },
  { value: 'multa', label: 'Multa' },
  { value: 'caucao', label: 'Caução' },
  { value: 'dev_caucao', label: 'Devolução de Caução' },
  { value: 'seguros', label: 'Seguros' },
  { value: 'rnvat', label: 'RNVAT' },
  { value: 'acordo', label: 'Acordo' },
  { value: 'renda_viatura', label: 'Renda Viatura' },
  { value: 'slot_mensal', label: 'Mensalidade Slot' },
  { value: 'reparacao', label: 'Reparação' },
  { value: 'negativo_anterior', label: 'Negativo Anterior' },
  { value: 'ajuda_custo', label: 'Ajuda de Custo' },
  { value: 'outras_devolucoes', label: 'Outras Devoluções' },
  { value: 'outro', label: 'Outro' },
];

export interface NovoMovimentoFinanceiroOverlayProps {
  motoristaId: string;
  /** Se fornecido, estamos a definir o acordo de uma reparação pendente */
  reparacaoPendente?: MovimentoFinanceiro;
  /** Se fornecido, estamos a editar um movimento existente */
  movimentoParaEditar?: MovimentoFinanceiro;
  /** URL da fatura vinda do ticket (fallback se não estiver embebida no referencia) */
  faturaUrlExterna?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function NovoMovimentoFinanceiroOverlay({
  motoristaId,
  reparacaoPendente,
  movimentoParaEditar,
  faturaUrlExterna,
  onClose,
  onSuccess,
}: NovoMovimentoFinanceiroOverlayProps) {
  const isAcordo = !!reparacaoPendente;
  const isEdicao = !!movimentoParaEditar;
  // Movimento base para pré-preencher: edição tem prioridade sobre acordo
  const movimentoBase = movimentoParaEditar ?? reparacaoPendente;

  const [tipo, setTipo] = useState<'credito' | 'debito'>(movimentoBase?.tipo ?? 'debito');
  const [categoria, setCategoria] = useState(movimentoBase?.categoria ?? '');
  const [descricao, setDescricao] = useState(
    movimentoParaEditar
      ? movimentoParaEditar.descricao
      : reparacaoPendente
        ? `Acordo de pagamento: ${reparacaoPendente.descricao}`
        : ''
  );
  const [valor, setValor] = useState(movimentoBase ? String(movimentoBase.valor) : '');
  const [status, setStatus] = useState<'pendente' | 'pago' | 'cancelado'>(
    movimentoParaEditar?.status ?? 'pendente'
  );
  // Separar referência (ex: "Ticket #13") de URL de fatura (ex: "Ticket #13 | https://...")
  const refRaw = movimentoBase?.referencia ?? '';
  const faturaUrlEmReferencia = refRaw.includes(' | http')
    ? (refRaw.split(' | ').find((p) => p.startsWith('http')) ?? null)
    : null;
  // Usar URL embebida no referencia, ou fallback para a URL vinda do ticket
  const faturaUrlExistente = faturaUrlEmReferencia ?? faturaUrlExterna ?? null;
  const refLimpa = faturaUrlEmReferencia
    ? refRaw.replace(` | ${faturaUrlEmReferencia}`, '').trim()
    : refRaw;

  const [referencia, setReferencia] = useState(refLimpa);
  const [numSemanas, setNumSemanas] = useState('1');
  const [semanaInicio, setSemanaInicio] = useState(
    movimentoParaEditar
      ? movimentoParaEditar.data_movimento
      : format(startOfWeek(addWeeks(new Date(), 1), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  );
  // Repetição: 'parcelas' = lote fixo gerado já (comportamento antigo); 'semanal'/
  // 'mensal' = regra de recorrência automática (motorista_financeiro_recorrencias),
  // gerada progressivamente pelo cron gerar_movimentos_recorrentes.
  const [repeticao, setRepeticao] = useState<'nenhuma' | 'parcelas' | 'semanal' | 'mensal'>(
    isAcordo ? 'parcelas' : 'nenhuma'
  );
  const [duracaoTipo, setDuracaoTipo] = useState<'indefinida' | 'data' | 'ocorrencias'>(
    'indefinida'
  );
  const [dataFim, setDataFim] = useState('');
  const [maxOcorrencias, setMaxOcorrencias] = useState('4');
  const [faturaFile, setFaturaFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 'parcelas' = lote fixo gerado já (comportamento antigo, usado também pelo
  // acordo de reparação). 'semanal'/'mensal' = nova recorrência automática.
  const isRecurring = repeticao === 'parcelas' && parseInt(numSemanas) > 1;
  const isRecorrenciaAutomatica = repeticao === 'semanal' || repeticao === 'mensal';
  const valorNum = parseFloat(valor) || 0;

  const handleSubmit = async () => {
    if (!descricao.trim() || !valor || valorNum <= 0) {
      toast.error('Preencha a descrição e o valor');
      return;
    }
    if (
      isRecorrenciaAutomatica &&
      duracaoTipo === 'ocorrencias' &&
      !(parseInt(maxOcorrencias) > 0)
    ) {
      toast.error('Indique um número de ocorrências válido');
      return;
    }
    if (isRecorrenciaAutomatica && duracaoTipo === 'data' && !dataFim) {
      toast.error('Indique a data de fim');
      return;
    }

    try {
      setSubmitting(true);
      const semanas = repeticao === 'parcelas' ? parseInt(numSemanas) || 1 : 1;

      // Upload de fatura opcional (usa bucket já existente)
      let faturaRef = referencia.trim() || null;
      if (faturaFile) {
        const fileExt = faturaFile.name.split('.').pop();
        const fileName = `financeiro/${motoristaId}/${Date.now()}.${fileExt}`;
        const { error: uploadErr } = await supabase.storage
          .from('assistencia-anexos')
          .upload(fileName, faturaFile);
        if (uploadErr) throw uploadErr;
        const {
          data: { publicUrl },
        } = supabase.storage.from('assistencia-anexos').getPublicUrl(fileName);
        faturaRef = faturaRef ? `${faturaRef} | ${publicUrl}` : publicUrl;
      } else if (isEdicao && faturaUrlEmReferencia) {
        // Em edição: preservar URL de fatura embebida se não houve novo upload
        faturaRef = faturaRef ? `${faturaRef} | ${faturaUrlEmReferencia}` : faturaUrlEmReferencia;
      }

      // Modo edição: update direto, sem parcelamento
      if (isEdicao && movimentoParaEditar) {
        const { error } = await supabase
          .from('motorista_financeiro')
          .update({
            tipo,
            categoria: categoria || null,
            descricao: descricao.trim(),
            valor: valorNum,
            data_movimento: semanaInicio,
            referencia: faturaRef,
            status,
            data_pagamento:
              status === 'pago'
                ? (movimentoParaEditar.data_pagamento ?? new Date().toISOString())
                : null,
          })
          .eq('id', movimentoParaEditar.id);
        if (error) throw error;
        toast.success('Movimento atualizado com sucesso!');
        onSuccess();
        return;
      }

      if (isRecorrenciaAutomatica) {
        // Cria a regra de recorrência + gera já a 1ª ocorrência (não esperar
        // pelo cron de 2ª feira). O cron gerar_movimentos_recorrentes trata
        // das semanas seguintes — ver 20260709100000_movimentos_financeiros_recorrentes.sql.
        const { data: regra, error: regraError } = await supabase
          .from('motorista_financeiro_recorrencias')
          .insert({
            motorista_id: motoristaId,
            tipo,
            categoria: categoria || null,
            descricao: descricao.trim(),
            valor: valorNum,
            frequencia: repeticao,
            semana_ancora: semanaInicio,
            data_fim: duracaoTipo === 'data' ? dataFim : null,
            max_ocorrencias: duracaoTipo === 'ocorrencias' ? parseInt(maxOcorrencias) : null,
            referencia_base: faturaRef,
          })
          .select()
          .single();
        if (regraError) throw regraError;

        const { error: primeiraError } = await supabase.from('motorista_financeiro').insert({
          motorista_id: motoristaId,
          tipo,
          categoria: categoria || null,
          descricao: descricao.trim(),
          valor: valorNum,
          data_movimento: semanaInicio,
          referencia: faturaRef,
          status: 'pendente',
          recorrencia_id: regra.id,
        });
        if (primeiraError) throw primeiraError;
      } else if (semanas <= 1) {
        const { error } = await supabase.from('motorista_financeiro').insert({
          motorista_id: motoristaId,
          tipo,
          categoria: categoria || null,
          descricao: descricao.trim(),
          valor: valorNum,
          data_movimento: semanaInicio,
          referencia: faturaRef,
          status: 'pendente',
        });
        if (error) throw error;
      } else {
        const valorParcela = Math.round((valorNum / semanas) * 100) / 100;
        const payloads = [];
        let currentWeek = parseISO(semanaInicio);

        for (let i = 0; i < semanas; i++) {
          const isLast = i === semanas - 1;
          payloads.push({
            motorista_id: motoristaId,
            tipo,
            categoria: categoria || null,
            descricao: `${descricao.trim()} (${i + 1}/${semanas})`,
            valor: isLast
              ? Math.round((valorNum - valorParcela * (semanas - 1)) * 100) / 100
              : valorParcela,
            data_movimento: format(currentWeek, 'yyyy-MM-dd'),
            referencia: faturaRef,
            status: 'pendente',
          });
          currentWeek = addWeeks(currentWeek, 1);
        }

        const { error } = await supabase.from('motorista_financeiro').insert(payloads);
        if (error) throw error;
      }

      // Se era um acordo de reparação, apagar a entrada original
      if (isAcordo && reparacaoPendente) {
        await supabase.from('motorista_financeiro').delete().eq('id', reparacaoPendente.id);
      }

      toast.success(
        isRecorrenciaAutomatica
          ? 'Recorrência criada com sucesso!'
          : semanas > 1
            ? `${semanas} parcelas criadas com sucesso!`
            : 'Movimento adicionado com sucesso!'
      );
      onSuccess();
    } catch (error: any) {
      console.error('Erro ao guardar movimento:', error);
      toast.error('Erro: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = !!descricao.trim() && valorNum > 0;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3 bg-card shrink-0">
        <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold leading-tight">
            {isEdicao
              ? 'Editar Movimento Financeiro'
              : isAcordo
                ? 'Definir Acordo de Pagamento'
                : 'Novo Movimento Financeiro'}
          </h1>
          <p className="text-xs text-muted-foreground">
            {isEdicao
              ? 'Correção de lançamento existente'
              : isAcordo
                ? `Reparação · €${Number(reparacaoPendente!.valor).toFixed(2)} a parcelar`
                : isRecorrenciaAutomatica
                  ? repeticao === 'semanal'
                    ? 'Recorrência semanal automática'
                    : 'Recorrência mensal automática'
                  : isRecurring
                    ? `Gerar ${numSemanas} lançamentos semanais`
                    : 'Lançamento único'}
          </p>
        </div>
        <Button onClick={handleSubmit} disabled={!canSubmit || submitting} className="shrink-0">
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />A guardar...
            </>
          ) : isEdicao ? (
            'Guardar Alterações'
          ) : isAcordo && isRecurring ? (
            `Criar ${numSemanas} Parcelas`
          ) : isAcordo ? (
            'Confirmar Acordo'
          ) : isRecorrenciaAutomatica ? (
            'Criar Recorrência'
          ) : isRecurring ? (
            `Gerar ${numSemanas} Semanas`
          ) : (
            'Guardar'
          )}
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
          {/* Aviso de acordo */}
          {isAcordo && (
            <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
              <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-warning">
                  A definir plano de pagamento para reparação
                </p>
                <p className="text-xs text-warning/90 mt-0.5">
                  O valor total de <strong>€{Number(reparacaoPendente!.valor).toFixed(2)}</strong>{' '}
                  está bloqueado. Defina apenas em quantas semanas o motorista irá pagar. A entrada
                  pendente será substituída pelas parcelas criadas.
                </p>
              </div>
            </div>
          )}

          {/* Tipo — só se não for acordo (edição também permite mudar tipo) */}
          {!isAcordo && (
            <div className="space-y-2">
              <Label>Tipo</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTipo('credito')}
                  className={cn(
                    'rounded-lg border-2 px-3 py-3 text-sm font-medium transition-all flex items-center gap-2 justify-center',
                    tipo === 'credito'
                      ? 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-400 font-semibold'
                      : 'border-border hover:border-primary/40 text-foreground'
                  )}
                >
                  <TrendingUp className="h-4 w-4" />
                  Crédito (a receber)
                </button>
                <button
                  type="button"
                  onClick={() => setTipo('debito')}
                  className={cn(
                    'rounded-lg border-2 px-3 py-3 text-sm font-medium transition-all flex items-center gap-2 justify-center',
                    tipo === 'debito'
                      ? 'border-red-500 bg-red-500/10 text-red-700 dark:text-red-400 font-semibold'
                      : 'border-border hover:border-primary/40 text-foreground'
                  )}
                >
                  <TrendingDown className="h-4 w-4" />
                  Débito (a pagar)
                </button>
              </div>
            </div>
          )}

          <MovimentoDetalhesFields
            isAcordo={isAcordo}
            categoria={categoria}
            onCategoriaChange={setCategoria}
            descricao={descricao}
            onDescricaoChange={setDescricao}
            valor={valor}
            onValorChange={setValor}
            referencia={referencia}
            onReferenciaChange={setReferencia}
            faturaUrlExistente={faturaUrlExistente}
            faturaFile={faturaFile}
            onFaturaFileChange={setFaturaFile}
            fileInputRef={fileInputRef}
          />

          {/* Estado — só em edição */}
          {isEdicao && (
            <div className="space-y-4 rounded-lg border border-border p-4">
              <h2 className="text-sm font-semibold">Estado e Data</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Estado</Label>
                  <Select
                    value={status}
                    onValueChange={(v) => setStatus(v as 'pendente' | 'pago' | 'cancelado')}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="pago">Pago</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Data do Movimento</Label>
                  <Input
                    type="date"
                    value={semanaInicio}
                    onChange={(e) => setSemanaInicio(e.target.value)}
                  />
                </div>
              </div>
              <NotaDataMovimento />
            </div>
          )}

          <MovimentoRepeticaoFields
            isEdicao={isEdicao}
            isAcordo={isAcordo}
            numSemanas={numSemanas}
            onNumSemanasChange={setNumSemanas}
            semanaInicio={semanaInicio}
            onSemanaInicioChange={setSemanaInicio}
            isRecurring={isRecurring}
            valorNum={valorNum}
            repeticao={repeticao}
            onRepeticaoChange={setRepeticao}
            isRecorrenciaAutomatica={isRecorrenciaAutomatica}
            duracaoTipo={duracaoTipo}
            onDuracaoTipoChange={setDuracaoTipo}
            dataFim={dataFim}
            onDataFimChange={setDataFim}
            maxOcorrencias={maxOcorrencias}
            onMaxOcorrenciasChange={setMaxOcorrencias}
          />
        </div>
      </div>
    </div>
  );
}
