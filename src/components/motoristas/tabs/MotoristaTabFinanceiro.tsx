import { useState, useEffect, useRef } from 'react';
import { format, startOfWeek, addWeeks, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import {
  Plus,
  TrendingUp,
  TrendingDown,
  Check,
  X,
  RefreshCw,
  ListOrdered,
  ArrowLeft,
  AlertTriangle,
  Loader2,
  Paperclip,
  HandCoins,
  FileText,
  Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SectionCard } from '@/components/ui/section-card';
import { FinanceiroSection } from '@/components/ui/financeiro-section';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Motorista } from '@/pages/Motoristas';
import { cn } from '@/lib/utils';
import { useCanEditFinanceiro } from '@/hooks/useCanEditFinanceiro';

interface MovimentoFinanceiro {
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
}

const CATEGORIAS = [
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

interface MotoristaTabFinanceiroProps {
  motorista: Motorista;
}

// ─── Overlay: Novo Movimento / Definir Acordo ─────────────────────────────────

interface NovoMovimentoOverlayProps {
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

function NovoMovimentoOverlay({
  motoristaId,
  reparacaoPendente,
  movimentoParaEditar,
  faturaUrlExterna,
  onClose,
  onSuccess,
}: NovoMovimentoOverlayProps) {
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
  const [faturaFile, setFaturaFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isRecurring = parseInt(numSemanas) > 1;
  const valorNum = parseFloat(valor) || 0;

  const handleSubmit = async () => {
    if (!descricao.trim() || !valor || valorNum <= 0) {
      toast.error('Preencha a descrição e o valor');
      return;
    }

    try {
      setSubmitting(true);
      const semanas = parseInt(numSemanas) || 1;

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

      if (semanas <= 1) {
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
        semanas > 1
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
            <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-4">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">
                  A definir plano de pagamento para reparação
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-500 mt-0.5">
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

          {/* Detalhes */}
          <div className="space-y-4 rounded-lg border border-border p-4">
            <h2 className="text-sm font-semibold">Detalhes do Movimento</h2>

            {!isAcordo && (
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={categoria} onValueChange={setCategoria}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar categoria (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>
                Descrição <span className="text-red-500">*</span>
              </Label>
              <Textarea
                placeholder="Ex: Caução semana 1, Salário Janeiro..."
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={3}
                autoFocus={!isAcordo}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>
                  Valor Total (€) <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  disabled={isAcordo}
                  className={isAcordo ? 'bg-muted font-semibold' : ''}
                />
                {isAcordo && (
                  <p className="text-xs text-muted-foreground">
                    Valor bloqueado — definido pelo gestor de assistência.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Fatura / Referência</Label>
                <Input
                  placeholder="Ex: FT 2026/123"
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value)}
                />
              </div>
            </div>

            {/* Fatura da assistência — se foi anexada no fecho do ticket */}
            {faturaUrlExistente && (
              <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/20 px-3 py-2">
                <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                <span className="text-xs text-blue-700 flex-1">
                  Fatura anexada pelo gestor de assistência
                </span>
                <a
                  href={faturaUrlExistente}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-blue-600 hover:underline"
                >
                  Ver fatura
                </a>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Anexar Fatura (opcional)</Label>
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  className="hidden"
                  ref={fileInputRef}
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setFaturaFile(e.target.files?.[0] || null)}
                />
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2 border-dashed"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="h-4 w-4" />
                  {faturaFile ? faturaFile.name : 'Selecionar ficheiro...'}
                </Button>
                {faturaFile && (
                  <Button variant="ghost" size="icon" onClick={() => setFaturaFile(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>

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
            </div>
          )}

          {/* Parcelamento — só na criação */}
          {!isEdicao && (
            <div className="space-y-4 rounded-lg border border-border p-4">
              <h2 className="text-sm font-semibold">
                {isAcordo ? 'Plano de Parcelamento Semanal' : 'Recorrência Semanal'}
              </h2>
              <p className="text-xs text-muted-foreground">
                {isAcordo
                  ? 'Defina em quantas semanas o motorista irá pagar. O valor total será dividido igualmente.'
                  : 'Se este custo se repete semanalmente (ex: caução, seguros), defina o número de semanas.'}
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Nº de Semanas / Parcelas</Label>
                  <Input
                    type="number"
                    min="1"
                    value={numSemanas}
                    onChange={(e) => setNumSemanas(e.target.value)}
                    autoFocus={isAcordo}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{isRecurring ? 'Semana de Início' : 'Data do Movimento'}</Label>
                  <Input
                    type="date"
                    value={semanaInicio}
                    onChange={(e) => setSemanaInicio(e.target.value)}
                  />
                </div>
              </div>

              {isRecurring && valorNum > 0 && (
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 p-3">
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                    {numSemanas}x parcelas de{' '}
                    <strong>€{(valorNum / parseInt(numSemanas)).toFixed(2)}</strong> = €
                    {valorNum.toFixed(2)} total
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    Início: {format(parseISO(semanaInicio), 'dd/MM/yyyy', { locale: pt })}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export function MotoristaFinanceiroContent({ motoristaId }: { motoristaId: string }) {
  const [movimentos, setMovimentos] = useState<MovimentoFinanceiro[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoMovimentoOpen, setNovoMovimentoOpen] = useState(false);
  const [reparacaoParaAcordo, setReparacaoParaAcordo] = useState<MovimentoFinanceiro | null>(null);
  const [movimentoParaEditar, setMovimentoParaEditar] = useState<MovimentoFinanceiro | null>(null);
  const [faturaUrlAcordo, setFaturaUrlAcordo] = useState<string | null>(null);
  // mapa: movimento.id → URL da fatura do ticket associado
  const [movimentoFaturaMap, setMovimentoFaturaMap] = useState<Map<string, string>>(new Map());
  const { canEdit } = useCanEditFinanceiro();

  useEffect(() => {
    loadMovimentos();
  }, [motoristaId]);

  const loadMovimentos = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('motorista_financeiro')
        .select('*')
        .eq('motorista_id', motoristaId)
        .order('data_movimento', { ascending: false });

      if (error) throw error;
      const movs = (data as MovimentoFinanceiro[]) || [];
      setMovimentos(movs);

      // Para movimentos de reparação, tentar obter o fatura_url do ticket associado
      const reparacaoMovs = movs.filter((m) => m.categoria === 'reparacao');
      if (reparacaoMovs.length > 0) {
        const ticketNums = reparacaoMovs
          .map((m) => {
            const match = (m.referencia ?? '').match(/Ticket #(\d+)/);
            return match ? parseInt(match[1]) : null;
          })
          .filter((n): n is number => n !== null);

        if (ticketNums.length > 0) {
          const { data: tickets } = await supabase
            .from('assistencia_tickets')
            .select('numero, fatura_url')
            .in('numero', ticketNums);

          const ticketFaturaMap = new Map(
            (tickets || [])
              .filter((t) => t.fatura_url)
              .map((t) => [t.numero as number, t.fatura_url as string])
          );

          const newMap = new Map<string, string>();
          for (const mov of reparacaoMovs) {
            // Primeiro tentar URL já embebida no referencia
            const refRaw = mov.referencia ?? '';
            const embeddedUrl = refRaw.includes(' | http')
              ? refRaw.split(' | ').find((p) => p.startsWith('http'))
              : null;
            if (embeddedUrl) {
              newMap.set(mov.id, embeddedUrl);
              continue;
            }
            // Fallback: buscar do ticket
            const match = refRaw.match(/Ticket #(\d+)/);
            if (match) {
              const url = ticketFaturaMap.get(parseInt(match[1]));
              if (url) newMap.set(mov.id, url);
            }
          }
          setMovimentoFaturaMap(newMap);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar movimentos:', error);
      toast.error('Erro ao carregar movimentos financeiros');
    } finally {
      setLoading(false);
    }
  };

  const calcularResumo = () => {
    let totalCreditos = 0;
    let totalDebitos = 0;

    movimentos.forEach((m) => {
      if (m.status !== 'cancelado') {
        if (m.tipo === 'credito') totalCreditos += Number(m.valor);
        else totalDebitos += Number(m.valor);
      }
    });

    return { totalCreditos, totalDebitos };
  };

  const resumo = calcularResumo();

  const pendingRepairs = movimentos.filter(
    (m) =>
      m.categoria === 'reparacao' &&
      m.status === 'pendente' &&
      !m.descricao.startsWith('Acordo de pagamento')
  );

  const handleMarcarPago = async (id: string) => {
    try {
      const { error } = await supabase
        .from('motorista_financeiro')
        .update({ status: 'pago', data_pagamento: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      toast.success('Movimento marcado como pago!');
      loadMovimentos();
    } catch (error) {
      toast.error('Erro ao atualizar movimento');
    }
  };

  const handleCancelar = async (id: string) => {
    try {
      const { error } = await supabase
        .from('motorista_financeiro')
        .update({ status: 'cancelado' })
        .eq('id', id);
      if (error) throw error;
      toast.success('Movimento cancelado!');
      loadMovimentos();
    } catch (error) {
      toast.error('Erro ao cancelar movimento');
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
  };

  const handleOpenAcordo = (mov: MovimentoFinanceiro) => {
    setReparacaoParaAcordo(mov);
    setFaturaUrlAcordo(movimentoFaturaMap.get(mov.id) ?? null);
    setNovoMovimentoOpen(true);
  };

  const handleOpenEditar = (mov: MovimentoFinanceiro) => {
    setMovimentoParaEditar(mov);
    setFaturaUrlAcordo(movimentoFaturaMap.get(mov.id) ?? null);
    setNovoMovimentoOpen(true);
  };

  const handleCloseOverlay = () => {
    setNovoMovimentoOpen(false);
    setReparacaoParaAcordo(null);
    setMovimentoParaEditar(null);
    setFaturaUrlAcordo(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">A carregar dados financeiros...</div>
      </div>
    );
  }

  return (
    <>
      {novoMovimentoOpen && (
        <NovoMovimentoOverlay
          motoristaId={motoristaId}
          reparacaoPendente={reparacaoParaAcordo ?? undefined}
          movimentoParaEditar={movimentoParaEditar ?? undefined}
          faturaUrlExterna={faturaUrlAcordo}
          onClose={handleCloseOverlay}
          onSuccess={() => {
            handleCloseOverlay();
            loadMovimentos();
          }}
        />
      )}

      <div className="space-y-6">
        {/* Alerta de reparações a aguardar acordo */}
        {pendingRepairs.length > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-4">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">
                {pendingRepairs.length} reparação(ões) a aguardar acordo de pagamento
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-500 mt-0.5">
                Combine o plano de parcelamento com o motorista e clique em "Definir Acordo" na
                linha correspondente.
              </p>
            </div>
          </div>
        )}

        {/* Resumo */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="overflow-hidden border-t-4 border-t-green-500">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Créditos</p>
                  <p className="text-2xl font-bold text-green-600">
                    {formatCurrency(resumo.totalCreditos)}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-green-500/10">
                  <TrendingUp className="h-6 w-6 text-green-500" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="overflow-hidden border-t-4 border-t-red-500">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Débitos</p>
                  <p className="text-2xl font-bold text-red-600">
                    {formatCurrency(resumo.totalDebitos)}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-red-500/10">
                  <TrendingDown className="h-6 w-6 text-red-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Histórico */}
        <SectionCard
          icon={<ListOrdered className="h-4 w-4" />}
          title="Histórico de Movimentos"
          headerClassName="bg-blue-50 dark:bg-blue-950/30"
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              Histórico de movimentos financeiros do motorista.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadMovimentos}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Atualizar
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setReparacaoParaAcordo(null);
                  setNovoMovimentoOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Novo Movimento
              </Button>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movimentos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Nenhum movimento financeiro registado.
                  </TableCell>
                </TableRow>
              ) : (
                movimentos.map((movimento) => (
                  <TableRow
                    key={movimento.id}
                    className={cn(
                      movimento.status === 'cancelado' && 'opacity-50',
                      movimento.categoria === 'reparacao' &&
                        movimento.status === 'pendente' &&
                        !movimento.descricao.startsWith('Acordo de pagamento') &&
                        'bg-amber-50/50 dark:bg-amber-950/10'
                    )}
                  >
                    <TableCell>
                      {format(new Date(movimento.data_movimento), 'dd/MM/yyyy')}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{movimento.descricao}</p>
                        {movimento.referencia && (
                          <p className="text-xs text-muted-foreground">
                            Ref:{' '}
                            {movimento.referencia.includes(' | http')
                              ? movimento.referencia.split(' | ')[0]
                              : movimento.referencia}
                          </p>
                        )}
                        {movimentoFaturaMap.get(movimento.id) && (
                          <a
                            href={movimentoFaturaMap.get(movimento.id)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-0.5"
                          >
                            <FileText className="h-3 w-3" />
                            Ver fatura
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {movimento.categoria
                        ? CATEGORIAS.find((c) => c.value === movimento.categoria)?.label ||
                          movimento.categoria
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={movimento.tipo === 'credito' ? 'default' : 'secondary'}>
                        {movimento.tipo === 'credito' ? 'Crédito' : 'Débito'}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium ${
                        movimento.tipo === 'credito' ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {movimento.tipo === 'credito' ? '+' : '-'}
                      {formatCurrency(Number(movimento.valor))}
                    </TableCell>
                    <TableCell>
                      {movimento.categoria === 'reparacao' &&
                      movimento.status === 'pendente' &&
                      !movimento.descricao.startsWith('Acordo de pagamento') ? (
                        <Badge
                          variant="outline"
                          className="border-amber-500 text-amber-600 whitespace-nowrap"
                        >
                          Aguarda Acordo
                        </Badge>
                      ) : (
                        <Badge
                          variant={
                            movimento.status === 'pago'
                              ? 'default'
                              : movimento.status === 'cancelado'
                                ? 'secondary'
                                : 'outline'
                          }
                        >
                          {movimento.status === 'pago'
                            ? 'Pago'
                            : movimento.status === 'cancelado'
                              ? 'Cancelado'
                              : 'Pendente'}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* Reparação pendente (sem acordo definido) → apenas "Definir Acordo" */}
                        {movimento.categoria === 'reparacao' &&
                        movimento.status === 'pendente' &&
                        !movimento.descricao.startsWith('Acordo de pagamento') ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-amber-500 text-amber-700 hover:bg-amber-50 hover:text-amber-700 whitespace-nowrap"
                            onClick={() => handleOpenAcordo(movimento)}
                          >
                            <HandCoins className="h-4 w-4 mr-1" />
                            Definir Acordo
                          </Button>
                        ) : movimento.status === 'pendente' ? (
                          /* Outros pendentes → ✓ / ✗ */
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleMarcarPago(movimento.id)}
                              title="Marcar como pago"
                              className="text-green-600 hover:text-green-700"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleCancelar(movimento.id)}
                              title="Cancelar"
                              className="text-destructive hover:text-destructive"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : null}
                        {/* Botão editar — só visível para admin/Supervisor Gestor TVDE */}
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEditar(movimento)}
                            title="Editar movimento"
                            className="text-blue-600 hover:text-blue-700"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </SectionCard>
      </div>
    </>
  );
}

/**
 * Wrapper público — mantém a API original (<MotoristaTabFinanceiro motorista={m} />)
 * para páginas que já a importam. Delega para o componente partilhado FinanceiroSection.
 */
export function MotoristaTabFinanceiro({ motorista }: MotoristaTabFinanceiroProps) {
  return <FinanceiroSection entidade="motorista" id={motorista.id} />;
}
