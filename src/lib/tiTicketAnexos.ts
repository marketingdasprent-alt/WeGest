/**
 * Anexos do formulário público de tickets de TI. Espelha os limites e a
 * mesma lista de MIME de `supabase/functions/_shared/ti-tickets/anexos.ts`
 * (o servidor é quem manda; isto é só para dar o erro cedo, antes de
 * submeter, sem duplicar uma viagem ao servidor).
 */

export const TI_ANEXO_MAX_BYTES = 5 * 1024 * 1024; // 5 MB por ficheiro
export const TI_ANEXO_MAX_FICHEIROS = 3;

export const TI_ANEXO_MIME_PERMITIDOS: ReadonlySet<string> = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);

function validarFicheiro(file: File): string | null {
  if (!TI_ANEXO_MIME_PERMITIDOS.has(file.type)) {
    return `Tipo de ficheiro não suportado: ${file.name}.`;
  }
  if (file.size > TI_ANEXO_MAX_BYTES) {
    return `Ficheiro excede o limite de ${TI_ANEXO_MAX_BYTES / (1024 * 1024)} MB: ${file.name}.`;
  }
  return null;
}

/** Devolve a primeira mensagem de erro, ou `null` se a lista toda for válida. */
export function validarListaFicheiros(files: File[]): string | null {
  if (files.length > TI_ANEXO_MAX_FICHEIROS) {
    return `Só pode anexar até ${TI_ANEXO_MAX_FICHEIROS} ficheiros.`;
  }
  for (const file of files) {
    const erro = validarFicheiro(file);
    if (erro) return erro;
  }
  return null;
}

/** Lê o ficheiro e devolve só a parte em base64 (sem o prefixo `data:...,`). */
export function ficheiroParaBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const resultado = reader.result as string;
      const virgula = resultado.indexOf(',');
      resolve(virgula >= 0 ? resultado.slice(virgula + 1) : resultado);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Não foi possível ler o ficheiro.'));
    reader.readAsDataURL(file);
  });
}
