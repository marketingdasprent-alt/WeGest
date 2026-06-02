import { useEffect, useMemo, useState } from 'react';
import { startOfWeek, format } from 'date-fns';
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
import { Loader2, Search, Link2, CreditCard, Fuel, Zap, ChevronsUpDown } from 'lucide-react';
import { matchesSearch } from '@/lib/utils';

type Plataforma = 'bp' | 'repsol' | 'edp';

interface Cartao {
  plataforma: Plataforma;
  card_number: string;
  nome: string | null;
  total: number;
  transacoes: number;
}

interface MotoristaCRM {
  id: string;
  nome: string;
  cartao_bp: string | null;
  cartao_repsol: string | null;
  cartao_edp: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}

const fmtEur = (v: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);

const normalize = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

const PLAT_INFO: Record<Plataforma, { label: string; cor: string; Icon: typeof Fuel }> = {
  bp: { label: 'BP', cor: 'text-green-600', Icon: Fuel },
  repsol: { label: 'Repsol', cor: 'text-orange-600', Icon: Fuel },
  edp: { label: 'EDP', cor: 'text-emerald-600', Icon: Zap },
};

export const CartoesNaoReconhecidos: React.FC<Props> = ({ open, onOpenChange, onChanged }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [cartoes, setCartoes] = useState<Cartao[]>([]);
  const [motoristas, setMotoristas] = useState<MotoristaCRM[]>([]);
  const [search, setSearch] = useState('');
  const [associando, setAssociando] = useState<string | null>(null);

  useEffect(() => {
    if (open) carregar();
  }, [open]);

  const carregar = async () => {
    setLoading(true);
    try {
      const [{ data: crm }, { data: lista, error }] = await Promise.all([
        supabase
          .from('motoristas_ativos')
          .select('id, nome, cartao_bp, cartao_repsol, cartao_edp')
          .order('nome'),
        (supabase as any).rpc('get_cartoes_combustivel_nao_associados', {
          p_desde: format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
        }),
      ]);
      if (error) throw error;
      setMotoristas((crm || []) as MotoristaCRM[]);
      const arr = ((lista as any[]) || [])
        .map((r) => ({
          plataforma: r.plataforma as Plataforma,
          card_number: r.card_number as string,
          nome: r.nome as string | null,
          total: Number(r.total) || 0,
          transacoes: Number(r.transacoes) || 0,
        }))
        .sort((a, b) => b.total - a.total);
      setCartoes(arr);
    } catch (err: any) {
      toast({ title: 'Erro', description: 'Falha ao carregar cartões.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const associar = async (cartao: Cartao, motoristaId: string) => {
    const chave = `${cartao.plataforma}-${cartao.card_number}`;
    setAssociando(chave);
    try {
      const { error } = await (supabase as any).rpc('associar_cartao_combustivel', {
        p_plataforma: cartao.plataforma,
        p_card: cartao.card_number,
        p_motorista: motoristaId,
      });
      if (error) throw error;
      toast({
        title: 'Cartão associado',
        description: `Cartão ${cartao.card_number} (${PLAT_INFO[cartao.plataforma].label}) ligado.`,
      });
      setCartoes((prev) =>
        prev.filter(
          (c) => !(c.plataforma === cartao.plataforma && c.card_number === cartao.card_number)
        )
      );
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
    if (!search) return cartoes;
    return cartoes.filter(
      (c) => matchesSearch(c.card_number, search) || matchesSearch(c.nome, search)
    );
  }, [cartoes, search]);

  const total = useMemo(() => cartoes.reduce((s, c) => s + c.total, 0), [cartoes]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-orange-500" />
            Cartões de combustível não reconhecidos
          </DialogTitle>
          <DialogDescription>
            {cartoes.length} cartão(ões) BP/Repsol/EDP com transações que não estão ligadas a uma
            ficha. Total: <strong>{fmtEur(total)}</strong>. Associa cada cartão ao motorista
            correto.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Pesquisar cartão ou nome…"
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
              {cartoes.length === 0
                ? '🎉 Todos os cartões de combustível estão associados!'
                : 'Nenhum resultado para a pesquisa.'}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((cartao) => (
                <LinhaCartao
                  key={`${cartao.plataforma}-${cartao.card_number}`}
                  cartao={cartao}
                  motoristas={motoristas}
                  associando={associando === `${cartao.plataforma}-${cartao.card_number}`}
                  onAssociar={(mid) => associar(cartao, mid)}
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const LinhaCartao: React.FC<{
  cartao: Cartao;
  motoristas: MotoristaCRM[];
  associando: boolean;
  onAssociar: (motoristaId: string) => void;
}> = ({ cartao, motoristas, associando, onAssociar }) => {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const info = PLAT_INFO[cartao.plataforma];
  const Icon = info.Icon;

  // Sugestão: motorista cujo nome aparece no "Nome cartão" (EDP) ou cartão já parecido.
  const sugestaoId = useMemo(() => {
    if (!cartao.nome) return null;
    const n = normalize(cartao.nome);
    const m = motoristas.find((mt) => {
      const partes = normalize(mt.nome)
        .split(' ')
        .filter((p) => p.length > 2);
      return partes.length >= 2 && partes.every((p) => n.includes(p));
    });
    return m?.id || null;
  }, [cartao.nome, motoristas]);

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 min-w-0">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className={`h-4 w-4 ${info.cor}`} />
        </span>
        <div className="min-w-0">
          <p className="font-medium truncate font-mono text-sm">{cartao.card_number}</p>
          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1">
            <Badge variant="outline">{info.label}</Badge>
            {cartao.nome && <span className="italic">{cartao.nome}</span>}
            <span>
              {fmtEur(cartao.total)} · {cartao.transacoes} transação(ões)
            </span>
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
              {sugestaoId && (
                <CommandGroup heading="Sugestão">
                  {motoristas
                    .filter((m) => m.id === sugestaoId)
                    .map((m) => (
                      <CommandItem
                        key={m.id}
                        value={`sugestao-${m.nome}`}
                        onSelect={() => {
                          setPopoverOpen(false);
                          onAssociar(m.id);
                        }}
                      >
                        {m.nome}
                      </CommandItem>
                    ))}
                </CommandGroup>
              )}
              <CommandGroup heading="Todos os motoristas">
                {motoristas.map((m) => (
                  <CommandItem
                    key={m.id}
                    value={m.nome}
                    onSelect={() => {
                      setPopoverOpen(false);
                      onAssociar(m.id);
                    }}
                  >
                    <span className="truncate">{m.nome}</span>
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
