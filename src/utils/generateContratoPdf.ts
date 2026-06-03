import { supabase } from '@/integrations/supabase/client';
import type { EmpresaConfig } from '@/config/empresas';

import { generateDocumentFromTemplate } from './generateDocumentFromTemplate';

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
  action?: 'print' | 'download';
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
}: GenerateContratoPdfParams): Promise<void> => {
  if (!empresa) {
    throw new Error('Empresa não definida — impossível gerar contrato.');
  }

  // 1) Escolher o template de contrato para esta empresa, conforme o `regime`.
  //    Convenção de nomes (até existir taxonomia própria de `tipo`):
  //      - rent-a-car → "Contrato Aluguer - <Empresa>"
  //      - tvde       → "Contrato TVDE - <Empresa>"
  //    Se ainda não existir o de aluguer, cai no de TVDE — não parte nada
  //    enquanto o template de aluguer não for criado no admin.
  const { data: templates, error: templatesErr } = await supabase
    .from('document_templates')
    .select('id, nome, tipo, empresa_id')
    .eq('ativo', true)
    .eq('empresa_id', empresa.id)
    .in('tipo', ['contrato_tvde', 'contrato', 'contrato_aluguer'])
    .order('nome', { ascending: true });

  if (templatesErr) throw templatesErr;

  const porPrefixo = (prefixo: string) =>
    (templates ?? []).find((t) => t.nome.toLowerCase().startsWith(prefixo.toLowerCase()));

  const regimeAluguer = contrato.regime === 'rent_a_car';
  const template = regimeAluguer
    ? (porPrefixo('Contrato Aluguer') ?? porPrefixo('Contrato Rent') ?? porPrefixo('Contrato TVDE'))
    : (porPrefixo('Contrato TVDE') ?? (templates ?? [])[0]);

  if (!template) {
    const nomeSugerido = regimeAluguer ? 'Contrato Aluguer' : 'Contrato TVDE';
    throw new Error(
      `Sem template de contrato activo para a empresa "${empresa.nome}". ` +
        `Cria um chamado "${nomeSugerido} - ${empresa.nome}" em Configurações do Sistema → Documentos.`
    );
  }

  // 2) Resolver o condutor principal para preencher o "motorista" no template.
  //    TVDE: motorista directo. Rent-a-car: cliente mapeado para motorista_*.
  const cli = condutorPrincipal?.cliente_id
    ? (clientes.find((c) => c.id === condutorPrincipal.cliente_id) ?? null)
    : null;
  const mo = condutorPrincipal?.motorista_id
    ? (motoristas.find((m) => m.id === condutorPrincipal.motorista_id) ?? null)
    : null;

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
        }
      : { nome: '—', nif: '', morada: '', email: '', telefone: '' };

  // 3) Duração em meses (placeholder {{duracao_meses}}). Arredonda para cima.
  const msDia = 86400000;
  const diasContrato = Math.max(
    1,
    Math.ceil(
      (new Date(contrato.data_fim).getTime() - new Date(contrato.data_inicio).getTime()) / msDia
    )
  );
  const duracaoMeses = Math.max(1, Math.round(diasContrato / 30));

  // Colaborador que gera o contrato — placeholder {{colaborador_nome}}
  // (assinatura pela empresa). Vem do perfil do utilizador autenticado.
  let colaboradorNome = '';
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (auth.user) {
      const { data: perfil } = await supabase
        .from('profiles')
        .select('nome')
        .eq('id', auth.user.id)
        .maybeSingle();
      colaboradorNome = (perfil as { nome?: string } | null)?.nome ?? '';
    }
  } catch {
    /* segue sem nome do colaborador */
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

  const documentData = {
    data_inicio: contrato.data_inicio,
    data_fim: contrato.data_fim,
    data_assinatura: today,
    cidade_assinatura: empresa.sede || (motoristaData.cidade as string) || 'Leiria',
    duracao_meses: duracaoMeses,
    dias: String(diasContrato),
    numero_contrato: contrato.codigo != null ? String(contrato.codigo) : '',
    colaborador_nome: colaboradorNome,
    // Viatura
    viatura_matricula: contrato.matricula ?? viatura?.matricula ?? '—',
    viatura_marca_modelo: viatura ? `${viatura.marca} ${viatura.modelo}`.trim() : '—',
    viatura_grupo: contrato.grupo ?? '—',
    viatura_kms: num(viatura?.km_atual),
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
    empresaData: {
      nomeCompleto: empresa.nomeCompleto,
      nif: empresa.nif,
      sede: empresa.sede,
      licencaTVDE: empresa.licencaTVDE,
      licencaValidade: empresa.licencaValidade,
      representante: empresa.representante,
      cargoRepresentante: empresa.cargoRepresentante,
    },
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

      const checkin = urlsDe('checkin');
      const checkout = urlsDe('checkout');
      anexoFotos = [];
      if (checkin.length)
        anexoFotos.push({ titulo: 'ANEXO — FOTOS DE CHECK-IN (ENTREGA)', urls: checkin });
      if (checkout.length)
        anexoFotos.push({ titulo: 'ANEXO — FOTOS DE CHECK-OUT (DEVOLUÇÃO)', urls: checkout });
      if (!anexoFotos.length) anexoFotos = undefined;
    }
  } catch (error) {
    console.warn('Não foi possível anexar fotos de check-in/out:', error);
  }

  // Rodapé da empresa (só no aluguer; o TVDE usa papel timbrado próprio).
  const footerText = regimeAluguer
    ? [empresa.nomeCompleto, empresa.nif ? `NIF ${empresa.nif}` : null, empresa.sede]
        .filter(Boolean)
        .join('   ·   ')
    : undefined;

  // Gera a partir do template editável (BD), tanto para rent-a-car como TVDE.
  await generateDocumentFromTemplate({
    templateId: template.id,
    motoristaData,
    documentData,
    headerLogoUrl: regimeAluguer ? '/Logo.png' : undefined,
    footerText,
    anexoFotos,
    action,
  });
};
