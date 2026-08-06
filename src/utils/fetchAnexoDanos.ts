import QRCode from 'qrcode';
import { supabase } from '@/integrations/supabase/client';
import type { AnexoDanos, AnexoFotoItem, AnexoParteItem } from './document-template/types';

/** Junta o que existe e descarta o resto — evita "NIF —" e vírgulas soltas. */
const linhaDetalhe = (...partes: (string | null | undefined)[]) =>
  partes
    .map((p) => p?.trim())
    .filter((p): p is string => !!p)
    .join(' · ');

/**
 * Quem alugou, para o cabeçalho da folha de danos.
 *
 * São duas coisas distintas e o contrato pode ter as duas: o TITULAR
 * (`contratos_renting.cliente_id`, quem assina e é facturado) e o CONDUTOR
 * (`contrato_condutores`, que tanto pode ser um cliente como um motorista).
 * Quando são a mesma entidade, aparece uma linha só — repetir o mesmo nome
 * duas vezes numa folha assinada faria duvidar de qual é qual.
 */
async function fetchPartesContrato(
  contratoId: string,
  clienteTitularId: string | null
): Promise<AnexoParteItem[]> {
  const partes: AnexoParteItem[] = [];
  try {
    const { data: cond } = await supabase
      .from('contrato_condutores')
      .select('cliente_id, motorista_id')
      .eq('contrato_id', contratoId)
      .order('is_principal', { ascending: false })
      .limit(1)
      .maybeSingle();

    const condutorClienteId = (cond?.cliente_id as string | null) ?? null;
    const condutorMotoristaId = (cond?.motorista_id as string | null) ?? null;
    // Titular e condutor são a mesma ficha de cliente: uma linha só.
    const mesmaEntidade = !!clienteTitularId && clienteTitularId === condutorClienteId;

    const clienteIds = [
      ...new Set([clienteTitularId, condutorClienteId].filter(Boolean)),
    ] as string[];
    const clientes = new Map<string, Record<string, unknown>>();
    if (clienteIds.length) {
      const { data } = await supabase
        .from('clientes')
        .select('id, nome, nome_comercial, nif, telefone, email, sede')
        .in('id', clienteIds);
      (data ?? []).forEach((c) => clientes.set(c.id as string, c));
    }

    const doCliente = (id: string, papel: string): AnexoParteItem | null => {
      const c = clientes.get(id);
      if (!c) return null;
      const nome = ((c.nome_comercial as string) || (c.nome as string) || '').trim();
      if (!nome) return null;
      return {
        papel,
        nome,
        detalhes: [
          linhaDetalhe(c.nif ? `NIF ${c.nif}` : null, c.telefone as string, c.email as string),
          linhaDetalhe(c.sede as string),
        ].filter(Boolean),
      };
    };

    if (clienteTitularId) {
      const p = doCliente(clienteTitularId, mesmaEntidade ? 'CLIENTE / CONDUTOR' : 'CLIENTE');
      if (p) partes.push(p);
    }

    if (!mesmaEntidade && condutorClienteId) {
      const p = doCliente(condutorClienteId, 'CONDUTOR');
      if (p) partes.push(p);
    } else if (condutorMotoristaId) {
      const { data: mot } = await supabase
        .from('motoristas_ativos')
        .select('nome, nif, telefone, email, morada, carta_conducao')
        .eq('id', condutorMotoristaId)
        .maybeSingle();
      const nome = (mot?.nome as string | undefined)?.trim();
      if (nome) {
        partes.push({
          papel: 'CONDUTOR',
          nome,
          detalhes: [
            linhaDetalhe(
              mot?.nif ? `NIF ${mot.nif}` : null,
              mot?.carta_conducao ? `Carta ${mot.carta_conducao}` : null
            ),
            linhaDetalhe(mot?.telefone as string, mot?.email as string),
            linhaDetalhe(mot?.morada as string),
          ].filter(Boolean),
        });
      }
    }
  } catch (err) {
    // Sem identificação a folha continua a valer — não vale a pena deitar
    // fora o anexo inteiro por causa do cabeçalho.
    console.warn('Não foi possível obter as partes do contrato:', err);
  }
  return partes;
}

export async function fetchAnexoDanos(
  viaturaId: string,
  matricula = '',
  /** ID do contrato de renting actual — usado só para rotular a origem de
   *  cada linha ("Nesta recolha/entrega" vs. já existente). Não filtra: a
   *  lista mostra sempre todos os danos activos da viatura. */
  contratoId?: string
): Promise<AnexoDanos | undefined> {
  try {
    const { data: danosRows } = await supabase
      .from('viatura_danos')
      .select(
        'id, localizacao, descricao, estado, data_registo, data_ocorrencia, valor, registo_fotografico, contrato_renting_id, contrato_id, ticket_id'
      )
      .eq('viatura_id', viaturaId)
      .not('estado', 'eq', 'reparado')
      .order('created_at', { ascending: false });

    const danos = (danosRows as typeof danosRows) ?? [];

    // Rotular a origem de cada dano: desta recolha/entrega, de outro
    // contrato de renting (com o respectivo código), de um contrato de
    // prestação de serviço legado, de um ticket de assistência (com o
    // respectivo número), ou registo manual (ficha da viatura).
    const outrosContratoIds = [
      ...new Set(
        danos
          .map((d) => d.contrato_renting_id as string | null)
          .filter((id): id is string => !!id && id !== contratoId)
      ),
    ];
    // O contrato ACTUAL entra na mesma consulta: o código dele vai para o
    // título da folha, tal como o contrato de aluguer o mostra em cima. Sem
    // isto, uma folha de danos solta não dizia a que fecho pertencia.
    const idsParaCodigo = [...outrosContratoIds, ...(contratoId ? [contratoId] : [])];
    const codigoPorContratoId = new Map<string, number>();
    let clienteTitularId: string | null = null;
    if (idsParaCodigo.length > 0) {
      const { data: contratosRows } = await supabase
        .from('contratos_renting')
        .select('id, codigo, cliente_id')
        .in('id', idsParaCodigo);
      (contratosRows ?? []).forEach((c) => {
        codigoPorContratoId.set(c.id, c.codigo);
        if (c.id === contratoId) clienteTitularId = (c.cliente_id as string | null) ?? null;
      });
    }
    const codigoContratoActual = contratoId ? codigoPorContratoId.get(contratoId) : undefined;

    const partes = contratoId ? await fetchPartesContrato(contratoId, clienteTitularId) : undefined;
    const ticketIds = [
      ...new Set(danos.map((d) => d.ticket_id as string | null).filter((id): id is string => !!id)),
    ];
    const numeroPorTicketId = new Map<string, number>();
    if (ticketIds.length > 0) {
      const { data: ticketsRows } = await supabase
        .from('assistencia_tickets')
        .select('id, numero')
        .in('id', ticketIds);
      (ticketsRows ?? []).forEach((t) => numeroPorTicketId.set(t.id, t.numero));
    }
    const origemPorDanoId = new Map<string, string>();
    for (const d of danos) {
      const rentingId = d.contrato_renting_id as string | null;
      const ticketId = d.ticket_id as string | null;
      if (rentingId && rentingId === contratoId) {
        origemPorDanoId.set(d.id, 'Nesta recolha/entrega');
      } else if (rentingId) {
        const codigo = codigoPorContratoId.get(rentingId);
        origemPorDanoId.set(d.id, codigo != null ? `Contrato #${codigo}` : 'Outro contrato');
      } else if (d.contrato_id) {
        origemPorDanoId.set(d.id, 'Contrato de prestação');
      } else if (ticketId) {
        const numero = numeroPorTicketId.get(ticketId);
        origemPorDanoId.set(
          d.id,
          numero != null
            ? `Ticket de Assistência #${String(numero).padStart(4, '0')}`
            : 'Ticket de Assistência'
        );
      } else {
        origemPorDanoId.set(d.id, 'Registo manual');
      }
    }

    // As fotos da grelha vêm de TODOS os registos (incluindo os de registo
    // fotográfico do momento). A tabela, porém, só lista danos catalogados.
    const danoIds = danos.map((d) => d.id);
    const danosTabela = danos.filter((d) => !d.registo_fotografico);
    const { data: fotosRows } = danoIds.length
      ? await supabase
          .from('viatura_dano_fotos')
          .select('dano_id, ficheiro_url, nome_ficheiro, descricao')
          .in('dano_id', danoIds)
          .order('created_at', { ascending: false })
      : { data: [] };

    type Bucket = 'viatura-documentos' | 'assistencia-anexos' | 'viatura-danos';
    const extractPath = (urlOrPath: string): string => {
      if (!urlOrPath.startsWith('http')) return urlOrPath;
      const m = urlOrPath.match(
        /\/storage\/v1\/object\/(?:public|sign)\/(?:viatura-documentos|assistencia-anexos|viatura-danos)\/([^?]+)/
      );
      return m ? decodeURIComponent(m[1]) : urlOrPath;
    };
    const detectBucket = (urlOrPath: string): Bucket => {
      if (urlOrPath.startsWith('assistencia/') || urlOrPath.includes('assistencia-anexos'))
        return 'assistencia-anexos';
      // Fotos do check-in/out (CheckinDadosSection) guardam path nu no bucket
      // viatura-danos. As manuais (ViaturaTabDanos) guardam URL http completo
      // do bucket viatura-documentos.
      if (urlOrPath.includes('viatura-danos')) return 'viatura-danos';
      if (!urlOrPath.startsWith('http')) return 'viatura-danos';
      return 'viatura-documentos';
    };

    // Mantém o dano_id agarrado a cada foto até ao fim, para a legenda por
    // baixo de cada imagem poder indicar de onde ela veio.
    type FotoRow = {
      dano_id: string;
      ficheiro_url: string;
      nome_ficheiro?: string | null;
      descricao?: string | null;
    };
    const fotoEntries = ((fotosRows ?? []) as FotoRow[])
      .filter((f) => !!f.ficheiro_url)
      .slice(0, 6);

    // Vídeo detectado pela extensão: o jsPDF não consegue extrair um frame,
    // por isso a moldura sai marcada como vídeo e remete-se para o QR.
    const EXT_VIDEO = /\.(mp4|mov|webm|avi|mkv|m4v|3gp)$/i;
    const ehVideo = (f: FotoRow) =>
      EXT_VIDEO.test(f.nome_ficheiro ?? '') || EXT_VIDEO.test(f.ficheiro_url.split('?')[0]);

    const byBucket: Record<string, { raw: string; path: string; danoId: string }[]> = {
      'viatura-documentos': [],
      'assistencia-anexos': [],
      'viatura-danos': [],
    };
    for (const f of fotoEntries) {
      byBucket[detectBucket(f.ficheiro_url)].push({
        raw: f.ficheiro_url,
        path: extractPath(f.ficheiro_url),
        danoId: f.dano_id,
      });
    }
    const signedByPath = new Map<string, string>();
    for (const [bucket, items] of Object.entries(byBucket)) {
      if (!items.length) continue;
      const { data: signed } = await supabase.storage.from(bucket).createSignedUrls(
        items.map((i) => i.path),
        60 * 30
      );
      (signed ?? []).forEach((s) => {
        if (s.signedUrl && s.path) signedByPath.set(s.path, s.signedUrl);
      });
    }
    const fotoItems: AnexoFotoItem[] = fotoEntries
      .map((f) => ({
        url:
          signedByPath.get(extractPath(f.ficheiro_url)) ??
          (f.ficheiro_url.startsWith('http') ? f.ficheiro_url : null),
        danoId: f.dano_id,
        descricao: f.descricao?.trim() || undefined,
        video: ehVideo(f),
      }))
      .filter((f): f is NonNullable<typeof f> & { url: string } => !!f.url)
      .map((f) => ({
        url: f.url,
        origem: origemPorDanoId.get(f.danoId) ?? 'Registo manual',
        descricao: f.descricao,
        video: f.video,
      }));

    // QR público: gera (ou reutiliza) um token e aponta para a galeria pública
    // /danos/:token (sem login). Fallback para a página interna se falhar.
    let linkUrl = `${window.location.origin}/viaturas/${viaturaId}?tab=danos`;
    try {
      const { data: tokenId } = await supabase.rpc('gerar_token_danos', {
        p_viatura_id: viaturaId,
        p_contrato_renting_id: contratoId,
      });
      if (tokenId) linkUrl = `${window.location.origin}/danos/${tokenId}`;
    } catch {
      /* sem token — mantém o link interno */
    }
    const qrCodeDataUrl = await QRCode.toDataURL(linkUrl, {
      width: 200,
      margin: 1,
      errorCorrectionLevel: 'M',
    });

    const fmtData = (iso: string | null | undefined) => {
      if (!iso) return '—';
      const [y, m, d] = iso.split('-');
      return d && m && y ? `${d}/${m}/${y}` : iso;
    };
    const fmtValor = (v: number | null | undefined) =>
      v != null && !Number.isNaN(Number(v)) ? `${Number(v).toFixed(2)} €` : undefined;

    return {
      titulo: [
        'ANEXO — DANOS DA VIATURA',
        matricula || null,
        codigoContratoActual != null ? `· CONTRATO #${codigoContratoActual}` : null,
      ]
        .filter(Boolean)
        .join(' '),
      partes,
      danos: danosTabela.map((d) => ({
        localizacao: (d.localizacao as string | null) ?? '—',
        descricao: (d.descricao as string | null) ?? '—',
        estado: (d.estado as string | null) ?? '—',
        data: fmtData((d.data_ocorrencia as string | null) ?? (d.data_registo as string | null)),
        valor: fmtValor(d.valor as number | null),
        origem: origemPorDanoId.get(d.id) ?? 'Registo manual',
      })),
      fotos: fotoItems,
      linkUrl,
      qrCodeDataUrl,
    };
  } catch (err) {
    console.warn('Não foi possível gerar o anexo de danos:', err);
    return undefined;
  }
}
