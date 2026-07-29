// Enriquecimento em lote dos itens da notification_queue com o que os
// templates HTML novos precisam e o payload do domain event não tem:
// nome do destinatário, branding da org (emissorNome/emissorLogoUrl) e o
// link de volta à app (ctaUrl). Uma única passagem por lote reclamado
// (até 20 itens) — nunca N+1 por item.

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export interface QueueItemEnrichment {
  destinatarioNome?: string;
  emissorNome?: string;
  emissorLogoUrl?: string | null;
  ctaUrl?: string;
  viaturaMarcaModelo?: string;
  motoristaNome?: string;
}

interface QueueItem {
  id: string;
  org_id: string;
  notification_id: string;
  template_codigo: string;
  payload_render: Record<string, unknown>;
}

export function buildCtaUrl(orgCodigo: string | null | undefined, link: string | null | undefined): string | undefined {
  if (!link) return undefined;
  const base = Deno.env.get('APP_URL') || (orgCodigo ? `https://${orgCodigo}.wegest.pt` : undefined);
  return base ? `${base}${link}` : undefined;
}

function unique<T>(values: (T | null | undefined)[]): T[] {
  return [...new Set(values.filter((v): v is T => v !== null && v !== undefined))];
}

export async function batchLoadEnrichment(
  items: QueueItem[],
  supabase: SupabaseClient
): Promise<Map<string, QueueItemEnrichment>> {
  const result = new Map<string, QueueItemEnrichment>();
  if (items.length === 0) return result;

  const notificationIds = unique(items.map((i) => i.notification_id));
  const orgIds = unique(items.map((i) => i.org_id));
  const motoristaIds = unique(
    items
      .filter((i) => i.template_codigo === 'motorista.reparacao_cobranca')
      .map((i) => i.payload_render?.motorista_id as string | undefined)
  );

  const [notificationsRes, orgsRes] = await Promise.all([
    notificationIds.length
      ? supabase.from('notifications').select('id, link, entity_table, entity_id, destinatario_user_id').in('id', notificationIds)
      : Promise.resolve({ data: [] }),
    orgIds.length
      ? supabase.from('organizacoes').select('id, nome, logo_url, codigo').in('id', orgIds)
      : Promise.resolve({ data: [] }),
  ]);

  interface NotifRow {
    id: string;
    link: string | null;
    entity_table: string | null;
    entity_id: string | null;
    destinatario_user_id: string | null;
  }
  interface OrgRow {
    id: string;
    nome: string;
    logo_url: string | null;
    codigo: string;
  }

  const notificationsById = new Map<string, NotifRow>((notificationsRes.data ?? []).map((n: NotifRow) => [n.id, n]));
  const orgsById = new Map<string, OrgRow>((orgsRes.data ?? []).map((o: OrgRow) => [o.id, o]));

  const userIds = unique([...notificationsById.values()].map((n) => n.destinatario_user_id));
  const viaturaIds = unique(
    [...notificationsById.values()].filter((n) => n.entity_table === 'viaturas').map((n) => n.entity_id)
  );

  const [profilesRes, motoristasRes, viaturasRes] = await Promise.all([
    userIds.length ? supabase.from('profiles').select('id, nome').in('id', userIds) : Promise.resolve({ data: [] }),
    motoristaIds.length
      ? supabase.from('motoristas_ativos').select('id, nome').in('id', motoristaIds)
      : Promise.resolve({ data: [] }),
    viaturaIds.length
      ? supabase.from('viaturas').select('id, marca, modelo').in('id', viaturaIds)
      : Promise.resolve({ data: [] }),
  ]);

  const nomeByUserId = new Map<string, string>(
    (profilesRes.data ?? []).map((p: { id: string; nome: string }) => [p.id, p.nome])
  );
  const nomeByMotoristaId = new Map<string, string>(
    (motoristasRes.data ?? []).map((m: { id: string; nome: string }) => [m.id, m.nome])
  );
  const viaturaById = new Map<string, { marca: string | null; modelo: string | null }>(
    (viaturasRes.data ?? []).map((v: { id: string; marca: string | null; modelo: string | null }) => [v.id, v])
  );

  for (const item of items) {
    const notif = notificationsById.get(item.notification_id);
    const org = orgsById.get(item.org_id);
    const motoristaId = item.payload_render?.motorista_id as string | undefined;
    const viatura =
      notif?.entity_table === 'viaturas' && notif.entity_id ? viaturaById.get(notif.entity_id) : undefined;

    result.set(item.id, {
      destinatarioNome: notif?.destinatario_user_id ? nomeByUserId.get(notif.destinatario_user_id) : undefined,
      emissorNome: org?.nome,
      emissorLogoUrl: org?.logo_url,
      ctaUrl: buildCtaUrl(org?.codigo, notif?.link),
      viaturaMarcaModelo: viatura ? [viatura.marca, viatura.modelo].filter(Boolean).join(' ') || undefined : undefined,
      motoristaNome: motoristaId ? nomeByMotoristaId.get(motoristaId) : undefined,
    });
  }

  return result;
}
