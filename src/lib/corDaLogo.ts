// A cor da marca tirada do próprio logótipo.
//
// Pedir a alguém que escreva um hexadecimal é pedir-lhe uma coisa que ninguém
// tem à mão. O logótipo, esse, já está carregado — e é ele que define a cor da
// empresa. Isto lê-o e propõe a cor, deixando sempre a última palavra a quem
// está a configurar.
//
// O QUE CONTA COMO "A COR DA MARCA"
// Não é a cor mais frequente: quase todos os logótipos são maioritariamente
// transparentes, brancos ou pretos, e a cor mais repetida seria o fundo ou o
// contorno do texto. É a cor CROMÁTICA dominante — descartam-se os pixéis
// transparentes, os cinzentos e os extremos de claro/escuro, e entre o que
// resta pesa-se cada cor pela área que ocupa E pela sua saturação, para um
// azul vivo em pouca área ganhar a um bege lavado em muita.

/** Um pixel só entra na contagem acima desta opacidade. */
const ALFA_MINIMO = 128;

/** Abaixo desta saturação é cinzento, branco ou preto — não é a cor da marca. */
const SATURACAO_MINIMA = 0.18;

/** Fora deste intervalo de luminosidade está-se no branco ou no preto. */
const LUMINOSIDADE_MINIMA = 0.1;
const LUMINOSIDADE_MAXIMA = 0.92;

/** Quantos níveis por canal ao agrupar cores parecidas (16 → passos de 16). */
const NIVEIS = 16;

interface Hsl {
  s: number;
  l: number;
}

function saturacaoEluminosidade(r: number, g: number, b: number): Hsl {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { s, l };
}

function paraHex(r: number, g: number, b: number): string {
  const par = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${par(r)}${par(g)}${par(b)}`.toUpperCase();
}

/**
 * A cor cromática dominante de um bloco de pixéis RGBA.
 *
 * `null` quando o logótipo não tem cor nenhuma — um logótipo a preto e branco
 * não deve inventar uma cor de marca; quem chama decide o que fazer (no nosso
 * caso, fica a cor da WeGest).
 */
export function corDominanteDePixeis(dados: Uint8ClampedArray): string | null {
  const baldes = new Map<number, { soma: [number, number, number]; n: number; peso: number }>();

  for (let i = 0; i < dados.length; i += 4) {
    const [r, g, b, a] = [dados[i], dados[i + 1], dados[i + 2], dados[i + 3]];
    if (a < ALFA_MINIMO) continue;

    const { s, l } = saturacaoEluminosidade(r, g, b);
    if (s < SATURACAO_MINIMA) continue;
    if (l < LUMINOSIDADE_MINIMA || l > LUMINOSIDADE_MAXIMA) continue;

    const passo = 256 / NIVEIS;
    const chave =
      Math.floor(r / passo) * NIVEIS * NIVEIS +
      Math.floor(g / passo) * NIVEIS +
      Math.floor(b / passo);

    const balde = baldes.get(chave) ?? {
      soma: [0, 0, 0] as [number, number, number],
      n: 0,
      peso: 0,
    };
    balde.soma[0] += r;
    balde.soma[1] += g;
    balde.soma[2] += b;
    balde.n += 1;
    // A saturação entra como peso AO QUADRADO. Linear não chegava: um bege
    // lavado a cobrir metade do logótipo batia um vermelho vivo do símbolo,
    // e o bege não é a cor que ninguém associa àquela marca. Ao quadrado, a
    // vivacidade pesa mais do que a área — que é como o olho decide.
    balde.peso += s * s;
    baldes.set(chave, balde);
  }

  if (baldes.size === 0) return null;

  let melhor: { soma: [number, number, number]; n: number; peso: number } | null = null;
  for (const balde of baldes.values()) {
    if (!melhor || balde.peso > melhor.peso) melhor = balde;
  }
  if (!melhor) return null;

  // Média real dos pixéis do balde vencedor — o balde é grosseiro de
  // propósito (agrupa tons vizinhos), mas a cor devolvida é precisa.
  return paraHex(melhor.soma[0] / melhor.n, melhor.soma[1] / melhor.n, melhor.soma[2] / melhor.n);
}

/**
 * Carrega a imagem e devolve a sua cor dominante. Só funciona no browser.
 *
 * Devolve `null` — nunca lança — quando a imagem não carrega, quando o
 * servidor não permite ler os pixéis (canvas contaminado por falta de CORS) ou
 * quando o logótipo não tem cor. Isto corre num ecrã de configuração: falhar
 * significa "não sugiro nada", nunca "rebentar o formulário".
 */
export async function corDominanteDaImagem(url: string): Promise<string | null> {
  if (!url) return null;

  try {
    const imagem = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      // Sem isto o canvas fica contaminado e getImageData atira.
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('imagem não carregou'));
      img.src = url;
    });

    // Reduzir antes de ler: um logótipo grande são milhões de pixéis para uma
    // resposta que não muda. 64×64 chega e é instantâneo.
    const LADO = 64;
    const canvas = document.createElement('canvas');
    canvas.width = LADO;
    canvas.height = LADO;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(imagem, 0, 0, LADO, LADO);
    return corDominanteDePixeis(ctx.getImageData(0, 0, LADO, LADO).data);
  } catch {
    return null;
  }
}
