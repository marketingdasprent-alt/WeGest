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
