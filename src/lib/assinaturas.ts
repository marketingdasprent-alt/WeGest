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
 * Só se envia para quem tem email na ficha.
 *
 * Quando falta, o envio pára e diz **quem** falta, pelo nome. Saltar a pessoa em
 * silêncio deixaria quem enviou convencido de que toda a gente recebeu — e a
 * assinatura que falta só apareceria semanas depois, quando fizesse falta.
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
 * Nomes de pessoas escolhidas mais do que uma vez, em papéis diferentes.
 *
 * Acontece a sério: o cliente de um contrato é muitas vezes também o condutor.
 * Como cada pedido é independente, essa pessoa receberia dois emails e assinaria
 * dois documentos — o que é legítimo, mas tem de ser uma escolha e não uma
 * surpresa.
 *
 * A identidade vem da ficha (`clienteId` ou `motoristaId`) e só na falta dela do
 * email. O nome nunca serve: há homónimos, e dois "Ana Reis" diferentes não são
 * a mesma pessoa.
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
export type EstadoToken = 'valido' | 'expirado' | 'assinado';

/**
 * O link morre de duas maneiras: quando o prazo passa e quando é assinado.
 *
 * A ordem importa e não é arbitrária. Já assinado ganha sempre ao prazo: quem
 * assinou tem de poder voltar a abrir o link e descarregar o documento
 * assinado, mesmo semanas depois. Mostrar-lhe "o link expirou" seria esconder-
 * lhe um documento que é dele — e gera um telefonema que não devia existir.
 */
export function estadoDoToken(
  pedido: { expires_at: string; assinado_em: string | null },
  agora: Date
): EstadoToken {
  if (pedido.assinado_em) return 'assinado';
  return new Date(pedido.expires_at) <= agora ? 'expirado' : 'valido';
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
 * Quem pode assinar os documentos de um contrato.
 *
 * Um condutor é uma ficha de cliente ou de motorista — e é isso que decide o
 * papel, porque um cliente que conduz assina como cliente. Quem não for
 * encontrado na respectiva lista é ignorado em vez de aparecer com o nome
 * vazio: um "(sem nome)" na lista de quem assina é pior do que não aparecer.
 *
 * A ordem é estável — clientes primeiro, depois motoristas — para a lista não
 * dançar entre aberturas do diálogo.
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
 * Estreitamento explícito do resultado da validação.
 *
 * O `tsconfig.app.json` tem `"strict": false`, e sem `strictNullChecks` o
 * TypeScript não estreita uma união discriminada por `if (!r.ok)`. Um type
 * guard nomeado funciona em qualquer configuração — e lê-se melhor.
 */
export function validacaoFalhou(v: ValidacaoSignatarios): v is { ok: false; semEmail: string[] } {
  return !v.ok;
}
