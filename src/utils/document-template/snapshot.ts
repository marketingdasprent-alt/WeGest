import type jsPDF from 'jspdf';

import { generateDocumentFromTemplate } from './generate-document';
import type { AnexoDanos, DocumentTemplate, GenerateDocumentParams } from './types';

/**
 * Papéis que assinam pelo link. A assinatura destes nasce no momento em que a
 * pessoa assina — nunca vem de trás, senão o documento sairia com uma
 * assinatura que ela não fez.
 *
 * O colaborador e o responsável ficam de fora desta lista de propósito: essas
 * assinaturas fazem parte do documento tal como foi enviado.
 */
const PAPEIS_QUE_ASSINAM_PELO_LINK = ['cliente', 'condutor', 'motorista'] as const;

export interface DocumentoSnapshot {
  versao: 1;
  /** Fixa a data dentro do PDF, para o mesmo documento dar sempre os mesmos bytes. */
  criadoEm: string;
  template: DocumentTemplate;
  motoristaData: Record<string, unknown>;
  documentData: Record<string, unknown>;
  anexoDanos?: AnexoDanos;
  headerLogoUrl?: string;
  footerText?: string;
  skipFooter?: boolean;
}

/**
 * Congela tudo o que produziu um documento, para ele poder nascer outra vez
 * exactamente igual mais tarde.
 *
 * Passa por JSON de propósito, e não por uma cópia em memória: a fotografia vai
 * ser guardada como ficheiro JSON e lida de volta noutro browser. Congelar já
 * na forma em que vai ser guardada garante que o que é testado é o que vai
 * mesmo acontecer — uma data que aqui fosse `Date` e lá chegasse texto podia
 * produzir um documento diferente sem ninguém dar por isso.
 */
export function capturarSnapshot(
  params: GenerateDocumentParams,
  template: DocumentTemplate,
  criadoEm: string
): DocumentoSnapshot {
  const documentData: Record<string, unknown> = { ...(params.documentData ?? {}) };
  for (const papel of PAPEIS_QUE_ASSINAM_PELO_LINK) {
    delete documentData[`assinatura_${papel}`];
  }

  const snapshot: DocumentoSnapshot = {
    versao: 1,
    criadoEm,
    template,
    motoristaData: params.motoristaData ?? {},
    documentData,
    anexoDanos: params.anexoDanos,
    headerLogoUrl: params.headerLogoUrl,
    footerText: params.footerText,
    skipFooter: params.skipFooter,
  };

  return JSON.parse(JSON.stringify(snapshot)) as DocumentoSnapshot;
}

/**
 * Identificador do ficheiro PDF, derivado da fotografia.
 *
 * O jsPDF gera este campo ao acaso, e por causa dele o mesmo documento gerado
 * duas vezes dava ficheiros diferentes. Derivá-lo da fotografia mantém-no
 * estável entre gerações — e mantém-no igual entre o documento enviado e o
 * documento assinado, que são duas versões do mesmo documento.
 *
 * FNV-1a repetido com sementes diferentes até encher os 32 dígitos hexadecimais
 * que o formato exige. Não é criptografia: só precisa de ser determinístico.
 */
function idDeterministico(texto: string): string {
  let saida = '';
  for (let semente = 0; saida.length < 32; semente++) {
    let hash = 0x811c9dc5 ^ semente;
    for (let i = 0; i < texto.length; i++) {
      hash ^= texto.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    saida += (hash >>> 0).toString(16).padStart(8, '0');
  }
  return saida.slice(0, 32).toUpperCase();
}

/**
 * Os dados com que o documento vai ser desenhado: os da fotografia, mais as
 * assinaturas que chegaram no momento de assinar.
 *
 * Está à parte para poder ser verificado sem desenhar o PDF. O desenho da
 * imagem em si é do jsPDF e não se consegue afirmar em testes: o carregamento
 * passa por `new Image()` e o `onload` nunca dispara fora de um browser a
 * sério.
 */
export function dadosParaGerar(
  snapshot: DocumentoSnapshot,
  assinaturas: Record<string, string> = {}
): Record<string, unknown> {
  return { ...snapshot.documentData, ...assinaturas };
}

/**
 * Produz o documento a partir da fotografia, com as assinaturas que existirem.
 *
 * Nunca vai à base de dados: o template viaja dentro da fotografia. É isso que
 * garante que o documento assinado é o mesmo que foi enviado, mesmo que o
 * contrato tenha mudado ou o template tenha sido editado no entretanto.
 */
export async function gerarDeSnapshot(
  snapshot: DocumentoSnapshot,
  assinaturas: Record<string, string> = {}
): Promise<jsPDF> {
  const pdf = await generateDocumentFromTemplate({
    templateId: snapshot.template.id,
    templateOverride: snapshot.template,
    motoristaData: snapshot.motoristaData as Record<string, any>,
    documentData: dadosParaGerar(snapshot, assinaturas),
    anexoDanos: snapshot.anexoDanos,
    headerLogoUrl: snapshot.headerLogoUrl,
    footerText: snapshot.footerText,
    skipFooter: snapshot.skipFooter,
    skipOutput: true,
  });

  // Sem estas duas linhas o mesmo documento dá bytes diferentes a cada geração
  // — a data porque o jsPDF carimba a hora de agora, e o identificador porque o
  // gera ao acaso. Sem elas seria impossível provar que o documento assinado é
  // o que foi enviado.
  pdf.setCreationDate(new Date(snapshot.criadoEm));
  pdf.setFileId(idDeterministico(JSON.stringify(snapshot)));

  return pdf;
}
