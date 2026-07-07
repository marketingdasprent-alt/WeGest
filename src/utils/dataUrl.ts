/**
 * Converte um data URL (ex.: PNG de uma assinatura) num Blob, para upload
 * directo no Supabase Storage. Lança se o formato não for um data URL válido.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:(.+?);base64,(.*)$/.exec(dataUrl);
  if (!match) throw new Error('Data URL inválido');
  const mime = match[1];
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}
