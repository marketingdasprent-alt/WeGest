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
  payloadCredenciaisPortalBolt,
  payloadCriacaoBolt,
  temCredenciaisPortal,
  semanaDe,
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
    const d = decidir({ contexto: 'editar', modoGravado: 'password', temPortal: true });
    expect(d.mostrarAvisoConversao).toBe(true);
    expect(d.mostrarCredenciaisPortal).toBe(true);
    expect(d.mostrarExecutarRobot).toBe(true);
    expect(d.mostrarSincronizarSemana).toBe(false);
  });

  // O CSV do portal é o ÚNICO sítio onde existem as campanhas (a API devolve
  // nove campos de preço por viagem e nenhum é campanha). Esconder o login do
  // portal depois da conversão foi o que deixou 4 contas sem forma de o voltar
  // a pôr — e sem campanhas — durante cinco semanas.
  it('edição de uma conta já convertida: mantém o portal E ganha a sincronização semanal', () => {
    const d = decidir({ contexto: 'editar', modoGravado: 'oauth', temPortal: true });
    expect(d.mostrarAvisoConversao).toBe(false);
    expect(d.mostrarCredenciaisPortal).toBe(true);
    expect(d.mostrarExecutarRobot).toBe(true);
    expect(d.mostrarSincronizarSemana).toBe(true);
  });

  it('sem login do portal não se oferece o robô — premi-lo daria sempre erro', () => {
    expect(decidir({ contexto: 'editar', modoGravado: 'oauth' }).mostrarExecutarRobot).toBe(false);
    expect(decidir({ contexto: 'editar', modoGravado: 'password' }).mostrarExecutarRobot).toBe(
      false
    );
    // Mas o campo para o preencher aparece à mesma, senão não havia por onde.
    expect(decidir({ contexto: 'editar', modoGravado: 'oauth' }).mostrarCredenciaisPortal).toBe(
      true
    );
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

  // Esta é a regressão que custou 5 semanas de campanhas: a conversão escreve a
  // chave da API por cima de client_id/client_secret, que numa conta ainda em
  // modo robô são o login do portal. Sem salvar esse login, o robô fica sem
  // forma de entrar e o CSV nunca mais chega — em silêncio.
  it('salva o login do portal que a conversão está prestes a substituir', () => {
    const payload = payloadConversaoBolt({
      ...credenciaisValidas,
      portalAnterior: { email: ' lara@exemplo.pt ', password: ' segredo ' },
    });
    expect(payload.robot_portal_email).toBe('lara@exemplo.pt');
    expect(payload.robot_portal_password).toBe('segredo');
    // E a chave da API vai para o sítio dela, não para o do portal.
    expect(payload.client_id).toBe('cli_123');
  });

  it('sem login anterior para salvar, não inventa colunas do portal', () => {
    for (const portalAnterior of [
      null,
      undefined,
      { email: 'so@email.pt', password: '' },
      { email: '', password: 'so_password' },
    ]) {
      const payload = payloadConversaoBolt({ ...credenciaisValidas, portalAnterior });
      expect(payload).not.toHaveProperty('robot_portal_email');
      expect(payload).not.toHaveProperty('robot_portal_password');
    }
  });
});

describe('temCredenciaisPortal', () => {
  it('as colunas próprias chegam, em qualquer modo', () => {
    const portal = { robot_portal_email: 'a@b.pt', robot_portal_password: 'x' };
    expect(temCredenciaisPortal({ ...portal, auth_mode: 'oauth' })).toBe(true);
    expect(temCredenciaisPortal({ ...portal, auth_mode: 'password' })).toBe(true);
  });

  it('numa conta por converter, client_id/secret ainda são o login do portal', () => {
    expect(
      temCredenciaisPortal({ auth_mode: 'password', client_id: 'a@b.pt', client_secret: 'x' })
    ).toBe(true);
  });

  // O cerne do bug: em oauth estas colunas guardam a chave da API. Tratá-las
  // como login do portal é mandar uma chave de API para um formulário de login.
  it('numa conta em oauth, client_id/secret NÃO contam — são a chave da API', () => {
    expect(
      temCredenciaisPortal({ auth_mode: 'oauth', client_id: 'cli_x', client_secret: 'sec_y' })
    ).toBe(false);
  });

  it('metade das credenciais não é credencial nenhuma', () => {
    expect(temCredenciaisPortal({ robot_portal_email: 'a@b.pt' })).toBe(false);
    expect(temCredenciaisPortal({ robot_portal_email: '  ', robot_portal_password: 'x' })).toBe(
      false
    );
    expect(temCredenciaisPortal(null)).toBe(false);
  });
});

describe('payloadCredenciaisPortalBolt', () => {
  it('grava só as colunas do portal, sem tocar nas da API', () => {
    expect(payloadCredenciaisPortalBolt(' lara@exemplo.pt ', ' segredo ')).toEqual({
      robot_portal_email: 'lara@exemplo.pt',
      robot_portal_password: 'segredo',
    });
  });

  it('recusa gravar metade de um par', () => {
    expect(() => payloadCredenciaisPortalBolt('', 'x')).toThrow(/portal Bolt/);
    expect(() => payloadCredenciaisPortalBolt('a@b.pt', '   ')).toThrow(/portal Bolt/);
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

describe('semanaDe', () => {
  // A calibração precisa exactamente desta semana — é a única com alvo
  // conhecido (48.797,42 EUR na Bolt Distancia).
  it('encaixa qualquer dia na semana Segunda–Domingo que o contém', () => {
    const esperada = { inicio: '2026-07-06', fim: '2026-07-12' };
    expect(semanaDe('2026-07-06')).toEqual(esperada); // a própria segunda
    expect(semanaDe('2026-07-09')).toEqual(esperada); // a meio
    expect(semanaDe('2026-07-12')).toEqual(esperada); // o domingo
  });

  it('não deixa o domingo cair na semana seguinte', () => {
    // (getDay() + 6) % 7 posto ao contrário mandava o domingo 7 dias à frente.
    expect(semanaDe('2026-08-02')).toEqual({ inicio: '2026-07-27', fim: '2026-08-02' });
  });

  it('atravessa a fronteira do mês e do ano', () => {
    expect(semanaDe('2026-01-01')).toEqual({ inicio: '2025-12-29', fim: '2026-01-04' });
  });

  it('recusa datas inválidas em vez de sincronizar um período inventado', () => {
    expect(semanaDe('2026-02-31')).toBeNull(); // não existe
    expect(semanaDe('06/07/2026')).toBeNull(); // formato errado
    expect(semanaDe('')).toBeNull();
    expect(semanaDe('2026-7-6')).toBeNull(); // sem zeros à esquerda
  });
});
