import { describe, it, expect } from 'vitest';
import {
  estadoDocumento,
  TIPOS_DOCUMENTO_MOTORISTA,
  type DocumentoMotoristaPortal,
} from './documentosMotorista';

const CARTA = TIPOS_DOCUMENTO_MOTORISTA.find((t) => t.value === 'carta_conducao')!;
const OUTROS = TIPOS_DOCUMENTO_MOTORISTA.find((t) => t.value === 'outros')!;

let n = 0;
function doc(over: Partial<DocumentoMotoristaPortal>): DocumentoMotoristaPortal {
  n += 1;
  return {
    id: `doc-${n}`,
    tipo_documento: 'carta_conducao',
    nome_ficheiro: `carta-${n}.pdf`,
    ficheiro_url: `uid/cartas/${n}.pdf`,
    data_validade: null,
    status: 'pendente',
    motivo_rejeicao: null,
    created_at: `2026-09-${String(n).padStart(2, '0')}T10:00:00Z`,
    ...over,
  };
}

describe('estadoDocumento', () => {
  it('sem nada: tudo a null', () => {
    expect(estadoDocumento(CARTA, null, [])).toEqual({
      oficial: null,
      pendente: null,
      rejeitado: null,
    });
  });

  it('a ficha ganha sempre — e traz a validade oficial', () => {
    const e = estadoDocumento(
      CARTA,
      { carta_ficheiro_url: 'gestor/cartas/1.pdf', carta_validade: '2028-01-01' },
      [doc({ status: 'aprovado', ficheiro_url: 'antigo.pdf' })]
    );
    expect(e.oficial).toEqual({
      ficheiro_url: 'gestor/cartas/1.pdf',
      nome_ficheiro: CARTA.label,
      validade: '2028-01-01',
    });
  });

  it('sem coluna na ficha, vale o último aprovado (tipos sem coluna e documentos antigos)', () => {
    const antigo = doc({
      status: 'aprovado',
      tipo_documento: 'outros',
      data_validade: '2027-05-05',
    });
    const recente = doc({ status: 'aprovado', tipo_documento: 'outros' });
    const e = estadoDocumento(OUTROS, {}, [antigo, recente]);
    expect(e.oficial?.ficheiro_url).toBe(recente.ficheiro_url);
    expect(e.oficial?.validade).toBeNull();
  });

  it('um pendente aparece ao lado do oficial, não o substitui', () => {
    // O gestor ainda não viu: a ficha continua a valer até ele aprovar.
    const pend = doc({ status: 'pendente' });
    const e = estadoDocumento(CARTA, { carta_ficheiro_url: 'oficial.pdf' }, [pend]);
    expect(e.oficial?.ficheiro_url).toBe('oficial.pdf');
    expect(e.pendente?.id).toBe(pend.id);
    expect(e.rejeitado).toBeNull();
  });

  it('rejeitado só conta se for o último envio e não houver outro pendente', () => {
    const rejeitado = doc({ status: 'rejeitado', motivo_rejeicao: 'Ilegível' });
    expect(estadoDocumento(CARTA, null, [rejeitado]).rejeitado?.motivo_rejeicao).toBe('Ilegível');

    // Voltou a enviar depois da recusa: o aviso de recusa sai, fica "em aprovação".
    const novo = doc({ status: 'pendente' });
    const e = estadoDocumento(CARTA, null, [rejeitado, novo]);
    expect(e.rejeitado).toBeNull();
    expect(e.pendente?.id).toBe(novo.id);
  });

  it('um rejeitado antigo, seguido de um aprovado, não volta a aparecer', () => {
    const rejeitado = doc({ status: 'rejeitado' });
    const aprovado = doc({ status: 'aprovado' });
    const e = estadoDocumento(CARTA, null, [rejeitado, aprovado]);
    expect(e.rejeitado).toBeNull();
    expect(e.oficial?.ficheiro_url).toBe(aprovado.ficheiro_url);
  });

  it('ignora documentos de outros tipos', () => {
    const e = estadoDocumento(CARTA, null, [doc({ tipo_documento: 'licenca_tvde' })]);
    expect(e).toEqual({ oficial: null, pendente: null, rejeitado: null });
  });

  it('os tipos com coluna oficial batem certo com as colunas da ficha', () => {
    // Se alguém mudar um `field`, a RPC de aprovação (que tem o mesmo mapa em
    // SQL) deixa de copiar para a coluna certa — este teste é o lembrete.
    const comColuna = TIPOS_DOCUMENTO_MOTORISTA.filter((t) => t.field).map((t) => t.field);
    expect(comColuna).toEqual([
      'documento_ficheiro_url',
      'documento_identificacao_verso_url',
      'carta_ficheiro_url',
      'carta_conducao_verso_url',
      'licenca_tvde_ficheiro_url',
      'registo_criminal_url',
      'comprovativo_morada_url',
      'comprovativo_iban_url',
    ]);
  });
});
