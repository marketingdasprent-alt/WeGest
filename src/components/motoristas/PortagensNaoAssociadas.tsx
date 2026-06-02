import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
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
import { Loader2, Search, Link2, ChevronsUpDown, Car, Printer } from 'lucide-react';
import { matchesSearch } from '@/lib/utils';
import { DialogFooter } from '@/components/ui/dialog';

interface ViaturaPortagem {
  matricula: string;
  viatura_id: string | null;
  total_portagens: number;
  total_valor: number;
  data_min: string | null;
  data_max: string | null;
}

interface MotoristaCRM {
  id: string;
  nome: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}

const fmtEur = (v: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);

export const PortagensNaoAssociadas: React.FC<Props> = ({ open, onOpenChange, onChanged }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [viaturas, setViaturas] = useState<ViaturaPortagem[]>([]);
  const [motoristas, setMotoristas] = useState<MotoristaCRM[]>([]);
  const [search, setSearch] = useState('');
  const [associando, setAssociando] = useState<string | null>(null);

  useEffect(() => {
    if (open) carregar();
  }, [open]);

  const carregar = async () => {
    setLoading(true);
    try {
      const [{ data: crm }, { data: portagens, error }] = await Promise.all([
        supabase.from('motoristas_ativos').select('id, nome').order('nome'),
        (supabase as any)
          .from('via_verde_transacoes')
          .select('matricula, viatura_id, amount, transaction_date')
          .is('motorista_id', null)
          .not('matricula', 'is', null),
      ]);

      if (error) throw error;
      setMotoristas((crm || []) as MotoristaCRM[]);

      const grouped = new Map<string, ViaturaPortagem>();
      for (const row of (portagens as any[]) || []) {
        const mat = row.matricula as string;
        if (!grouped.has(mat)) {
          grouped.set(mat, {
            matricula: mat,
            viatura_id: row.viatura_id || null,
            total_portagens: 0,
            total_valor: 0,
            data_min: row.transaction_date || null,
            data_max: row.transaction_date || null,
          });
        }
        const entry = grouped.get(mat)!;
        entry.total_portagens += 1;
        entry.total_valor += Number(row.amount) || 0;
        if (row.transaction_date) {
          if (!entry.data_min || row.transaction_date < entry.data_min)
            entry.data_min = row.transaction_date;
          if (!entry.data_max || row.transaction_date > entry.data_max)
            entry.data_max = row.transaction_date;
        }
        if (!entry.viatura_id && row.viatura_id) entry.viatura_id = row.viatura_id;
      }

      setViaturas([...grouped.values()].sort((a, b) => b.total_valor - a.total_valor));
    } catch {
      toast({ title: 'Erro', description: 'Falha ao carregar portagens.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const associar = async (viatura: ViaturaPortagem, motoristaId: string) => {
    setAssociando(viatura.matricula);
    try {
      if (viatura.viatura_id) {
        const dataInicio = viatura.data_min
          ? viatura.data_min.slice(0, 10)
          : format(new Date(), 'yyyy-MM-dd');

        const { error: mvError } = await supabase.from('motorista_viaturas').upsert(
          {
            viatura_id: viatura.viatura_id,
            motorista_id: motoristaId,
            data_inicio: dataInicio,
            data_fim: null,
          },
          { onConflict: 'viatura_id,data_inicio' }
        );
        if (mvError) throw mvError;
      }

      const { error: txError } = await (supabase as any)
        .from('via_verde_transacoes')
        .update({ motorista_id: motoristaId })
        .eq('matricula', viatura.matricula)
        .is('motorista_id', null);
      if (txError) throw txError;

      const nome = motoristas.find((m) => m.id === motoristaId)?.nome ?? '';
      toast({
        title: 'Viatura associada',
        description: `${viatura.matricula} → ${nome}. ${viatura.total_portagens} portagem(ns) atualizadas.`,
      });
      setViaturas((prev) => prev.filter((v) => v.matricula !== viatura.matricula));
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
    if (!search) return viaturas;
    return viaturas.filter((v) => matchesSearch(v.matricula, search));
  }, [viaturas, search]);

  const totals = useMemo(
    () => ({
      viaturas: viaturas.length,
      portagens: viaturas.reduce((s, v) => s + v.total_portagens, 0),
      valor: viaturas.reduce((s, v) => s + v.total_valor, 0),
    }),
    [viaturas]
  );

  const handlePrint = () => {
    const fmtDate = (s: string | null) => {
      if (!s) return '';
      try {
        return format(new Date(s), 'dd/MM/yyyy');
      } catch {
        return s.slice(0, 10);
      }
    };
    const rows = viaturas
      .map(
        (v) =>
          `<tr>
            <td>${v.matricula}</td>
            <td>${v.total_portagens}</td>
            <td>${fmtEur(v.total_valor)}</td>
            <td>${fmtDate(v.data_min)}${v.data_max !== v.data_min ? ' – ' + fmtDate(v.data_max) : ''}</td>
          </tr>`
      )
      .join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Portagens sem motorista</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; }
        h2 { margin-bottom: 4px; }
        p { margin: 0 0 12px; color: #555; font-size: 11px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f3f4f6; text-align: left; padding: 6px 8px; border-bottom: 2px solid #d1d5db; font-size: 11px; }
        td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
        tfoot td { font-weight: bold; border-top: 2px solid #d1d5db; }
        @media print { button { display: none; } }
      </style></head><body>
      <h2>Portagens sem motorista associado</h2>
      <p>${viaturas.length} viatura(s) · ${totals.portagens} portagem(ns) · Total: ${fmtEur(totals.valor)}</p>
      <table>
        <thead><tr><th>Matrícula</th><th>Portagens</th><th>Valor</th><th>Período</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td>TOTAL</td><td>${totals.portagens}</td><td>${fmtEur(totals.valor)}</td><td></td></tr></tfoot>
      </table>
      <script>window.onload=()=>window.print();<\/script>
      </body></html>`;
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="h-5 w-5 text-blue-500" />
            Portagens sem motorista associado
          </DialogTitle>
          <DialogDescription>
            {totals.viaturas} viatura(s) com {totals.portagens} portagem(ns) não atribuídas (total:{' '}
            <strong>{fmtEur(totals.valor)}</strong>). Associa cada viatura ao motorista correto.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Pesquisar matrícula…"
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
              {viaturas.length === 0
                ? '🎉 Todas as portagens têm motorista associado!'
                : 'Nenhum resultado para a pesquisa.'}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((viatura) => (
                <LinhaViatura
                  key={viatura.matricula}
                  viatura={viatura}
                  motoristas={motoristas}
                  associando={associando === viatura.matricula}
                  onAssociar={(mid) => associar(viatura, mid)}
                />
              ))}
            </div>
          )}
        </div>

        {viaturas.length > 0 && (
          <DialogFooter className="pt-2 border-t">
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              Imprimir lista
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

const LinhaViatura: React.FC<{
  viatura: ViaturaPortagem;
  motoristas: MotoristaCRM[];
  associando: boolean;
  onAssociar: (motoristaId: string) => void;
}> = ({ viatura, motoristas, associando, onAssociar }) => {
  const [popoverOpen, setPopoverOpen] = useState(false);

  const fmtDate = (s: string | null) => {
    if (!s) return '';
    try {
      return format(new Date(s), 'dd/MM/yyyy');
    } catch {
      return s.slice(0, 10);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 min-w-0">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Car className="h-4 w-4 text-blue-500" />
        </span>
        <div className="min-w-0">
          <p className="font-medium font-mono text-sm">{viatura.matricula}</p>
          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1">
            <Badge variant="outline">{viatura.total_portagens} portagens</Badge>
            <span>{fmtEur(viatura.total_valor)}</span>
            {viatura.data_min && (
              <span className="opacity-60">
                {fmtDate(viatura.data_min)}
                {viatura.data_max !== viatura.data_min ? ` – ${fmtDate(viatura.data_max)}` : ''}
              </span>
            )}
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
