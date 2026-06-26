import QRCode from 'qrcode';
import { supabase } from '@/integrations/supabase/client';
import type { AnexoDanos } from './generateDocumentFromTemplate';

export async function fetchAnexoDanos(
  viaturaId: string,
  matricula = '',
  contratoId?: string
): Promise<AnexoDanos | undefined> {
  try {
    let query = supabase
      .from('viatura_danos')
      .select('id, localizacao, descricao, estado, data_registo, data_ocorrencia, valor')
      .eq('viatura_id', viaturaId)
      .not('estado', 'eq', 'reparado')
      .order('created_at', { ascending: false });
    if (contratoId) query = query.eq('contrato_id', contratoId);
    const { data: danosRows } = await query;

    const danos = (danosRows as typeof danosRows) ?? [];

    const danoIds = danos.map((d) => d.id);
    const { data: fotosRows } = danoIds.length
      ? await supabase
          .from('viatura_dano_fotos')
          .select('dano_id, ficheiro_url')
          .in('dano_id', danoIds)
          .order('created_at', { ascending: false })
      : { data: [], error: null };

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

    const rawUrls = (fotosRows ?? [])
      .map((f) => f.ficheiro_url)
      .filter((u): u is string => !!u)
      .slice(0, 6);

    const byBucket: Record<string, { raw: string; path: string }[]> = {
      'viatura-documentos': [],
      'assistencia-anexos': [],
      'viatura-danos': [],
    };
    for (const raw of rawUrls) {
      byBucket[detectBucket(raw)].push({ raw, path: extractPath(raw) });
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
    const fotoSignedUrls = rawUrls
      .map((raw) => signedByPath.get(extractPath(raw)) ?? (raw.startsWith('http') ? raw : null))
      .filter((u): u is string => !!u);

    const linkUrl = `${window.location.origin}/viaturas/${viaturaId}?tab=danos`;
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
      danos: danos.map((d) => ({
        localizacao: (d.localizacao as string | null) ?? '—',
        descricao: (d.descricao as string | null) ?? '—',
        estado: (d.estado as string | null) ?? '—',
        data: fmtData((d.data_ocorrencia as string | null) ?? (d.data_registo as string | null)),
        valor: fmtValor(d.valor as number | null),
      })),
      fotos: fotoSignedUrls,
      linkUrl,
      qrCodeDataUrl,
    };
  } catch (err) {
    console.warn('Não foi possível gerar o anexo de danos:', err);
    return undefined;
  }
}
