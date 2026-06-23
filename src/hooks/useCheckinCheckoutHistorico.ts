import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SessionMedia {
  id: string;
  url: string;
  created_at: string;
}

export interface CheckinCheckoutSession {
  key: string;
  contrato_renting_id: string | null;
  contrato_id: string | null;
  sistema: 'renting' | 'legacy';
  thumbnailPath: string;
  created_at: string;
  mediaCheckin: SessionMedia[];
  mediaCheckout: SessionMedia[];
  contrato: {
    id: string;
    codigo: number | null;
    reserva_id: string | null;
    data_inicio: string;
    data_fim: string | null;
    comentarios_entrega: string | null;
    comentarios_recolha: string | null;
    // Renting
    cliente: { id: string; nome: string; nif: string | null } | null;
    // Legacy — campos inline no contrato
    motorista_nome: string | null;
    motorista_nif: string | null;
    motorista_email: string | null;
    motorista_telefone: string | null;
    motorista_morada: string | null;
    km_checkin: number | null;
    km_checkout: number | null;
    combustivel_checkin: string | null;
    combustivel_checkout: string | null;
    // Legacy — do perfil do motorista
    motorista_iban: string | null;
    motorista_cidade: string | null;
    motorista_cartao_frota: string | null;
    motorista_caucao: number | null;
    // Viatura
    viatura: {
      id: string;
      matricula: string;
      marca: string;
      modelo: string;
      valor_mensal: number | null;
      limite_kms: number | null;
    } | null;
  } | null;
}

function groupRenting(rows: any[]): CheckinCheckoutSession[] {
  const map = new Map<string, CheckinCheckoutSession>();
  for (const row of rows) {
    const cr = row.contratos_renting;
    if (cr?.deleted_at) continue;

    const key = `renting_${row.contrato_renting_id}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        contrato_renting_id: row.contrato_renting_id,
        contrato_id: null,
        sistema: 'renting',
        thumbnailPath: row.url,
        created_at: row.created_at,
        mediaCheckin: [],
        mediaCheckout: [],
        contrato: cr
          ? {
              id: cr.id,
              codigo: cr.codigo,
              reserva_id: cr.reserva_id ?? null,
              data_inicio: cr.data_inicio,
              data_fim: cr.data_fim ?? null,
              comentarios_entrega: cr.comentarios_entrega ?? null,
              comentarios_recolha: cr.comentarios_recolha ?? null,
              cliente: cr.clientes
                ? { id: cr.clientes.id, nome: cr.clientes.nome, nif: cr.clientes.nif ?? null }
                : null,
              motorista_nome: null,
              motorista_nif: null,
              motorista_email: null,
              motorista_telefone: null,
              motorista_morada: null,
              km_checkin: null,
              km_checkout: null,
              combustivel_checkin: null,
              combustivel_checkout: null,
              motorista_iban: null,
              motorista_cidade: null,
              motorista_cartao_frota: null,
              motorista_caucao: null,
              viatura: cr.viaturas
                ? {
                    id: cr.viaturas.id,
                    matricula: cr.viaturas.matricula,
                    marca: cr.viaturas.marca,
                    modelo: cr.viaturas.modelo,
                    valor_mensal: null,
                    limite_kms: null,
                  }
                : null,
            }
          : null,
      });
    }
    const s = map.get(key)!;
    const media: SessionMedia = { id: row.id, url: row.url, created_at: row.created_at };
    if (row.tipo === 'checkin') s.mediaCheckin.push(media);
    else s.mediaCheckout.push(media);
    // thumbnail = foto mais recente (rows já vêm por created_at desc)
    if (row.created_at > s.created_at) {
      s.created_at = row.created_at;
      s.thumbnailPath = row.url;
    }
  }
  return Array.from(map.values());
}

function groupLegacy(rows: any[]): CheckinCheckoutSession[] {
  const map = new Map<string, CheckinCheckoutSession>();
  for (const row of rows) {
    const c = row.contratos;
    // Agrupar por motorista + viatura: mesmo condutor na mesma viatura = 1 sessão
    const motoristaKey = c?.motorista_id ?? c?.motorista_nome ?? row.contrato_id;
    const viaturaKey = c?.viatura_id ?? row.contrato_id;
    const key = `legacy_${motoristaKey}_${viaturaKey}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        contrato_renting_id: null,
        contrato_id: row.contrato_id,
        sistema: 'legacy',
        thumbnailPath: row.url,
        created_at: row.created_at,
        mediaCheckin: [],
        mediaCheckout: [],
        contrato: c
          ? {
              id: c.id,
              codigo: c.numero_contrato ?? null,
              reserva_id: null,
              data_inicio: c.data_inicio,
              data_fim: null,
              comentarios_entrega: null,
              comentarios_recolha: null,
              cliente: null,
              motorista_nome: c.motorista_nome ?? null,
              motorista_nif: c.motorista_nif ?? null,
              motorista_email: c.motorista_email ?? null,
              motorista_telefone: c.motorista_telefone ?? null,
              motorista_morada: c.motorista_morada ?? null,
              km_checkin: c.km_checkin ?? null,
              km_checkout: c.km_checkout ?? null,
              combustivel_checkin: c.combustivel_checkin ?? null,
              combustivel_checkout: c.combustivel_checkout ?? null,
              motorista_iban: c.motoristas_ativos?.iban ?? null,
              motorista_cidade: c.motoristas_ativos?.cidade ?? null,
              motorista_cartao_frota: c.motoristas_ativos?.cartao_frota ?? null,
              motorista_caucao: null,
              viatura: c.viaturas
                ? {
                    id: c.viaturas.id,
                    matricula: c.viaturas.matricula,
                    marca: c.viaturas.marca,
                    modelo: c.viaturas.modelo,
                    valor_mensal: c.viaturas.valor_mensal ?? null,
                    limite_kms: c.viaturas.limite_kms ?? null,
                  }
                : null,
            }
          : null,
      });
    }
    const s = map.get(key)!;
    const media: SessionMedia = { id: row.id, url: row.url, created_at: row.created_at };
    if (row.tipo === 'checkin') s.mediaCheckin.push(media);
    else s.mediaCheckout.push(media);
    if (row.created_at > s.created_at) {
      s.created_at = row.created_at;
      s.thumbnailPath = row.url;
    }
  }
  return Array.from(map.values());
}

export function useCheckinCheckoutHistorico(enabled: boolean) {
  return useQuery({
    queryKey: ['dashboard', 'checkin-checkout-historico'],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<CheckinCheckoutSession[]> => {
      const [rentingRes, legacyRes] = await Promise.all([
        supabase
          .from('contrato_media')
          .select(
            `id, contrato_renting_id, tipo, url, created_at,
            contratos_renting:contrato_renting_id (
              id, codigo, deleted_at, reserva_id,
              data_inicio, data_fim,
              comentarios_entrega, comentarios_recolha,
              clientes:cliente_id ( id, nome, nif ),
              viaturas:viatura_id ( id, matricula, marca, modelo )
            )`
          )
          .not('contrato_renting_id', 'is', null)
          .in('tipo', ['checkin', 'checkout'])
          .order('created_at', { ascending: false })
          .limit(200),

        supabase
          .from('contrato_media')
          .select(
            `id, contrato_id, tipo, url, created_at,
            contratos:contrato_id (
              id, numero_contrato, data_inicio, motorista_id, viatura_id,
              motorista_nome, motorista_nif, motorista_email, motorista_telefone, motorista_morada,
              km_checkin, km_checkout,
              combustivel_checkin, combustivel_checkout,
              motoristas_ativos:motorista_id ( id, iban, cidade, cartao_frota ),
              viaturas:viatura_id ( id, matricula, marca, modelo, valor_mensal, limite_kms )
            )`
          )
          .not('contrato_id', 'is', null)
          .is('contrato_renting_id', null)
          .in('tipo', ['checkin', 'checkout'])
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      if (rentingRes.error) throw rentingRes.error;
      if (legacyRes.error) throw legacyRes.error;

      const combined = [
        ...groupRenting(rentingRes.data ?? []),
        ...groupLegacy(legacyRes.data ?? []),
      ];

      combined.sort((a, b) => b.created_at.localeCompare(a.created_at));
      return combined;
    },
  });
}
