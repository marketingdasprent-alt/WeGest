import { describe, it, expect } from 'vitest';
import { notificacaoLink, notificacaoLabel } from './notificacoes';

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

  it('motorista_carta_expirando sem link nem viatura_id cai no fallback de candidaturas (não tem rota própria de motorista)', () => {
    const n = fixture({
      tipo: 'motorista_carta_expirando',
      link: null,
      viatura_id: null,
      candidatura_id: null,
    });
    expect(notificacaoLink(n)).toBe('/motoristas/candidaturas');
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

  it('tipo desconhecido continua a cair em "Ver candidatura"', () => {
    expect(notificacaoLabel(fixture({ tipo: 'motorista_pendente' }))).toBe('Ver candidatura');
  });
});
