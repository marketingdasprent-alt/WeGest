/**
 * Operações de backend para o fluxo de entrega/recolha/troca.
 * Lógica de Supabase, geração de PDF e envio de email.
 */
import { format } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { generateDocumentFromTemplate } from '@/utils/generateDocumentFromTemplate';
import { emailFolhaDanos } from '@/lib/emailFolhaDanos';
import { guardarFolhaDanos } from '@/lib/guardarFolhaDanos';
import { fileToDataUrl, type FilePreview } from '@/utils/entrega';
import type { AssinaturasHandoverHandle } from '@/components/assinatura/AssinaturasHandoverSection';

interface BlocoFolha {
  matricula: string;
  viaturaId: string | null | undefined;
  isEntrega: boolean;
  km: string;
  combustivel: string;
  eletricidade: string;
  files: FilePreview[];
}

interface GerarFolhaParams {
  modo: 'preview' | 'print';
  bloco: BlocoFolha;
  assinaturasRef: React.RefObject<AssinaturasHandoverHandle>;
  observacoes: string;
  contexto: {
    emissorId: string | null;
    anexoDanosTemplateId: string | null;
    condutorNome: string;
    condutorEmail: string;
    clienteNome: string;
    empresaData: Record<string, string> | null;
    kmSaida: number | null;
    combustivelSaida: string | null;
  };
  responsavelNome: string;
  info: {
    cidade?: string | null;
    contrato_id: string;
    tipo: string;
  };
  /** Token de realização — autoriza o arquivo da folha nos anexos do contrato. */
  token?: string | null;
}

/**
 * Gera (pré-visualiza ou envia) a folha de danos para um bloco de viatura.
 * Chamado 1x na entrega/recolha simples, 2x na troca.
 */
export async function gerarFolhaBloco(params: GerarFolhaParams): Promise<void> {
  const { modo, bloco, assinaturasRef, observacoes, contexto, responsavelNome, info, token } =
    params;

  // Resolvido no servidor por contexto_folha_por_token (SECURITY DEFINER) —
  // a query directa a document_templates fica bloqueada por RLS aqui, pois
  // quem faz check-in/out por token normalmente não tem sessão/permissão de
  // renting.
  const tmplId = contexto?.anexoDanosTemplateId ?? null;
  if (!tmplId) {
    toast.error('Não existe uma Folha de Danos activa. Contacta o gestor da frota.');
    return;
  }

  const {
    matricula,
    viaturaId,
    isEntrega,
    km: kmBloco,
    combustivel: combustivelBloco,
    eletricidade: eletricidadeBloco,
    files: filesBloco,
  } = bloco;

  const fotosMomento =
    modo === 'preview' && filesBloco.length
      ? await Promise.all(filesBloco.map((f) => fileToDataUrl(f.file)))
      : undefined;

  const danosMomento =
    modo === 'preview'
      ? filesBloco
          .filter((f) => f.descricao.trim() || f.localizacao)
          .map((f) => ({
            localizacao: f.localizacao || '—',
            descricao: f.descricao.trim() || '—',
            estado: 'existente',
            data: format(new Date(), 'dd/MM/yyyy'),
            valor: f.valor.trim() ? `${Number(f.valor).toFixed(2)} €` : undefined,
            origem: 'Nesta recolha/entrega',
          }))
      : undefined;

  const hoje = new Date().toISOString().slice(0, 10);
  const sigs = assinaturasRef.current?.getAssinaturas() ?? {
    motorista: null,
    responsavel: null,
  };

  const pdf = await generateDocumentFromTemplate({
    templateId: tmplId,
    motoristaData: { nome: contexto?.condutorNome ?? '' },
    documentData: {
      viatura_matricula: matricula,
      data_assinatura: hoje,
      cidade_assinatura: info?.cidade ?? '',
      clienteData: { nome: contexto?.clienteNome ?? '' },
      assinatura_motorista: sigs.motorista ?? '',
      assinatura_responsavel: sigs.responsavel ?? '',
      responsavel_nome: responsavelNome,
      momento_responsavel: isEntrega ? 'Entregue por' : 'Recolhido por',
      ...(contexto?.empresaData ? { empresaData: contexto.empresaData } : {}),
    },
    viaturaId: viaturaId ?? undefined,
    contratoId: info!.contrato_id,
    momentoFolha: isEntrega ? 'ENTREGA' : 'RECOLHA',
    observacoesMomento: observacoes,
    ...(isEntrega
      ? {
          km_saida: kmBloco,
          combustivel_saida: combustivelBloco,
          eletricidade_saida: eletricidadeBloco,
        }
      : {
          km_entrada: kmBloco,
          combustivel_entrada: combustivelBloco,
          eletricidade_entrada: eletricidadeBloco,
          km_saida: contexto?.kmSaida?.toString() ?? '',
          combustivel_saida: contexto?.combustivelSaida ?? '',
        }),
    ...(fotosMomento ? { fotosMomento } : {}),
    ...(danosMomento?.length ? { danosMomento } : {}),
    action: modo === 'print' ? 'print' : 'download',
    skipOutput: modo === 'preview',
  });

  if (modo === 'preview' && pdf) {
    window.open(pdf.output('bloburl'), '_blank');
  }
  if (modo === 'print' && pdf) {
    void emailFolhaDanos({
      pdf,
      to: contexto?.condutorEmail,
      toNome: contexto?.condutorNome,
      matricula,
      momento: isEntrega ? 'ENTREGA' : 'RECOLHA',
      // Fluxo por token, sem sessão — sem org_id disponível aqui; a Edge
      // Function deriva a org a partir de viaturaId (viaturas.org_id).
      orgId: null,
      viaturaId,
    });
    // Arquiva esta mesma cópia nos anexos do contrato — é a única forma de a
    // voltar a descarregar: a folha só se gera aqui, e regerá-la mais tarde
    // daria outro documento (sem assinaturas, com os danos de então).
    void guardarFolhaDanos({
      pdf,
      contratoId: info?.contrato_id,
      matricula,
      momento: isEntrega ? 'ENTREGA' : 'RECOLHA',
      token,
    });
  }
}

interface UploadDanosParams {
  files: FilePreview[];
  filesAntiga: FilePreview[];
  viaturaId: string | null;
  viaturaAntigaId: string | null;
  observacoes: string;
  info: {
    contrato_id: string;
    tipo: string;
  };
  userId: string;
  token: string;
}

/**
 * Faz upload das fotos de danos para o Supabase Storage e insere registos
 * na tabela viatura_danos. Retorna os paths carregados para limpeza em caso
 * de erro.
 */
export async function uploadDanos(params: UploadDanosParams): Promise<string[]> {
  const { files, filesAntiga, viaturaId, viaturaAntigaId, observacoes, info, userId, token } =
    params;
  const uploadedPaths: string[] = [];
  const isEntrega = info.tipo === 'entrega';

  // Limpa danos/fotos duma tentativa anterior falhada deste mesmo token —
  // tem de correr ANTES de confirmar (o token ainda não está usado aqui).
  // Best-effort: um token novo normalmente não tem nada para limpar.
  try {
    const { error: limparErr } = await (supabase as any).rpc('limpar_danos_token', {
      p_token: token,
    });
    if (limparErr) throw limparErr;
  } catch (err) {
    console.warn('Falha a limpar danos de tentativa anterior:', err);
  }

  // Agrupa todos os files (viatura actual + antiga, se troca)
  const allFiles = [...(viaturaId ? [files] : []), ...(viaturaAntigaId ? [filesAntiga] : [])];

  for (let gi = 0; gi < allFiles.length; gi++) {
    const grupoFiles = allFiles[gi];
    const vId = gi === 0 ? viaturaId : viaturaAntigaId;
    if (!vId || !grupoFiles.length) continue;

    // Separar files com localização/descrição (detalhados) dos genéricos
    const detalhados = grupoFiles.filter((fp) => fp.localizacao || fp.descricao.trim());
    const genericos = grupoFiles.filter((fp) => !fp.localizacao && !fp.descricao.trim());

    interface GrupoDano {
      localizacao: string | null;
      descricao: string;
      valor: number | null;
      fotos: FilePreview[];
    }

    const grupos: GrupoDano[] = detalhados.map((fp) => {
      const valorNum = fp.valor.trim() ? Number(fp.valor) : null;
      return {
        localizacao: fp.localizacao || null,
        descricao: fp.descricao.trim() || `Registo ${isEntrega ? 'entrega' : 'recolha'}`,
        valor: valorNum != null && !Number.isNaN(valorNum) ? valorNum : null,
        fotos: [fp],
      };
    });
    if (genericos.length > 0) {
      grupos.push({
        localizacao: null,
        descricao: `Registo ${isEntrega ? 'entrega' : 'recolha'}`,
        valor: null,
        fotos: genericos,
      });
    }

    for (const grupo of grupos) {
      const { data: dano, error: dErr } = await (supabase as any)
        .from('viatura_danos')
        .insert({
          viatura_id: vId,
          localizacao: grupo.localizacao,
          descricao: grupo.descricao,
          valor: grupo.valor,
          observacoes: observacoes.trim() || null,
          estado: 'existente',
          contrato_renting_id: info.contrato_id,
          registado_por: userId,
          realizacao_token_id: token,
        })
        .select('id')
        .single();
      if (dErr) throw dErr;

      for (const fp of grupo.fotos) {
        const ext = fp.file.name.split('.').pop() || 'bin';
        const path = `${dano.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('viatura-danos')
          .upload(path, fp.file, { contentType: fp.file.type });
        if (upErr) throw upErr;
        uploadedPaths.push(path);
        const { error: fErr } = await supabase.from('viatura_dano_fotos').insert({
          dano_id: dano.id,
          ficheiro_url: path,
          nome_ficheiro: fp.file.name,
          uploaded_by: userId,
        });
        if (fErr) throw fErr;
      }
    }
  }

  return uploadedPaths;
}
