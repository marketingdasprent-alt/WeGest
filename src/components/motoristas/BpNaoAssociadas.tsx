import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Loader2, Search, Link2, Fuel, ChevronsUpDown } from 'lucide-react';

interface GrupoCartao {
  card_number: string | null;
  transacoes: number;
  total_valor: number;
  total_litros: number;
  ultima_data: string;
  ids: string[];
}

interface Motorista {
  id: string;
  nome: string;
  cartao_bp: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}

const fmtEur = (v: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);

const fmtL = (v: number) =>
  new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    v || 0
  );

export const BpNaoAssociadas: React.FC<Props> = ({ open, onOpenChange, onChanged }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [grupos, setGrupos] = useState<GrupoCartao[]>([]);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [search, setSearch] = useState('');
  const [associando, setAssociando] = useState<string | null>(null);

  useEffect(() => {
    if (open) carregar();
  }, [open]);

  const carregar = async () => {
    setLoading(true);
    try {
      const [crmResult, txResult] = await Promise.all([
        supabase.from('motoristas_ativos').select('id, nome, cartao_bp').order('nome'),
        supabase
          .from('bp_transacoes')
          .select('id, card_number, amount, quantity, transaction_date')
          .is('motorista_id', null)
          .order('transaction_date', { ascending: false }),
      ]);
      if (txResult.error) throw txResult.error;
      setMotoristas((crmResult.data || []) as Motorista[]);

      // Group by card_number
      const map = new Map<string, GrupoCartao>();
      const txData = (txResult.data || []) as unknown as Array<{
        id: string;
        card_number: string | null;
        amount: number | null;
        quantity: number | null;
        transaction_date: string;
      }>;
      for (const tx of txData) {
        const key = tx.card_number || '__sem_cartao__';
        if (!map.has(key)) {
          map.set(key, {
            card_number: tx.card_number,
            transacoes: 0,
            total_valor: 0,
            total_litros: 0,
            ultima_data: tx.transaction_date,
            ids: [],
          });
        }
        const g = map.get(key)!;
        g.transacoes++;
        g.total_valor += tx.amount || 0;
        g.total_litros += tx.quantity || 0;
        g.ids.push(tx.id);
        if (tx.transaction_date > g.ultima_data) g.ultima_data = tx.transaction_date;
      }
      setGrupos(Array.from(map.values()).sort((a, b) => b.total_valor - a.total_valor));
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: 'Falha ao carregar transações BP.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const associar = async (grupo: GrupoCartao, motoristaId: string, motoristaNome: string) => {
    const key = grupo.card_number || '__sem_cartao__';
    setAssociando(key);
    try {
      // Update all transactions of this card
      const { error: txError } = await supabase
        .from('bp_transacoes')
        .update({ motorista_id: motoristaId })
        .in('id', grupo.ids);
      if (txError) throw txError;

      // Also register the card on the driver if not set
      if (grupo.card_number) {
        const motorista = motoristas.find((m) => m.id === motoristaId);
        if (motorista && !motorista.cartao_bp) {
          await supabase
            .from('motoristas_ativos')
            .update({ cartao_bp: grupo.card_number })
            .eq('id', motoristaId);
        }
      }

      toast({
        title: 'Transações associadas',
        description: `${grupo.transacoes} transação(ões) BP ligadas a ${motoristaNome}.`,
      });
      setGrupos((prev) => prev.filter((g) => (g.card_number || '__sem_cartao__') !== key));
      onChanged?.();
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err.message || 'Falha ao associar.',
        variant: 'destructive',
      });
    } finally {
      setAssociando(null);
    }
  };

  const filtered = useMemo(() => {
    if (!search) return grupos;
    const t = search.toLowerCase();
    return grupos.filter((g) => (g.card_number || '').toLowerCase().includes(t));
  }, [grupos, search]);

  const totalValor = useMemo(() => grupos.reduce((s, g) => s + g.total_valor, 0), [grupos]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Fuel className="h-5 w-5 text-green-600" />
            Transações BP não associadas
          </DialogTitle>
          <DialogDescription>
            {grupos.length} cartão(ões) BP com transações sem motorista identificado. Total:{' '}
            <strong>{fmtEur(totalValor)}</strong>. Associa cada cartão ao motorista correto.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Pesquisar número de cartão…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {grupos.length === 0
                ? 'Todas as transações BP estão associadas a motoristas!'
                : 'Nenhum resultado para a pesquisa.'}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((grupo) => (
                <LinhaGrupo
                  key={grupo.card_number || '__sem_cartao__'}
                  grupo={grupo}
                  motoristas={motoristas}
                  associando={associando === (grupo.card_number || '__sem_cartao__')}
                  onAssociar={(mid, nome) => associar(grupo, mid, nome)}
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const LinhaGrupo: React.FC<{
  grupo: GrupoCartao;
  motoristas: Motorista[];
  associando: boolean;
  onAssociar: (motoristaId: string, nome: string) => void;
}> = ({ grupo, motoristas, associando, onAssociar }) => {
  const [popoverOpen, setPopoverOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 min-w-0">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-500/10">
          <Fuel className="h-4 w-4 text-green-600" />
        </span>
        <div className="min-w-0">
          <p className="font-medium font-mono text-sm">
            {grupo.card_number || <span className="italic text-muted-foreground">Sem cartão</span>}
          </p>
          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1">
            <Badge variant="outline" className="text-green-700 border-green-300">
              BP
            </Badge>
            <span>{grupo.transacoes} transação(ões)</span>
            <span>·</span>
            <span>{fmtL(grupo.total_litros)} L</span>
            <span>·</span>
            <span className="font-medium text-foreground">{fmtEur(grupo.total_valor)}</span>
            <span>·</span>
            <span>última {format(new Date(grupo.ultima_data), 'dd/MM/yyyy', { locale: pt })}</span>
          </div>
        </div>
      </div>

      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5 shrink-0" disabled={associando}>
            {associando ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Link2 className="h-3.5 w-3.5" />
            )}
            Associar
            <ChevronsUpDown className="h-3 w-3 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0 z-[100]" align="end">
          <Command>
            <CommandInput placeholder="Procurar motorista…" />
            <CommandList>
              <CommandEmpty>Nenhum motorista encontrado.</CommandEmpty>
              <CommandGroup heading="Motoristas">
                {motoristas.map((m) => (
                  <CommandItem
                    key={m.id}
                    value={m.nome}
                    onSelect={() => {
                      setPopoverOpen(false);
                      onAssociar(m.id, m.nome);
                    }}
                  >
                    <span className="truncate">{m.nome}</span>
                    {m.cartao_bp && (
                      <span className="ml-auto text-xs font-mono text-muted-foreground">
                        {m.cartao_bp}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};
