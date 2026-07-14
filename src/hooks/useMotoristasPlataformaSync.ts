import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

function normalizeStr(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // Remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ') // Remove pontuação
    .trim()
    .replace(/\s+/g, ' '); // Normaliza espaços
}

const PARTICLES = ['de', 'da', 'do', 'das', 'dos', 'e'];

/** Pessoas distintas na Uber/Bolt (últimas 8 semanas) sem ficha de motorista. */
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

      const [uberDrv, boltRows, uberLigDb, boltLigDb] = await Promise.all([
        supabase.from('uber_drivers').select('uber_driver_id, full_name').is('motorista_id', null),
        supabase
          .from('bolt_resumos_semanais')
          .select('identificador_motorista, motorista_nome')
          .is('motorista_id', null)
          .gte('periodo_inicio', desdeDate)
          .not('identificador_motorista', 'is', null),
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
      (uberLigDb.data || []).forEach((r: any) => uberLigados.add(r.uber_driver_id));
      (boltLigDb.data || []).forEach((r: any) => boltLigados.add(r.identificador_motorista));

      // Contar PESSOAS (nome normalizado distinto), não registos.
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

/** Nomes únicos da Bolt ainda sem motorista_id mapeado — usado no dialog de mapeamento manual. */
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

/** Confirma o mapeamento manual de um motorista a um identificador Bolt. */
export function useMapearMotoristaBolt() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ motoristaId, boltId }: { motoristaId: string; boltId: string }) => {
      const { error } = await supabase
        .from('motoristas_ativos')
        .update({ bolt_id: boltId })
        .eq('id', motoristaId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['motoristas'] });
      toast({ title: 'Sucesso', description: 'Motorista mapeado com sucesso!' });
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : 'Erro inesperado';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    },
  });
}

/** Sincronização em massa: cruza motoristas locais com Uber/Bolt por nome/telefone/email. */
export function useSincronizarMotoristasPlataformaIds() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      // 1. Buscar todos os motoristas
      const { data: currentMotoristas, error: motError } = await supabase
        .from('motoristas_ativos')
        .select('id, nome, email, telefone, bolt_id, uber_uuid');
      if (motError) throw motError;

      // 2. Buscar resumos Bolt com IDs
      const { data: resumos, error: resError } = await supabase
        .from('bolt_resumos_semanais')
        .select('motorista_nome, identificador_motorista, telefone, email, motorista_id')
        .not('identificador_motorista', 'is', null);
      if (resError) throw resError;

      // 3. Buscar Uber Drivers mapeados
      const { data: uberDrivers, error: uberError } = await supabase
        .from('uber_drivers')
        .select('full_name, uber_driver_id, motorista_id')
        .not('uber_driver_id', 'is', null);
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

        // Tentar encontrar na Bolt
        if (!m.bolt_id || !m.email || !m.telefone) {
          const match = (resumos || []).find((r) => {
            const rClean = normalizeStr(r.motorista_nome || '');
            const rWords = rClean.split(' ').filter((w) => w.length > 2 && !PARTICLES.includes(w));
            const rPhone = r.telefone ? r.telefone.replace(/\D/g, '').slice(-9) : null;
            const rEmail = r.email?.toLowerCase().trim();

            // Prioridade 1: Match por Telefone ou Email (Confiança Total)
            if (mEmail && rEmail && mEmail === rEmail) return true;
            if (mPhone && rPhone && mPhone === rPhone) return true;

            // Prioridade 2: Match por Nome
            if (rClean === mClean) return true;
            if (mWords.length >= 2 && rWords.length >= 2) {
              const mFirstLast = `${mWords[0]} ${mWords[mWords.length - 1]}`;
              const rFirstLast = `${rWords[0]} ${rWords[rWords.length - 1]}`;
              if (mFirstLast === rFirstLast) return true;

              const intersection = mWords.filter((w) => rWords.includes(w));
              const score = intersection.length / Math.min(mWords.length, rWords.length);
              if (score >= 0.8) return true; // Confiança alta para enriquecer dados
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

        // Tentar encontrar na Uber
        if (!m.uber_uuid) {
          const matchUber = (uberDrivers || []).find((u) => {
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
        // Executar em grupos de 10 para evitar timeouts
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
