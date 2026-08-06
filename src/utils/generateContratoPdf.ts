import type jsPDF from 'jspdf';
import { supabase } from '@/integrations/supabase/client';
import { empresaDocData, empresaFooterText, type EmpresaConfig } from '@/config/empresas';
import { resolveCartaoFrota } from './document-template/resolveCartaoFrota';
import { precisaEletrico } from './combustivel';

import {
  generateDocumentosCombinados,
  type DocumentoCombinado,
} from './generateDocumentFromTemplate';

import type { ContratoRenting } from '@/types/contratoRenting';
import type { ClienteComDocumentos } from '@/types/cliente';
import type { Motorista } from '@/types/motorista';
import type { ViaturaBasic } from '@/hooks/useViaturas';

export interface CondutorPrincipal {
  cliente_id: string | null;
  motorista_id: string | null;
}

export interface GenerateContratoPdfParams {
  contrato: ContratoRenting;
  /** Condutor principal — usado para preencher o "PRIMEIRO OUTORGANTE" no template. */
  condutorPrincipal: CondutorPrincipal | null;
  clientes: ClienteComDocumentos[];
  motoristas: Motorista[];
  /** Viatura do contrato — fornece marca/modelo/kms para os placeholders {{viatura_*}}. */
  viatura?: ViaturaBasic | null;
  /** Empresa actual — fornece dados para os placeholders {{empresa_*}}. */
  empresa: EmpresaConfig | null;
  /** 'email' gera o PDF sem imprimir/descarregar — quem chama trata do envio. */
  action?: 'print' | 'download' | 'email';
  /** IDs de templates a gerar (ordenados), escolhidos no dialog "Gerar
   *  Documentos". Quando dado, gera exactamente estes; senão, decide pelo
   *  regime (rent_a_car → aluguer; tvde → prestação + aluguer). */
  templateIds?: string[];
  /** Cidade de assinatura escolhida no dialog (normalmente a cidade de uma
   *  estação). Manda sobre o fallback (sede da empresa / cidade do motorista). */
  cidadeAssinatura?: string;
  /**
   * Um PDF por documento em vez de um só combinado.
   *
   * Para imprimir/descarregar um único PDF é o que faz sentido (folheia-se de
   * uma ponta à outra). Por email não: quem recebe quer o Contrato, a
   * Declaração e o Termo como ficheiros distintos, para assinar e arquivar
   * cada um por si — não uma pilha de 12 páginas onde tem de os separar.
   */
  separados?: boolean;
}

/** Um PDF combinado, ou vários (um por documento) quando `separados`. */
export type ContratoPdfResultado =
  | { pdf: jsPDF; fileName: string }
  | { anexos: Array<{ pdf: jsPDF; fileName: string }> };

/** Nome de ficheiro seguro a partir do nome do template. */
function nomeFicheiro(nomeTemplate: string, codigo: number | null | undefined): string {
  const base = `${nomeTemplate}_${codigo ?? ''}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base || 'Documento';
}

/**
 * Mapeia os dados do contrato + condutor principal para o formato
 * esperado por `generateDocumentFromTemplate`, que usa placeholders
 * centrados no motorista TVDE. Em rent-a-car, o cliente toma o lugar
 * do motorista no template.
 */
export const generateContratoPdf = async ({
  contrato,
  condutorPrincipal,
  clientes,
  motoristas,
  viatura,
  empresa,
  action = 'print',
  templateIds,
  cidadeAssinatura,
  separados = false,
}: GenerateContratoPdfParams): Promise<ContratoPdfResultado | null> => {
  if (!empresa) {
    throw new Error('Empresa não definida — impossível gerar contrato.');
  }

  // 1) Escolher os templates para esta empresa, conforme o `regime`:
  //      - rent_a_car → só o Contrato de Aluguer
  //      - tvde       → Contrato de Prestação + Contrato de Aluguer (1 PDF,
  //        folha branca a separar). O motorista presta serviço sob a licença
  //        da empresa (prestação) E aluga a viatura (aluguer).
  const [{ data: templatesEmpresa, error: templatesErr }, { data: folhasOrg, error: folhasErr }] =
    await Promise.all([
      supabase
        .from('document_templates')
        .select('id, nome, tipo, cliente_empresa_id')
        .eq('ativo', true)
        .eq('cliente_empresa_id', empresa.id)
        .order('nome', { ascending: true }),
      // A Folha de Danos é um anexo da VIATURA e vive ao nível da org, não da
      // empresa emissora — tem de entrar aqui pela mesma regra do diálogo
      // "Gerar Documentos". Sem isto, escolhê-la dava "Nenhum documento
      // seleccionado para gerar": o id vinha do diálogo mas não existia nesta
      // lista, e ficava pelo caminho no `.map()` mais abaixo.
      supabase
        .from('document_templates')
        .select('id, nome, tipo, cliente_empresa_id')
        .eq('ativo', true)
        .eq('tipo', 'anexo_danos')
        .eq('org_id', contrato.org_id)
        .order('nome', { ascending: true }),
    ]);

  if (templatesErr) throw templatesErr;
  if (folhasErr) throw folhasErr;

  const daEmpresa = templatesEmpresa ?? [];
  const templates = [
    ...daEmpresa,
    ...(folhasOrg ?? []).filter((f) => !daEmpresa.some((t) => t.id === f.id)),
  ];

  const porPrefixo = (prefixo: string) =>
    (templates ?? []).find((t) => t.nome.toLowerCase().startsWith(prefixo.toLowerCase()));
  const porTipo = (tipo: string) => (templates ?? []).find((t) => t.tipo === tipo);

  const regimeAluguer = contrato.regime === 'rent_a_car';
  const aluguerTemplate =
    porTipo('contrato_aluguer') ?? porPrefixo('Contrato Aluguer') ?? porPrefixo('Contrato Rent');
  const prestacaoTemplate =
    porTipo('contrato_prestacao') ??
    porPrefixo('Contrato Prestação') ??
    porPrefixo('Contrato Prestacao');

  // No modo automático (sem escolha manual) o Aluguer é obrigatório.
  if (!templateIds?.length) {
    if (!aluguerTemplate) {
      throw new Error(
        `Sem template de "Contrato Aluguer" activo para a empresa "${empresa.nome}". ` +
          `Cria um chamado "Contrato Aluguer - ${empresa.nome}" em Configurações do Sistema → Documentos.`
      );
    }
    if (!regimeAluguer && !prestacaoTemplate) {
      console.warn(
        'Regime TVDE sem template de "Contrato Prestação" — imprime só o Contrato de Aluguer.'
      );
    }
  }

  // 2a) Cliente do contrato (locatário) — é SEMPRE o contrato.cliente_id,
  //     independentemente de quem é o condutor principal. Alimenta os
  //     placeholders {{cliente_*}}.
  //     Se o cliente não vier na lista (race condition na UI), vai-se buscar
  //     directamente à BD — para garantir que {{cliente_*}} resolve sempre.
  let clienteContrato: ClienteComDocumentos | null = contrato.cliente_id
    ? (clientes.find((c) => c.id === contrato.cliente_id) ?? null)
    : null;

  if (!clienteContrato && contrato.cliente_id) {
    try {
      const { data: clienteRow } = await supabase
        .from('clientes')
        .select('*')
        .eq('id', contrato.cliente_id)
        .maybeSingle();
      if (clienteRow) {
        clienteContrato = {
          ...(clienteRow as unknown as ClienteComDocumentos),
          documentoIdentificacao: null,
          cartaConducao: null,
          ligacaoDocumento: null,
          ligacaoCarta: null,
        };
      }
    } catch (err) {
      console.warn('Falha a obter cliente do contrato directamente da BD:', err);
    }
  }

  if (contrato.cliente_id && !clienteContrato) {
    console.warn(
      `[generateContratoPdf] contrato.cliente_id=${contrato.cliente_id} não foi encontrado — {{cliente_*}} ficarão vazios.`
    );
  } else if (!contrato.cliente_id) {
    console.warn(
      '[generateContratoPdf] Contrato sem cliente_id — {{cliente_*}} ficarão vazios. Define o cliente do contrato.'
    );
  } else if (clienteContrato) {
    console.info(
      `[generateContratoPdf] {{cliente_*}} usa "${clienteContrato.nome}" (id=${clienteContrato.id})`
    );
  }

  // 2b) Resolver o condutor principal para preencher o "motorista" no template.
  //     TVDE: motorista directo. Rent-a-car: cliente mapeado para motorista_*.
  const cli = condutorPrincipal?.cliente_id
    ? (clientes.find((c) => c.id === condutorPrincipal.cliente_id) ?? null)
    : null;
  let mo = condutorPrincipal?.motorista_id
    ? (motoristas.find((m) => m.id === condutorPrincipal.motorista_id) ?? null)
    : null;

  // 2c) Procurar QUALQUER motorista entre os condutores do contrato (não só o
  //     principal). Se houver, prefere-se sempre esse para {{motorista_*}} —
  //     evita que rent-a-car com cliente como condutor principal mas com um
  //     motorista também registado nos condutores não pinte o motorista.
  if (!mo) {
    try {
      const { data: condutoresAll } = await (supabase as any)
        .from('contratos_condutores')
        .select('motorista_id, is_principal')
        .eq('contrato_id', contrato.id)
        .not('motorista_id', 'is', null)
        .order('is_principal', { ascending: false });

      const motoristaId = (condutoresAll ?? [])[0]?.motorista_id ?? null;
      if (motoristaId) {
        const moInLista = motoristas.find((m) => m.id === motoristaId) ?? null;
        if (moInLista) {
          mo = moInLista;
        } else {
          const { data: moRow } = await supabase
            .from('motoristas')
            .select('*')
            .eq('id', motoristaId)
            .maybeSingle();
          if (moRow) mo = moRow as unknown as Motorista;
        }
      }
    } catch (err) {
      console.warn('Falha a obter motoristas do contrato:', err);
    }
  }

  if (mo) {
    console.info(`[generateContratoPdf] {{motorista_*}} usa "${mo.nome}" (id=${mo.id})`);
  } else if (cli) {
    console.info(
      `[generateContratoPdf] {{motorista_*}} usa cliente "${cli.nome}" (sem motorista nos condutores — rent-a-car).`
    );
  } else {
    console.warn(
      '[generateContratoPdf] {{motorista_*}} sem fonte — nem motorista nem cliente nos condutores.'
    );
  }

  const motoristaData: Record<string, unknown> = mo
    ? {
        nome: mo.nome,
        nif: mo.nif ?? '',
        documento_tipo: mo.documento_tipo ?? '',
        documento_numero: mo.documento_numero ?? '',
        documento_validade: mo.documento_validade ?? '',
        carta_conducao: mo.carta_conducao ?? '',
        carta_categorias: mo.carta_categorias?.join(', ') ?? '',
        carta_validade: mo.carta_validade ?? '',
        licenca_tvde_numero: mo.licenca_tvde_numero ?? '',
        licenca_tvde_validade: mo.licenca_tvde_validade ?? '',
        morada: mo.morada ?? '',
        email: mo.email ?? '',
        telefone: mo.telefone ?? '',
        cidade: mo.cidade ?? '',
        iban: mo.iban ?? '',
      }
    : cli
      ? {
          nome: cli.nome,
          nif: cli.nif ?? '',
          documento_tipo: cli.documentoIdentificacao?.tipo ?? '',
          documento_numero: cli.documentoIdentificacao?.numero ?? '',
          documento_validade: cli.documentoIdentificacao?.validade ?? '',
          carta_conducao: cli.cartaConducao?.numero ?? '',
          carta_categorias: '',
          carta_validade: cli.cartaConducao?.validade ?? '',
          licenca_tvde_numero: '',
          licenca_tvde_validade: '',
          morada: cli.morada ?? '',
          email: cli.email ?? '',
          telefone: cli.telefone ?? '',
          cidade: cli.cidade ?? '',
          iban: cli.iban ?? '',
        }
      : { nome: '—', nif: '', morada: '', email: '', telefone: '' };

  // 3) Duração em meses (placeholder {{duracao_meses}}). Arredonda para cima.
  // TVDE não tem data_fim (contrato aberto, renovação automática) — usa o
  // intervalo de renovação (normalmente 30 dias) como base do cálculo.
  const msDia = 86400000;
  const diasContrato = contrato.data_fim
    ? Math.max(
        1,
        Math.ceil(
          (new Date(contrato.data_fim).getTime() - new Date(contrato.data_inicio).getTime()) / msDia
        )
      )
    : Math.max(1, contrato.renovacao_intervalo_dias ?? 30);
  const duracaoMeses = Math.max(1, Math.round(diasContrato / 30));

  // Colaborador que gera o contrato — placeholders {{colaborador_nome}} e
  // {{assinatura_colaborador}} (assinatura pela empresa). Vêm do perfil do
  // utilizador autenticado. A assinatura é um data URL PNG; o motor de PDF
  // desenha-a na célula "O Colaborador". Sem assinatura, fica em branco.
  let colaboradorNome = '';
  let colaboradorAssinatura = '';
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (auth.user) {
      const { data: perfil } = await supabase
        .from('profiles')
        .select('nome, assinatura_url')
        .eq('id', auth.user.id)
        .maybeSingle();
      colaboradorNome = (perfil as { nome?: string } | null)?.nome ?? '';
      colaboradorAssinatura =
        (perfil as { assinatura_url?: string | null } | null)?.assinatura_url ?? '';
    }
  } catch {
    /* segue sem nome/assinatura do colaborador */
  }

  // 3b) Resolver nomes das estações de levantamento/devolução (placeholders
  //     {{local_entrega}}/{{local_recolha}}). São UUIDs no contrato.
  const estacaoIds = [contrato.estacao_entrega_id, contrato.estacao_recolha_id].filter(
    (id): id is string => !!id
  );
  const estacaoNome = new Map<string, string>();
  if (estacaoIds.length) {
    const { data: estacoes } = await supabase
      .from('estacoes')
      .select('id, nome')
      .in('id', estacaoIds);
    (estacoes ?? []).forEach((e) => estacaoNome.set(e.id, e.nome));
  }
  const localEntrega = contrato.estacao_entrega_id
    ? (estacaoNome.get(contrato.estacao_entrega_id) ?? '—')
    : '—';
  const localRecolha = contrato.estacao_recolha_id
    ? (estacaoNome.get(contrato.estacao_recolha_id) ?? '—')
    : '—';

  // 4) Dados do contrato (placeholders {{data_inicio}}, {{viatura_*}}, etc.)
  const today = new Date().toISOString().split('T')[0];
  const eur = (n: number | null | undefined) =>
    n != null && !Number.isNaN(Number(n)) ? `${Number(n).toFixed(2)} €` : '—';
  const num = (n: number | null | undefined) =>
    n != null && !Number.isNaN(Number(n)) ? String(n) : '—';

  // Cartão de combustível do motorista (placeholders {{cartao_frota_*}}).
  const cartaoFrota = await resolveCartaoFrota(mo?.id ?? null);

  const documentData = {
    data_inicio: contrato.data_inicio,
    data_fim: contrato.data_fim,
    data_assinatura: today,
    cidade_assinatura:
      cidadeAssinatura || empresa.sede || (motoristaData.cidade as string) || 'Leiria',
    duracao_meses: duracaoMeses,
    dias: String(diasContrato),
    numero_contrato: contrato.codigo != null ? String(contrato.codigo) : '',
    colaborador_nome: colaboradorNome,
    // Data URL PNG da assinatura (vazio = sem assinatura → linha em branco).
    // Só o template de Aluguer tem a sentinela {{assinatura_colaborador}}.
    assinatura_colaborador: colaboradorAssinatura,
    // Viatura
    viatura_matricula: contrato.matricula ?? viatura?.matricula ?? '—',
    viatura_data_matricula: viatura?.data_matricula ?? '',
    viatura_marca_modelo: viatura ? `${viatura.marca} ${viatura.modelo}`.trim() : '—',
    viatura_grupo: contrato.grupo ?? '—',
    viatura_kms: num(viatura?.km_atual),
    // Nível de combustível/bateria com que a viatura foi entregue ao
    // motorista. Elétricas/híbridas mostram a bateria; as restantes, o
    // combustível — só um dos dois costuma estar preenchido.
    viatura_combustivel_saida: precisaEletrico(viatura?.combustivel)
      ? (contrato.eletricidade_saida ?? '—')
      : (contrato.combustivel_saida ?? '—'),
    local_entrega: localEntrega,
    local_recolha: localRecolha,
    // Financeiro (já formatado; total_final só existe após facturar)
    tarifa_diaria: eur(contrato.tarifa_diaria),
    franquia: eur(contrato.franquia_valor),
    caucao: eur(contrato.caucao_valor),
    kms_incluidos: num(contrato.kms_incluidos),
    km_adicional: eur(contrato.km_adicional_valor),
    subtotal: eur(contrato.total_subtotal),
    iva: eur(contrato.total_iva),
    total: contrato.total_final != null ? eur(contrato.total_final) : 'A facturar',
    observacoes: contrato.observacoes ?? '',
    cartao_frota_marca: cartaoFrota.marca,
    cartao_frota_numero: cartaoFrota.numero,
    cartao_frota_validade: cartaoFrota.validade,
    cartao_frota_limite: cartaoFrota.limite,
    empresaData: empresaDocData(empresa),
    // Cliente do contrato (locatário) — alimenta os placeholders {{cliente_*}}.
    // É sempre o contrato.cliente_id, NÃO o condutor principal. Em TVDE, o
    // locatário pode ser uma empresa cliente; o motorista (condutor) é outra
    // pessoa e resolve em {{motorista_*}}.
    clienteData: clienteContrato
      ? {
          nome: clienteContrato.nome ?? '',
          nif: clienteContrato.nif ?? '',
          email: clienteContrato.email ?? '',
          telefone: clienteContrato.telefone ?? '',
          morada: clienteContrato.morada ?? '',
          codigo_postal: clienteContrato.codigo_postal ?? '',
          cidade: clienteContrato.cidade ?? '',
          data_nascimento: clienteContrato.data_nascimento ?? '',
          nome_comercial: clienteContrato.nome_comercial ?? '',
          sede: clienteContrato.sede ?? '',
          representante: clienteContrato.representante ?? '',
          cargo_representante: clienteContrato.cargo_representante ?? '',
        }
      : undefined,
  };

  // 5) Anexar fotos de check-in/check-out em folhas extra (grelha 2×3).
  //    Vivem em contrato_media (bucket "contrato-media"), ligadas ao contrato
  //    de renting. Só se anexam as que existirem nesse momento.
  let anexoFotos: Array<{ titulo: string; urls: string[] }> | undefined;
  try {
    const { data: media } = await supabase
      .from('contrato_media')
      .select('tipo, url, created_at, nome_ficheiro, tamanho_bytes')
      .eq('contrato_renting_id', contrato.id)
      .in('tipo', ['checkin', 'checkout'])
      .order('created_at', { ascending: true });

    // Deduplicar: re-envios do MESMO ficheiro (mesmo nome + tamanho) criam
    // linhas com paths diferentes. Mostra-se cada ficheiro uma só vez — nunca
    // se "enche" a grelha; anexa-se só o que existe.
    const vistos = new Set<string>();
    const mediaUnica = (media ?? []).filter((m) => {
      const chave = `${m.tipo}|${m.nome_ficheiro ?? m.url}|${m.tamanho_bytes ?? ''}`;
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });

    const paths = mediaUnica.map((m) => m.url);
    if (paths.length) {
      const { data: signed } = await supabase.storage
        .from('contrato-media')
        .createSignedUrls(paths, 60 * 30);
      const urlByPath = new Map<string, string>();
      (signed ?? []).forEach((s) => {
        if (s.signedUrl && s.path) urlByPath.set(s.path, s.signedUrl);
      });
      const urlsDe = (tipo: string) =>
        mediaUnica
          .filter((m) => m.tipo === tipo)
          .map((m) => urlByPath.get(m.url))
          .filter((u): u is string => !!u);

      // checkout = entrega ao cliente; checkin = recolha da viatura (ver
      // RealizarEntregaPage). Ordem lógica: entrega primeiro, recolha depois.
      const entrega = urlsDe('checkout');
      const recolha = urlsDe('checkin');
      anexoFotos = [];
      if (entrega.length) anexoFotos.push({ titulo: 'ANEXO — FOTOS DA ENTREGA', urls: entrega });
      if (recolha.length)
        anexoFotos.push({ titulo: 'ANEXO — FOTOS DA RECOLHA (DEVOLUÇÃO)', urls: recolha });
      if (!anexoFotos.length) anexoFotos = undefined;
    }
  } catch (error) {
    console.warn('Não foi possível anexar fotos de check-in/out:', error);
  }

  // Rodapé da empresa (nome · NIF · sede) em todos os documentos gerados.
  const footerText = empresaFooterText(empresa);

  // As fotos de check-in/out anexam-se ao template de ALUGUER (ou, na falta
  // dele entre os escolhidos, ao último documento).
  const anexarFotosA = (lista: { tipo: string }[]) => {
    const idxAluguer = lista.findIndex((t) => t.tipo === 'contrato_aluguer');
    return idxAluguer >= 0 ? idxAluguer : lista.length - 1;
  };

  // Lista ordenada de templates a gerar:
  //  - templateIds dados (dialog "Gerar Documentos") → exactamente esses, na ordem;
  //  - senão, por regime: rent_a_car → [aluguer]; tvde → [prestação, aluguer].
  let templatesEscolhidos: { id: string; nome: string; tipo: string }[];
  if (templateIds?.length) {
    templatesEscolhidos = templateIds
      .map((tid) => (templates ?? []).find((t) => t.id === tid))
      .filter((t): t is NonNullable<typeof t> => !!t);
  } else {
    templatesEscolhidos = [
      ...(!regimeAluguer && prestacaoTemplate ? [prestacaoTemplate] : []),
      ...(aluguerTemplate ? [aluguerTemplate] : []),
    ];
  }

  if (templatesEscolhidos.length === 0) {
    // Distinguir os dois casos: nada escolhido vs. escolhido mas não
    // encontrado. O 2.º é sempre um template que a query acima não trouxe
    // (tipicamente por estar noutra empresa) — dizer "nenhum seleccionado"
    // nesse caso manda quem depura para o lado errado.
    throw new Error(
      templateIds?.length
        ? 'Os documentos seleccionados não estão disponíveis para esta empresa.'
        : 'Nenhum documento seleccionado para gerar.'
    );
  }

  const idxFotos = anexoFotos ? anexarFotosA(templatesEscolhidos) : -1;
  const docs: DocumentoCombinado[] = templatesEscolhidos.map((t, i) => ({
    templateId: t.id,
    motoristaData,
    documentData,
    headerLogoUrl: empresa.logoUrl || '/Logo.png',
    footerText,
    anexoFotos: i === idxFotos ? anexoFotos : undefined,
    // Folha de danos: a viatura faz o renderer puxar TODOS os danos activos
    // + fotos + QR para o placeholder {{secao_danos}}.
    //
    // O contratoId VAI (é ele que dá o número no canto, a identificação do
    // cliente/condutor e o QR com o âmbito deste contrato), mas com
    // folhaDanosMomentoActual=false: aqui não estamos num handover, e sem essa
    // ressalva os danos deste contrato saíam rotulados "Nesta recolha/entrega"
    // em vez de "Contrato #N", que é o que faz sentido a ler isto mais tarde.
    //
    // Os km/combustível vêm do contrato: sem eles a folha saía com esses
    // campos em branco. O momento segue o estado — um contrato já devolvido
    // tem km de entrada, os restantes só os de saída.
    ...(t.tipo === 'anexo_danos'
      ? {
          viaturaId: viatura?.id,
          contratoId: contrato.id,
          folhaDanosMomentoActual: false,
          momentoFolha: contrato.estado_operacional === 'devolvido' ? 'RECOLHA' : 'ENTREGA',
          km_saida: contrato.km_saida != null ? String(contrato.km_saida) : '',
          km_entrada: contrato.km_entrada != null ? String(contrato.km_entrada) : '',
          combustivel_saida: contrato.combustivel_saida ?? '',
          eletricidade_saida: contrato.eletricidade_saida ?? '',
        }
      : {}),
  }));

  // Um PDF por documento — cada um gerado à parte, para irem como anexos
  // distintos no mesmo email.
  if (separados) {
    const anexos: Array<{ pdf: jsPDF; fileName: string }> = [];
    for (let i = 0; i < docs.length; i++) {
      const nome = nomeFicheiro(templatesEscolhidos[i].nome, contrato.codigo);
      const pdfDoc = await generateDocumentosCombinados([docs[i]], { action, fileName: nome });
      if (pdfDoc) anexos.push({ pdf: pdfDoc, fileName: `${nome}.pdf` });
    }
    return anexos.length ? { anexos } : null;
  }

  const fileName =
    `Contrato_${contrato.codigo ?? ''}_${(motoristaData.nome as string) ?? ''}`.trim();
  const pdf = await generateDocumentosCombinados(docs, { action, fileName });
  return pdf ? { pdf, fileName: `${fileName}.pdf` } : null;
};
