/**
 * Modal de parcelamento de uma fatura (spec §7.3). Pré-voo ao ABRIR (não só ao
 * submeter) — falhar aqui custa um diálogo de erro; falhar depois de receber
 * dinheiro custa um problema contabilístico (backend §5.1).
 */
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileText, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatCurrency } from '@/utils/formatters';
import { cn } from '@/lib/utils';
import { DocumentoToken } from './DocumentoToken';
import {
  useAcordoResponsaveisElegiveis,
  useCriarAcordo,
  useFaturacaoPreflight,
} from '@/hooks/useAcordosPagamento';
import {
  gerarPlanoParcelas,
  somaParcelas,
  planoBateCerto,
  type ParcelaPlano,
  type FrequenciaParcela,
} from '@/lib/parcelamento';

export interface ParcelamentoFaturaAlvo {
  cobrancaId: string;
  contratoId: string;
  numeroDocumento: string;
  dataDocumento: string;
  valorTotal: number;
  saldoPagar: number;
  titularId: string;
  titularNome: string;
  titularNif: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alvo: ParcelamentoFaturaAlvo | null;
  onCriado: () => void;
}

type ResponsavelSelecao =
  | { papel: 'cliente'; id: string }
  | { papel: 'condutor' | 'motorista'; id: string };

const hojeISO = () => new Date().toISOString().slice(0, 10);

export function ParcelamentoDialog({ open, onOpenChange, alvo, onCriado }: Props) {
  const qc = useQueryClient();
  const { data: elegiveis } = useAcordoResponsaveisElegiveis(alvo?.contratoId);
  const criarAcordo = useCriarAcordo();
  const preflight = useFaturacaoPreflight();

  const [responsavel, setResponsavel] = useState<ResponsavelSelecao | null>(null);
  const [entradaValor, setEntradaValor] = useState('');
  const [entradaData, setEntradaData] = useState(hojeISO());
  const [numParcelas, setNumParcelas] = useState('3');
  const [frequencia, setFrequencia] = useState<FrequenciaParcela>('mensal');
  const [diaVencimento, setDiaVencimento] = useState('');
  const [enviarAviso, setEnviarAviso] = useState(true);
  const [antecedenciaDias, setAntecedenciaDias] = useState('3');
  const [parcelasEditadas, setParcelasEditadas] = useState<ParcelaPlano[] | null>(null);
  const [erroGeracao, setErroGeracao] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Pré-voo ao abrir — não esperar pela submissão para descobrir um bloqueio.
  useEffect(() => {
    if (open) preflight.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Reset ao abrir/trocar de alvo.
  useEffect(() => {
    if (!open) return;
    setResponsavel(alvo ? { papel: 'cliente', id: alvo.titularId } : null);
    setEntradaValor('');
    setEntradaData(hojeISO());
    setNumParcelas('3');
    setFrequencia('mensal');
    setDiaVencimento('');
    setEnviarAviso(true);
    setAntecedenciaDias('3');
    setParcelasEditadas(null);
    setErroGeracao(null);
  }, [open, alvo]);

  const planoGerado = useMemo((): ParcelaPlano[] | null => {
    if (!alvo) return null;
    const n = parseInt(numParcelas, 10);
    if (!Number.isFinite(n) || n < 1) return null;
    try {
      setErroGeracao(null);
      return gerarPlanoParcelas({
        valorTotal: alvo.saldoPagar,
        numParcelas: n,
        frequencia,
        dataInicio: hojeISO(),
        diaVencimento: diaVencimento ? parseInt(diaVencimento, 10) : undefined,
        entrada: entradaValor
          ? { valor: parseFloat(entradaValor.replace(',', '.')) || 0, data: entradaData }
          : undefined,
      });
    } catch (e: any) {
      setErroGeracao(e?.message ?? 'Não foi possível gerar o plano.');
      return null;
    }
  }, [alvo, numParcelas, frequencia, diaVencimento, entradaValor, entradaData]);

  useEffect(() => {
    setParcelasEditadas(planoGerado);
  }, [planoGerado]);

  const soma = parcelasEditadas ? somaParcelas(parcelasEditadas) : 0;
  const bateCerto =
    !!alvo && !!parcelasEditadas && planoBateCerto(parcelasEditadas, alvo.saldoPagar);

  function atualizarValorParcela(index: number, valor: string) {
    if (!parcelasEditadas) return;
    const novo = [...parcelasEditadas];
    novo[index] = { ...novo[index], valor: parseFloat(valor.replace(',', '.')) || 0 };
    setParcelasEditadas(novo);
  }

  const cessaoParaTerceiro = !!responsavel && responsavel.papel !== 'cliente';

  // Bloqueia tanto se a mutação do pré-voo rebentou (rede, função indisponível — `data` fica
  // undefined, nunca chega a `ok`/`rc_configurado`) como se respondeu mas com `ok=false`. Nunca
  // hardcodar "Recibo não configurado": o backend já devolve a mensagem certa em `data.error`
  // para esse caso (faturacao-emitir/index.ts) — os dois caminhos de falha voltam sempre com
  // `rc_configurado:false`, por isso essa flag NUNCA distingue "não configurado" de "qualquer
  // outra falha" (chave inválida, provider em baixo, etc.); só a mensagem do backend distingue.
  const preflightFalhou =
    preflight.isError ||
    (!!preflight.data && !(preflight.data.ok && preflight.data.rc_configurado));
  const preflightMensagemErro = preflight.isError
    ? ((preflight.error as Error)?.message ??
      'Não foi possível confirmar se esta organização pode emitir Recibos. Tenta novamente.')
    : preflight.data?.error || 'O serviço de faturação não respondeu.';

  const podeSubmeter =
    !!alvo &&
    !!responsavel &&
    !!parcelasEditadas &&
    parcelasEditadas.length > 0 &&
    bateCerto &&
    preflight.data?.ok &&
    preflight.data?.rc_configurado &&
    !submitting;

  async function handleCriar() {
    if (!alvo || !responsavel || !parcelasEditadas || !podeSubmeter) return;
    setSubmitting(true);
    try {
      await criarAcordo.mutateAsync({
        cobrancaId: alvo.cobrancaId,
        responsavelPapel: responsavel.papel,
        responsavelId: responsavel.id,
        parcelas: parcelasEditadas,
        frequencia,
        diaVencimento: diaVencimento ? parseInt(diaVencimento, 10) : undefined,
        avisoAntecedenciaDias: enviarAviso ? parseInt(antecedenciaDias, 10) || 3 : 0,
      });
      toast.success('Acordo de pagamento criado.');
      qc.invalidateQueries({ queryKey: ['contrato-cobrancas', alvo.contratoId] });
      onCriado();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`Erro ao criar o acordo: ${e?.message ?? 'tente novamente'}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!submitting) onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-4 pb-4 border-b bg-card shrink-0">
          <DialogTitle>Parcelar fatura</DialogTitle>
          <DialogDescription>
            Divide o saldo por liquidar num plano de pagamentos. A fatura original continua a ser o
            único documento com valor fiscal.
          </DialogDescription>
        </DialogHeader>

        {!alvo ? null : preflight.isPending ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : preflightFalhou ? (
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
              <p className="font-medium text-destructive">Não é possível parcelar esta fatura</p>
              <p className="mt-1 text-muted-foreground">{preflightMensagemErro}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                → Configurar em Integrações › Faturação
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* 1. Cabeçalho */}
            <DocumentoToken
              tipo="fiscal"
              icone={FileText}
              titulo={alvo.numeroDocumento}
              subtitulo={`Fatura original · ${alvo.titularNome}${alvo.titularNif ? ` · NIF ${alvo.titularNif}` : ''}`}
              valor={alvo.valorTotal}
            />

            {/* 2. Total / Já liquidado / A parcelar */}
            <div className="rounded-md border divide-y text-sm">
              <Linha label="Total da fatura" valor={alvo.valorTotal} />
              <Linha label="Já liquidado" valor={round2(alvo.valorTotal - alvo.saldoPagar)} />
              <Linha label="A parcelar" valor={alvo.saldoPagar} forte />
            </div>

            {/* 3. Quem assume */}
            <div className="space-y-1.5">
              <Label className="text-xs">Quem assume o pagamento</Label>
              <Select
                value={responsavel ? `${responsavel.papel}:${responsavel.id}` : ''}
                onValueChange={(v) => {
                  const [papel, id] = v.split(':');
                  setResponsavel({ papel: papel as ResponsavelSelecao['papel'], id });
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={`cliente:${alvo.titularId}`}>
                    Cliente — {alvo.titularNome} (titular)
                  </SelectItem>
                  {(elegiveis ?? []).map((e) => (
                    <SelectItem key={`${e.papel}:${e.id}`} value={`${e.papel}:${e.id}`}>
                      {e.papel === 'motorista' ? 'Motorista' : 'Condutor'} — {e.nome ?? e.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {cessaoParaTerceiro && (
                <p className="text-[11px] text-muted-foreground rounded-md border p-2 mt-1.5">
                  ⓘ A dívida passa para a conta-corrente de{' '}
                  {elegiveis?.find((e) => e.id === responsavel?.id)?.nome ?? 'quem escolheu'}. Os
                  recibos continuam a ser emitidos em nome de {alvo.titularNome} (titular da fatura)
                  — exigência legal.
                </p>
              )}
            </div>

            {/* 4. Entrada + parcelas + frequência + dia */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Entrada (opcional)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={entradaValor}
                  onChange={(e) => setEntradaValor(e.target.value)}
                  className="h-9"
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Data da entrada</Label>
                <Input
                  type="date"
                  value={entradaData}
                  onChange={(e) => setEntradaData(e.target.value)}
                  className="h-9"
                  disabled={!entradaValor}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Nº de parcelas</Label>
                <Input
                  type="number"
                  min="1"
                  max="24"
                  value={numParcelas}
                  onChange={(e) => setNumParcelas(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Frequência</Label>
                <Select
                  value={frequencia}
                  onValueChange={(v) => setFrequencia(v as FrequenciaParcela)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="semanal">Semanal</SelectItem>
                    <SelectItem value="mensal">Mensal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {frequencia === 'mensal' && (
                <div className="space-y-1.5 col-span-2">
                  <Label className="text-xs">Dia de vencimento (opcional)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="31"
                    value={diaVencimento}
                    onChange={(e) => setDiaVencimento(e.target.value)}
                    className="h-9"
                    placeholder="Dia do mês, ex.: 15"
                  />
                </div>
              )}
            </div>

            {erroGeracao && <p className="text-[11px] text-destructive">{erroGeracao}</p>}

            {/* 5. Grelha editável */}
            {parcelasEditadas && parcelasEditadas.length > 0 && (
              <div className="rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left p-2">#</th>
                      <th className="text-left p-2">Vencimento</th>
                      <th className="text-right p-2">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parcelasEditadas.map((p, i) => (
                      <tr key={p.numero} className="border-b last:border-0">
                        <td className="p-2">{p.numero === 0 ? 'E' : p.numero}</td>
                        <td className="p-2 font-mono text-xs">
                          {p.data_vencimento.split('-').reverse().join('/')}
                        </td>
                        <td className="p-2 text-right">
                          <Input
                            type="number"
                            step="0.01"
                            value={p.valor}
                            onChange={(e) => atualizarValorParcela(i, e.target.value)}
                            className="h-8 text-right tabular-nums"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div
                  className={cn(
                    'flex items-center justify-between px-3 py-2 text-xs border-t',
                    bateCerto ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
                  )}
                >
                  <span>Soma</span>
                  <span className="tabular-nums font-medium">
                    {formatCurrency(soma)}{' '}
                    {bateCerto
                      ? '✓ bate certo'
                      : `— falta ${formatCurrency(round2(alvo.saldoPagar - soma))}`}
                  </span>
                </div>
              </div>
            )}

            {/* 6. Aviso */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="enviar-aviso"
                checked={enviarAviso}
                onCheckedChange={(v) => setEnviarAviso(!!v)}
              />
              <Label htmlFor="enviar-aviso" className="text-xs font-normal cursor-pointer">
                Enviar aviso{' '}
                <Input
                  type="number"
                  min="0"
                  max="30"
                  value={antecedenciaDias}
                  onChange={(e) => setAntecedenciaDias(e.target.value)}
                  disabled={!enviarAviso}
                  className="inline-block w-14 h-6 mx-1 px-1"
                />{' '}
                dias antes de cada vencimento
              </Label>
            </div>
          </div>
        )}

        <div className="px-6 py-4 border-t bg-card flex items-center justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleCriar} disabled={!podeSubmeter} className="gap-2">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar acordo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

function Linha({ label, valor, forte }: { label: string; valor: number; forte?: boolean }) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={cn('tabular-nums', forte && 'font-semibold')}>{formatCurrency(valor)}</span>
    </div>
  );
}
