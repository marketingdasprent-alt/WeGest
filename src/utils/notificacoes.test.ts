import { describe, it, expect } from 'vitest';
import {
  notificacaoLink,
  notificacaoLabel,
  notificacaoItemTexto,
  notificacaoTitulo,
  TIPOS_NOTIFICACAO,
} from './notificacoes';

type Notificacao = Parameters<typeof notificacaoLink>[0];

function fixture(overrides: Partial<Notificacao>): Notificacao {
  return {
    id: 'notif-1',
    org_id: 'org-1',
    tipo: 'motorista_pendente',
    candidatura_id: null,
    link: null,
    destinatario_id: null,
    destinatario_user_id: null,
    evento_id: null,
    viatura_id: null,
    titulo: 'Título',
    mensagem: null,
    severidade: 'normal',
    resolvida: false,
    resolvida_por: null,
    resolvida_por_nome: null,
    resolvida_em: null,
    created_at: '2026-07-27T08:00:00.000Z',
    ...overrides,
  } as Notificacao;
}

describe('notificacaoLink', () => {
  it('viatura.seguro_expirando aponta para a viatura concreta (link já preenchido pelo motor)', () => {
    const n = fixture({
      tipo: 'viatura_seguro_expirando',
      link: '/viaturas/v-1',
      viatura_id: 'v-1',
    });
    expect(notificacaoLink(n)).toBe('/viaturas/v-1');
  });

  it('viatura.inspecao_expirando cai no fallback por viatura_id quando link ainda não está preenchido', () => {
    const n = fixture({ tipo: 'viatura_inspecao_expirando', link: null, viatura_id: 'v-2' });
    expect(notificacaoLink(n)).toBe('/viaturas/v-2');
  });

  it('motorista_carta_expirando vai para os motoristas, não para as candidaturas', () => {
    // Este teste asseverava o contrário, justificando-se com "não tem rota
    // própria de motorista". A premissa era falsa: /motoristas existe
    // (WebAppRoutes.tsx:191), tal como /motoristas/:id. Mandar um alerta de
    // carta de condução a expirar para o ecrã de CANDIDATURAS nunca foi
    // justificado — era o fallback enganador a ser tomado por desenho.
    const n = fixture({
      tipo: 'motorista_carta_expirando',
      link: null,
      viatura_id: null,
      candidatura_id: null,
    });
    expect(notificacaoLink(n)).toBe('/motoristas');
  });

  it('viatura_disponivel continua a funcionar como antes', () => {
    const n = fixture({ tipo: 'viatura_disponivel', viatura_id: 'v-3' });
    expect(notificacaoLink(n)).toBe('/viaturas/v-3');
  });

  it('contrato_renting_renovacao_proxima usa o link já preenchido pelo motor', () => {
    const n = fixture({
      tipo: 'contrato_renting_renovacao_proxima',
      link: '/renting/contratos/c-1',
    });
    expect(notificacaoLink(n)).toBe('/renting/contratos/c-1');
  });

  it('sistema_limite_email_atingido usa o link já preenchido pelo motor', () => {
    const n = fixture({ tipo: 'sistema_limite_email_atingido', link: '/admin/automacao' });
    expect(notificacaoLink(n)).toBe('/admin/automacao');
  });
});

describe('notificacaoLabel', () => {
  it('viatura_seguro_expirando mostra "Ver viatura", não "Ver candidatura"', () => {
    expect(notificacaoLabel(fixture({ tipo: 'viatura_seguro_expirando' }))).toBe('Ver viatura');
  });

  it('viatura_inspecao_expirando mostra "Ver viatura"', () => {
    expect(notificacaoLabel(fixture({ tipo: 'viatura_inspecao_expirando' }))).toBe('Ver viatura');
  });

  it('motorista_carta_expirando mostra "Ver motorista"', () => {
    expect(notificacaoLabel(fixture({ tipo: 'motorista_carta_expirando' }))).toBe('Ver motorista');
  });

  it('motorista_licenca_tvde_expirando mostra "Ver motorista"', () => {
    expect(notificacaoLabel(fixture({ tipo: 'motorista_licenca_tvde_expirando' }))).toBe(
      'Ver motorista'
    );
  });

  it('cobranca_gerada mostra "Ver cobrança"', () => {
    expect(notificacaoLabel(fixture({ tipo: 'cobranca_gerada' }))).toBe('Ver cobrança');
  });

  it('contrato_renting_renovacao_proxima mostra "Ver contrato"', () => {
    expect(notificacaoLabel(fixture({ tipo: 'contrato_renting_renovacao_proxima' }))).toBe(
      'Ver contrato'
    );
  });

  it('utilizador_criado mostra "Ver utilizadores"', () => {
    expect(notificacaoLabel(fixture({ tipo: 'utilizador_criado' }))).toBe('Ver utilizadores');
  });

  it('sistema_limite_email_atingido mostra "Ver automações"', () => {
    expect(notificacaoLabel(fixture({ tipo: 'sistema_limite_email_atingido' }))).toBe(
      'Ver automações'
    );
  });

  it('motorista_pendente mostra "Ver candidatura" — aqui está correcto', () => {
    // O nome anterior deste teste dizia "tipo desconhecido", mas
    // motorista_pendente é um tipo REAL e é um dos dois (com
    // motorista_candidatura_parada) em que "Ver candidatura" é a verdade.
    expect(notificacaoLabel(fixture({ tipo: 'motorista_pendente' }))).toBe('Ver candidatura');
  });
});

// ── Invariantes do mapa ─────────────────────────────────────────────────────
// A BD aceita 25 tipos. Antes, o frontend rotulava 10 e os outros 15 caíam num
// `return 'Ver candidatura'` — um alerta de login suspeito, uma fatura por
// enviar ou um ticket em atraso mostravam todos um botão que mentia e levava ao
// ecrã de candidaturas de motorista. Estes testes impedem o regresso disso.
describe('mapa de tipos — completude e honestidade', () => {
  it('todos os 25 tipos da base de dados têm rótulo e rota próprios', () => {
    // Se a BD ganhar um tipo novo, acrescentá-lo a TIPOS_NOTIFICACAO faz este
    // teste falhar até o destino existir — em vez de o tipo ser silenciosamente
    // etiquetado como outra coisa.
    const semDestino = TIPOS_NOTIFICACAO.filter((tipo) => {
      const n = fixture({ tipo, link: null, viatura_id: null, candidatura_id: null });
      return notificacaoLabel(n) === 'Ver detalhe' && notificacaoLink(n) === '/notificacoes';
    });
    expect(semDestino).toEqual([]);
  });

  it('nenhum tipo diz "Ver candidatura" sem ser uma candidatura', () => {
    const queDizemCandidatura = TIPOS_NOTIFICACAO.filter(
      (tipo) => notificacaoLabel(fixture({ tipo })) === 'Ver candidatura'
    );
    expect(queDizemCandidatura.sort()).toEqual([
      'motorista_candidatura_parada',
      'motorista_pendente',
    ]);
  });

  it('um tipo fora do mapa cai num destino honesto, nunca em candidaturas', () => {
    const n = fixture({
      tipo: 'tipo_que_ainda_nao_existe' as never,
      link: null,
      viatura_id: null,
      candidatura_id: null,
    });
    expect(notificacaoLabel(n)).toBe('Ver detalhe');
    expect(notificacaoLink(n)).toBe('/notificacoes');
    expect(notificacaoLabel(n)).not.toBe('Ver candidatura');
  });

  it('avisos dirigidos ao motorista levam ao portal dele, não a rotas de staff', () => {
    // Um motorista não tem acesso às rotas de staff: mandá-lo para lá dava-lhe
    // um ecrã sem permissão em vez da informação que o aviso lhe prometeu.
    for (const tipo of ['motorista_ficha_incompleta', 'motorista_reparacao_cobranca'] as const) {
      const n = fixture({ tipo, link: null, viatura_id: null, candidatura_id: null });
      expect(notificacaoLink(n)).toBe('/motorista/painel');
    }
  });

  it('o rótulo nunca vem vazio', () => {
    for (const tipo of TIPOS_NOTIFICACAO) {
      expect(notificacaoLabel(fixture({ tipo })).trim().length).toBeGreaterThan(0);
    }
  });
});

describe('notificacaoItemTexto', () => {
  it('prefere sempre a mensagem do item quando existe', () => {
    const n = fixture({ tipo: 'viatura_seguro_expirando' });
    expect(notificacaoItemTexto(n, { mensagem: 'AA-00-BB — expira em 3 dias' }, 0)).toBe(
      'AA-00-BB — expira em 3 dias'
    );
  });

  it('nunca mostra o URL em cru quando falta a mensagem', () => {
    // Regressão: a lista expandida fazia `item.mensagem || item.link` e
    // imprimia dezesseis linhas de /assistencia/<uuid> no painel.
    const n = fixture({ tipo: 'assistencia_ticket_aberto_demasiado_tempo' });
    const link = '/assistencia/4309204a-5499-402a-b744-ae7ff8713c22';

    const texto = notificacaoItemTexto(n, { link }, 0);

    expect(texto).not.toContain('/');
    expect(texto).not.toContain(link);
    expect(texto).toBe('Ticket #4309204a');
  });

  it('usa o nome da entidade do próprio tipo', () => {
    expect(
      notificacaoItemTexto(
        fixture({ tipo: 'viatura_iuc_a_pagar' }),
        {
          link: '/viaturas/bd35b9ad-4651-463c-8a64-f4df15b7a111',
        },
        0
      )
    ).toBe('Viatura #bd35b9ad');

    expect(
      notificacaoItemTexto(
        fixture({ tipo: 'contrato_renting_renovacao_proxima' }),
        {
          link: '/renting/contratos/8d349675-b8d8-4a41-8c97-b232676011ff',
        },
        0
      )
    ).toBe('Contrato #8d349675');
  });

  it('sem mensagem e sem id utilizável, numera a posição', () => {
    const n = fixture({ tipo: 'invoice_nao_enviada_ao_cliente' });
    expect(notificacaoItemTexto(n, {}, 0)).toBe('Fatura 1');
    expect(notificacaoItemTexto(n, { link: '/administrativo/faturacao' }, 4)).toBe('Fatura 5');
  });

  it('um tipo fora do mapa não inventa uma entidade', () => {
    // Herda o destino honesto do fallback ("Ver detalhe" → "Detalhe"), em vez
    // de afirmar que é uma viatura ou um contrato.
    const n = fixture({ tipo: 'tipo_novo_qualquer' as never });
    expect(notificacaoItemTexto(n, {}, 0)).toBe('Detalhe 1');
  });

  it('um rótulo que não começa por "Ver" cai em Registo', () => {
    // 'motorista_ficha_incompleta' → "Completar ficha": não há entidade a
    // extrair, e inventar uma seria pior do que um termo neutro.
    const n = fixture({ tipo: 'motorista_ficha_incompleta' });
    expect(notificacaoItemTexto(n, {}, 2)).toBe('Registo 3');
  });
});

describe('notificacaoTitulo', () => {
  it('devolve o título quando existe', () => {
    expect(notificacaoTitulo(fixture({ titulo: 'Seguro a expirar' }))).toBe('Seguro a expirar');
  });

  it('nunca devolve vazio — o cartão mostrava dois botões e nada escrito', () => {
    expect(notificacaoTitulo(fixture({ titulo: '' }))).toBe('Aviso do sistema');
    expect(notificacaoTitulo(fixture({ titulo: '   ' }))).toBe('Aviso do sistema');
    expect(notificacaoTitulo(fixture({ titulo: undefined as never }))).toBe('Aviso do sistema');
  });
});
