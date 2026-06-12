import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { TablesInsert } from '@/integrations/supabase/types';
import type {
  Cliente,
  Documento,
  ClienteDocumento,
  ClienteComDocumentos,
  TipoDocumento,
} from '@/types/cliente';

const QUERY_KEY = ['renting', 'clientes'] as const;

// Tipos considerados "documento de identificação" (todos excepto carta)
const TIPOS_IDENTIFICACAO: TipoDocumento[] = [
  'Cartão Cidadão',
  'Passaporte',
  'Autorização de Residência',
  'Outro',
];
const TIPO_CARTA: TipoDocumento = 'Carta de Condução';

// ── Tipos de input ───────────────────────────────────────────

// org_id é preenchido por trigger na BD — fica de fora do payload do formulário.
// Campos de empresa (sede, representante, ...) são opcionais: o formulário de
// cliente não os captura, e enviá-los a null apagaria dados de emissor já
// preenchidos na BD (semântica PATCH — só escreve quem os fornecer).
type CamposEmpresa =
  | 'sede'
  | 'representante'
  | 'cargo_representante'
  | 'licenca_tvde'
  | 'licenca_validade'
  | 'papel_timbrado';

type ClienteInsert = Omit<
  Cliente,
  | 'id'
  | 'codigo'
  | 'created_at'
  | 'updated_at'
  | 'created_by'
  | 'updated_by'
  | 'org_id'
  | CamposEmpresa
> &
  Partial<Pick<Cliente, CamposEmpresa>>;
type DocumentoInsert = Omit<
  Documento,
  'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'
>;

export type ClienteFormPayload = {
  cliente: ClienteInsert;
  documentoIdentificacao: DocumentoInsert;
  cartaConducao: DocumentoInsert;
};

// ── Query principal ──────────────────────────────────────────

export function useClientes() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<ClienteComDocumentos[]> => {
      const { data: clientes, error: errClientes } = await supabase
        .from('clientes')
        .select('*')
        .order('codigo', { ascending: true });
      if (errClientes) throw errClientes;
      if (!clientes || clientes.length === 0) return [];

      const ids = clientes.map((c) => c.id);

      // Buscar todas as ligações + documentos em paralelo
      const { data: ligacoes, error: errLig } = await supabase
        .from('cliente_documentos')
        .select('*, documentos(*)')
        .in('cliente_id', ids);
      if (errLig) throw errLig;

      // Agrupar por cliente_id
      const ligacoesPorCliente = new Map<string, typeof ligacoes>();
      for (const lig of ligacoes ?? []) {
        const lista = ligacoesPorCliente.get(lig.cliente_id) ?? [];
        lista.push(lig);
        ligacoesPorCliente.set(lig.cliente_id, lista);
      }

      return (clientes as Cliente[]).map((c) => {
        const docs = ligacoesPorCliente.get(c.id) ?? [];

        const ligDoc =
          docs.find((l) =>
            TIPOS_IDENTIFICACAO.includes(((l.documentos as any)?.tipo ?? '') as TipoDocumento)
          ) ?? null;
        const ligCarta = docs.find((l) => (l.documentos as any)?.tipo === TIPO_CARTA) ?? null;

        return {
          ...c,
          documentoIdentificacao: ligDoc ? (ligDoc.documentos as unknown as Documento) : null,
          cartaConducao: ligCarta ? (ligCarta.documentos as unknown as Documento) : null,
          ligacaoDocumento: ligDoc
            ? {
                id: ligDoc.id,
                cliente_id: ligDoc.cliente_id,
                documento_id: ligDoc.documento_id,
                created_by: ligDoc.created_by,
                created_at: ligDoc.created_at,
              }
            : null,
          ligacaoCarta: ligCarta
            ? {
                id: ligCarta.id,
                cliente_id: ligCarta.cliente_id,
                documento_id: ligCarta.documento_id,
                created_by: ligCarta.created_by,
                created_at: ligCarta.created_at,
              }
            : null,
        };
      });
    },
  });
}

// ── Helper: upsert de um documento + ligação ─────────────────

// Detecta se um payload de documento tem alguma informação relevante além do tipo.
// Se não tiver, não vale a pena criar o registo na BD.
function temDadosUteis(d: DocumentoInsert): boolean {
  return Boolean(d.numero || d.pais_emissao || d.data_emissao || d.validade || d.arquivo_url);
}

async function upsertDocumento(
  clienteId: string,
  documentoId: string | null,
  dados: DocumentoInsert
): Promise<void> {
  if (documentoId) {
    // Documento já existe — actualizar (mesmo que fique "vazio", mantém histórico)
    const { error } = await supabase.from('documentos').update(dados).eq('id', documentoId);
    if (error) throw error;
    return;
  }

  // Documento novo: só cria se houver dados úteis
  if (!temDadosUteis(dados)) return;

  const { data: novoDoc, error: errDoc } = await supabase
    .from('documentos')
    .insert(dados)
    .select('id')
    .single();
  if (errDoc) throw errDoc;

  const { error: errLig } = await supabase
    .from('cliente_documentos')
    .insert({ cliente_id: clienteId, documento_id: novoDoc.id });
  if (errLig) throw errLig;
}

// ── Mutation: criar ──────────────────────────────────────────

export function useCreateCliente() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      cliente,
      documentoIdentificacao,
      cartaConducao,
    }: ClienteFormPayload): Promise<{ id: string }> => {
      // 1. Criar cliente (org_id preenchido por trigger — daí o cast)
      const { data: novoCliente, error: errCliente } = await supabase
        .from('clientes')
        .insert(cliente as TablesInsert<'clientes'>)
        .select('id')
        .single();
      if (errCliente) throw errCliente;

      const clienteId = novoCliente.id;

      // 2. Criar documentos e ligações em paralelo (só se houver dados)
      await Promise.all([
        upsertDocumento(clienteId, null, documentoIdentificacao),
        upsertDocumento(clienteId, null, cartaConducao),
      ]);

      return { id: clienteId };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: 'Cliente criado', description: 'O cliente foi criado com sucesso.' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao criar cliente', description: error.message, variant: 'destructive' });
    },
  });
}

// ── Mutation: actualizar ─────────────────────────────────────

export function useUpdateCliente() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      id,
      documentoIdentificacaoId,
      cartaConducaoId,
      cliente,
      documentoIdentificacao,
      cartaConducao,
    }: ClienteFormPayload & {
      id: string;
      documentoIdentificacaoId: string | null;
      cartaConducaoId: string | null;
    }) => {
      const { error } = await supabase.from('clientes').update(cliente).eq('id', id);
      if (error) throw error;

      await Promise.all([
        upsertDocumento(id, documentoIdentificacaoId, documentoIdentificacao),
        upsertDocumento(id, cartaConducaoId, cartaConducao),
      ]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: 'Cliente actualizado', description: 'Os dados foram guardados.' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao actualizar', description: error.message, variant: 'destructive' });
    },
  });
}

// ── Mutation: eliminar ───────────────────────────────────────
// As ligações e documentos são eliminados automaticamente via CASCADE.

export function useDeleteCliente() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      // Antes de apagar o cliente, apagar os documentos órfãos que ficariam
      // (cliente_documentos tem CASCADE mas documentos não tem FK de volta ao cliente)
      const { data: ligacoes } = await supabase
        .from('cliente_documentos')
        .select('documento_id')
        .eq('cliente_id', id);

      const docIds = (ligacoes ?? []).map((l) => l.documento_id);

      const { error } = await supabase.from('clientes').delete().eq('id', id);
      if (error) throw error;

      // Apagar os documentos depois (CASCADE apagou as ligações, documentos ficam órfãos)
      if (docIds.length > 0) {
        await supabase.from('documentos').delete().in('id', docIds);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: 'Cliente eliminado', description: 'O cliente foi removido.' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao eliminar', description: error.message, variant: 'destructive' });
    },
  });
}
