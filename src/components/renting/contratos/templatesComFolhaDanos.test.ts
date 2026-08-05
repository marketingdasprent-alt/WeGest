import { describe, it, expect } from 'vitest';
import type { DocumentTemplateRow } from '@/hooks/useDocumentTemplates';
import { templatesComFolhaDanos } from './templatesComFolhaDanos';

const tpl = (
  id: string,
  nome: string,
  tipo: string,
  cliente_empresa_id: string | null = null
): DocumentTemplateRow => ({ id, nome, tipo, cliente_empresa_id, empresa_id: null });

const EMPRESA = 'emp-1';
const OUTRA = 'emp-2';

const CONTRATOS = [
  tpl('t-alu', 'Contrato de Aluguer', 'contrato_aluguer', EMPRESA),
  tpl('t-pre', 'Contrato de Prestação', 'contrato_prestacao', EMPRESA),
];

describe('templatesComFolhaDanos', () => {
  it('junta a folha da org mesmo quando não está atribuída a empresa nenhuma', () => {
    // Caso "Premium Ride": cliente_empresa_id a NULL.
    const r = templatesComFolhaDanos(
      CONTRATOS,
      [tpl('t-fd', 'Folha de Danos', 'anexo_danos')],
      EMPRESA
    );
    expect(r.map((t) => t.id)).toContain('t-fd');
    expect(r).toHaveLength(3);
  });

  it('junta a folha mesmo quando pertence a OUTRO emissor da org', () => {
    // Caso "Década Ousada": 5 emissores, folha atribuída só a um. Antes, os
    // contratos dos outros 4 não mostravam folha nenhuma.
    const r = templatesComFolhaDanos(
      CONTRATOS,
      [tpl('t-fd', 'Folha de Danos - Década Ousada', 'anexo_danos', OUTRA)],
      EMPRESA
    );
    expect(r.map((t) => t.id)).toContain('t-fd');
  });

  it('com várias folhas, escolhe a da empresa seleccionada — e só essa', () => {
    const r = templatesComFolhaDanos(
      CONTRATOS,
      [
        tpl('t-fd-2', 'Folha de Danos - Empresa 2', 'anexo_danos', OUTRA),
        tpl('t-fd-1', 'Folha de Danos - Empresa 1', 'anexo_danos', EMPRESA),
      ],
      EMPRESA
    );
    const folhas = r.filter((t) => t.tipo === 'anexo_danos');
    expect(folhas).toHaveLength(1);
    expect(folhas[0].id).toBe('t-fd-1');
  });

  it('não duplica a folha quando ela já vinha na lista da empresa', () => {
    const folha = tpl('t-fd', 'Folha de Danos', 'anexo_danos', EMPRESA);
    const r = templatesComFolhaDanos([...CONTRATOS, folha], [folha], EMPRESA);
    expect(r.filter((t) => t.id === 't-fd')).toHaveLength(1);
    expect(r).toHaveLength(3);
  });

  it('sem folhas na org, devolve a lista da empresa intacta', () => {
    const r = templatesComFolhaDanos(CONTRATOS, [], EMPRESA);
    expect(r.map((t) => t.id)).toEqual(['t-alu', 't-pre']);
  });

  it('ordena por nome', () => {
    const r = templatesComFolhaDanos(
      CONTRATOS,
      [tpl('t-fd', 'Anexo de Danos', 'anexo_danos')],
      EMPRESA
    );
    expect(r.map((t) => t.nome)).toEqual([
      'Anexo de Danos',
      'Contrato de Aluguer',
      'Contrato de Prestação',
    ]);
  });
});
