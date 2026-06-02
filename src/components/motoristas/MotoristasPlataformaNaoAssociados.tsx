import { useEffect, useMemo, useState } from 'react';
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
import {
  Loader2,
  Search,
  Link2,
  UserPlus,
  Car,
  Zap,
  Check,
  ChevronsUpDown,
  Printer,
} from 'lucide-react';
import { cn, matchesSearch } from '@/lib/utils';
import { generateNaoAssociadosPDF } from '@/utils/generateNaoAssociadosPDF';
import { useThemedLogo } from '@/hooks/useThemedLogo';

type Plataforma = 'uber' | 'bolt';

interface Fonte {
  plataforma: Plataforma;
  id_plataforma: string; // uber_driver_id ou identificador_motorista (bolt)
  faturado: number;
  transacoes: number;
}

// Um motorista agrupado por nome — pode ter fonte Uber E Bolt.
interface NaoAssociado {
  key: string; // nome normalizado
  nome: string; // melhor nome disponível
  fontes: Fonte[];
  faturado: number; // soma
  transacoes: number; // soma
}

interface MotoristaCRM {
  id: string;
  nome: string;
  uber_uuid: string | null;
  bolt_id: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
  onCriarFicha?: (prefill: { nome: string; uberId?: string; boltId?: string }) => void;
}

const fmtEur = (v: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);

const normalize = (s: string) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

export const MotoristasPlataformaNaoAssociados: React.FC<Props> = ({
  open,
  onOpenChange,
  onChanged,
  onCriarFicha,
}) => {
  const { toast } = useToast();
  const logoSrc = useThemedLogo();
  const [loading, setLoading] = useState(false);
  const [naoAssociados, setNaoAssociados] = useState<NaoAssociado[]>([]);
  const [motoristas, setMotoristas] = useState<MotoristaCRM[]>([]);
  const [search, setSearch] = useState('');
  const [associando, setAssociando] = useState<string | null>(null);

  const imprimirLista = () => {
    const fonte = search ? filtered : naoAssociados;
    if (fonte.length === 0) {
      toast({ title: 'Sem dados', description: 'Não há motoristas para imprimir.' });
      return;
    }
    const doc = generateNaoAssociadosPDF({
      linhas: fonte.map((n) => ({
        nome: n.nome,
        plataforma: n.fontes.map((f) => f.plataforma.toUpperCase()).join(' + '),
        faturado: n.faturado,
        transacoes: n.transacoes,
      })),
      logoSrc,
    });
    doc.save(`motoristas_sem_ficha_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  useEffect(() => {
    if (open) carregar();
  }, [open]);

  const carregar = async () => {
    setLoading(true);
    try {
      // Motoristas CRM (para o seletor de associação)
      const { data: crm } = await supabase
        .from('motoristas_ativos')
        .select('id, nome, uber_uuid, bolt_id')
        .order('nome');
      const crmList = (crm || []) as MotoristaCRM[];
      setMotoristas(crmList);

      // Um id de plataforma conta como "ligado" se:
      //  (a) está num uber_uuid/bolt_id de alguma ficha, OU
      //  (b) já tem motorista_id nalgum registo dessa plataforma (mesmo que outro
      //      registo do mesmo id ainda esteja NULL — caso do Agnelo, em que a ficha
      //      tinha um bolt_id desatualizado mas os resumos já estavam ligados).
      const uberJaLigados = new Set(
        crmList.map((m) => m.uber_uuid).filter((x): x is string => !!x)
      );
      const boltJaLigados = new Set(crmList.map((m) => m.bolt_id).filter((x): x is string => !!x));

      const [uberLigadosDb, boltLigadosDb] = await Promise.all([
        supabase
          .from('uber_transactions')
          .select('uber_driver_id')
          .not('motorista_id', 'is', null)
          .not('uber_driver_id', 'is', null),
        supabase
          .from('bolt_resumos_semanais')
          .select('identificador_motorista')
          .not('motorista_id', 'is', null)
          .not('identificador_motorista', 'is', null),
      ]);
      (uberLigadosDb.data || []).forEach((r: any) => uberJaLigados.add(r.uber_driver_id));
      (boltLigadosDb.data || []).forEach((r: any) => boltJaLigados.add(r.identificador_motorista));

      // Janela: últimas 8 semanas
      const desde = new Date();
      desde.setDate(desde.getDate() - 56);
      const desdeIso = desde.toISOString();
      const desdeDate = desde.toISOString().slice(0, 10);

      // --- UBER: transações sem motorista_id, agrupar por uber_driver_id ---
      const { data: uberTx } = await supabase
        .from('uber_transactions')
        .select('uber_driver_id, gross_amount')
        .is('motorista_id', null)
        .gte('occurred_at', desdeIso)
        .not('uber_driver_id', 'is', null);

      const { data: uberDrivers } = await supabase
        .from('uber_drivers')
        .select('uber_driver_id, full_name')
        .is('motorista_id', null);
      const uberNomeById = new Map<string, string>();
      (uberDrivers || []).forEach((d: any) => {
        if (d.uber_driver_id) uberNomeById.set(d.uber_driver_id, d.full_name || d.uber_driver_id);
      });

      // 1ª passagem: agregar por id de plataforma (cada fonte separada)
      const fontesUber = new Map<string, { nome: string; faturado: number; transacoes: number }>();
      (uberTx || []).forEach((t: any) => {
        const id = t.uber_driver_id;
        if (!id || !uberNomeById.has(id)) return;
        if (uberJaLigados.has(id)) return;
        const cur = fontesUber.get(id) || {
          nome: uberNomeById.get(id)!,
          faturado: 0,
          transacoes: 0,
        };
        cur.faturado += Number(t.gross_amount) || 0;
        cur.transacoes += 1;
        fontesUber.set(id, cur);
      });

      // --- BOLT: resumos sem motorista_id, agrupar por identificador ---
      const { data: boltRows } = await supabase
        .from('bolt_resumos_semanais')
        .select('identificador_motorista, motorista_nome, ganhos_liquidos')
        .is('motorista_id', null)
        .gte('periodo_inicio', desdeDate)
        .not('identificador_motorista', 'is', null);

      const fontesBolt = new Map<string, { nome: string; faturado: number; transacoes: number }>();
      (boltRows || []).forEach((r: any) => {
        const id = r.identificador_motorista;
        if (!id) return;
        if (boltJaLigados.has(id)) return;
        const cur = fontesBolt.get(id) || {
          nome: r.motorista_nome || id,
          faturado: 0,
          transacoes: 0,
        };
        cur.faturado += Number(r.ganhos_liquidos) || 0;
        cur.transacoes += 1;
        fontesBolt.set(id, cur);
      });

      // 2ª passagem: UNIFICAR por nome normalizado (mesma pessoa em Uber + Bolt = 1 linha)
      const grupos = new Map<string, NaoAssociado>();
      const addFonte = (
        plataforma: Plataforma,
        idPlataforma: string,
        nome: string,
        faturado: number,
        transacoes: number
      ) => {
        const key = normalize(nome) || idPlataforma;
        const g = grupos.get(key) || {
          key,
          nome,
          fontes: [] as Fonte[],
          faturado: 0,
          transacoes: 0,
        };
        // Preferir o nome mais comprido (geralmente mais completo)
        if (nome.length > g.nome.length) g.nome = nome;
        g.fontes.push({ plataforma, id_plataforma: idPlataforma, faturado, transacoes });
        g.faturado += faturado;
        g.transacoes += transacoes;
        grupos.set(key, g);
      };
      fontesUber.forEach((v, id) => addFonte('uber', id, v.nome, v.faturado, v.transacoes));
      fontesBolt.forEach((v, id) => addFonte('bolt', id, v.nome, v.faturado, v.transacoes));

      const todos = [...grupos.values()].sort((a, b) => b.faturado - a.faturado);
      setNaoAssociados(todos);
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: 'Falha ao carregar não-associados.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const associar = async (item: NaoAssociado, motoristaId: string) => {
    setAssociando(item.key);
    try {
      const uberId = item.fontes.find((f) => f.plataforma === 'uber')?.id_plataforma;
      const boltId = item.fontes.find((f) => f.plataforma === 'bolt')?.id_plataforma;

      // Liga TODAS as plataformas deste motorista de uma só vez.
      const fichaUpdate: Record<string, any> = {};
      if (uberId) fichaUpdate.uber_uuid = uberId;
      if (boltId) fichaUpdate.bolt_id = boltId;
      if (Object.keys(fichaUpdate).length > 0) {
        await supabase
          .from('motoristas_ativos')
          .update(fichaUpdate as any)
          .eq('id', motoristaId);
      }

      if (uberId) {
        await supabase
          .from('uber_drivers')
          .update({ motorista_id: motoristaId })
          .eq('uber_driver_id', uberId);
        await supabase
          .from('uber_transactions')
          .update({ motorista_id: motoristaId })
          .eq('uber_driver_id', uberId)
          .is('motorista_id', null);
      }
      if (boltId) {
        await supabase
          .from('bolt_resumos_semanais')
          .update({ motorista_id: motoristaId })
          .eq('identificador_motorista', boltId)
          .is('motorista_id', null);
      }

      const plats = item.fontes.map((f) => f.plataforma.toUpperCase()).join(' + ');
      toast({
        title: 'Associado',
        description: `${item.nome} (${plats}) ligado à ficha selecionada.`,
      });
      setNaoAssociados((prev) => prev.filter((n) => n.key !== item.key));
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
    if (!search) return naoAssociados;
    return naoAssociados.filter((n) => matchesSearch(n.nome, search));
  }, [naoAssociados, search]);

  const totalFaturado = useMemo(
    () => naoAssociados.reduce((s, n) => s + n.faturado, 0),
    [naoAssociados]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-amber-500" />
            Motoristas de plataforma sem ficha
          </DialogTitle>
          <DialogDescription>
            {naoAssociados.length} motorista(s) com atividade nas últimas 8 semanas que não estão
            ligados a uma ficha. Total faturado: <strong>{fmtEur(totalFaturado)}</strong>. Associa a
            uma ficha existente ou cria uma nova.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Pesquisar nome…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant="outline"
            className="gap-2 shrink-0"
            onClick={imprimirLista}
            disabled={loading || naoAssociados.length === 0}
          >
            <Printer className="h-4 w-4" />
            Imprimir{search ? ' filtrados' : ' lista'}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {naoAssociados.length === 0
                ? '🎉 Todos os motoristas de plataforma estão associados!'
                : 'Nenhum resultado para a pesquisa.'}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((item) => (
                <LinhaNaoAssociado
                  key={item.key}
                  item={item}
                  motoristas={motoristas}
                  associando={associando === item.key}
                  onAssociar={(motoristaId) => associar(item, motoristaId)}
                  onCriar={() =>
                    onCriarFicha?.({
                      nome: item.nome,
                      uberId: item.fontes.find((f) => f.plataforma === 'uber')?.id_plataforma,
                      boltId: item.fontes.find((f) => f.plataforma === 'bolt')?.id_plataforma,
                    })
                  }
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const LinhaNaoAssociado: React.FC<{
  item: NaoAssociado;
  motoristas: MotoristaCRM[];
  associando: boolean;
  onAssociar: (motoristaId: string) => void;
  onCriar: () => void;
}> = ({ item, motoristas, associando, onAssociar, onCriar }) => {
  const [popoverOpen, setPopoverOpen] = useState(false);

  // Sugestão fuzzy: motorista CRM cujo 1º+último nome coincide
  const sugestaoId = useMemo(() => {
    const partes = normalize(item.nome)
      .split(' ')
      .filter((p) => p.length > 2);
    if (partes.length < 1) return null;
    const match = motoristas.find((m) => {
      const mp = normalize(m.nome)
        .split(' ')
        .filter((p) => p.length > 2);
      const comuns = partes.filter((p) => mp.includes(p));
      return comuns.length >= 2;
    });
    return match?.id || null;
  }, [item.nome, motoristas]);

  const temUber = item.fontes.some((f) => f.plataforma === 'uber');
  const temBolt = item.fontes.some((f) => f.plataforma === 'bolt');

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 min-w-0">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          {temUber && temBolt ? (
            <span className="flex items-center gap-0.5">
              <Car className="h-3.5 w-3.5 text-slate-500" />
              <Zap className="h-3.5 w-3.5 text-amber-500" />
            </span>
          ) : temUber ? (
            <Car className="h-4 w-4 text-slate-500" />
          ) : (
            <Zap className="h-4 w-4 text-amber-500" />
          )}
        </span>
        <div className="min-w-0">
          <p className="font-medium truncate">{item.nome}</p>
          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1">
            {temUber && (
              <Badge variant="outline" className="border-slate-400/50">
                Uber
              </Badge>
            )}
            {temBolt && (
              <Badge variant="outline" className="border-amber-400/50">
                Bolt
              </Badge>
            )}
            <span>
              {fmtEur(item.faturado)} · {item.transacoes} transação(ões)
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5" disabled={associando}>
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
                          <Check className="mr-2 h-4 w-4 text-green-500" />
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

        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={onCriar}
          disabled={associando}
        >
          <UserPlus className="h-3.5 w-3.5" />
          Criar ficha
        </Button>
      </div>
    </div>
  );
};
