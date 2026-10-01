/**
 * Regras de quem assina um documento enviado para assinatura.
 *
 * Estão aqui, e não dentro das edge functions, porque o `vitest.config.ts`
 * exclui `supabase/**` — um teste ao lado da função nunca correria. As funções
 * repetem a verificação por defesa; esta é a versão que o ecrã usa e que fica
 * coberta por testes.
 */

/** Papéis que assinam pelo link. Espelha o `check` da tabela de pedidos. */
export type PapelSignatario = 'cliente' | 'condutor' | 'motorista';

export interface Signatario {
  papel: PapelSignatario;
  nome: string;
  email: string | null;
  /** Ficha de origem, quando existe — serve para reconhecer a mesma pessoa. */
  clienteId?: string | null;
  motoristaId?: string | null;
}

export type ValidacaoSignatarios =
  | { ok: true; signatarios: Array<Signatario & { email: string }> }
  | { ok: false; semEmail: string[] };

/**
 * Só se envia para quem tem email na ficha; quando falta, o envio pára e diz
 * quem falta — saltar em silêncio deixaria a assinatura em falta passar despercebida.
 */
export function validarSignatarios(lista: Signatario[]): ValidacaoSignatarios {
  const temEmail = (s: Signatario) => typeof s.email === 'string' && s.email.trim() !== '';

  const semEmail = lista.filter((s) => !temEmail(s)).map((s) => s.nome);
  if (semEmail.length > 0 || lista.length === 0) return { ok: false, semEmail };

  return {
    ok: true,
    signatarios: lista.map((s) => ({ ...s, email: (s.email as string).trim() })),
  };
}

/**
 * Nomes de pessoas escolhidas mais do que uma vez, em papéis diferentes (ex.:
 * cliente e condutor da mesma pessoa) — legítimo, mas tem de ser uma escolha.
 * Identidade vem de `clienteId`/`motoristaId`, nunca do nome (há homónimos).
 */
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

/** Em que pé está um pedido de assinatura, do ponto de vista de quem abre o link. */
export type EstadoToken = 'valido' | 'assinado';

/**
 * O link NÃO expira, mas é de UMA utilização — é a assinatura que o fecha, não
 * o tempo. Para reassinar é preciso um pedido novo (gerado do lado do sistema),
 * para que um link que corra mundo não dê a ninguém poder de reassinar depois.
 */
export function estadoDoToken(pedido: { assinado_em: string | null }): EstadoToken {
  return pedido.assinado_em ? 'assinado' : 'valido';
}

/** O mínimo que se precisa de saber de um condutor do contrato. */
export interface CondutorDoContrato {
  cliente_id?: string | null;
  motorista_id?: string | null;
}

interface FichaComEmail {
  id: string;
  nome?: string | null;
  email?: string | null;
}

/**
 * Quem pode assinar os documentos de um contrato. O papel vem da ficha em que
 * o condutor é encontrado (cliente ou motorista); quem não é encontrado é
 * ignorado, porque um "(sem nome)" na lista é pior do que não aparecer.
 */
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

/**
 * Estreitamento explícito do resultado da validação — necessário porque o
 * `tsconfig.app.json` tem `"strict": false` e `if (!r.ok)` não estreitaria.
 */
export function validacaoFalhou(v: ValidacaoSignatarios): v is { ok: false; semEmail: string[] } {
  return !v.ok;
}
