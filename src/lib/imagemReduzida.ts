import { dimensoesReduzidas } from '@/utils/fotosViatura';

/**
 * Reduz uma imagem no browser e devolve-a em JPEG.
 *
 * `createImageBitmap` já respeita a orientação EXIF, por isso uma foto de
 * telemóvel ao alto não sai deitada. Lança se o browser não conseguir ler o
 * formato (ex.: HEIC fora do Safari) — quem chama decide o que fazer.
 */
export async function reduzirImagem(file: Blob, ladoMax: number, qualidade: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const { largura, altura } = dimensoesReduzidas(bitmap.width, bitmap.height, ladoMax);
    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Sem contexto 2D para reduzir a imagem');
    ctx.drawImage(bitmap, 0, 0, largura, altura);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Não foi possível gerar a imagem'))),
        'image/jpeg',
        qualidade
      )
    );
  } finally {
    bitmap.close();
  }
}
