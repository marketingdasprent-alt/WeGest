import React, { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import {
  useCartoesAssociados,
  useCartoesDisponiveis,
  useAssociarCartaoAoMotorista,
  useDevolverCartaoDoMotorista,
  useSincronizarFichaCartao,
  type CartaoAssociado,
} from '@/hooks/useCartoesFrota';
import { errorMessage } from '@/utils/errorMessage';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Fuel, Zap, Plus, UserX, Check, AlertTriangle } from 'lucide-react';

type TipoCartao = 'bp' | 'repsol' | 'edp';

// As formas de CartaoAssociado/CartaoDisponivel e a escrita por chave calculada
// (`cartao_${tipo}`) na ficha do motorista vivem agora em @/hooks/useCartoesFrota.

interface Props {
  motorista: {
    id: string;
    cartao_bp?: string | null;
    cartao_repsol?: string | null;
    cartao_edp?: string | null;
  };
  onChanged?: () => void;
}

const TIPO_INFO: Record<TipoCartao, { label: string; Icon: typeof Fuel; cls: string }> = {
  bp: {
    label: 'BP',
    Icon: Fuel,
    cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  },
  repsol: {
    label: 'Repsol',
    Icon: Fuel,
    cls: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  },
  edp: {
    label: 'EDP',
    Icon: Zap,
    cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  },
};

const fmtEur = (v: number | null) =>
  v == null
    ? '—'
    : new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);
const todayISO = () => new Date().toISOString().slice(0, 10);

export const MotoristaCartoesFrota: React.FC<Props> = ({ motorista, onChanged }) => {
  const { toast } = useToast();
  const [tipo, setTipo] = useState<TipoCartao>('bp');
  const [selectedId, setSelectedId] = useState('');

  const { data: associados = [], isLoading: loading } = useCartoesAssociados(motorista.id);
  const { data: disponiveis = [], isLoading: loadingDisp } = useCartoesDisponiveis(tipo);

  const associarCartao = useAssociarCartaoAoMotorista();
  const devolverCartao = useDevolverCartaoDoMotorista();
  const sincronizarCartao = useSincronizarFichaCartao();
  const busy = associarCartao.isPending || devolverCartao.isPending || sincronizarCartao.isPending;

  const fichaDe = (t: TipoCartao) =>
    (t === 'bp'
      ? motorista.cartao_bp
      : t === 'repsol'
        ? motorista.cartao_repsol
        : motorista.cartao_edp) || '';

  const associar = async () => {
    const cartao = disponiveis.find((c) => c.id === selectedId);
    if (!cartao) return;
    try {
      const r = await associarCartao.mutateAsync({
        cartaoId: cartao.id,
        numero: cartao.numero,
        tipo,
        motoristaId: motorista.id,
        orgId: cartao.org_id,
        hoje: todayISO(),
      });
      // O histórico falhar não desfaz a associação — mas tem de se ver.
      if (r.historicoFalhou) {
        toast({
          title: 'Cartão associado, mas sem registo de atribuição',
          description: `O combustível deste cartão vai entrar por atribuir. ${r.historicoFalhou}`,
          variant: 'destructive',
        });
      } else {
        toast({ title: `Cartão ${TIPO_INFO[tipo].label} ${cartao.numero} associado` });
      }
      setSelectedId('');
      onChanged?.();
    } catch (err: unknown) {
      toast({
        title: 'Erro ao associar',
        description: errorMessage(err),
        variant: 'destructive',
      });
    }
  };

  const devolver = async (c: CartaoAssociado) => {
    try {
      const r = await devolverCartao.mutateAsync({
        cartaoId: c.id,
        tipo: c.tipo,
        motoristaId: motorista.id,
        // Só limpar a ficha se ela apontava mesmo para este cartão.
        limparFicha: fichaDe(c.tipo).trim() === c.numero.trim(),
        hoje: todayISO(),
      });
      if (r.historicoFalhou) {
        toast({
          title: 'Cartão devolvido, mas o histórico não fechou',
          description: `Movimentos futuros deste cartão continuam a cair neste motorista. ${r.historicoFalhou}`,
          variant: 'destructive',
        });
      } else {
        toast({ title: `Cartão ${c.numero} devolvido` });
      }
      onChanged?.();
    } catch (err: unknown) {
      toast({
        title: 'Erro ao devolver',
        description: errorMessage(err),
        variant: 'destructive',
      });
    }
  };

  const sincronizarFicha = async (c: CartaoAssociado) => {
    try {
      await sincronizarCartao.mutateAsync({
        motoristaId: motorista.id,
        tipo: c.tipo,
        numero: c.numero,
      });
      toast({ title: 'Ficha sincronizada' });
      onChanged?.();
    } catch (err: unknown) {
      toast({ title: 'Erro', description: errorMessage(err), variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-3">
      {/* Associados */}
      {loading ? (
        <div className="flex justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : associados.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">Nenhum cartão de frota associado.</p>
      ) : (
        <div className="space-y-2">
          {associados.map((c) => {
            const info = TIPO_INFO[c.tipo];
            const Icon = info.Icon;
            const synced = fichaDe(c.tipo).trim() === c.numero.trim();
            return (
              <div
                key={c.id}
                className="flex items-center gap-2 rounded-md border bg-card/50 px-2.5 py-1.5"
              >
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full ${info.cls}`}
                >
                  <Icon className="h-3 w-3" />
                  {info.label}
                </span>
                <span className="font-mono text-sm font-medium">{c.numero}</span>
                <span className="text-xs text-muted-foreground">{fmtEur(c.limite)}</span>
                {synced ? (
                  <span
                    className="flex items-center gap-0.5 text-[11px] text-emerald-600 dark:text-emerald-400"
                    title="Ficha sincronizada com o cartão"
                  >
                    <Check className="h-3 w-3" />
                    ficha ok
                  </span>
                ) : (
                  <button
                    onClick={() => sincronizarFicha(c)}
                    disabled={busy}
                    className="flex items-center gap-0.5 text-[11px] text-amber-600 dark:text-amber-400 hover:underline"
                    title={`Ficha aponta para "${fichaDe(c.tipo) || '—'}". Clique para atualizar para ${c.numero}.`}
                  >
                    <AlertTriangle className="h-3 w-3" />
                    atualizar ficha
                  </button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-7 px-2 text-amber-600 hover:text-amber-600"
                  onClick={() => devolver(c)}
                  disabled={busy}
                >
                  <UserX className="h-3.5 w-3.5 mr-1" />
                  Devolver
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Associar novo */}
      <div className="border-t pt-3 space-y-2">
        <Label className="text-xs text-muted-foreground">Associar cartão disponível</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={tipo} onValueChange={(v) => setTipo(v as TipoCartao)}>
            <SelectTrigger className="w-24 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bp">BP</SelectItem>
              <SelectItem value="repsol">Repsol</SelectItem>
              <SelectItem value="edp">EDP</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={selectedId}
            onValueChange={setSelectedId}
            disabled={loadingDisp || disponiveis.length === 0}
          >
            <SelectTrigger className="flex-1 min-w-[160px] h-9">
              <SelectValue
                placeholder={
                  loadingDisp
                    ? 'A carregar…'
                    : disponiveis.length === 0
                      ? `Sem cartões ${TIPO_INFO[tipo].label} disponíveis`
                      : 'Selecionar cartão'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {disponiveis.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.numero}
                  {c.detentor ? ` · ${c.detentor}` : ''}
                  {c.limite != null ? ` · ${fmtEur(c.limite)}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-9" onClick={associar} disabled={busy || !selectedId}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            <span className="ml-1">Associar</span>
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {disponiveis.length} cartão(ões) {TIPO_INFO[tipo].label} disponível(is). Associar liga o
          cartão ao motorista (fica <strong>Em Uso</strong>) e atualiza a ficha.
        </p>
      </div>
    </div>
  );
};
