import { describe, it, expect } from 'vitest';
import {
  buildFaturacaoSettings,
  camposPorTipo,
  CAMPOS_POR_TIPO_VAZIOS,
  empresaServicoValida,
  enderecoServicoValido,
  integracaoPrimaveraAntiga,
  normalizarEmpresaServico,
  primeiroErroServico,
  validarServicoPrimavera,
  type FaturacaoFormFields,
} from './faturacaoIntegracaoConfig';

const base: FaturacaoFormFields = {
  provider: 'keyinvoice',
  endpoint: '',
  defaultProduct: '',
  defaultIdTax: '',
  doctypes: { FT: '4', FR: '34', NC: '7', RC: '' },
  docseries: { ...CAMPOS_POR_TIPO_VAZIOS },
};

describe('buildFaturacaoSettings', () => {
  it('grava as séries preenchidas ao lado dos tipos de documento', () => {
    const s = buildFaturacaoSettings({
      ...base,
      docseries: { FT: '67', FR: ' 69 ', NC: '68', RC: '' },
    });
    expect(s.doctypes).toEqual({ FT: '4', FR: '34', NC: '7' });
    expect(s.docseries).toEqual({ FT: '67', FR: '69', NC: '68' });
  });

  it('sem nenhuma série preenchida não grava a chave docseries', () => {
    expect(buildFaturacaoSettings(base)).not.toHaveProperty('docseries');
  });

  it('grava precos_com_iva só quando ligado', () => {
    expect(buildFaturacaoSettings({ ...base, precosComIva: true }).precos_com_iva).toBe(true);
    expect(buildFaturacaoSettings({ ...base, precosComIva: false })).not.toHaveProperty(
      'precos_com_iva'
    );
  });

  it('campos vazios não apagam predefinições partilháveis', () => {
    const s = buildFaturacaoSettings({ ...base, doctypes: { ...CAMPOS_POR_TIPO_VAZIOS } });
    expect(s).toEqual({ provider: 'keyinvoice' });
  });
});

describe('buildFaturacaoSettings: Primavera pelo serviço', () => {
  const primavera: FaturacaoFormFields = { ...base, provider: 'primavera' };

  it('grava os campos do serviço preenchidos', () => {
    const s = buildFaturacaoSettings({
      ...primavera,
      doctypes: { ...CAMPOS_POR_TIPO_VAZIOS },
      servicoUrl: ' https://primavera-teste.dasprent.pt ',
      ambiente: 'teste',
      empresa: ' dasprent ',
      metodoPagamento: 'mbway',
    });
    expect(s).toEqual({
      provider: 'primavera',
      servico_url: 'https://primavera-teste.dasprent.pt',
      ambiente: 'teste',
      empresa: 'dasprent',
      metodo_pagamento: 'mbway',
    });
  });

  it('nunca grava servico_url vazio, nem os restantes campos do serviço', () => {
    for (const servicoUrl of [undefined, '', '   ']) {
      const s = buildFaturacaoSettings({
        ...primavera,
        doctypes: { ...CAMPOS_POR_TIPO_VAZIOS },
        servicoUrl,
        ambiente: 'producao',
        empresa: 'dasprent',
        metodoPagamento: 'numerario',
      });
      expect(s).toEqual({ provider: 'primavera' });
    }
  });

  it('o ambiente por escolher não se grava (nunca há valor por omissão)', () => {
    const s = buildFaturacaoSettings({
      ...primavera,
      servicoUrl: 'https://primavera.dasprent.pt',
      ambiente: '',
    });
    expect(s).not.toHaveProperty('ambiente');
  });

  it('grava sempre a empresa em minúsculas', () => {
    const s = buildFaturacaoSettings({
      ...primavera,
      servicoUrl: 'https://primavera.dasprent.pt',
      ambiente: 'producao',
      empresa: ' DasPrent ',
    });
    expect(s.empresa).toBe('dasprent');
  });

  it('empresa vazia não se grava', () => {
    const s = buildFaturacaoSettings({
      ...primavera,
      servicoUrl: 'https://primavera.dasprent.pt',
      ambiente: 'producao',
      empresa: '  ',
    });
    expect(s).not.toHaveProperty('empresa');
    expect(s.ambiente).toBe('producao');
  });

  it('abrir e guardar sem alterações preserva o config gravado do serviço', () => {
    const gravado = {
      provider: 'primavera',
      servico_url: 'https://primavera.dasprent.pt',
      ambiente: 'producao' as const,
      empresa: 'decada',
      metodo_pagamento: 'multibanco' as const,
    };
    const reconstruido = buildFaturacaoSettings({
      provider: gravado.provider,
      endpoint: '',
      defaultProduct: '',
      defaultIdTax: '',
      doctypes: { ...CAMPOS_POR_TIPO_VAZIOS },
      docseries: { ...CAMPOS_POR_TIPO_VAZIOS },
      servicoUrl: gravado.servico_url,
      ambiente: gravado.ambiente,
      empresa: gravado.empresa,
      metodoPagamento: gravado.metodo_pagamento,
    });
    expect(reconstruido).toEqual(gravado);
  });
});

describe('integracaoPrimaveraAntiga', () => {
  it('sem servico_url é uma integração do agente antigo', () => {
    expect(integracaoPrimaveraAntiga({ config: { provider: 'primavera' } })).toBe(true);
    expect(integracaoPrimaveraAntiga({ config: null })).toBe(true);
    expect(integracaoPrimaveraAntiga({ config: { servico_url: '  ' } })).toBe(true);
  });

  it('com servico_url já é do serviço; integração nova não é antiga', () => {
    expect(integracaoPrimaveraAntiga({ config: { servico_url: 'https://x.pt' } })).toBe(false);
    expect(integracaoPrimaveraAntiga(null)).toBe(false);
  });
});

describe('empresa do serviço', () => {
  it('normaliza com trim e minúsculas', () => {
    expect(normalizarEmpresaServico('  DasPrent ')).toBe('dasprent');
  });

  it('aceita o que o servidor aceita: ^[a-z0-9-]{1,40}$ depois de normalizar', () => {
    const validas = [
      'dasprent',
      'decada',
      'distancia',
      'dasprentsul',
      ' DECADA ',
      'a-1',
      'x'.repeat(40),
    ];
    for (const e of validas) expect(empresaServicoValida(e)).toBe(true);
  });

  it('recusa vazio, símbolos, espaços no meio, acentos e mais de 40', () => {
    const invalidas = [
      '',
      '   ',
      'das prent',
      'dasprent/faturas',
      'década',
      'a_b',
      '../x',
      'x'.repeat(41),
    ];
    for (const e of invalidas) expect(empresaServicoValida(e)).toBe(false);
  });
});

describe('enderecoServicoValido', () => {
  it('aceita https e localhost em http', () => {
    expect(enderecoServicoValido('https://primavera-teste.dasprent.pt')).toBe(true);
    expect(enderecoServicoValido(' https://primavera.dasprent.pt/ ')).toBe(true);
    expect(enderecoServicoValido('http://localhost:8787')).toBe(true);
    expect(enderecoServicoValido('http://127.0.0.1:8787/api')).toBe(true);
  });

  it('recusa o resto', () => {
    for (const u of [
      '',
      'primavera.dasprent.pt',
      'http://primavera.dasprent.pt',
      'http://localhost.evil.com',
      'https://',
      'ftp://x.pt',
    ]) {
      expect(enderecoServicoValido(u)).toBe(false);
    }
  });
});

describe('validarServicoPrimavera', () => {
  const ok = {
    servicoUrl: 'https://primavera.dasprent.pt',
    ambiente: 'teste' as const,
    empresa: 'dasprent',
    apiKey: 'k',
  };

  it('tudo preenchido não dá erros', () => {
    expect(validarServicoPrimavera(ok)).toEqual({});
    expect(primeiroErroServico({})).toBeNull();
  });

  it('exige endereço, ambiente escolhido, empresa e chave', () => {
    const erros = validarServicoPrimavera({
      servicoUrl: '',
      ambiente: '',
      empresa: '  ',
      apiKey: '  ',
    });
    expect(erros.servicoUrl).toMatch(/endereço/i);
    expect(erros.ambiente).toMatch(/ambiente/i);
    expect(erros.empresa).toBe('Indique a empresa no serviço (ex.: dasprent).');
    expect(erros.chave).toMatch(/chave/i);
  });

  it('empresa inválida tem mensagem própria; maiúsculas normalizam e são válidas', () => {
    expect(validarServicoPrimavera({ ...ok, empresa: 'das prent' }).empresa).toBe(
      'Use só letras minúsculas, números e hífen (ex.: dasprent).'
    );
    expect(validarServicoPrimavera({ ...ok, empresa: ' DASPRENT ' })).toEqual({});
  });

  it('endereço sem https tem mensagem própria', () => {
    expect(
      validarServicoPrimavera({ ...ok, servicoUrl: 'http://primavera.dasprent.pt' }).servicoUrl
    ).toMatch(/https:\/\//);
  });

  it('a primeira mensagem segue a ordem do ecrã', () => {
    const erros = validarServicoPrimavera({
      servicoUrl: 'x',
      ambiente: '',
      empresa: '',
      apiKey: '',
    });
    expect(primeiroErroServico(erros)).toBe(erros.servicoUrl);
    expect(primeiroErroServico({ ambiente: 'a', empresa: 'e', chave: 'b' })).toBe('a');
    expect(primeiroErroServico({ empresa: 'e', chave: 'b' })).toBe('e');
  });
});

describe('camposPorTipo', () => {
  it('carrega o que está gravado e deixa vazio o que falta', () => {
    expect(camposPorTipo({ FT: '67', NC: '68' })).toEqual({ FT: '67', FR: '', NC: '68', RC: '' });
  });

  it('sem config dá tudo vazio', () => {
    expect(camposPorTipo(undefined)).toEqual(CAMPOS_POR_TIPO_VAZIOS);
  });

  // Regressão: guardar o diálogo reconstrói o config inteiro. Uma série gravada
  // por fora tem de sobreviver a abrir e guardar sem mexer em nada.
  it('abrir e guardar sem alterações preserva as séries gravadas', () => {
    const gravado = { provider: 'keyinvoice', doctypes: { FT: '4' }, docseries: { FT: '67' } };
    const reconstruido = buildFaturacaoSettings({
      provider: gravado.provider,
      endpoint: '',
      defaultProduct: '',
      defaultIdTax: '',
      doctypes: camposPorTipo(gravado.doctypes),
      docseries: camposPorTipo(gravado.docseries),
    });
    expect(reconstruido).toEqual(gravado);
  });
});
