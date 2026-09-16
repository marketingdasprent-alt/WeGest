import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

function normalizeStr(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const PARTICLES = ['de', 'da', 'do', 'das', 'dos', 'e'];

export async function idsJaLigados(
  tabela: 'uber_transactions' | 'bolt_resumos_semanais',
  coluna: 'uber_driver_id' | 'identificador_motorista',
  candidatos: string[]
): Promise<Set<string>> {
  const ligados = new Set<string>();
  const PAGINA = 1000;
  for (let i = 0; i < candidatos.length; i += 50) {
    const lote = candidatos.slice(i, i + 50);
    for (let from = 0; ; from += PAGINA) {
      const { data, error } = await (supabase as any)
        .from(tabela)
        .select(coluna)
        .in(coluna, lote)
        .not('motorista_id', 'is', null)
        .range(from, from + PAGINA - 1);
      if (error) throw error;
      const linhas = (data ?? []) as Record<string, string>[];
      linhas.forEach((r) => ligados.add(r[coluna]));
      if (linhas.length < PAGINA) break;
    }
  }
  return ligados;
}

export function useMotoristasPlataformaNaoAssociadosCount() {
  return useQuery({
    queryKey: ['motoristas-plataforma-nao-associados-count'],
    queryFn: async () => {
      const desde = new Date();
      desde.setDate(desde.getDate() - 56);
      const desdeDate = desde.toISOString().slice(0, 10);

      const { data: crm } = await supabase.from('motoristas_ativos').select('uber_uuid, bolt_id');
      const uberLigados = new Set<string>(
        (crm || []).map((m: any) => m.uber_uuid).filter((x: any) => !!x)
      );
      const boltLigados = new Set<string>(
        (crm || []).map((m: any) => m.bolt_id).filter((x: any) => !!x)
      );

      const [uberDrv, boltRows] = await Promise.all([
        // A conta de frota recebe transferências; não representa um motorista.
        supabase
          .from('uber_drivers')
          .select('uber_driver_id, full_name')
          .is('motorista_id', null)
          .eq('is_conta_frota', false),
        supabase
          .from('bolt_resumos_semanais')
          .select('identificador_motorista, motorista_nome')
          .is('motorista_id', null)
          .gte('periodo_inicio', desdeDate)
          .not('identificador_motorista', 'is', null),
      ]);

      const candidatosUber = [
        ...new Set((uberDrv.data || []).map((d: any) => d.uber_driver_id).filter(Boolean)),
      ] as string[];
      const candidatosBolt = [
        ...new Set(
          (boltRows.data || []).map((r: any) => r.identificador_motorista).filter(Boolean)
        ),
      ] as string[];
      const [uberLigDb, boltLigDb] = await Promise.all([
        idsJaLigados('uber_transactions', 'uber_driver_id', candidatosUber),
        idsJaLigados('bolt_resumos_semanais', 'identificador_motorista', candidatosBolt),
      ]);
      uberLigDb.forEach((id) => uberLigados.add(id));
      boltLigDb.forEach((id) => boltLigados.add(id));

      const nomes = new Set<string>();
      (uberDrv.data || []).forEach((d: any) => {
        if (d.uber_driver_id && !uberLigados.has(d.uber_driver_id)) {
          nomes.add(normalizeStr(d.full_name) || d.uber_driver_id);
        }
      });
      (boltRows.data || []).forEach((r: any) => {
        if (r.identificador_motorista && !boltLigados.has(r.identificador_motorista)) {
          nomes.add(normalizeStr(r.motorista_nome) || r.identificador_motorista);
        }
      });
      return nomes.size;
    },
  });
}

export function useUnmappedBoltDrivers(enabled: boolean) {
  return useQuery({
    queryKey: ['unmapped-bolt-drivers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bolt_resumos_semanais')
        .select('motorista_nome, identificador_motorista')
        .is('motorista_id', null)
        .not('identificador_motorista', 'is', null);

      if (error) throw error;

      const unique = (data || []).reduce((acc: { name: string; id: string }[], current) => {
        const id = current.identificador_motorista;
        if (id && !acc.find((i) => i.id === id)) {
          acc.push({ name: current.motorista_nome ?? '', id });
        }
        return acc;
      }, []);
      return unique;
    },
    enabled,
  });
}

export function useMapearMotoristaBolt() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ motoristaId, boltId }: { motoristaId: string; boltId: string }) => {
      const { data: ctx } = await supabase
        .from('bolt_resumos_semanais')
        .select('org_id, integracao_id, motorista_nome, telefone')
        .eq('identificador_motorista', boltId)
        .order('periodo_inicio', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: mot } = await supabase
        .from('motoristas_ativos')
        .select('org_id')
        .eq('id', motoristaId)
        .maybeSingle();

      const { error: erroMapa } = await (supabase as any).from('bolt_mapeamento_motoristas').upsert(
        {
          driver_uuid: boltId,
          motorista_id: motoristaId,
          org_id: (ctx as any)?.org_id ?? (mot as any)?.org_id ?? null,
          integracao_id: (ctx as any)?.integracao_id ?? null,
          driver_name: (ctx as any)?.motorista_nome ?? null,
          driver_phone: (ctx as any)?.telefone ?? null,
          auto_mapped: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'driver_uuid' }
      );
      if (erroMapa) throw erroMapa;

      const { error: erroResumos } = await supabase
        .from('bolt_resumos_semanais')
        .update({ motorista_id: motoristaId })
        .eq('identificador_motorista', boltId);
      if (erroResumos) throw erroResumos;

      // A tabela de mapeamento é a fonte de verdade; esta cópia é compatibilidade.
      const { error: erroFicha } = await supabase
        .from('motoristas_ativos')
        .update({ bolt_id: boltId })
        .eq('id', motoristaId);
      if (erroFicha) {
        console.warn(
          '[useMapearMotoristaBolt] bolt_id da ficha não actualizado:',
          erroFicha.message
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['motoristas'] });
      qc.invalidateQueries({ queryKey: ['motoristas-plataforma-nao-associados-count'] });
      qc.invalidateQueries({ queryKey: ['bolt-mapeamento'] });
      toast({
        title: 'Motorista ligado',
        description:
          'A ligação vale para sempre, mesmo que a Bolt mude o ID. O histórico deste ID foi reatribuído.',
      });
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : 'Erro inesperado';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    },
  });
}

export function useIdentidadesPlataforma(motoristaId: string | null) {
  return useQuery({
    queryKey: ['bolt-mapeamento', motoristaId],
    enabled: !!motoristaId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('bolt_mapeamento_motoristas')
        .select('driver_uuid, driver_name, auto_mapped, integracao_id, created_at')
        .eq('motorista_id', motoristaId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{
        driver_uuid: string;
        driver_name: string | null;
        auto_mapped: boolean;
        integracao_id: string | null;
        created_at: string;
      }>;
    },
  });
}

export function useSincronizarMotoristasPlataformaIds() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      // O emparelhamento inclui org_id: a mesma pessoa pode ter fichas independentes.
      const { data: currentMotoristas, error: motError } = await supabase
        .from('motoristas_ativos')
        .select('id, nome, email, telefone, bolt_id, uber_uuid, org_id');
      if (motError) throw motError;

      const { data: resumos, error: resError } = await supabase
        .from('bolt_resumos_semanais')
        .select('motorista_nome, identificador_motorista, telefone, email, motorista_id, org_id')
        .not('identificador_motorista', 'is', null);
      if (resError) throw resError;

      const { data: uberDrivers, error: uberError } = await supabase
        .from('uber_drivers')
        .select('full_name, uber_driver_id, motorista_id, org_id')
        .not('uber_driver_id', 'is', null)
        // A conta de frota não pode participar no cruzamento por nome.
        .eq('is_conta_frota', false);
      if (uberError) throw uberError;

      let totalMapped = 0;
      const updates: PromiseLike<any>[] = [];

      for (const m of currentMotoristas || []) {
        if (m.bolt_id && m.uber_uuid) continue;

        const mClean = normalizeStr(m.nome);
        const mWords = mClean.split(' ').filter((w) => w.length > 2 && !PARTICLES.includes(w));
        const mPhone = m.telefone ? m.telefone.replace(/\D/g, '').slice(-9) : null;
        const mEmail = m.email?.toLowerCase().trim();

        const updatedData: any = {};
        let needsUpdate = false;

        if (!m.bolt_id || !m.email || !m.telefone) {
          const match = (resumos || []).find((r) => {
            if (!r.org_id || !m.org_id || r.org_id !== m.org_id) return false;

            const rClean = normalizeStr(r.motorista_nome || '');
            const rWords = rClean.split(' ').filter((w) => w.length > 2 && !PARTICLES.includes(w));
            const rPhone = r.telefone ? r.telefone.replace(/\D/g, '').slice(-9) : null;
            const rEmail = r.email?.toLowerCase().trim();

            if (mEmail && rEmail && mEmail === rEmail) return true;
            if (mPhone && rPhone && mPhone === rPhone) return true;

            if (rClean === mClean) return true;
            if (mWords.length >= 2 && rWords.length >= 2) {
              const mFirstLast = `${mWords[0]} ${mWords[mWords.length - 1]}`;
              const rFirstLast = `${rWords[0]} ${rWords[rWords.length - 1]}`;
              if (mFirstLast === rFirstLast) return true;

              const intersection = mWords.filter((w) => rWords.includes(w));
              const score = intersection.length / Math.min(mWords.length, rWords.length);
              if (score >= 0.8) return true;
            }

            return false;
          });

          if (match) {
            if (!m.bolt_id) {
              updatedData.bolt_id = match.identificador_motorista;
              needsUpdate = true;
            }
            if (!m.email && match.email) {
              updatedData.email = match.email.toLowerCase().trim();
              needsUpdate = true;
            }
            if (!m.telefone && match.telefone) {
              updatedData.telefone = match.telefone.trim();
              needsUpdate = true;
            }
          }
        }

        if (!m.uber_uuid) {
          const matchUber = (uberDrivers || []).find((u) => {
            if (!u.org_id || !m.org_id || u.org_id !== m.org_id) return false;

            const uClean = normalizeStr(u.full_name || '');
            const uWords = uClean.split(' ').filter((w) => w.length > 2 && !PARTICLES.includes(w));

            if (uClean === mClean) return true;

            if (mWords.length >= 2 && uWords.length >= 2) {
              const intersection = mWords.filter((w) => uWords.includes(w));
              const score = intersection.length / Math.min(mWords.length, uWords.length);
              if (score >= 0.8) return true;
            }
            return false;
          });

          if (matchUber) {
            updatedData.uber_uuid = matchUber.uber_driver_id;
            needsUpdate = true;
          }
        }

        if (needsUpdate) {
          updates.push(supabase.from('motoristas_ativos').update(updatedData).eq('id', m.id));
          totalMapped++;
        }
      }

      if (updates.length > 0) {
        for (let i = 0; i < updates.length; i += 10) {
          await Promise.all(updates.slice(i, i + 10));
        }
      }

      return totalMapped;
    },
    onSuccess: (totalMapped) => {
      qc.invalidateQueries({ queryKey: ['motoristas'] });
      qc.invalidateQueries({ queryKey: ['motoristas-plataforma-nao-associados-count'] });
      toast({
        title: 'Sincronização concluída',
        description: `${totalMapped} motoristas mapeados com sucesso!`,
      });
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : 'Erro inesperado';
      toast({
        title: 'Erro na sincronização',
        description: msg,
        variant: 'destructive',
      });
    },
  });
}

export function useIdentidadesBoltPorLigar() {
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
