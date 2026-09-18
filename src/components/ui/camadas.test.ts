import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Tudo isto vive em portais irmãos no <body>: o que decide quem fica à frente
 * é só o z-index. Um menu com z inferior ao do diálogo abre na mesma — atrás
 * do véu — e para quem está a usar a aplicação parece que o botão está morto.
 * Foi exactamente o que aconteceu ao "Enviar" do resumo financeiro.
 */
function zIndexDe(ficheiro: string): number[] {
  const src = readFileSync(resolve(process.cwd(), 'src/components/ui', ficheiro), 'utf8');
  return [...src.matchAll(/(?:^|[\s'"`])z-(?:\[(\d+)\]|(\d+))/g)].map((m) =>
    Number(m[1] ?? m[2])
  );
}

const camadaDoDialogo = Math.max(...zIndexDe('dialog.tsx'));

describe('camadas — o que abre por cima de um diálogo', () => {
  it('o diálogo declara a sua camada, senão não há nada para comparar', () => {
    expect(camadaDoDialogo).toBeGreaterThan(0);
  });

  it.each(['dropdown-menu.tsx', 'select.tsx'])(
    '%s fica à frente do diálogo, não atrás',
    (ficheiro) => {
      const camadas = zIndexDe(ficheiro);
      expect(camadas.length).toBeGreaterThan(0);
      // Todas as camadas declaradas, não só a maior: o conteúdo do menu e o do
      // submenu têm de estar os dois à frente.
      for (const z of camadas) {
        expect(z).toBeGreaterThanOrEqual(camadaDoDialogo);
      }
    }
  );
});
