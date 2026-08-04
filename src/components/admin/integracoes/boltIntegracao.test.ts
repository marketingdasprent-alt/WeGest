// src/components/admin/integracoes/boltIntegracao.test.ts
import { describe, expect, it } from 'vitest';
import {
  boltAuthMode,
  decidirFormularioBolt,
  type EntradaDecisaoBolt,
  etiquetaEmpresaBolt,
  isIntegracaoBolt,
  normalizarCompanyId,
  normalizarEmpresasBolt,
  payloadConversaoBolt,
  payloadCriacaoBolt,
  periodoTexto,
  semanaAnterior,
} from './boltIntegracao';

const decisaoBase: EntradaDecisaoBolt = {
  contexto: 'criar',
  modoGravado: 'password',
  clientId: '',
  clientSecret: '',
  companyId: '',
  estadoTeste: 'idle',
  empresas: [],
};

const decidir = (parcial: Partial<EntradaDecisaoBolt>) =>
  decidirFormularioBolt({ ...decisaoBase, ...parcial });

const credenciaisValidas = {
  clientId: 'cli_123',
  clientSecret: 'sec_456',
  companyId: '77',
  companyName: 'Distância Lda',
};

describe('isIntegracaoBolt', () => {
  it('reconhece o robô Bolt e a forma legada plataforma=bolt', () => {
    expect(isIntegracaoBolt({ plataforma: 'robot', robot_target_platform: 'bolt' })).toBe(true);
    expect(isIntegracaoBolt({ plataforma: 'bolt' })).toBe(true);
  });

  it('não confunde com outros robôs nem com linhas vazias', () => {
    expect(isIntegracaoBolt({ plataforma: 'robot', robot_target_platform: 'uber' })).toBe(false);
    expect(isIntegracaoBolt({ plataforma: 'cartrack' })).toBe(false);
    expect(isIntegracaoBolt(null)).toBe(false);
  });
});

describe('boltAuthMode', () => {
  it('só oauth conta como API; tudo o resto é robô', () => {
    expect(boltAuthMode({ auth_mode: 'oauth' })).toBe('oauth');
    expect(boltAuthMode({ auth_mode: 'password' })).toBe('password');
    expect(boltAuthMode({ auth_mode: null })).toBe('password');
    expect(boltAuthMode({})).toBe('password');
  });
});

describe('normalizarEmpresasBolt', () => {
  it('aceita a lista de IDs em data.company_ids', () => {
    expect(normalizarEmpresasBolt({ data: { company_ids: [10, 11] } })).toEqual([
      { company_id: 10, company_name: null },
      { company_id: 11, company_name: null },
    ]);
  });

  it('aceita objectos com nome e limpa espaços', () => {
    expect(
      normalizarEmpresasBolt({ companies: [{ company_id: 5, company_name: '  Pró Peças ' }] })
    ).toEqual([{ company_id: 5, company_name: 'Pró Peças' }]);
  });

  it('descarta duplicados e valores não numéricos', () => {
    expect(normalizarEmpresasBolt({ company_ids: [7, 7, 'x', null, 8] })).toEqual([
      { company_id: 7, company_name: null },
      { company_id: 8, company_name: null },
    ]);
  });

  it('não deixa passar um #0 (Number(null) e Number("") são 0)', () => {
    expect(normalizarEmpresasBolt({ company_ids: [null, '', 0, -3, 1.5, 9] })).toEqual([
      { company_id: 9, company_name: null },
    ]);
  });

  it('devolve lista vazia quando o formato não é o esperado', () => {
    expect(normalizarEmpresasBolt(null)).toEqual([]);
    expect(normalizarEmpresasBolt({ data: {} })).toEqual([]);
    expect(normalizarEmpresasBolt({ company_ids: 'nada' })).toEqual([]);
  });
});

describe('etiquetaEmpresaBolt', () => {
  it('mostra o nome com o ID, ou só o ID quando a Bolt não deu nome', () => {
    expect(etiquetaEmpresaBolt({ company_id: 4, company_name: 'Lara' })).toBe('Lara (4)');
    expect(etiquetaEmpresaBolt({ company_id: 4, company_name: null })).toBe('#4');
  });
});

describe('decidirFormularioBolt', () => {
  it('criação: pede credenciais e não fala em conversão nem em robô', () => {
    const d = decidir({ contexto: 'criar' });
    expect(d.mostrarAvisoConversao).toBe(false);
    expect(d.mostrarCredenciaisPortal).toBe(false);
    expect(d.mostrarExecutarRobot).toBe(false);
    expect(d.mostrarSincronizarSemana).toBe(false);
    expect(d.completo).toBe(false);
    expect(d.motivo).toBe('Preencha o Client ID e o Client Secret da API Bolt.');
  });

  it('edição de uma conta ainda no robô: avisa da conversão e mantém o portal', () => {
    const d = decidir({ contexto: 'editar', modoGravado: 'password' });
    expect(d.mostrarAvisoConversao).toBe(true);
    expect(d.mostrarCredenciaisPortal).toBe(true);
    expect(d.mostrarExecutarRobot).toBe(true);
    expect(d.mostrarSincronizarSemana).toBe(false);
  });

  it('edição de uma conta já convertida: sem robô, com sincronização semanal', () => {
    const d = decidir({ contexto: 'editar', modoGravado: 'oauth' });
    expect(d.mostrarAvisoConversao).toBe(false);
    expect(d.mostrarCredenciaisPortal).toBe(false);
    expect(d.mostrarExecutarRobot).toBe(false);
    expect(d.mostrarSincronizarSemana).toBe(true);
  });

  it('a importação manual do CSV está sempre disponível, em qualquer modo', () => {
    expect(decidir({ contexto: 'criar' }).mostrarImportarCsv).toBe(true);
    expect(decidir({ contexto: 'editar', modoGravado: 'password' }).mostrarImportarCsv).toBe(true);
    expect(decidir({ contexto: 'editar', modoGravado: 'oauth' }).mostrarImportarCsv).toBe(true);
  });

  it('só se pode testar com os dois campos preenchidos, e não durante o teste', () => {
    expect(decidir({ clientId: 'a' }).podeTestar).toBe(false);
    expect(decidir({ clientId: 'a', clientSecret: 'b' }).podeTestar).toBe(true);
    expect(decidir({ clientId: 'a', clientSecret: 'b', estadoTeste: 'testing' }).podeTestar).toBe(
      false
    );
  });

  it('credenciais por testar não são credenciais gravaveis', () => {
    const d = decidir({ clientId: 'a', clientSecret: 'b', estadoTeste: 'idle' });
    expect(d.completo).toBe(false);
    expect(d.motivo).toBe('Teste a ligação antes de gravar as credenciais.');
  });

  it('teste com sucesso mas sem empresa escolhida ainda não chega', () => {
    const d = decidir({
      clientId: 'a',
      clientSecret: 'b',
      estadoTeste: 'success',
      empresas: [
        { company_id: 1, company_name: null },
        { company_id: 2, company_name: null },
      ],
    });
    expect(d.mostrarEmpresas).toBe(true);
    expect(d.completo).toBe(false);
    expect(d.motivo).toBe('Escolha a empresa Bolt desta integração.');
  });

  it('com tudo preenchido e testado fica completo', () => {
    const d = decidir({
      clientId: 'a',
      clientSecret: 'b',
      companyId: '9',
      estadoTeste: 'success',
      empresas: [{ company_id: 9, company_name: 'X' }],
    });
    expect(d.completo).toBe(true);
    expect(d.motivo).toBeNull();
  });

  it('espaços não contam como credenciais escritas', () => {
    expect(decidir({ clientId: '   ' }).preenchido).toBe(false);
    expect(decidir({ clientId: ' a ' }).preenchido).toBe(true);
  });
});

describe('normalizarCompanyId', () => {
  it('aceita o inteiro positivo em texto ou número', () => {
    expect(normalizarCompanyId(' 123 ')).toBe(123);
    expect(normalizarCompanyId(456)).toBe(456);
  });

  it('recusa vazio, zero, negativo e lixo', () => {
    expect(() => normalizarCompanyId('')).toThrow(/empresa Bolt/);
    expect(() => normalizarCompanyId('0')).toThrow(/empresa Bolt/);
    expect(() => normalizarCompanyId(-5)).toThrow(/empresa Bolt/);
    expect(() => normalizarCompanyId('abc')).toThrow(/empresa Bolt/);
  });
});

describe('payloadCriacaoBolt', () => {
  it('grava a Bolt como robot+bolt em modo oauth, com sync automático desligado', () => {
    const payload = payloadCriacaoBolt({
      nome: ' Bolt Distância ',
      ...credenciaisValidas,
      apifyApiToken: 'apify_tok',
    });

    expect(payload).toMatchObject({
      nome: 'Bolt Distância',
      plataforma: 'robot',
      robot_target_platform: 'bolt',
      auth_mode: 'oauth',
      client_id: 'cli_123',
      client_secret: 'sec_456',
      company_id: 77,
      company_name: 'Distância Lda',
      apify_api_token: 'apify_tok',
      ativo: true,
      sync_automatico: false,
    });
  });

  it('limpa espaços à volta das credenciais coladas do portal', () => {
    const payload = payloadCriacaoBolt({
      nome: 'Bolt',
      clientId: '  cli_123\n',
      clientSecret: ' sec_456 ',
      companyId: '77',
    });
    expect(payload.client_id).toBe('cli_123');
    expect(payload.client_secret).toBe('sec_456');
    expect(payload.company_name).toBeNull();
  });

  it('não deixa criar sem nome, sem credenciais ou sem empresa', () => {
    expect(() => payloadCriacaoBolt({ nome: '  ', ...credenciaisValidas })).toThrow(/nome/);
    expect(() =>
      payloadCriacaoBolt({ ...credenciaisValidas, nome: 'Bolt', clientSecret: '' })
    ).toThrow(/Client ID e o Client Secret/);
    expect(() =>
      payloadCriacaoBolt({ ...credenciaisValidas, nome: 'Bolt', companyId: '' })
    ).toThrow(/empresa Bolt/);
  });

  it('sem token Apify a criação continua a ser possível (a linha nasce em oauth)', () => {
    expect(payloadCriacaoBolt({ nome: 'Bolt', ...credenciaisValidas }).apify_api_token).toBeNull();
  });
});

describe('payloadConversaoBolt', () => {
  it('converte no lugar: nunca traz id, plataforma ou nome', () => {
    const payload = payloadConversaoBolt(credenciaisValidas);

    expect(payload).toEqual({
      auth_mode: 'oauth',
      client_id: 'cli_123',
      client_secret: 'sec_456',
      company_id: 77,
      company_name: 'Distância Lda',
      cookies_json: null,
      sync_automatico: false,
    });
    expect(payload).not.toHaveProperty('id');
    expect(payload).not.toHaveProperty('plataforma');
    expect(payload).not.toHaveProperty('robot_target_platform');
    expect(payload).not.toHaveProperty('nome');
  });

  it('desliga o sync automático do robô ao converter', () => {
    expect(payloadConversaoBolt(credenciaisValidas).sync_automatico).toBe(false);
  });

  it('recusa converter com credenciais incompletas', () => {
    expect(() => payloadConversaoBolt({ ...credenciaisValidas, clientId: ' ' })).toThrow(
      /Client ID e o Client Secret/
    );
    expect(() => payloadConversaoBolt({ ...credenciaisValidas, companyId: 'x' })).toThrow(
      /empresa Bolt/
    );
  });
});

describe('semanaAnterior', () => {
  it('numa terça-feira devolve a Segunda-Domingo anterior', () => {
    expect(semanaAnterior(new Date(2026, 7, 4))).toEqual({
      inicio: '2026-07-27',
      fim: '2026-08-02',
    });
  });

  it('numa segunda-feira ainda é a semana toda anterior, não a que começou hoje', () => {
    expect(semanaAnterior(new Date(2026, 7, 3))).toEqual({
      inicio: '2026-07-27',
      fim: '2026-08-02',
    });
  });

  it('num domingo conta a semana fechada antes dele', () => {
    expect(semanaAnterior(new Date(2026, 7, 2))).toEqual({
      inicio: '2026-07-20',
      fim: '2026-07-26',
    });
  });

  it('atravessa a viragem do ano', () => {
    expect(semanaAnterior(new Date(2026, 0, 1))).toEqual({
      inicio: '2025-12-22',
      fim: '2025-12-28',
    });
  });

  it('atravessa a viragem do mês', () => {
    expect(semanaAnterior(new Date(2026, 2, 2))).toEqual({
      inicio: '2026-02-23',
      fim: '2026-03-01',
    });
  });
});

describe('periodoTexto', () => {
  it('usa o formato gravado em bolt_resumos_semanais.periodo', () => {
    expect(periodoTexto('2026-07-27', '2026-08-02')).toBe('2026-07-27 a 2026-08-02');
  });
});
