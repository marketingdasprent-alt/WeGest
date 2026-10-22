import { describe, it, expect } from 'vitest';
import { viaturaToFormValues, montarPayloadViatura, VIATURA_FK_FIELDS } from './viaturaFormValues';
import type { Viatura, ViaturaFormData } from './viaturaTabDados.types';

const viatura: Viatura = {
  id: 'v1',
  matricula: '16-UZ-35',
  marca: 'Renault',
  modelo: 'Megane',
  marca_id: 'marca-1',
  modelo_id: 'modelo-1',
  combustivel_id: 'comb-1',
  ano: 2015,
  cor: 'Cinza',
  categoria: null,
  combustivel: 'Diesel',
  status: 'em_uso',
  km_atual: 120000,
  grupo_id: 'grupo-1',
  is_slot: false,
  tipo_id: 'tipo-1',
  estacao_id: 'estacao-1',
};

describe('viaturaToFormValues', () => {
  it('preserva TODOS os FKs (a causa do bug: marca/modelo/grupo desapareciam)', () => {
    const v = viaturaToFormValues(viatura);
    expect(v.marca_id).toBe('marca-1');
    expect(v.modelo_id).toBe('modelo-1');
    expect(v.grupo_id).toBe('grupo-1');
    expect(v.combustivel_id).toBe('comb-1');
    expect(v.tipo_id).toBe('tipo-1');
    expect(v.estacao_id).toBe('estacao-1');
  });

  it('normaliza numéricos para string', () => {
    const v = viaturaToFormValues(viatura);
    expect(v.ano).toBe('2015');
    expect(v.km_atual).toBe('120000');
  });

  it('mantém o estado tal como está na BD (em_uso não vira disponivel)', () => {
    expect(viaturaToFormValues(viatura).status).toBe('em_uso');
    expect(viaturaToFormValues({ ...viatura, status: 'manutencao' }).status).toBe('manutencao');
    expect(viaturaToFormValues({ ...viatura, status: null }).status).toBe('disponivel');
  });

  it('trata nulos/indefinidos como strings vazias', () => {
    const v = viaturaToFormValues({
      id: 'v2',
      matricula: 'AA-00-AA',
      marca: '',
      modelo: '',
      marca_id: null,
      grupo_id: null,
      tipo_id: null,
    } as Viatura);
    expect(v.marca_id).toBe('');
    expect(v.grupo_id).toBe('');
    expect(v.ano).toBe('');
  });

  it('lista os campos FK reaplicados na hidratação', () => {
    expect(VIATURA_FK_FIELDS).toContain('marca_id');
    expect(VIATURA_FK_FIELDS).toContain('grupo_id');
    expect(VIATURA_FK_FIELDS).toHaveLength(6);
  });
});

describe('montarPayloadViatura — quando o estado vai no payload', () => {
  const nomes = { marcaNome: 'Renault', modeloNome: 'Megane', combustivelNome: 'Diesel' };
  const data: ViaturaFormData = { ...viaturaToFormValues(viatura), km_atual: '121000' };

  it('viatura existente sem mexer no estado: o payload não tem a chave status', () => {
    const payload = montarPayloadViatura(data, {
      ...nomes,
      isNew: false,
      statusAtual: 'em_uso',
      statusAlterado: false,
    });
    expect('status' in payload).toBe(false);
    expect(payload.km_atual).toBe(121000);
    expect(payload.matricula).toBe('16-UZ-35');
  });

  it('viatura existente com estado alterado no Select: grava o novo estado', () => {
    const payload = montarPayloadViatura(
      { ...data, status: 'inativo' },
      { ...nomes, isNew: false, statusAtual: 'disponivel', statusAlterado: true }
    );
    expect(payload.status).toBe('inativo');
  });

  it('Select tocado mas com o mesmo valor da BD: não reescreve o estado', () => {
    const payload = montarPayloadViatura(
      { ...data, status: 'disponivel' },
      { ...nomes, isNew: false, statusAtual: 'disponivel', statusAlterado: true }
    );
    expect('status' in payload).toBe(false);
  });

  it('viatura nova leva sempre estado, com disponivel por omissão', () => {
    expect(
      montarPayloadViatura(
        { ...data, status: '' },
        { ...nomes, isNew: true, statusAtual: null, statusAlterado: false }
      ).status
    ).toBe('disponivel');
    expect(
      montarPayloadViatura(
        { ...data, status: 'inativo' },
        { ...nomes, isNew: true, statusAtual: null, statusAlterado: true }
      ).status
    ).toBe('inativo');
  });

  it('usa os nomes resolvidos dos catálogos e normaliza vazios para null', () => {
    const payload = montarPayloadViatura(
      { ...data, cor: '', grupo_id: '' },
      { ...nomes, isNew: false, statusAtual: 'em_uso', statusAlterado: false }
    );
    expect(payload.marca).toBe('Renault');
    expect(payload.combustivel).toBe('Diesel');
    expect(payload.cor).toBeNull();
    expect(payload.grupo_id).toBeNull();
  });
});
