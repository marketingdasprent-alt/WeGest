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

  // O titular é frequentemente também condutor do mesmo contrato (mesmo padrão
  // já visto em ContratoTabFaturar.tsx, que dedupe contrato.cliente_id/
  // principal.cliente_id por este motivo). O hook só recebe `contratoId` e
  // devolve TODOS os contrato_condutores — não sabe quem é o titular DESTA
  // fatura (alvo.titularId vem de cobranca.destinatario_id, que pode divergir
  // de contrato.cliente_id, ex.: fatura emitida ao condutor principal), por
  // isso o filtro fica aqui — o único sítio onde titularId está disponível —
  // e não dentro de useAcordoResponsaveisElegiveis.
  const elegiveisSemTitular = (elegiveis ?? []).filter(
    (e) => !(e.papel === 'condutor' && e.id === alvo?.titularId)
  );

  // Espelha exactamente a condição de cessão do backend (acordo_criar,
  // 20260724100001_acordos_saldo_e_criar.sql:202 —
  // `NOT (p_responsavel_papel <> 'motorista' AND p_responsavel_id = destinatario_id)`):
  // só NÃO há cessão quando o responsável é o próprio titular (papel distinto
  // de motorista E o mesmo id). Um "condutor" com o MESMO id do titular (a
  // mesma pessoa sob outro papel — ver elegiveisSemTitular acima) não é
  // cessão. O termo `=== 'motorista'` já não é alcançável por aqui — TVDE
  // fatura-se fora do WeGest e useAcordoResponsaveisElegiveis filtra motorista
  // fora antes de chegar a este componente (nunca é oferecido no Select acima)
  // — mas fica como defesa em profundidade, a espelhar exactamente a condição
  // do backend, sem custo por nunca ser verdadeiro na prática.
  const cessaoParaTerceiro =
    !!responsavel &&
    !!alvo &&
    (responsavel.papel === 'motorista' || responsavel.id !== alvo.titularId);

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
    // Cada parcela tem de ter um valor positivo — `acordo_parcelas.valor` tem
    // CHECK (valor > 0) na BD (20260724100000_acordos_pagamento.sql:83).
    // Limpar uma célula da grelha (o gesto mais natural de edição) dá
    // exactamente 0 (ver atualizarValorParcela), e `bateCerto` só valida a
    // SOMA — uma parcela a 0 compensada por outra continua a "bater certo".
    parcelasEditadas.every((p) => p.valor > 0) &&
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
        // Sem checkbox de opt-out (Finding 1 do gate final): o worker diário
        // não tem interruptor "não avisar" nenhum (só a antecedência), por
        // isso desligar aqui era uma promessa falsa — o aviso ia na mesma no
        // dia de vencimento. Envia-se sempre; só a antecedência varia. Nota:
        // `=== ''` (não `|| 3`) porque `parseInt('0') || 3` daria 3 em vez de
        // 0 — 0 é um valor válido (aviso no próprio dia), não deve ser
        // substituído pelo default.
        avisoAntecedenciaDias: antecedenciaDias === '' ? 3 : parseInt(antecedenciaDias, 10),
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
                  {elegiveisSemTitular.map((e) => (
                    <SelectItem key={`${e.papel}:${e.id}`} value={`${e.papel}:${e.id}`}>
                      {e.papel === 'motorista' ? 'Motorista' : 'Condutor'} — {e.nome ?? e.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {cessaoParaTerceiro && (
                <p className="text-[11px] text-muted-foreground rounded-md border p-2 mt-1.5">
                  ⓘ A dívida passa para a conta-corrente de{' '}
                  {elegiveisSemTitular.find((e) => e.id === responsavel?.id)?.nome ??
                    'quem escolheu'}
                  . Os recibos continuam a ser emitidos em nome de {alvo.titularNome} (titular da
                  fatura) — exigência legal.
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
                    onChange={(e) => setDiaVencimento(limitarCampoNumerico(e.target.value, 1, 31))}
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
                            min="0.01"
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

            {/* 6. Aviso — envia-se sempre (sem opt-out: um checkbox "não
                enviar" não desligava nada no worker diário — só mudava a
                antecedência para 0, o que ainda avisa no próprio dia do
                vencimento). A antecedência é a única variável. */}
            <div className="space-y-1.5">
              <Label htmlFor="antecedencia-dias" className="text-xs font-normal">
                Enviar aviso{' '}
                <Input
                  id="antecedencia-dias"
                  type="number"
                  min="0"
                  max="30"
                  value={antecedenciaDias}
                  onChange={(e) => setAntecedenciaDias(limitarCampoNumerico(e.target.value, 0, 30))}
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

/** Limita um número ao intervalo [min, max]. */
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * Recorta o valor em texto de um input numérico para [min, max] a cada
 * alteração — usado em `diaVencimento` (1-31) e `antecedenciaDias` (0-30).
 * O atributo HTML `min`/`max`, sozinho, não impede escrever um valor fora do
 * intervalo (não há `<form>` a validar; o "hint" nativo nunca dispara), e a
 * BD tem um CHECK igual nestes dois campos (dia_vencimento,
 * aviso_antecedencia_dias — 20260724100000_acordos_pagamento.sql). Vazio
 * fica vazio — cada campo trata o "sem valor" à sua maneira no envio
 * (opcional vs. default); só um número fora do intervalo é recortado aqui.
 */
function limitarCampoNumerico(valor: string, min: number, max: number): string {
  if (valor.trim() === '') return '';
  const n = parseInt(valor, 10);
  if (!Number.isFinite(n)) return '';
  return String(clamp(n, min, max));
}

function Linha({ label, valor, forte }: { label: string; valor: number; forte?: boolean }) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={cn('tabular-nums', forte && 'font-semibold')}>{formatCurrency(valor)}</span>
    </div>
  );
}
