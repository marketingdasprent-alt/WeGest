/**
 * Aba "Combustível" da ficha do cliente.
 *
 * Atribui e devolve cartões de frota, e mostra o que gastaram no período.
 *
 * Deliberadamente NÃO lança nada na conta-corrente — ver a nota em
 * `useClienteCombustivel`.
 *
 * A atribuição também existe em Administrativo → Cartões e é a MESMA RPC: o
 * cartão é um activo de frota, por isso a permissão que a guarda continua a ser
 * `administrativo_cartoes:editar`, e não a de gerir clientes. Quem não a tiver
 * vê o consumo mas não mexe.
 */
import { useState } from 'react';
import { Fuel, Zap, CreditCard, Plus, UserX, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { errorMessage } from '@/utils/errorMessage';
import { usePermissions } from '@/hooks/usePermissions';
import { RECURSOS } from '@/utils/permissions';
import {
  useCartoesDisponiveis,
  useAssociarCartaoAoCliente,
  useDevolverCartaoDoCliente,
  type TipoCartao,
} from '@/hooks/useCartoesFrota';
import { useCartoesDoCliente, useConsumoDoCliente } from '@/hooks/useClienteCombustivel';

interface ClienteCombustivelTabProps {
  clienteId: string | null;
}

const TIPO_INFO = {
  bp: { label: 'BP', Icon: Fuel, cls: 'bg-green-100 text-green-800 dark:bg-green-900/30' },
  repsol: {
    label: 'Repsol',
    Icon: Fuel,
    cls: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30',
  },
  edp: { label: 'EDP', Icon: Zap, cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30' },
} as const;

const fmtEur = (v: number | null) =>
  v == null
    ? '—'
    : new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);

const primeiroDiaDoMes = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
const hoje = () => new Date().toISOString().slice(0, 10);

export function ClienteCombustivelTab({ clienteId }: ClienteCombustivelTabProps) {
  const [inicio, setInicio] = useState(primeiroDiaDoMes);
  const [fim, setFim] = useState(hoje);
  const [tipo, setTipo] = useState<TipoCartao>('bp');
  const [selecionado, setSelecionado] = useState('');

  const { toast } = useToast();
  const { canEdit } = usePermissions();
  // O cartão é um activo de frota: quem o move é quem gere cartões, não quem
  // gere clientes. Sem esta permissão a aba mostra, mas não mexe — e a RPC
  // recusaria de qualquer forma.
  const podeGerir = canEdit(RECURSOS.ADMINISTRATIVO_CARTOES);

  const { data: cartoes = [], isLoading: aCarregarCartoes } = useCartoesDoCliente(clienteId);
  const { data: disponiveis = [], isLoading: aCarregarDisponiveis } = useCartoesDisponiveis(
    podeGerir ? tipo : undefined
  );

  const associar = useAssociarCartaoAoCliente();
  const devolver = useDevolverCartaoDoCliente();
  const ocupado = associar.isPending || devolver.isPending;

  const onAssociar = async () => {
    const cartao = disponiveis.find((c) => c.id === selecionado);
    if (!cartao || !clienteId) return;
    try {
      await associar.mutateAsync({ cartaoId: cartao.id, clienteId });
      toast({ title: `Cartão ${TIPO_INFO[tipo].label} ${cartao.numero} associado` });
      setSelecionado('');
    } catch (err: unknown) {
      toast({ title: 'Erro ao associar', description: errorMessage(err), variant: 'destructive' });
    }
  };

  const onDevolver = async (cartaoId: string, numero: string) => {
    try {
      await devolver.mutateAsync({ cartaoId });
      toast({ title: `Cartão ${numero} devolvido` });
    } catch (err: unknown) {
      toast({ title: 'Erro ao devolver', description: errorMessage(err), variant: 'destructive' });
    }
  };
  const { data: consumo, isLoading: aCarregarConsumo } = useConsumoDoCliente(
    clienteId,
    inicio,
    fim
  );

  if (!clienteId) {
    return (
      <p className="text-sm text-muted-foreground italic py-4">
        Grave o cliente primeiro para poder associar cartões de frota.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cartões atribuídos */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CreditCard className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          Cartões de frota
        </div>

        {aCarregarCartoes ? (
          <Skeleton className="h-16 w-full" />
        ) : cartoes.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            Nenhum cartão de frota atribuído a este cliente.
          </p>
        ) : (
          <div className="space-y-2">
            {cartoes.map((c) => {
              const info = TIPO_INFO[c.tipo];
              const Icon = info.Icon;
              return (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border bg-card/50 px-2.5 py-1.5"
                >
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full ${info.cls}`}
                  >
                    <Icon className="h-3 w-3" />
                    {info.label}
                  </span>
                  <span className="font-mono text-sm font-medium">{c.numero}</span>
                  {c.limite != null && (
                    <span className="text-xs text-muted-foreground">
                      plafond {fmtEur(c.limite)}
                    </span>
                  )}
                  {c.data_entrega && (
                    <span className="text-xs text-muted-foreground">desde {c.data_entrega}</span>
                  )}
                  {podeGerir && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-7 px-2 text-amber-600 hover:text-amber-600"
                      onClick={() => onDevolver(c.id, c.numero)}
                      disabled={ocupado}
                    >
                      <UserX className="h-3.5 w-3.5 mr-1" />
                      Devolver
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Associar novo */}
        {podeGerir ? (
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
                value={selecionado}
                onValueChange={setSelecionado}
                disabled={aCarregarDisponiveis || disponiveis.length === 0}
              >
                <SelectTrigger className="flex-1 min-w-[180px] h-9">
                  <SelectValue
                    placeholder={
                      aCarregarDisponiveis
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
              <Button
                size="sm"
                className="h-9"
                onClick={onAssociar}
                disabled={ocupado || !selecionado}
              >
                {ocupado ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                <span className="ml-1">Associar</span>
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {disponiveis.length} cartão(ões) {TIPO_INFO[tipo].label} disponível(is). Associar liga
              o cartão a este cliente (fica <strong>Em Uso</strong>) e abre o período a partir do
              qual o consumo lhe é imputado.
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground border-t pt-3">
            Precisa da permissão de edição em <strong>Administrativo → Cartões</strong> para
            associar ou devolver cartões.
          </p>
        )}
      </section>

      {/* Consumo do período */}
      <section className="space-y-3 border-t pt-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">De</Label>
            <Input
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              className="h-9 w-40"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Até</Label>
            <Input
              type="date"
              value={fim}
              onChange={(e) => setFim(e.target.value)}
              className="h-9 w-40"
            />
          </div>
        </div>

        {aCarregarConsumo ? (
          <Skeleton className="h-20 w-full" />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">A pagar no período</p>
              <p className="text-lg font-semibold">{fmtEur(consumo?.total ?? 0)}</p>
              <p className="text-[11px] text-muted-foreground">
                {consumo?.transacoes ?? 0} transacção(ões)
              </p>
            </div>
            {(['bp', 'repsol', 'edp'] as const).map((t) => (
              <div key={t} className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{TIPO_INFO[t].label}</p>
                <p className="text-base font-medium">{fmtEur(consumo?.porTipo[t] ?? 0)}</p>
              </div>
            ))}
          </div>
        )}

        {!!consumo?.gastoCobradoAOutro && (
          <p className="text-xs rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/10 dark:text-amber-300">
            Além disto, gastou <strong>{fmtEur(consumo.gastoCobradoAOutro)}</strong> com os cartões
            dele que são cobrados ao titular do contrato onde conduz — por isso não entram no valor
            acima.
          </p>
        )}

        <p className="text-[11px] text-muted-foreground">
          O valor a pagar é o das transacções cujo devedor é este cliente: o que ele gastou, mais o
          que os condutores dos contratos de que é titular gastaram. Calculado a partir das
          transacções importadas — <strong>não é lançado na conta-corrente</strong>.
        </p>
      </section>
    </div>
  );
}
