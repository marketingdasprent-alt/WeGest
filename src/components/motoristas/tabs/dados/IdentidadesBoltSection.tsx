import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Link2, Loader2, Zap } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  useIdentidadesPlataforma,
  useMapearMotoristaBolt,
} from '@/hooks/useMotoristasPlataformaSync';
import { cn } from '@/lib/utils';

/**
 * Identidades Bolt ligadas a este motorista.
 *
 * A Bolt emite um `driver_uuid` novo sempre que o motorista sai da frota e
 * volta, e outro por cada conta da frota — por isso um motorista tem N. A
 * coluna `motoristas_ativos.bolt_id` só guardava um, e o sync preenchia o
 * resto adivinhando pelo nome, o que mandou ganhos para a ficha errada
 * (auditoria 2026-08-12).
 *
 * Agora a ligação é sempre manual e explícita: um UUID desconhecido fica por
 * ligar até alguém o atribuir aqui. A ligação vale para sempre e reatribui o
 * histórico desse UUID.
 */
interface Props {
  motoristaId: string | null;
}

/** UUIDs Bolt vistos nos resumos que ainda não pertencem a ninguém. */
function useIdentidadesBoltPorLigar() {
  return useQuery({
    queryKey: ['bolt-identidades-por-ligar'],
    queryFn: async () => {
      const { data: mapeados } = await (supabase as any)
        .from('bolt_mapeamento_motoristas')
        .select('driver_uuid');
      const jaLigados = new Set<string>(
        ((mapeados ?? []) as Array<{ driver_uuid: string }>).map((m) => m.driver_uuid)
      );

      const { data, error } = await supabase
        .from('bolt_resumos_semanais')
        .select('identificador_motorista, motorista_nome, telefone, periodo_inicio')
        .not('identificador_motorista', 'is', null)
        .order('periodo_inicio', { ascending: false })
        .limit(2000);
      if (error) throw error;

      const porUuid = new Map<
        string,
        { uuid: string; nome: string | null; telefone: string | null; ultima: string }
      >();
      for (const r of (data ?? []) as Array<{
        identificador_motorista: string;
        motorista_nome: string | null;
        telefone: string | null;
        periodo_inicio: string;
      }>) {
        const uuid = r.identificador_motorista;
        if (jaLigados.has(uuid) || porUuid.has(uuid)) continue;
        porUuid.set(uuid, {
          uuid,
          nome: r.motorista_nome,
          telefone: r.telefone,
          ultima: r.periodo_inicio,
        });
      }
      return [...porUuid.values()];
    },
  });
}

export function IdentidadesBoltSection({ motoristaId }: Props) {
  const [aberto, setAberto] = useState(false);
  const { data: ligadas = [], isLoading } = useIdentidadesPlataforma(motoristaId);
  const { data: porLigar = [], isLoading: aCarregarPorLigar } = useIdentidadesBoltPorLigar();
  const mapear = useMapearMotoristaBolt();

  const total = ligadas.length;
  const porLigarOrdenado = useMemo(
    () => [...porLigar].sort((a, b) => (a.nome ?? '').localeCompare(b.nome ?? '')),
    [porLigar]
  );

  if (!motoristaId) return null;

  return (
    <div className="mt-4 rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Zap className="h-4 w-4 text-yellow-500" />
          Identidades Bolt ligadas
          <Badge variant={total > 0 ? 'default' : 'outline'}>{total}</Badge>
        </div>

        <Popover open={aberto} onOpenChange={setAberto} modal={false}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="gap-2">
              {mapear.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
              Sincronizar identidade
              <ChevronsUpDown className="h-3 w-3 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[420px] p-0" align="end">
            <Command>
              <CommandInput placeholder="Procurar por nome ou telefone na Bolt..." className="h-9" />
              <CommandList>
                <CommandEmpty>
                  {aCarregarPorLigar ? 'A carregar…' : 'Não há identidades Bolt por ligar.'}
                </CommandEmpty>
                <CommandGroup heading="Por ligar (vistas nos resumos da Bolt)">
                  {porLigarOrdenado.map((i) => (
                    <CommandItem
                      key={i.uuid}
                      value={`${i.nome ?? ''} ${i.telefone ?? ''} ${i.uuid}`}
                      className="cursor-pointer"
                      onSelect={() => {
                        mapear.mutate(
                          { motoristaId, boltId: i.uuid },
                          { onSuccess: () => setAberto(false) }
                        );
                      }}
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{i.nome ?? '(sem nome)'}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {i.telefone ? `${i.telefone} · ` : ''}última semana {i.ultima}
                        </p>
                        <p className="truncate font-mono text-[10px] text-muted-foreground">
                          {i.uuid}
                        </p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {isLoading ? (
        <p className="mt-2 text-xs text-muted-foreground">A carregar…</p>
      ) : total === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Sem identidades ligadas — os ganhos da Bolt deste motorista não são reconhecidos. Usa
          "Sincronizar identidade".
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {ligadas.map((i) => (
            <li key={i.driver_uuid} className="flex items-center gap-2 text-xs">
              <Check className="h-3 w-3 shrink-0 text-green-600" />
              <span className="font-mono text-[10px] text-muted-foreground">{i.driver_uuid}</span>
              {i.driver_name && <span className="text-muted-foreground">· {i.driver_name}</span>}
              <span
                className={cn(
                  'ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px]',
                  i.auto_mapped
                    ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                    : 'bg-green-500/10 text-green-700 dark:text-green-400'
                )}
                title={
                  i.auto_mapped
                    ? 'Ligação derivada do histórico — por confirmar'
                    : 'Confirmada por uma pessoa'
                }
              >
                {i.auto_mapped ? 'do histórico' : 'confirmada'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
