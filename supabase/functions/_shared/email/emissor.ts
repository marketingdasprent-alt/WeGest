// supabase/functions/_shared/email/emissor.ts
// ============================================================
// Quem assina um email ao cliente: a EMPRESA EMISSORA do contrato, não a org.
// ============================================================
// Uma organização (ex.: Década Ousada) fatura através de várias empresas —
// Dasp Rent Sul, Distância Arrojada, Urbango… Cada contrato/reserva tem
// `emissor_id` → `clientes` (tipo_cliente='empresa', is_emissora), com nome
// comercial e logo próprios; é essa empresa que consta na fatura e nos
// documentos do contrato (ver contexto_folha_por_token).
//
// A 15/09/2026 o lembrete de cobrança em atraso de uma fatura da Dasp Rent Sul
// saiu com o nome e o logo da Década Ousada: `send-cobrancas-atrasadas` (e
// `send-contrato-criado-cliente`) iam buscar a marca a `organizacoes`,
// ignorando o contrato. Para o cliente, que só conhece a empresa com quem
// assinou, é um email de uma empresa que não é a dele.
//
// Esta função resolve a marca pela cadeia cobrança → contrato/reserva →
// emissora, e só cai para a org quando o contrato não tem emissora (6 dos
// ~720 contratos da Década a 16/09). Sem nada resolvível devolve undefined —
// o template `notificacaoTemplate` fica white-label WeGest, como já fazia.
//
// As cores do email NÃO vêm daqui: são da severidade da notificação (a barra
// vermelha de "Cobrança" é o `critico`), não da empresa.

export interface EmissorEmail {
  emissorNome?: string;
  emissorLogoUrl?: string | null;
}

export interface EmissorEmailArgs {
  orgId: string;
  /** Quando só se tem a cobrança: lê contrato_id/reserva_id dela. */
  cobrancaId?: string | null;
  contratoId?: string | null;
  reservaId?: string | null;
}

// Mesma convenção de EmailService/EmailProviderFactory: o cliente Supabase
// entra como `any`. Um tipo estrutural (from().select().eq().maybeSingle())
// rebenta o typechecker com o cliente real (TS2589, instanciação infinita).
// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

async function lerUm(
  supabase: SupabaseClient,
  tabela: string,
  cols: string,
  id: string
): Promise<Record<string, unknown> | null> {
  const { data } = await supabase.from(tabela).select(cols).eq("id", id).maybeSingle();
  return data ?? null;
}

export async function resolverEmissorDoEmail(
  supabase: SupabaseClient,
  args: EmissorEmailArgs
): Promise<EmissorEmail> {
  let contratoId = args.contratoId ?? null;
  let reservaId = args.reservaId ?? null;

  if (!contratoId && !reservaId && args.cobrancaId) {
    const cob = await lerUm(supabase, "contrato_cobrancas", "contrato_id, reserva_id", args.cobrancaId);
    contratoId = (cob?.contrato_id as string | null) ?? null;
    reservaId = (cob?.reserva_id as string | null) ?? null;
  }

  let emissorId: string | null = null;
  if (contratoId) {
    const ctr = await lerUm(supabase, "contratos_renting", "emissor_id", contratoId);
    emissorId = (ctr?.emissor_id as string | null) ?? null;
  } else if (reservaId) {
    const res = await lerUm(supabase, "reservas", "emissor_id", reservaId);
    emissorId = (res?.emissor_id as string | null) ?? null;
  }

  if (emissorId) {
    const emp = await lerUm(supabase, "clientes", "nome, nome_comercial, logo_url", emissorId);
    // Mesma preferência que contexto_folha_por_token: nome comercial, senão o fiscal.
    const nome =
      ((emp?.nome_comercial as string | null) ?? "").trim() ||
      ((emp?.nome as string | null) ?? "").trim();
    if (nome) {
      return { emissorNome: nome, emissorLogoUrl: (emp?.logo_url as string | null) ?? null };
    }
  }

  // Contrato sem emissora (ou cobrança avulsa sem contrato/reserva): a org.
  const org = await lerUm(supabase, "organizacoes", "nome, logo_url", args.orgId);
  return {
    emissorNome: (org?.nome as string | undefined) ?? undefined,
    emissorLogoUrl: org ? ((org.logo_url as string | null) ?? null) : undefined,
  };
}
