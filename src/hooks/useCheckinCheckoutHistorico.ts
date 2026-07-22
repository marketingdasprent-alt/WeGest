import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Uma foto de check-in/check-out. As fotos vivem nos DANOS da viatura
 * (viatura_dano_fotos) e podem estar em buckets diferentes conforme a origem
 * (fotos do momento no `viatura-danos` com path nu; danos manuais no
 * `viatura-documentos` com URL http). Por isso guardamos o bucket + path e
 * assinamos a URL na hora de mostrar.
 */
export interface SessionMedia {
  id: string;
  bucket: string;
  path: string;
  /** true → `path` já é uma URL utilizável (não precisa de assinar). */
  directUrl: boolean;
  created_at: string;
}

export interface CheckinCheckoutSession {
  key: string;
  contrato_renting_id: string | null;
  contrato_id: string | null;
  sistema: 'renting' | 'legacy';
  thumbnail: SessionMedia | null;
  created_at: string;
  /** Momento da recolha/devolução (check-in) realizada — do evento. */
  checkinAt: string | null;
  /** Momento da entrega (check-out) realizada — do evento. */
  checkoutAt: string | null;
  /** Todas as fotos de danos do contrato (galeria única). */
  fotos: SessionMedia[];
  contrato: {
    id: string;
    codigo: number | null;
    reserva_id: string | null;
    data_inicio: string;
    data_fim: string | null;
    comentarios_entrega: string | null;
    comentarios_recolha: string | null;
    cliente: { id: string; nome: string; nif: string | null } | null;
    motorista_nome: string | null;
    motorista_nif: string | null;
    motorista_email: string | null;
    motorista_telefone: string | null;
    motorista_morada: string | null;
    km_checkin: number | null;
    km_checkout: number | null;
    combustivel_checkin: string | null;
    combustivel_checkout: string | null;
    motorista_iban: string | null;
    motorista_cidade: string | null;
    motorista_cartao_frota: string | null;
    motorista_caucao: number | null;
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

// ── Resolução de bucket/path das fotos (espelha fetchAnexoDanos) ──────────────

function extractPath(urlOrPath: string): string {
  if (!urlOrPath.startsWith('http')) return urlOrPath;
  const m = urlOrPath.match(
    /\/storage\/v1\/object\/(?:public|sign)\/(?:viatura-documentos|assistencia-anexos|viatura-danos)\/([^?]+)/
  );
  return m ? decodeURIComponent(m[1]) : urlOrPath;
}

function detectBucket(urlOrPath: string): string {
  if (urlOrPath.startsWith('assistencia/') || urlOrPath.includes('assistencia-anexos'))
    return 'assistencia-anexos';
  if (urlOrPath.includes('viatura-danos')) return 'viatura-danos';
  if (!urlOrPath.startsWith('http')) return 'viatura-danos';
  return 'viatura-documentos';
}

function resolveFoto(id: string, ficheiro_url: string, created_at: string): SessionMedia {
  const path = extractPath(ficheiro_url);
  // Se não conseguimos extrair um path (continua http), usa-se a URL directa.
  if (path.startsWith('http')) {
    return { id, bucket: '', path: ficheiro_url, directUrl: true, created_at };
  }
  return { id, bucket: detectBucket(ficheiro_url), path, directUrl: false, created_at };
}

/** Resolve (e assina, se preciso) a URL de uma foto no seu bucket. Partilhado
 *  pelo card e pelo modal de detalhe. `expiresIn` em segundos. */
export function useMediaSignedUrl(media: SessionMedia | null, expiresIn = 60 * 10) {
  const [src, setSrc] = useState<string | null>(media?.directUrl ? (media?.path ?? null) : null);

  useEffect(() => {
    if (!media) {
      setSrc(null);
      return;
    }
    if (media.directUrl) {
      setSrc(media.path);
      return;
    }
    let cancelled = false;
    supabase.storage
      .from(media.bucket)
      .createSignedUrl(media.path, expiresIn)
      .then(({ data }) => {
        if (!cancelled && data?.signedUrl) setSrc(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [media, expiresIn]);

  return src;
}

// ── Mapeamento dos contratos ──────────────────────────────────────────────────

function mapContratoRenting(cr: any): CheckinCheckoutSession['contrato'] {
  return {
    id: cr.id,
    codigo: cr.codigo ?? null,
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
    km_checkout: cr.km_saida ?? null,
    km_checkin: cr.km_entrada ?? null,
    combustivel_checkout: cr.combustivel_saida ?? null,
    combustivel_checkin: cr.combustivel_entrada ?? null,
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
  };
}

function mapContratoLegacy(c: any): CheckinCheckoutSession['contrato'] {
  return {
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
  };
}

const EVENTO_CHECKOUT = new Set(['entrega']);
const EVENTO_CHECKIN = new Set(['recolha', 'devolucao', 'troca']);

interface ContratoFotos {
  rentingId: string | null;
  legacyId: string | null;
  fotos: SessionMedia[];
}

/**
 * Histórico de check-in/check-out do dashboard: um contrato por cada conjunto
 * de FOTOS de danos (a verdadeira fonte das fotos de check-in/out). Só aparecem
 * contratos que TÊM fotos associadas. As fotos vão numa galeria única; os
 * badges check-in/check-out vêm dos eventos realizados quando existem.
 */
export function useCheckinCheckoutHistorico(enabled: boolean) {
  return useQuery({
    queryKey: ['dashboard', 'checkin-checkout-historico'],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<CheckinCheckoutSession[]> => {
      // 1) Danos ligados a um contrato (renting ou legado).
      const { data: danos, error: danosErr } = await supabase
        .from('viatura_danos')
        .select('id, contrato_renting_id, contrato_id')
        .or('contrato_renting_id.not.is.null,contrato_id.not.is.null')
        .order('created_at', { ascending: false })
        .limit(1000);
      if (danosErr) throw danosErr;

      const danoInfo = new Map<string, { rentingId: string | null; legacyId: string | null }>();
      for (const d of danos ?? []) {
        danoInfo.set(d.id, {
          rentingId: (d.contrato_renting_id as string | null) ?? null,
          legacyId: (d.contrato_id as string | null) ?? null,
        });
      }
      const danoIds = [...danoInfo.keys()];
      if (danoIds.length === 0) return [];

      // 2) Fotos desses danos.
      const { data: fotos, error: fotosErr } = await supabase
        .from('viatura_dano_fotos')
        .select('id, dano_id, ficheiro_url, created_at')
        .in('dano_id', danoIds)
        .order('created_at', { ascending: false })
        .limit(2000);
      if (fotosErr) throw fotosErr;

      // 3) Agrupar fotos por contrato (renting tem prioridade sobre legado).
      const byContract = new Map<string, ContratoFotos>();
      for (const f of fotos ?? []) {
        if (!f.ficheiro_url) continue;
        const info = danoInfo.get(f.dano_id as string);
        if (!info) continue;
        const rentingId = info.rentingId;
        const legacyId = rentingId ? null : info.legacyId;
        if (!rentingId && !legacyId) continue;
        const key = rentingId ? `renting_${rentingId}` : `legacy_${legacyId}`;
        const agg = byContract.get(key) ?? { rentingId, legacyId, fotos: [] };
        agg.fotos.push(
          resolveFoto(f.id as string, f.ficheiro_url as string, f.created_at as string)
        );
        byContract.set(key, agg);
      }
      if (byContract.size === 0) return [];

      const rentingIds = [
        ...new Set(
          [...byContract.values()].map((c) => c.rentingId).filter((id): id is string => !!id)
        ),
      ];
      const legacyIds = [
        ...new Set(
          [...byContract.values()].map((c) => c.legacyId).filter((id): id is string => !!id)
        ),
      ];

      // 4) Detalhes dos contratos + eventos (badges) em paralelo.
      const [rentingRes, legacyRes, eventosRes] = await Promise.all([
        rentingIds.length
          ? supabase
              .from('contratos_renting')
              .select(
                `id, codigo, deleted_at, reserva_id, data_inicio, data_fim,
                comentarios_entrega, comentarios_recolha,
                km_saida, km_entrada, combustivel_saida, combustivel_entrada,
                clientes:cliente_id ( id, nome, nif ),
                viaturas:viatura_id ( id, matricula, marca, modelo )`
              )
              .in('id', rentingIds)
          : Promise.resolve({ data: [], error: null } as const),
        legacyIds.length
          ? supabase
              .from('contratos')
              .select(
                `id, numero_contrato, data_inicio,
                motorista_nome, motorista_nif, motorista_email, motorista_telefone, motorista_morada,
                km_checkin, km_checkout, combustivel_checkin, combustivel_checkout,
                motoristas_ativos:motorista_id ( id, iban, cidade, cartao_frota ),
                viaturas:viatura_id ( id, matricula, marca, modelo, valor_mensal, limite_kms )`
              )
              .in('id', legacyIds)
          : Promise.resolve({ data: [], error: null } as const),
        rentingIds.length
          ? supabase
              .from('calendario_eventos')
              .select('origem_id, tipo, realizado_em')
              .eq('origem_tipo', 'contrato_renting')
              .in('origem_id', rentingIds)
              .in('tipo', ['entrega', 'recolha', 'devolucao', 'troca'])
              .not('realizado_em', 'is', null)
          : Promise.resolve({ data: [], error: null } as const),
      ]);

      if (rentingRes.error) throw rentingRes.error;
      if (legacyRes.error) throw legacyRes.error;
      if (eventosRes.error) throw eventosRes.error;

      const rentingById = new Map<string, any>((rentingRes.data ?? []).map((c: any) => [c.id, c]));
      const legacyById = new Map<string, any>((legacyRes.data ?? []).map((c: any) => [c.id, c]));

      // Momentos realizados por contrato (para os badges).
      const momentos = new Map<string, { checkinAt: string | null; checkoutAt: string | null }>();
      for (const ev of eventosRes.data ?? []) {
        const id = ev.origem_id as string | null;
        if (!id || !ev.realizado_em) continue;
        const cur = momentos.get(id) ?? { checkinAt: null, checkoutAt: null };
        if (EVENTO_CHECKOUT.has(ev.tipo)) {
          if (!cur.checkoutAt || ev.realizado_em > cur.checkoutAt) cur.checkoutAt = ev.realizado_em;
        } else if (EVENTO_CHECKIN.has(ev.tipo)) {
          if (!cur.checkinAt || ev.realizado_em > cur.checkinAt) cur.checkinAt = ev.realizado_em;
        }
        momentos.set(id, cur);
      }

      // 5) Construir as sessões.
      const sessions: CheckinCheckoutSession[] = [];
      for (const [key, agg] of byContract) {
        const isRenting = !!agg.rentingId;
        const cr = isRenting ? rentingById.get(agg.rentingId as string) : null;
        const cl = !isRenting ? legacyById.get(agg.legacyId as string) : null;
        // Renting eliminado ou contrato inexistente → não mostrar.
        if (isRenting && (!cr || cr.deleted_at)) continue;
        if (!isRenting && !cl) continue;

        agg.fotos.sort((a, b) => b.created_at.localeCompare(a.created_at));
        const thumbnail = agg.fotos[0] ?? null;
        const mom = (isRenting && momentos.get(agg.rentingId as string)) || {
          checkinAt: null,
          checkoutAt: null,
        };
        const createdAt = thumbnail?.created_at ?? cr?.data_inicio ?? cl?.data_inicio ?? '';

        sessions.push({
          key,
          contrato_renting_id: agg.rentingId,
          contrato_id: agg.legacyId,
          sistema: isRenting ? 'renting' : 'legacy',
          thumbnail,
          created_at: createdAt,
          checkinAt: mom.checkinAt,
          checkoutAt: mom.checkoutAt,
          fotos: agg.fotos,
          contrato: isRenting ? mapContratoRenting(cr) : mapContratoLegacy(cl),
        });
      }

      sessions.sort((a, b) => b.created_at.localeCompare(a.created_at));
      return sessions;
    },
  });
}
