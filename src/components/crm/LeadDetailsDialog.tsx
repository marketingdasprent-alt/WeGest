import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EditLeadDialog } from './EditLeadDialog';
import { LeadStatusHistory } from './LeadStatusHistory';
import { supabase } from '@/integrations/supabase/client';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Car,
  FileText,
  Edit3,
  Trash2,
  X,
  Tag,
} from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

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
  formulario_id?: string;
  gestor_responsavel?: string;
}

interface LeadDetailsDialogProps {
  lead: Lead | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (updatedLead: Partial<Lead>) => void;
  onDelete: (leadId: string) => void;
}

const statusLabels: Record<string, string> = {
  novo: 'Novo',
  contactado: 'Contactado',
  interessado: 'Interessado',
  convertido: 'Convertido',
  perdido: 'Perdido',
};

const statusColors: Record<string, string> = {
  novo: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
  contactado: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
  interessado: 'bg-green-500/20 text-green-400 border-green-500/50',
  convertido: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
  perdido: 'bg-red-500/20 text-red-400 border-red-500/50',
};

interface FormFieldData {
  label: string;
  value: any;
  type: string;
}

export const LeadDetailsDialog: React.FC<LeadDetailsDialogProps> = ({
  lead,
  isOpen,
  onClose,
  onEdit,
  onDelete,
}) => {
  const isMobile = useIsMobile();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [formularioTags, setFormularioTags] = useState<string[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [formFields, setFormFields] = useState<Record<string, FormFieldData>>({});

  // Função para extrair dados das observações
  const getLeadDisplayData = (lead: Lead) => {
    const displayData = {
      nome: lead.nome,
      email: lead.email,
      telefone: lead.telefone,
      zona: lead.zona,
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
              } else if (
                (labelLower.includes('zona') ||
                  labelLower.includes('cidade') ||
                  labelLower.includes('região')) &&
                !displayData.zona
              ) {
                displayData.zona = value;
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

  // Extrair todos os campos do formulário das observações
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

  // Buscar etiquetas do formulário e atribuir gestor quando o lead é aberto
  useEffect(() => {
    const fetchFormularioTags = async () => {
      if (!lead?.formulario_id) {
        setFormularioTags([]);
        return;
      }

      setLoadingTags(true);
      try {
        const { data, error } = await supabase
          .from('formulario_campanhas')
          .select('campanha_tag')
          .eq('formulario_id', lead.formulario_id);

        if (error) throw error;

        const tags = data?.map((item) => item.campanha_tag) || [];
        setFormularioTags(tags);
      } catch (error) {
        console.error('Erro ao buscar etiquetas do formulário:', error);
        setFormularioTags([]);
      } finally {
        setLoadingTags(false);
      }
    };

    const assignGestor = async () => {
      if (!lead || (lead.gestor_responsavel && lead.gestor_responsavel.trim())) return;

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user) return;

        const { data, error } = await supabase.rpc('assign_lead_on_first_view', {
          lead_id_param: lead.id,
          user_id_param: user.id,
        });

        if (!error && data === true) {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('nome')
            .eq('id', user.id)
            .single();

          if (!profileError && profile?.nome) {
            onEdit({ ...lead, gestor_responsavel: profile.nome });
          }
        }
      } catch (error) {
        console.error('Erro ao atribuir gestor:', error);
      }
    };

    if (isOpen && lead) {
      fetchFormularioTags();
      assignGestor();
      setFormFields(extractFormFields(lead));
    }
  }, [lead, isOpen, onEdit]);

  if (!lead) return null;

  // Obter dados para exibição (campos principais ou extraídos das observações)
  const displayData = getLeadDisplayData(lead);

  const handleEdit = () => {
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = (updatedLead: Partial<Lead>) => {
    onEdit(updatedLead);
    setIsEditDialogOpen(false);
  };

  const handleDelete = () => {
    if (
      window.confirm('Tem certeza que deseja excluir este lead? Esta ação não pode ser desfeita.')
    ) {
      onDelete(lead.id);
      onClose();
    }
  };

  const handleEmailClick = () => {
    window.open(`mailto:${displayData.email}`, '_blank');
  };

  const handlePhoneClick = () => {
    if (displayData.telefone) {
      // Remove all non-numeric characters and format for WhatsApp
      const phoneNumber = displayData.telefone.replace(/\D/g, '');
      // If it doesn't start with country code, assume it's Portuguese (+351)
      const formattedNumber = phoneNumber.startsWith('351') ? phoneNumber : `351${phoneNumber}`;
      window.open(`https://wa.me/${formattedNumber}`, '_blank');
    }
  };

  // Mobile version with Sheet
  if (isMobile) {
    return (
      <>
        <Sheet open={isOpen} onOpenChange={onClose}>
          <SheetContent
            side="bottom"
            className="h-[90vh] bg-gradient-to-br from-gray-900 to-black border-gray-700 text-white p-0"
          >
            {/* Header */}
            <SheetHeader className="p-4 border-b border-gray-700">
              <div className="flex items-center justify-between">
                <SheetTitle className="text-lg font-bold text-white flex items-center gap-2">
                  <User className="h-5 w-5 text-yellow-500" />
                  {displayData.nome || 'Lead sem nome'}
                </SheetTitle>
                <Badge
                  variant="outline"
                  className={`text-xs ${statusColors[lead.status] || 'bg-gray-500/20 text-gray-400'}`}
                >
                  {statusLabels[lead.status] || lead.status}
                </Badge>
              </div>
            </SheetHeader>

            {/* Content */}
            <ScrollArea className="h-[calc(90vh-12rem)] px-4">
              <div className="space-y-4 py-4">
                {/* Contact Info */}
                <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
                  <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                    <User className="h-4 w-4 text-yellow-500" />
                    Informações de Contacto
                  </h3>

                  <div className="space-y-2 text-sm">
                    {displayData.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="h-3 w-3 text-gray-400 flex-shrink-0" />
                        <button
                          onClick={handleEmailClick}
                          className="text-gray-300 hover:text-yellow-400 hover:underline truncate"
                        >
                          {displayData.email}
                        </button>
                      </div>
                    )}
                    {displayData.telefone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-3 w-3 text-gray-400 flex-shrink-0" />
                        <button
                          onClick={handlePhoneClick}
                          className="text-gray-300 hover:text-yellow-400 hover:underline"
                        >
                          {displayData.telefone}
                        </button>
                      </div>
                    )}
                    {displayData.zona && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3 w-3 text-gray-400 flex-shrink-0" />
                        <span className="text-gray-300">{displayData.zona}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Additional Details */}
                {(lead.data_aluguer || lead.tipo_viatura) && (
                  <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
                    <h3 className="text-sm font-semibold text-white mb-3">Detalhes</h3>
                    <div className="space-y-2 text-sm">
                      {lead.data_aluguer && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3 text-gray-400" />
                          <span className="text-gray-300">
                            {format(new Date(lead.data_aluguer), "dd 'de' MMM, yyyy", {
                              locale: pt,
                            })}
                          </span>
                        </div>
                      )}
                      {lead.tipo_viatura && (
                        <div className="flex items-center gap-2">
                          <Car className="h-3 w-3 text-gray-400" />
                          <span className="text-gray-300">{lead.tipo_viatura}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Campaign Tags */}
                {lead.campaign_tags && lead.campaign_tags.length > 0 && (
                  <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
                    <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                      <Tag className="h-4 w-4 text-yellow-500" />
                      Campanhas
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {lead.campaign_tags.map((tag, index) => (
                        <Badge
                          key={index}
                          variant="outline"
                          className="text-xs bg-yellow-500/10 text-yellow-300 border-yellow-500/30"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Observations */}
                {lead.observacoes_gestores && (
                  <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
                    <h3 className="text-sm font-semibold text-white mb-2">Observações</h3>
                    <p className="text-xs text-gray-300 whitespace-pre-wrap">
                      {lead.observacoes_gestores}
                    </p>
                  </div>
                )}

                {/* Status History */}
                <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
                  <h3 className="text-sm font-semibold text-white mb-3">Histórico</h3>
                  <LeadStatusHistory leadId={lead.id} />
                </div>
              </div>
            </ScrollArea>

            {/* Action Buttons */}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-background border-t border-gray-700 space-y-2">
              <Button
                onClick={handleEdit}
                variant="outline"
                className="w-full border-gray-600 text-gray-300 hover:bg-gray-800"
              >
                <Edit3 className="h-4 w-4 mr-2" />
                Editar Lead
              </Button>
              <Button
                onClick={handleDelete}
                variant="outline"
                className="w-full border-red-600 text-red-400 hover:bg-red-900/20"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir Lead
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        {/* Edit Dialog */}
        <EditLeadDialog
          lead={lead}
          isOpen={isEditDialogOpen}
          onClose={() => setIsEditDialogOpen(false)}
          onSave={handleSaveEdit}
        />
      </>
    );
  }

  // Desktop version with Dialog
  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="bg-gradient-to-br from-gray-900 to-black border-gray-700 text-white max-w-5xl max-h-[95vh] p-0">
          {/* Header with close button */}
          <DialogHeader className="p-6 pb-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl font-bold text-white flex items-center gap-3">
                <div className="p-2 rounded-full bg-gradient-to-r from-yellow-500/20 to-yellow-600/20 border border-yellow-500/30">
                  <User className="h-5 w-5 text-yellow-500" />
                </div>
                <div>
                  <span>{displayData.nome || 'Lead sem nome'}</span>
                  <Badge
                    variant="outline"
                    className={`ml-3 text-xs ${statusColors[lead.status] || 'bg-gray-500/20 text-gray-400'}`}
                  >
                    {statusLabels[lead.status] || lead.status}
                  </Badge>
                </div>
              </DialogTitle>

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleEdit}
                  variant="outline"
                  size="sm"
                  className="border-gray-600 text-gray-300 hover:bg-gray-800"
                >
                  <Edit3 className="h-4 w-4 mr-1" />
                  Editar
                </Button>
                <Button
                  onClick={handleDelete}
                  variant="outline"
                  size="sm"
                  className="border-red-600 text-red-400 hover:bg-red-900/20"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Excluir
                </Button>
                <DialogClose asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-gray-400 hover:text-white hover:bg-gray-800"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </DialogClose>
              </div>
            </div>
          </DialogHeader>

          {/* Content */}
          <ScrollArea className="flex-1 px-6 pb-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
              {/* Informações do Lead */}
              <div className="space-y-6">
                <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <User className="h-5 w-5 text-yellow-500" />
                    Informações de Contacto
                  </h3>

                  <div className="space-y-3">
                    {displayData.email && displayData.email.trim() && (
                      <div className="flex items-center gap-3">
                        <Mail className="h-4 w-4 text-gray-400" />
                        <button
                          onClick={handleEmailClick}
                          className="text-gray-300 hover:text-yellow-400 hover:underline cursor-pointer transition-colors"
                        >
                          {displayData.email.trim()}
                        </button>
                      </div>
                    )}

                    {displayData.telefone && displayData.telefone.trim() && (
                      <div className="flex items-center gap-3">
                        <Phone className="h-4 w-4 text-gray-400" />
                        <button
                          onClick={handlePhoneClick}
                          className="text-gray-300 hover:text-green-400 hover:underline cursor-pointer transition-colors"
                        >
                          {displayData.telefone.trim()}
                        </button>
                      </div>
                    )}

                    {displayData.zona && displayData.zona.trim() && (
                      <div className="flex items-center gap-3">
                        <MapPin className="h-4 w-4 text-gray-400" />
                        <span className="text-gray-300">{displayData.zona.trim()}</span>
                      </div>
                    )}

                    {/* Dados do Formulário - Exibição dinâmica de todos os campos */}
                    {Object.keys(formFields).length > 0 &&
                      Object.entries(formFields)
                        .filter(([key, fieldData]) => {
                          const value = String(fieldData.value || '').trim();
                          const labelLower = fieldData.label.toLowerCase();
                          // Não mostrar campos básicos (nome, email, telefone) já exibidos acima
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
                          return value.length > 0;
                        })
                        .map(([key, fieldData]) => (
                          <div
                            key={key}
                            className="flex items-start gap-3 p-2 rounded bg-gray-700/30"
                          >
                            <FileText className="h-4 w-4 text-gray-400 mt-0.5" />
                            <div className="flex-1">
                              <span className="text-gray-400 text-sm block">
                                {fieldData.label}:
                              </span>
                              <span className="text-white">
                                {Array.isArray(fieldData.value)
                                  ? fieldData.value.join(', ')
                                  : String(fieldData.value)}
                              </span>
                            </div>
                          </div>
                        ))}

                    {(!displayData.email || !displayData.email.trim()) &&
                      (!displayData.telefone || !displayData.telefone.trim()) &&
                      (!displayData.zona || !displayData.zona.trim()) &&
                      !lead.observacoes && (
                        <div className="text-gray-500 text-sm italic">
                          Nenhuma informação de contacto disponível
                        </div>
                      )}
                  </div>
                </div>

                <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Car className="h-5 w-5 text-yellow-500" />
                    Detalhes do Aluguer
                  </h3>

                  <div className="space-y-3">
                    {lead.data_aluguer && (
                      <div className="flex items-center gap-3">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <span className="text-gray-300">
                          {format(new Date(lead.data_aluguer), 'dd/MM/yyyy', { locale: pt })}
                        </span>
                      </div>
                    )}

                    {lead.tipo_viatura && (
                      <div className="flex items-center gap-3">
                        <Car className="h-4 w-4 text-gray-400" />
                        <span className="text-gray-300 capitalize">{lead.tipo_viatura}</span>
                      </div>
                    )}
                  </div>
                </div>

                {formularioTags.length > 0 && (
                  <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <Tag className="h-5 w-5 text-yellow-500" />
                      Etiquetas do Formulário
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {formularioTags.map((tag, index) => (
                        <Badge
                          key={index}
                          variant="outline"
                          className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Observações dos Gestores */}
                {lead.observacoes_gestores && lead.observacoes_gestores.trim() && (
                  <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <FileText className="h-5 w-5 text-yellow-500" />
                      Observações dos Gestores
                    </h3>
                    <div className="bg-gray-700/30 rounded p-3">
                      <p className="text-gray-300 whitespace-pre-wrap">
                        {lead.observacoes_gestores.trim()}
                      </p>
                    </div>
                  </div>
                )}

                {(() => {
                  // Verificar se observações contém texto livre (não JSON)
                  let isTextObservations = true;
                  try {
                    const parsed = JSON.parse(lead.observacoes || '');
                    // Se conseguir fazer parse e for um objeto, não é texto livre
                    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                      isTextObservations = false;
                    }
                  } catch {
                    // Se não conseguir fazer parse, é texto livre
                    isTextObservations = true;
                  }

                  if (lead.observacoes && isTextObservations) {
                    return (
                      <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                          <FileText className="h-5 w-5 text-yellow-500" />
                          Observações do Cliente
                        </h3>
                        <div className="text-gray-300 text-sm leading-relaxed">
                          <p className="whitespace-pre-wrap">{lead.observacoes}</p>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}

                <div className="text-xs text-gray-500">
                  <p>
                    Lead criado em:{' '}
                    {format(new Date(lead.created_at), 'dd/MM/yyyy HH:mm', { locale: pt })}
                  </p>
                </div>
              </div>

              {/* Histórico de Status */}
              <div>
                <LeadStatusHistory leadId={lead.id} />
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <EditLeadDialog
        lead={lead}
        isOpen={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        onSave={handleSaveEdit}
      />
    </>
  );
};
