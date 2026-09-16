/** Regras de assinatura vivem fora das Edge Functions para cobertura Vitest. */

export type PapelSignatario = 'cliente' | 'condutor' | 'motorista';

export interface Signatario {
  papel: PapelSignatario;
  nome: string;
  email: string | null;
  clienteId?: string | null;
  motoristaId?: string | null;
}

export type ValidacaoSignatarios =
  | { ok: true; signatarios: Array<Signatario & { email: string }> }
  | { ok: false; semEmail: string[] };

/** Falhas de email são bloqueantes para evitar envios parcialmente omitidos. */
export function validarSignatarios(lista: Signatario[]): ValidacaoSignatarios {
  const temEmail = (s: Signatario) => typeof s.email === 'string' && s.email.trim() !== '';

  const semEmail = lista.filter((s) => !temEmail(s)).map((s) => s.nome);
  if (semEmail.length > 0 || lista.length === 0) return { ok: false, semEmail };

  return {
    ok: true,
    signatarios: lista.map((s) => ({ ...s, email: (s.email as string).trim() })),
  };
}

/** Identifica repetidos por ficha ou email, nunca pelo nome, para evitar homónimos. */
export function agruparPorPessoa(lista: Signatario[]): string[] {
  const vistos = new Map<string, { nome: string; vezes: number }>();

  for (const s of lista) {
    const chave = s.clienteId ?? s.motoristaId ?? (s.email ?? '').trim().toLowerCase();
    if (!chave) continue;

    const anterior = vistos.get(chave);
    if (anterior) anterior.vezes += 1;
    else vistos.set(chave, { nome: s.nome, vezes: 1 });
  }

  return [...vistos.values()].filter((p) => p.vezes > 1).map((p) => p.nome);
}

export type EstadoToken = 'valido' | 'assinado';

/** O token não expira, mas fica inutilizável depois de assinado. */
export function estadoDoToken(pedido: { assinado_em: string | null }): EstadoToken {
  return pedido.assinado_em ? 'assinado' : 'valido';
}

export interface CondutorDoContrato {
  cliente_id?: string | null;
  motorista_id?: string | null;
}

interface FichaComEmail {
  id: string;
  nome?: string | null;
  email?: string | null;
}

/** Clientes precedem motoristas para manter a lista de candidatos estável. */
export function candidatosDoContrato(dados: {
  condutores: CondutorDoContrato[];
  clientes: FichaComEmail[];
  motoristas: FichaComEmail[];
}): Signatario[] {
  const { condutores, clientes, motoristas } = dados;
  const porIdCliente = new Map(clientes.map((c) => [c.id, c]));
  const porIdMotorista = new Map(motoristas.map((m) => [m.id, m]));

  const candidatos: Signatario[] = [];
  const jaVistos = new Set<string>();

  for (const condutor of condutores) {
    if (condutor.cliente_id) {
      const ficha = porIdCliente.get(condutor.cliente_id);
      if (ficha && !jaVistos.has(`c:${ficha.id}`)) {
        jaVistos.add(`c:${ficha.id}`);
        candidatos.push({
          papel: 'cliente',
          nome: ficha.nome ?? '',
          email: ficha.email ?? null,
          clienteId: ficha.id,
        });
      }
    }
  }

  for (const condutor of condutores) {
    if (condutor.motorista_id) {
      const ficha = porIdMotorista.get(condutor.motorista_id);
      if (ficha && !jaVistos.has(`m:${ficha.id}`)) {
        jaVistos.add(`m:${ficha.id}`);
        candidatos.push({
          papel: 'motorista',
          nome: ficha.nome ?? '',
          email: ficha.email ?? null,
          motoristaId: ficha.id,
        });
      }
    }
  }

  return candidatos.filter((c) => c.nome.trim() !== '');
}

/** O type guard contorna o estreitamento inconsistente sem `strictNullChecks`. */
export function validacaoFalhou(v: ValidacaoSignatarios): v is { ok: false; semEmail: string[] } {
  return !v.ok;
}
