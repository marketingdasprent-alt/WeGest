import QRCode from 'qrcode';
import { supabase } from '@/integrations/supabase/client';
import type { AnexoDanos, AnexoFotoItem } from './generateDocumentFromTemplate';

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
    const codigoPorContratoId = new Map<string, number>();
    if (outrosContratoIds.length > 0) {
      const { data: contratosRows } = await supabase
        .from('contratos_renting')
        .select('id, codigo')
        .in('id', outrosContratoIds);
      (contratosRows ?? []).forEach((c) => codigoPorContratoId.set(c.id, c.codigo));
    }
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
          .select('dano_id, ficheiro_url')
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
    const fotoEntries = (fotosRows ?? [])
      .filter((f): f is { dano_id: string; ficheiro_url: string } => !!f.ficheiro_url)
      .slice(0, 6);

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
      }))
      .filter((f): f is { url: string; danoId: string } => !!f.url)
      .map((f) => ({ url: f.url, origem: origemPorDanoId.get(f.danoId) ?? 'Registo manual' }));

    // QR público: gera (ou reutiliza) um token e aponta para a galeria pública
    // /danos/:token (sem login). Fallback para a página interna se falhar.
    let linkUrl = `${window.location.origin}/viaturas/${viaturaId}?tab=danos`;
    try {
      const { data: tokenId } = await supabase.rpc('gerar_token_danos', {
        p_viatura_id: viaturaId,
        p_contrato_renting_id: contratoId ?? null,
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
      titulo: `ANEXO — DANOS DA VIATURA${matricula ? ` ${matricula}` : ''}`,
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
