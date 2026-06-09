import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, FileText, CheckCircle2, Search, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { gerarContratoAtomico } from '@/hooks/useContratos';
import jsPDF from 'jspdf';
import {
  generateDocumentFromTemplate,
  uploadDocumentToStorage,
} from '@/utils/generateDocumentFromTemplate';
import { useClientesEmpresas } from '@/hooks/useClientesEmpresas';
import { matchesSearch } from '@/lib/utils';

interface Motorista {
  id: string;
  nome: string;
  nif: string | null;
  documento_tipo: string | null;
  documento_numero: string | null;
  documento_validade: string | null;
  carta_conducao: string | null;
  carta_categorias: string[] | null;
  carta_validade: string | null;
  licenca_tvde_numero: string | null;
  licenca_tvde_validade: string | null;
  morada: string | null;
  email: string | null;
  telefone: string | null;
  data_contratacao?: string | null;
  cidade?: string | null;
  cidade_assinatura?: string | null;
}

interface DocumentTemplate {
  id: string;
  nome: string;
  tipo: string;
  cliente_empresa_id: string | null;
  empresa_id: string | null;
}

interface GenerateDocumentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  motorista?: Motorista | null; // Agora opcional
  onSuccess?: () => void; // Callback quando documentos são gerados
  // Parâmetros opcionais para contexto de calendário (entrega/troca de viatura)
  viaturaId?: string | null;
  calendarioEventoId?: string | null;
  checkoutPendente?: boolean;
  forceNewVersion?: boolean;
  uploadFirstToStorage?: boolean; // Se true, faz upload do primeiro contrato ao storage
}

export const GenerateDocumentsDialog = ({
  open,
  onOpenChange,
  motorista,
  onSuccess,
  viaturaId,
  calendarioEventoId,
  checkoutPendente,
  forceNewVersion = false,
  uploadFirstToStorage = false,
}: GenerateDocumentsDialogProps) => {
  const { empresas, getById } = useClientesEmpresas();
  const defaultEmpresaId = empresas[0]?.id || '';

  // Estado para seleção de motorista (quando não passado nas props)
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [filteredMotoristas, setFilteredMotoristas] = useState<Motorista[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMotorista, setSelectedMotorista] = useState<Motorista | null>(null);
  const [loadingMotoristas, setLoadingMotoristas] = useState(false);

  // Estado para templates e geração
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(new Set());
  const [cidadeAssinatura, setCidadeAssinatura] = useState('Leiria');
  const [selectedEmpresa, setSelectedEmpresa] = useState(defaultEmpresaId);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [generatedTemplates, setGeneratedTemplates] = useState<Set<string>>(new Set());
  const [currentGenerating, setCurrentGenerating] = useState<string | null>(null);

  // Motorista ativo: das props OU selecionado internamente
  const activeMotorista = motorista || selectedMotorista;

  useEffect(() => {
    if (open) {
      if (!motorista) {
        loadMotoristas();
      } else {
        // Usar a cidade de assinatura salva ou a cidade do motorista como fallback
        const defaultCidade = motorista.cidade_assinatura || motorista.cidade || 'Leiria';
        setCidadeAssinatura(defaultCidade);
      }
      loadTemplates();
    } else {
      setSelectedTemplates(new Set());
      setGeneratedTemplates(new Set());
      setCurrentGenerating(null);
      setSelectedEmpresa(defaultEmpresaId);
      setSearchTerm('');
      setSelectedMotorista(null);
    }
  }, [open, motorista]);

  // Filtrar motoristas baseado na busca
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredMotoristas(motoristas);
    } else {
      const filtered = motoristas.filter(
        (m) =>
          matchesSearch(m.nome, searchTerm) ||
          matchesSearch(m.email, searchTerm) ||
          (m.nif && m.nif.includes(searchTerm))
      );
      setFilteredMotoristas(filtered);
    }
  }, [searchTerm, motoristas]);

  // Limpar seleções de templates que não pertencem à empresa selecionada
  useEffect(() => {
    if (templates.length > 0 && selectedEmpresa) {
      setSelectedTemplates((prev) => {
        const filteredIds = templates
          .filter((t) => t.cliente_empresa_id === selectedEmpresa)
          .map((t) => t.id);

        const newSet = new Set<string>();
        prev.forEach((id) => {
          if (filteredIds.includes(id)) {
            newSet.add(id);
          }
        });
        return newSet;
      });
    }
  }, [selectedEmpresa, templates]);

  const loadMotoristas = async () => {
    try {
      setLoadingMotoristas(true);
      const { data, error } = await supabase
        .from('motoristas_ativos')
        .select('*')
        .eq('status_ativo', true)
        .order('nome', { ascending: true });

      if (error) throw error;
      setMotoristas(data || []);
      setFilteredMotoristas(data || []);
    } catch (error: any) {
      console.error('Erro ao carregar motoristas:', error);
      toast.error('Erro ao carregar motoristas');
    } finally {
      setLoadingMotoristas(false);
    }
  };

  const loadTemplates = async () => {
    try {
      setLoadingTemplates(true);
      setSelectedEmpresa(defaultEmpresaId);

      const { data, error } = await supabase
        .from('document_templates')
        .select('id, nome, tipo, cliente_empresa_id, empresa_id')
        .eq('ativo', true)
        .order('nome', { ascending: true });

      if (error) throw error;
      setTemplates(data || []);

      // Pré-selecionar templates do tipo contrato_tvde APENAS da empresa padrão
      const contratoIds = (data || [])
        .filter((t) => t.tipo === 'contrato_tvde' && t.cliente_empresa_id === defaultEmpresaId)
        .map((t) => t.id);
      setSelectedTemplates(new Set(contratoIds));
    } catch (error: any) {
      console.error('Erro ao carregar templates:', error);
      toast.error('Erro ao carregar templates de documentos');
    } finally {
      setLoadingTemplates(false);
    }
  };

  const toggleTemplate = (templateId: string) => {
    setSelectedTemplates((prev) => {
      const next = new Set(prev);
      if (next.has(templateId)) {
        next.delete(templateId);
      } else {
        next.add(templateId);
      }
      return next;
    });
  };

  const filteredTemplates = templates.filter(
    (t) => !selectedEmpresa || t.cliente_empresa_id === selectedEmpresa
  );

  // Contador de templates visíveis e selecionados
  const visibleSelectedCount = filteredTemplates.filter((t) => selectedTemplates.has(t.id)).length;

  const handleGenerate = async (action: 'print' | 'download') => {
    if (!activeMotorista) {
      toast.error('Selecione um motorista');
      return;
    }

    if (selectedTemplates.size === 0) {
      toast.error('Selecione pelo menos um documento');
      return;
    }

    try {
      setIsGenerating(true);
      setGeneratedTemplates(new Set());

      const templatesToGenerate = filteredTemplates.filter((t) => selectedTemplates.has(t.id));
      const { data: user } = await supabase.auth.getUser();
      const today = new Date().toISOString().split('T')[0];

      const motoristaData = {
        nome: activeMotorista.nome,
        nif: activeMotorista.nif || '',
        documento_tipo: activeMotorista.documento_tipo || '',
        documento_numero: activeMotorista.documento_numero || '',
        documento_validade: activeMotorista.documento_validade || '',
        carta_conducao: activeMotorista.carta_conducao || '',
        carta_categorias: activeMotorista.carta_categorias?.join(', ') || '',
        carta_validade: activeMotorista.carta_validade || '',
        licenca_tvde_numero: activeMotorista.licenca_tvde_numero || '',
        licenca_tvde_validade: activeMotorista.licenca_tvde_validade || '',
        morada: activeMotorista.morada || '',
        email: activeMotorista.email || '',
        telefone: activeMotorista.telefone || '',
      };

      const empresa = getById(selectedEmpresa);

      // Separar templates por tipo
      const contratoTemplates = templatesToGenerate.filter(
        (t) => t.tipo === 'contrato_tvde' || t.tipo === 'contrato'
      );
      const otherTemplates = templatesToGenerate.filter(
        (t) => t.tipo !== 'contrato_tvde' && t.tipo !== 'contrato'
      );

      let successCount = 0;
      // Para impressão cada documento abre o seu próprio diálogo; combinação só para download
      const isMultiple = templatesToGenerate.length > 1 && action === 'download';

      // Quando múltiplos downloads, criar um PDF combinado onde todos os documentos são adicionados
      const combinedPdf = isMultiple
        ? new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
        : null;

      const docParams = {
        data_inicio: activeMotorista.data_contratacao || today,
        data_assinatura: activeMotorista.data_contratacao || today,
        cidade_assinatura: cidadeAssinatura,
        duracao_meses: 12,
        empresaData: empresa
          ? {
              nomeCompleto: empresa.nomeCompleto,
              nif: empresa.nif,
              sede: empresa.sede,
              licencaTVDE: empresa.licencaTVDE,
              licencaValidade: empresa.licencaValidade,
              representante: empresa.representante,
              cargoRepresentante: empresa.cargoRepresentante,
            }
          : undefined,
      };

      // Criar/reutilizar contrato UMA vez (não por template)
      let contratoId: string | null = null;
      if (contratoTemplates.length > 0) {
        try {
          const contratoData = await gerarContratoAtomico({
            motoristaId: activeMotorista.id,
            empresaId: selectedEmpresa,
            motoristaNome: activeMotorista.nome,
            motoristaNif: activeMotorista.nif,
            motoristaEmail: activeMotorista.email,
            motoristaTelefone: activeMotorista.telefone,
            motoristaMorada: activeMotorista.morada,
            motoristaDocumentoTipo: activeMotorista.documento_tipo,
            motoristaDocumentoNumero: activeMotorista.documento_numero,
            cidadeAssinatura,
            dataAssinatura: activeMotorista.data_contratacao || today,
            dataInicio: activeMotorista.data_contratacao || today,
            duracaoMeses: 12,
            criadoPor: user?.user?.id ?? null,
            forceNewVersion,
            ...(viaturaId ? { viaturaId } : {}),
            ...(calendarioEventoId ? { calendarioEventoId } : {}),
            ...(checkoutPendente !== undefined ? { checkoutPendente } : {}),
          });

          const isExisting = contratoData?.is_existing as boolean | undefined;
          contratoId = contratoData?.id || null;

          if (contratoId) {
            await supabase.from('contratos_reimpressoes').insert({
              contrato_id: contratoId,
              reimpresso_por: user?.user?.id,
              motivo: isExisting
                ? 'Reimpressão de contrato existente'
                : 'Geração inicial do documento',
            });

            // Upload do primeiro template ao storage se pedido
            if (uploadFirstToStorage) {
              const docUrl = await uploadDocumentToStorage({
                templateId: contratoTemplates[0].id,
                motoristaData,
                documentData: docParams,
                contratoId,
                action,
              });
              if (docUrl) {
                await supabase
                  .from('contratos')
                  .update({ documento_url: docUrl })
                  .eq('id', contratoId);
              }
            }
          }
        } catch (err: any) {
          console.error('Erro ao criar/verificar contrato:', err);
          toast.error('Erro ao criar contrato');
        }
      }

      // Gerar PDFs dos templates de contrato (sem chamar RPC de novo)
      for (const template of contratoTemplates) {
        setCurrentGenerating(template.id);
        try {
          await generateDocumentFromTemplate({
            templateId: template.id,
            motoristaData,
            documentData: docParams,
            action,
            skipOutput: isMultiple,
            existingPdf: combinedPdf || undefined,
          });

          setGeneratedTemplates((prev) => new Set(prev).add(template.id));
          successCount++;
        } catch (err: any) {
          console.error(`Erro ao gerar ${template.nome}:`, err);
          toast.error(`Erro ao gerar ${template.nome}`);
        }
      }

      // Processar outros templates (declarações, etc.)
      for (const template of otherTemplates) {
        setCurrentGenerating(template.id);
        try {
          await generateDocumentFromTemplate({
            templateId: template.id,
            motoristaData,
            documentData: docParams,
            action,
            skipOutput: isMultiple,
            existingPdf: combinedPdf || undefined,
          });

          setGeneratedTemplates((prev) => new Set(prev).add(template.id));
          successCount++;
        } catch (err: any) {
          console.error(`Erro ao gerar ${template.nome}:`, err);
          toast.error(`Erro ao gerar ${template.nome}`);
        }
      }

      // Quando múltiplos downloads: apagar página 1 em branco e guardar PDF combinado
      if (isMultiple && combinedPdf && successCount > 0) {
        combinedPdf.deletePage(1);
        const today_str = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const fileName = `Documentos_${activeMotorista.nome}_${today_str}.pdf`;
        combinedPdf.save(fileName);
      }

      setCurrentGenerating(null);
      toast.success(`${successCount} documento(s) gerado(s) com sucesso!`);

      // Chamar callback de sucesso se existir
      onSuccess?.();
    } catch (error: any) {
      console.error('Erro ao gerar documentos:', error);
      toast.error('Erro ao gerar documentos: ' + error.message);
    } finally {
      setIsGenerating(false);
      setCurrentGenerating(null);
    }
  };

  const isLoading = loadingTemplates || loadingMotoristas;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden [&>button:last-child]:hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Gerar Documentos
          </DialogTitle>
          {activeMotorista && (
            <DialogDescription>
              A gerar documentos para: <strong>{activeMotorista.nome}</strong>
            </DialogDescription>
          )}
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4 py-4 overflow-hidden">
            {/* Seleção de Motorista (quando não passado nas props) */}
            {!motorista && (
              <div className="space-y-2">
                <Label>Motorista</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Pesquisar motorista por nome, email ou NIF..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {!selectedMotorista && (
                  <ScrollArea className="h-[180px] border rounded-md">
                    {filteredMotoristas.length === 0 ? (
                      <div className="p-4 text-center text-muted-foreground">
                        Nenhum motorista encontrado
                      </div>
                    ) : (
                      <div className="p-2 space-y-1">
                        {filteredMotoristas.map((m) => (
                          <button
                            key={m.id}
                            onClick={() => setSelectedMotorista(m)}
                            className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-accent text-left transition-colors"
                          >
                            <User className="h-4 w-4 text-muted-foreground" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{m.nome}</p>
                              <p className="text-sm text-muted-foreground truncate">
                                {m.email || m.telefone || 'Sem contato'}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                )}

                {selectedMotorista && (
                  <div className="flex items-center gap-3 p-3 bg-primary/10 border border-primary rounded-md">
                    <User className="h-5 w-5 text-primary" />
                    <div className="flex-1">
                      <p className="font-medium">{selectedMotorista.nome}</p>
                      <p className="text-sm text-muted-foreground">
                        {selectedMotorista.email || selectedMotorista.telefone}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedMotorista(null)}>
                      Alterar
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Informação do motorista (se passado nas props) */}
            {motorista && (
              <div className="grid grid-cols-2 gap-4 p-3 bg-muted rounded-lg">
                <div>
                  <p className="text-xs text-muted-foreground">Motorista</p>
                  <p className="font-medium">{motorista.nome}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Data Contratação</p>
                  <p className="font-medium">
                    {motorista.data_contratacao
                      ? new Date(motorista.data_contratacao).toLocaleDateString('pt-PT')
                      : 'Não definida'}
                  </p>
                </div>
              </div>
            )}

            {/* Mostrar campos apenas quando há um motorista ativo */}
            {activeMotorista && (
              <>
                {/* Cidade de Assinatura e Empresa */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cidadeAssinatura">Cidade de Assinatura</Label>
                    <Input
                      id="cidadeAssinatura"
                      value={cidadeAssinatura}
                      onChange={(e) => setCidadeAssinatura(e.target.value)}
                      placeholder="Ex: Lisboa"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="empresa">Empresa</Label>
                    <Select value={selectedEmpresa} onValueChange={setSelectedEmpresa}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a empresa" />
                      </SelectTrigger>
                      <SelectContent>
                        {empresas.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Lista de Templates para Seleção */}
                <div className="space-y-2">
                  <Label>Documentos a Gerar</Label>
                  <ScrollArea className="h-[180px] border rounded-md p-3">
                    {templates.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Nenhum template disponível para esta empresa
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {templates
                          .filter((t) => t.cliente_empresa_id === selectedEmpresa)
                          .map((template) => (
                            <div
                              key={template.id}
                              className="flex items-center space-x-3 p-2 hover:bg-muted/50 rounded-md cursor-pointer"
                              onClick={() => toggleTemplate(template.id)}
                            >
                              <Checkbox
                                id={template.id}
                                checked={selectedTemplates.has(template.id)}
                                onCheckedChange={() => toggleTemplate(template.id)}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <label
                                htmlFor={template.id}
                                className="text-sm font-medium leading-none cursor-pointer flex-1"
                              >
                                {template.nome}
                              </label>
                            </div>
                          ))}
                      </div>
                    )}
                  </ScrollArea>
                </div>

                <p className="text-xs text-muted-foreground text-center">
                  {visibleSelectedCount} documento(s) selecionado(s)
                </p>
              </>
            )}
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>
            Cancelar
          </Button>
          <Button
            variant="outline"
            onClick={() => handleGenerate('download')}
            disabled={isGenerating || isLoading || !activeMotorista || visibleSelectedCount === 0}
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />A gerar...
              </>
            ) : (
              'Download'
            )}
          </Button>
          <Button
            onClick={() => handleGenerate('print')}
            disabled={isGenerating || isLoading || !activeMotorista || visibleSelectedCount === 0}
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />A gerar...
              </>
            ) : (
              'Imprimir'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
