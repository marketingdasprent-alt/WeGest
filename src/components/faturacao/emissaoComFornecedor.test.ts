import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Os 7 ecrãs que emitem documentos novos não têm testes de componente; este teste
// apanha o esquecimento mais provável: emitir sem passar a integração escolhida.
const COM_DIALOGO = [
  'src/components/renting/contratos/ContratoFaturarDialog.tsx',
  'src/components/faturacao/NovaFaturaDialog.tsx',
  'src/components/faturacao/ReservaFaturarDialog.tsx',
  'src/components/renting/contratos/ProlongarContratoDialog.tsx',
];
const ACOES_DE_LINHA = [
  'src/components/renting/contratos/ContratoTabFaturar.tsx',
  'src/components/renting/reservas/tabs/ReservaTabFaturar.tsx',
  'src/components/administrativo/SlotMensalidadeCard.tsx',
];
const ler = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf-8');

describe('emissão com fornecedor escolhido', () => {
  it.each(COM_DIALOGO)('%s usa o seletor e envia integracao_id', (f) => {
    const src = ler(f);
    expect(src).toContain('useEscolhaFornecedor(');
    expect(src).toContain('<SeletorFornecedorFaturacao');
    expect(src).toMatch(/integracao_id:\s*escolha\.integracaoId/);
    expect(src).toMatch(/escolha\.bloqueiaConfirmar/);
  });

  it.each(ACOES_DE_LINHA)('%s pede o fornecedor e envia integracao_id', (f) => {
    const src = ler(f);
    expect(src).toContain('usePedirFornecedor(');
    expect(src).toMatch(/integracao_id:\s*escolhido\.integracaoId/);
    expect(src).toContain('{pedirFornecedor.dialogo}');
    expect(src).toMatch(/escolhido === 'cancelado'\)\s*return/);
  });

  // O diálogo pode ficar aberto minutos: a reconfirmação feita antes dele já não protege.
  it.each(ACOES_DE_LINHA.slice(0, 2))(
    '%s reconfirma documento_externo_ref depois do diálogo e antes de emitir',
    (f) => {
      const src = ler(f);
      const corpo = src.slice(src.indexOf('async function reemitirFatura('));
      const pedir = corpo.indexOf('pedirFornecedor.pedir(');
      const reconfirma = corpo.indexOf(".select('documento_externo_ref')");
      const emite = corpo.indexOf('emitirMut.mutateAsync(');
      expect(pedir).toBeGreaterThan(0);
      expect(reconfirma).toBeGreaterThan(pedir);
      expect(emite).toBeGreaterThan(reconfirma);
      expect(corpo.slice(0, emite).match(/documento_externo_ref'\)/g)).toHaveLength(1);
    }
  );

  it.each([...COM_DIALOGO, ...ACOES_DE_LINHA])(
    '%s envia integracao_id em cada emitirMut.mutateAsync',
    (f) => {
      const chamadas = ler(f).split('emitirMut.mutateAsync(').slice(1);
      expect(chamadas.length).toBeGreaterThan(0);
      for (const chamada of chamadas) {
        expect(chamada.split('cobrancaId:')[0]).toContain('integracao_id:');
      }
    }
  );
});
