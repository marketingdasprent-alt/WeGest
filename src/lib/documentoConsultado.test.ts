import { describe, expect, it } from 'vitest';
// Fonte única — o ficheiro é TS puro, sem APIs de Deno, por isso o Vitest importa-o.
import {
  type BdFaturas,
  type ConsultaFaturas,
  documentoDaConsulta,
  DocumentoNaoEncontradoError,
  type FaturaDoDocumento,
  faturaDoDocumento,
} from '../../supabase/functions/_shared/faturacao/documento';

type Linha = FaturaDoDocumento & { id: string; org_id: string; created_at: string };

const fatura = (id: string, org_id: string, integracao_id: string, created_at: string): Linha => ({
  id,
  org_id,
  integracao_id,
  contrato_id: `contrato-${id}`,
  cobranca_id: null,
  provider_doctype: 'FA',
  provider_docnum: '50',
  serie: '2026',
  created_at,
});

// Duas empresas da mesma org com o mesmo FA 2026/50, e uma terceira org também com ele.
const LINHAS: Linha[] = [
  fatura('fa-empresa-a', 'org-1', 'primavera-a', '2026-10-01T10:00:00Z'),
  fatura('fa-empresa-b', 'org-1', 'primavera-b', '2026-10-05T10:00:00Z'),
  fatura('fa-outra-org', 'org-2', 'primavera-x', '2026-10-09T10:00:00Z'),
];

/** BD falsa: aplica os filtros eq às linhas e regista-os para se ver o que foi pedido. */
function bdFalsa(linhas: Linha[]) {
  const filtros: Array<Array<[string, string]>> = [];
  const bd: BdFaturas = {
    from: () => ({
      select: () => {
        const meus: Array<[string, string]> = [];
        filtros.push(meus);
        let ordenar = false;
        const c: ConsultaFaturas = {
          eq(coluna, valor) {
            meus.push([coluna, valor]);
            return c;
          },
          order() {
            ordenar = true;
            return c;
          },
          limit: () => c,
          maybeSingle: async () => {
            let r = linhas.filter((l) => meus.every(([k, v]) => String(l[k as keyof Linha]) === v));
            if (ordenar) r = [...r].sort((a, b) => b.created_at.localeCompare(a.created_at));
            if (r.length > 1 && !ordenar) return { data: null, error: { message: 'PGRST116' } };
            return { data: r[0] ?? null, error: null };
          },
        };
        return c;
      },
    }),
  };
  return { bd, filtros };
}

describe('faturaDoDocumento', () => {
  it('com o id, devolve a fatura dessa empresa mesmo que outra tenha o mesmo número', async () => {
    const { bd, filtros } = bdFalsa(LINHAS);
    const f = await faturaDoDocumento(bd, 'org-1', {
      invoice_id: 'fa-empresa-a',
      provider_doctype: 'FA',
      provider_docnum: '50',
      serie: '2026',
    });
    expect(f?.integracao_id).toBe('primavera-a');
    expect(filtros[0]).toEqual([
      ['org_id', 'org-1'],
      ['id', 'fa-empresa-a'],
    ]);
  });

  it('o id de uma fatura de outra organização não é encontrado', async () => {
    const { bd } = bdFalsa(LINHAS);
    await expect(
      faturaDoDocumento(bd, 'org-1', { invoice_id: 'fa-outra-org' })
    ).rejects.toBeInstanceOf(DocumentoNaoEncontradoError);
  });

  it('sem id (cliente antigo) cai no número, sempre dentro da org', async () => {
    const { bd, filtros } = bdFalsa(LINHAS);
    const f = await faturaDoDocumento(bd, 'org-1', {
      provider_doctype: 'FA',
      provider_docnum: '50',
      serie: '2026',
    });
    // Comportamento antigo: a mais recente da org (aqui a da empresa B), nunca a da org-2.
    expect(f?.integracao_id).toBe('primavera-b');
    expect(filtros[0][0]).toEqual(['org_id', 'org-1']);
  });

  it('sem id nem número não há fatura', async () => {
    const { bd, filtros } = bdFalsa(LINHAS);
    expect(await faturaDoDocumento(bd, 'org-1', {})).toBeNull();
    expect(filtros).toHaveLength(0);
  });
});

describe('documentoDaConsulta', () => {
  it('usa o tipo, série e número da própria fatura', () => {
    expect(
      documentoDaConsulta(LINHAS[0], { provider_doctype: 'FT', provider_docnum: '7', serie: 'X' })
    ).toEqual({ provider_doctype: 'FA', provider_docnum: '50', serie: '2026' });
  });

  it('sem fatura (ou sem número nela) usa o que o chamador mandou', () => {
    const pedido = { provider_doctype: 'FT', provider_docnum: '7', serie: 'X' };
    expect(documentoDaConsulta(null, pedido)).toEqual(pedido);
    expect(documentoDaConsulta({ ...LINHAS[0], provider_docnum: null }, pedido)).toEqual(pedido);
  });

  it('campos em falta na fatura vêm do pedido', () => {
    expect(
      documentoDaConsulta(
        { ...LINHAS[0], serie: null, provider_doctype: null },
        { provider_doctype: 'FA', serie: '2026' }
      )
    ).toEqual({ provider_doctype: 'FA', provider_docnum: '50', serie: '2026' });
  });
});
