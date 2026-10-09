import { describe, it, expect } from 'vitest';
import {
  buildFaturacaoSettings,
  camposPorTipo,
  CAMPOS_POR_TIPO_VAZIOS,
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
