import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import {
  ArrowLeft,
  Edit3,
  Mail,
  Phone,
  Calendar,
  Tag,
  FileText,
  Upload,
  CheckCircle,
  XCircle,
  History,
  User,
  Building,
  MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import type { TablesUpdate } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { CampaignTagsManager } from '@/components/crm/CampaignTagsManager';
import { LeadStatusHistory } from '@/components/crm/LeadStatusHistory';

interface Lead {
  id: string;
  nome: string;
  email: string;
  telefone?: string;
  zona?: string;
  data_aluguer?: string;
  tipo_viatura?: string;
  observacoes?: string;
  observacoes_gestores?: string;
  campaign_tags?: string[];
  status: string;
  created_at: string;
  updated_at: string;
  formulario_id?: string;
  valor_negocio?: string;
  gestor_responsavel?: string;
  tem_formacao_tvde?: boolean;
}

const LeadDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [refreshHistoryKey, setRefreshHistoryKey] = useState(0);
  const [notes, setNotes] = useState<any[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [gestores, setGestores] = useState<{ nome: string }[]>([]);
  const [formData, setFormData] = useState({
    valor_negocio: '',
    gestor_responsavel: 'none',
    tipo_viatura: '',
    newNote: '',
  });

  useEffect(() => {
    if (id) {
      fetchLead();
      fetchNotes();
      fetchGestores();
    }
  }, [id]);

  const fetchLead = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('leads_dasprent')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      setLead(data);
      setFormData({
        valor_negocio: data.valor_negocio || '',
        gestor_responsavel: data.gestor_responsavel || 'none',
        tipo_viatura: data.tipo_viatura || '',
        newNote: '',
      });

      // Atribuir gestor automaticamente na primeira visualização
      if (data && (!data.gestor_responsavel || data.gestor_responsavel.trim() === '') && user?.id) {
        try {
          const { data: assigned, error: assignError } = await supabase.rpc(
            'assign_lead_on_first_view',
            {
              lead_id_param: data.id,
              user_id_param: user.id,
            }
          );
          if (!assignError && assigned === true) {
            // Buscar nome do gestor e atualizar localmente
            const { data: profile, error: profileError } = await supabase
              .from('profiles')
              .select('nome')
              .eq('id', user.id)
              .single();
            if (!profileError && profile?.nome) {
              setLead((prev) => (prev ? { ...prev, gestor_responsavel: profile.nome } : prev));
              setFormData((prev) => ({ ...prev, gestor_responsavel: profile.nome }));
            }
          }
        } catch (e) {
          console.error('Erro ao atribuir gestor na primeira visualização:', e);
        }
      }
    } catch (error) {
      console.error('Erro ao buscar lead:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os dados do lead.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchNotes = async () => {
    if (!id) return;

    try {
      setLoadingNotes(true);
      const { data: notesData, error } = await supabase
        .from('lead_status_history')
        .select(
          `
          *,
          profiles:alterado_por (
            nome,
            email
          )
        `
        )
        .eq('lead_id', id)
        .not('observacoes', 'is', null)
        .order('alterado_em', { ascending: false });

      if (error) throw error;

      setNotes(notesData || []);
    } catch (error) {
      console.error('Erro ao buscar anotações:', error);
    } finally {
      setLoadingNotes(false);
    }
  };

  const fetchGestores = async () => {
    try {
      const { data, error } = await supabase.rpc('get_gestores');

      if (error) throw error;

      // Transformar o resultado para ter a estrutura esperada
      const gestoresData = (data || []).map((item: any) => ({
        nome: item.nome,
      }));

      setGestores(gestoresData);
    } catch (error) {
      console.error('Erro ao buscar gestores:', error);
    }
  };

  const formatarNome = (nomeCompleto: string) => {
    if (!nomeCompleto) return '';
    const nomes = nomeCompleto
      .trim()
      .split(' ')
      .filter((nome) => nome.length > 0);
    if (nomes.length === 1) {
      return nomes[0].charAt(0).toUpperCase() + nomes[0].slice(1).toLowerCase();
    }
    const primeiroNome = nomes[0].charAt(0).toUpperCase() + nomes[0].slice(1).toLowerCase();
    const ultimoNome =
      nomes[nomes.length - 1].charAt(0).toUpperCase() +
      nomes[nomes.length - 1].slice(1).toLowerCase();
    return `${primeiroNome} ${ultimoNome}`;
  };

  const updateLeadStatus = async (newStatus: string) => {
    if (!lead) return;

    try {
      // Garantir atribuição ao gestor atual antes da atualização (RLS)
      if ((!lead.gestor_responsavel || lead.gestor_responsavel.trim() === '') && user?.id) {
        const { data: assigned, error: assignError } = await supabase.rpc(
          'assign_lead_on_first_view',
          {
            lead_id_param: lead.id,
            user_id_param: user.id,
          }
        );
        if (assignError)
          console.error('Erro ao atribuir gestor antes de atualizar status:', assignError);
      }

      const { error } = await supabase
        .from('leads_dasprent')
        .update({ status: newStatus })
        .eq('id', lead.id);

      if (error) throw error;

      setLead({ ...lead, status: newStatus });
      toast({
        title: 'Sucesso',
        description: `Lead marcado como ${newStatus}.`,
      });

      // Voltar para a lista (fechar "modal") para ir ao próximo lead
      navigate('/crm');
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar o status do lead.',
        variant: 'destructive',
      });
    }
  };

  const updateField = async (field: string, value: any) => {
    if (!lead) return;

    try {
      const { error } = await supabase
        .from('leads_dasprent')
        .update({ [field]: value } as TablesUpdate<'leads_dasprent'>)
        .eq('id', lead.id);

      if (error) throw error;

      setLead({ ...lead, [field]: value });
      setEditingField(null);
      toast({
        title: 'Sucesso',
        description: 'Campo atualizado com sucesso.',
      });
    } catch (error) {
      console.error('Erro ao atualizar campo:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar o campo.',
        variant: 'destructive',
      });
    }
  };

  const saveNote = async () => {
    if (!lead || !formData.newNote.trim()) return;

    try {
      const { error } = await supabase.from('lead_status_history').insert({
        lead_id: lead.id,
        status_anterior: lead.status,
        status_novo: lead.status,
        alterado_por: user?.id,
        observacoes: formData.newNote.trim(),
      });

      if (error) throw error;

      setFormData({ ...formData, newNote: '' });
      setRefreshHistoryKey((prev) => prev + 1); // Força refresh do histórico
      fetchNotes(); // Atualiza as anotações
      toast({
        title: 'Sucesso',
        description: 'Anotação salva com sucesso.',
      });
    } catch (error) {
      console.error('Erro ao salvar anotação:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar a anotação.',
        variant: 'destructive',
      });
    }
  };

  // Interface para dados do formulário
  interface FormFieldData {
    label: string;
    value: any;
    type: string;
  }

  const [formFieldsData, setFormFieldsData] = useState<Record<string, FormFieldData>>({});

  const getLeadDisplayData = (lead: Lead) => {
    const displayData = {
      nome: lead.nome,
      email: lead.email,
      telefone: lead.telefone,
    };

    if (lead.observacoes) {
      try {
        const observacoesData = JSON.parse(lead.observacoes);

        if (typeof observacoesData === 'object' && observacoesData !== null) {
          // Novo formato com labels
          Object.entries(observacoesData).forEach(([key, fieldData]: [string, any]) => {
            if (fieldData && typeof fieldData === 'object' && fieldData.label) {
              const labelLower = fieldData.label.toLowerCase();
              const value = String(fieldData.value || '').trim();

              if (!value) return;

              if (
                labelLower.includes('nome') &&
                !labelLower.includes('sobre') &&
                (!displayData.nome || displayData.nome === 'Nome não fornecido')
              ) {
                displayData.nome = value;
              } else if (
                (labelLower.includes('email') || labelLower.includes('e-mail')) &&
                (!displayData.email || displayData.email === 'email@naoidentificado.com')
              ) {
                displayData.email = value;
              } else if (
                (labelLower.includes('telefone') ||
                  labelLower.includes('whatsapp') ||
                  labelLower.includes('telemóvel')) &&
                !displayData.telefone
              ) {
                displayData.telefone = value;
              }
            } else if (typeof fieldData === 'string') {
              // Formato antigo (fallback)
              const value = fieldData.trim();
              if (!value) return;

              if (
                value.includes('@') &&
                (!displayData.email || displayData.email === 'email@naoidentificado.com')
              ) {
                displayData.email = value;
              } else if (
                /^\+?\d{9,}$/.test(value.replace(/[\s()-]/g, '')) &&
                !displayData.telefone
              ) {
                displayData.telefone = value;
              }
            }
          });
        }
      } catch (error) {
        // Não é JSON, ignorar
      }
    }

    return displayData;
  };

  // Extrair campos do formulário
  const extractFormFields = (lead: Lead): Record<string, FormFieldData> => {
    if (!lead.observacoes) return {};

    try {
      const observacoesData = JSON.parse(lead.observacoes);

      if (typeof observacoesData === 'object' && observacoesData !== null) {
        const fields: Record<string, FormFieldData> = {};

        Object.entries(observacoesData).forEach(([key, fieldData]: [string, any]) => {
          if (
            fieldData &&
            typeof fieldData === 'object' &&
            fieldData.label &&
            fieldData.value !== undefined &&
            fieldData.value !== ''
          ) {
            fields[key] = fieldData as FormFieldData;
          }
        });

        return fields;
      }
    } catch (error) {
      // Não é JSON válido
    }

    return {};
  };

  // Atualizar campos do formulário quando o lead mudar
  useEffect(() => {
    if (lead) {
      setFormFieldsData(extractFormFields(lead));
    }
  }, [lead]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-yellow-500 mx-auto"></div>
          <p className="text-white mt-4">Carregando dados do lead...</p>
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Lead não encontrado</h1>
          <Button onClick={() => navigate('/crm')} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar ao CRM
          </Button>
        </div>
      </div>
    );
  }

  const displayData = getLeadDisplayData(lead);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700/50 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                onClick={() => navigate('/crm')}
                variant="ghost"
                size="sm"
                className="text-gray-400 hover:text-white"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-white">{displayData.nome}</h1>
                <p className="text-gray-400">Lead #{lead.id.slice(0, 8)}</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-gray-300">
                <User className="h-4 w-4" />
                <span>{user?.email}</span>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => updateLeadStatus('contactado')}
                  className="bg-yellow-600 hover:bg-yellow-700"
                >
                  <Phone className="h-4 w-4 mr-2" />
                  Contactado
                </Button>
                <Button
                  onClick={() => updateLeadStatus('interessado')}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <User className="h-4 w-4 mr-2" />
                  Interessado
                </Button>
                <Button
                  onClick={() => updateLeadStatus('convertido')}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Ganho
                </Button>
                <Button onClick={() => updateLeadStatus('perdido')} variant="destructive">
                  <XCircle className="h-4 w-4 mr-2" />
                  Perdido
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna Principal */}
          <div className="lg:col-span-2 space-y-6">
            {/* Resumo */}
            <Card className="bg-gray-800/50 backdrop-blur-sm border-gray-700/50">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Building className="h-5 w-5" />
                  Resumo do Negócio
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm text-gray-400 mb-1 block">Valor do Negócio</label>
                    {editingField === 'valor_negocio' ? (
                      <div className="flex gap-2">
                        <Input
                          value={formData.valor_negocio}
                          onChange={(e) =>
                            setFormData({ ...formData, valor_negocio: e.target.value })
                          }
                          placeholder="Ex: €1500"
                          className="bg-gray-700 border-gray-600 text-white"
                        />
                        <Button
                          size="sm"
                          onClick={() => updateField('valor_negocio', formData.valor_negocio)}
                        >
                          Salvar
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-white">
                          {formData.valor_negocio || 'Não definido'}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingField('valor_negocio')}
                        >
                          <Edit3 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-sm text-gray-400 mb-1 block">Gestor Responsável</label>
                    {editingField === 'gestor_responsavel' ? (
                      <div className="flex gap-2">
                        <Select
                          value={formData.gestor_responsavel}
                          onValueChange={(value) =>
                            setFormData({ ...formData, gestor_responsavel: value })
                          }
                        >
                          <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                            <SelectValue placeholder="Selecionar gestor" />
                          </SelectTrigger>
                          <SelectContent className="bg-gray-800 border-gray-600 z-50">
                            <SelectItem value="none" className="text-gray-400">
                              Não atribuído
                            </SelectItem>
                            {gestores.map((gestor) => (
                              <SelectItem
                                key={gestor.nome}
                                value={gestor.nome}
                                className="text-white hover:bg-gray-700"
                              >
                                {formatarNome(gestor.nome)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          onClick={() =>
                            updateField(
                              'gestor_responsavel',
                              formData.gestor_responsavel === 'none'
                                ? null
                                : formData.gestor_responsavel
                            )
                          }
                        >
                          Salvar
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-white">
                          {formData.gestor_responsavel || 'Não atribuído'}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingField('gestor_responsavel')}
                        >
                          <Edit3 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-sm text-gray-400 mb-1 block">Licença TVDE</label>
                    <div className="flex items-center gap-2">
                      {lead.tem_formacao_tvde === null ? (
                        <Badge
                          variant="outline"
                          className="bg-gray-500/20 text-gray-400 border-gray-500/30"
                        >
                          Não informado
                        </Badge>
                      ) : lead.tem_formacao_tvde === false ? (
                        <Badge
                          variant="outline"
                          className="bg-red-500/20 text-red-400 border-red-500/30"
                        >
                          Não possui
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-green-500/20 text-green-400 border-green-500/30"
                        >
                          Possui
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Etiquetas de Campanha</label>
                  <CampaignTagsManager
                    tags={lead.campaign_tags || []}
                    onTagsChange={(tags) => updateField('campaign_tags', tags)}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-700">
                  <div>
                    <label className="text-sm text-gray-400 mb-1 block">Data de Entrada</label>
                    <div className="flex items-center gap-2 text-white">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      {format(new Date(lead.created_at), 'dd/MM/yyyy HH:mm', { locale: pt })}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm text-gray-400 mb-1 block">Status Atual</label>
                    <Badge
                      className={`
                      ${lead.status === 'novo' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' : ''}
                      ${lead.status === 'contactado' ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' : ''}
                      ${lead.status === 'reuniao_agendada' ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' : ''}
                      ${lead.status === 'proposta_enviada' ? 'bg-orange-500/20 text-orange-300 border-orange-500/30' : ''}
                      ${lead.status === 'ganho' ? 'bg-green-500/20 text-green-300 border-green-500/30' : ''}
                      ${lead.status === 'perdido' ? 'bg-red-500/20 text-red-300 border-red-500/30' : ''}
                    `}
                    >
                      {lead.status}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tabs com funcionalidades */}
            <Tabs
              defaultValue="notes"
              className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700/50"
            >
              <TabsList className="grid w-full grid-cols-4 bg-gray-700/50">
                <TabsTrigger value="notes">Anotações</TabsTrigger>
                <TabsTrigger value="meetings">Reuniões</TabsTrigger>
                <TabsTrigger value="emails">E-mails</TabsTrigger>
                <TabsTrigger value="files">Arquivos</TabsTrigger>
              </TabsList>

              <TabsContent value="notes" className="p-6">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-4">Nova Anotação</h3>
                    <div className="space-y-2">
                      <Textarea
                        value={formData.newNote}
                        onChange={(e) => setFormData({ ...formData, newNote: e.target.value })}
                        placeholder="Escreva sua anotação sobre este lead..."
                        className="bg-gray-700 border-gray-600 text-white min-h-[120px]"
                      />
                      <Button
                        onClick={saveNote}
                        disabled={!formData.newNote.trim()}
                        className="w-full"
                      >
                        Salvar Anotação
                      </Button>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-white mb-4">Anotações Anteriores</h3>
                    {loadingNotes ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-yellow-500"></div>
                        <span className="ml-2 text-gray-400">Carregando anotações...</span>
                      </div>
                    ) : notes.length === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-gray-400">Nenhuma anotação encontrada.</p>
                      </div>
                    ) : (
                      <div className="space-y-4 max-h-96 overflow-y-auto">
                        {notes.map((note) => (
                          <div
                            key={note.id}
                            className="bg-gray-700/50 rounded-lg p-4 border border-gray-600/50"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2 text-sm text-gray-400">
                                <User className="h-4 w-4" />
                                <span>
                                  {note.profiles?.nome || note.profiles?.email || 'Sistema'}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 text-xs text-gray-500">
                                <Calendar className="h-3 w-3" />
                                <span>
                                  {format(new Date(note.alterado_em), 'dd/MM/yyyy HH:mm', {
                                    locale: pt,
                                  })}
                                </span>
                              </div>
                            </div>
                            <p className="text-gray-300 text-sm leading-relaxed">
                              {note.observacoes}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="meetings" className="p-6">
                <div className="text-center py-8">
                  <Calendar className="h-12 w-12 text-gray-500 mx-auto mb-4" />
                  <p className="text-gray-400">Funcionalidade de agendamento em desenvolvimento</p>
                </div>
              </TabsContent>

              <TabsContent value="emails" className="p-6">
                <div className="space-y-4">
                  <Button
                    className="w-full"
                    onClick={() => window.open(`mailto:${displayData.email}`)}
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Enviar E-mail para {displayData.email}
                  </Button>
                  <div className="text-center py-8">
                    <Mail className="h-12 w-12 text-gray-500 mx-auto mb-4" />
                    <p className="text-gray-400">Histórico de e-mails em desenvolvimento</p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="files" className="p-6">
                <div className="space-y-4">
                  <Button variant="outline" className="w-full">
                    <Upload className="h-4 w-4 mr-2" />
                    Anexar Documento
                  </Button>
                  <div className="text-center py-8">
                    <FileText className="h-12 w-12 text-gray-500 mx-auto mb-4" />
                    <p className="text-gray-400">Nenhum arquivo anexado</p>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            {/* Histórico do Lead */}
            <Card className="bg-gray-800/50 backdrop-blur-sm border-gray-700/50">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Histórico do Lead
                </CardTitle>
              </CardHeader>
              <CardContent>
                <LeadStatusHistory key={refreshHistoryKey} leadId={lead.id} />
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Informações de Contato */}
            <Card className="bg-gray-800/50 backdrop-blur-sm border-gray-700/50">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Informações de Contato
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm text-gray-400">Nome</label>
                  <p className="text-white font-medium">{displayData.nome}</p>
                </div>

                <Separator className="bg-gray-700" />

                <div>
                  <label className="text-sm text-gray-400">E-mail</label>
                  <div className="flex items-center gap-2">
                    <p className="text-white">{displayData.email}</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => window.open(`mailto:${displayData.email}`)}
                    >
                      <Mail className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <Separator className="bg-gray-700" />

                <div>
                  <label className="text-sm text-gray-400">Telefone</label>
                  <div className="flex items-center gap-2">
                    <p className="text-white">{displayData.telefone || 'Não informado'}</p>
                    {displayData.telefone && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          window.open(`https://wa.me/${displayData.telefone?.replace(/\D/g, '')}`)
                        }
                      >
                        <Phone className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>

                {lead.zona && (
                  <>
                    <Separator className="bg-gray-700" />
                    <div>
                      <label className="text-sm text-gray-400">Zona</label>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-gray-400" />
                        <p className="text-white">{lead.zona}</p>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Viatura de Interesse */}
            <Card className="bg-gray-800/50 backdrop-blur-sm border-gray-700/50">
              <CardHeader>
                <CardTitle className="text-white">Viatura de Interesse</CardTitle>
              </CardHeader>
              <CardContent>
                {editingField === 'tipo_viatura' ? (
                  <div className="space-y-2">
                    <Input
                      value={formData.tipo_viatura}
                      onChange={(e) => setFormData({ ...formData, tipo_viatura: e.target.value })}
                      placeholder="Ex: BMW Série 3, Mercedes Classe A..."
                      className="bg-gray-700 border-gray-600 text-white"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => updateField('tipo_viatura', formData.tipo_viatura)}
                      >
                        Salvar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingField(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="text-white">{lead.tipo_viatura || 'Não especificado'}</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingField('tipo_viatura')}
                    >
                      <Edit3 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Dados do Formulário */}
            {Object.keys(formFieldsData).length > 0 && (
              <Card className="bg-gray-800/50 backdrop-blur-sm border-gray-700/50">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Dados do Formulário
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {Object.entries(formFieldsData)
                    .filter(([key, fieldData]) => {
                      const labelLower = fieldData.label.toLowerCase();
                      // Não mostrar campos básicos já exibidos
                      if (labelLower.includes('nome') && !labelLower.includes('sobre'))
                        return false;
                      if (labelLower.includes('email') || labelLower.includes('e-mail'))
                        return false;
                      if (
                        labelLower.includes('telefone') ||
                        labelLower.includes('whatsapp') ||
                        labelLower.includes('telemóvel')
                      )
                        return false;
                      return String(fieldData.value || '').trim().length > 0;
                    })
                    .map(([key, fieldData]) => (
                      <div key={key} className="bg-gray-700/30 rounded-lg p-3">
                        <label className="text-sm text-gray-400 block mb-1">
                          {fieldData.label}
                        </label>
                        <p className="text-white">
                          {Array.isArray(fieldData.value)
                            ? fieldData.value.join(', ')
                            : String(fieldData.value)}
                        </p>
                      </div>
                    ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeadDetails;
