// Leitura da resposta de POST /documentos/vendas/inserir do AS Connect, feita
// pelo agente local. TS puro, sem Deno: testado em resposta.test.ts.
//
// A distinção que importa é entre "o Primavera recusou" (seguro voltar a
// tentar) e "não se sabe" (uma resposta sem forma, um 5xx, um corte de rede
// depois de o pedido sair). Na dúvida o documento pode existir: nunca se diz
// "falhou" quando pode ter sido criado, porque a fila reemitiria.

export interface RespostaDocumento {
  TipoDocGerado?: string;
  SerieDocGerado?: string;
  NumeroDocGerado?: string | number;
  IdDocGerado?: string;
  Documento?: string;
  Estado?: { Mensagem?: string };
}

export interface DocumentoEmitido {
  doctype: string;
  docnum: string;
  serie: string;
  numero: string;
  id_doc: string | null;
  raw: RespostaDocumento;
}

export type Leitura =
  | { tipo: 'ok'; documento: DocumentoEmitido }
  | { tipo: 'recusado'; mensagem: string }
  | { tipo: 'ambiguo'; mensagem: string };

const curto = (texto: string) => texto.slice(0, 300);

function mensagemDeSucesso(m: string | undefined): boolean {
  return !m || /^sucesso\.?$/i.test(m.trim());
}

export function lerRespostaInserir(status: number, texto: string, tipoPedido = 'FT'): Leitura {
  if (status >= 500) {
    return {
      tipo: 'ambiguo',
      mensagem: `inserir documento: o servidor respondeu HTTP ${status} (${curto(texto)}). O documento pode ter sido criado.`,
    };
  }
  if (status < 200 || status >= 300) {
    return {
      tipo: 'recusado',
      mensagem: `inserir documento falhou (HTTP ${status}): ${curto(texto)}`,
    };
  }

  let d: RespostaDocumento;
  try {
    d = JSON.parse(texto);
  } catch {
    return {
      tipo: 'ambiguo',
      mensagem: `inserir documento: resposta sem forma reconhecível (${curto(texto)}). O documento pode ter sido criado.`,
    };
  }

  const numero = d?.NumeroDocGerado;
  if (numero !== undefined && numero !== null && String(numero).trim() !== '') {
    const tipo = d.TipoDocGerado || tipoPedido;
    return {
      tipo: 'ok',
      documento: {
        doctype: tipo,
        docnum: String(numero),
        serie: String(d.SerieDocGerado ?? ''),
        numero: d.Documento || `${tipo} ${d.SerieDocGerado ?? ''}/${numero}`,
        id_doc: d.IdDocGerado ?? null,
        raw: d,
      },
    };
  }

  const mensagem = d?.Estado?.Mensagem;
  if (!mensagemDeSucesso(mensagem)) {
    return { tipo: 'recusado', mensagem: `Primavera recusou: ${mensagem}` };
  }
  return {
    tipo: 'ambiguo',
    mensagem: `inserir documento: resposta sem NumeroDocGerado (${curto(texto)}). O documento pode ter sido criado.`,
  };
}
