import { describe, it, expect } from 'vitest';
import {
  TI_ANEXO_MAX_BYTES,
  TI_ANEXO_MAX_FICHEIROS,
  validarListaFicheiros,
  ficheiroParaBase64,
} from './tiTicketAnexos';

function ficheiro(nome: string, tipo: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], nome, { type: tipo });
}

describe('validarListaFicheiros', () => {
  it('lista vazia é válida', () => {
    expect(validarListaFicheiros([])).toBeNull();
  });

  it('aceita ficheiros dentro do limite', () => {
    const files = [ficheiro('a.png', 'image/png', 100), ficheiro('b.pdf', 'application/pdf', 200)];
    expect(validarListaFicheiros(files)).toBeNull();
  });

  it(`rejeita mais de ${TI_ANEXO_MAX_FICHEIROS} ficheiros`, () => {
    const files = Array.from({ length: TI_ANEXO_MAX_FICHEIROS + 1 }, (_, i) =>
      ficheiro(`f${i}.png`, 'image/png', 10)
    );
    expect(validarListaFicheiros(files)).not.toBeNull();
  });

  it('rejeita tipo de ficheiro não suportado', () => {
    const files = [ficheiro('a.exe', 'application/x-msdownload', 10)];
    expect(validarListaFicheiros(files)).toContain('a.exe');
  });

  it('rejeita ficheiro acima do limite de tamanho', () => {
    const files = [ficheiro('grande.png', 'image/png', TI_ANEXO_MAX_BYTES + 1)];
    expect(validarListaFicheiros(files)).toContain('grande.png');
  });

  it('aceita ficheiro exactamente no limite de tamanho', () => {
    const files = [ficheiro('no-limite.png', 'image/png', TI_ANEXO_MAX_BYTES)];
    expect(validarListaFicheiros(files)).toBeNull();
  });
});

describe('ficheiroParaBase64', () => {
  it('converte o conteúdo do ficheiro para base64, sem o prefixo data:', async () => {
    const conteudo = new TextEncoder().encode('olá');
    const file = new File([conteudo], 'ola.txt', { type: 'text/plain' });

    const base64 = await ficheiroParaBase64(file);

    expect(base64).not.toContain('data:');
    expect(base64).not.toContain(',');
    const decodido = atob(base64);
    const bytes = Uint8Array.from(decodido, (c) => c.charCodeAt(0));
    expect(new TextDecoder().decode(bytes)).toBe('olá');
  });
});
