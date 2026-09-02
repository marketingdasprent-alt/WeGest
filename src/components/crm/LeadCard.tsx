import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Eye, Tag, User } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';
import { saoRespostasDeFormulario } from '@/lib/camposDoLead';

interface Lead {
  id: string;
  nome: string;
  email: string;
  telefone?: string;
  zona?: string;
  data_aluguer?: string;
  tipo_viatura?: string;
  observacoes?: string;
  campaign_tags?: string[];
  status: string;
  created_at: string;
  formulario_id?: string;
}

interface LeadCardProps {
  lead: Lead;
  customTags?: string[];
}

export const LeadCard: React.FC<LeadCardProps> = ({ lead, customTags = [] }) => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // A mesma leitura que o kanban e a lista de leads usam — este cartão tinha
  // a sua cópia. Ver lib/camposDoLead.ts.
  const isFormDataJSON = saoRespostasDeFormulario;

  // Função para extrair dados das observações
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

  // Tags são recebidas via props (otimização de performance)

  // Obter dados para exibição (campos principais ou extraídos das observações)
  const displayData = getLeadDisplayData(lead);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
    data: {
      type: 'lead',
      lead,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleViewClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    navigate(`/crm/lead/${lead.id}`);
  };

  const getTagColor = (tag: string) => {
    return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: isDragging ? 1 : 1.02 }}
      className={`transition-all duration-200 ${isDragging ? 'opacity-50 z-50' : ''}`}
    >
      <Card
        className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-cyan-400 dark:hover:border-cyan-500 hover:shadow-md transition-all duration-200 ${
          isDragging ? 'shadow-lg shadow-cyan-500/30 border-cyan-400' : ''
        }`}
        {...attributes}
        {...listeners}
      >
        <CardContent className="p-4">
          {/* Header with name and actions */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="min-w-0 flex-1">
                <h4 className="font-semibold text-foreground text-sm leading-tight truncate">
                  {displayData.nome || 'Lead sem nome'}
                </h4>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleViewClick}
                className="p-1.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700 z-10"
                title="Ver detalhes"
              >
                <Eye className="h-3 w-3 text-slate-600 dark:text-slate-400" />
              </button>
            </div>
          </div>

          {/* Observações do Lead - só exibir se não for JSON de dados do formulário */}
          {lead.observacoes && lead.observacoes.trim() && !isFormDataJSON(lead.observacoes) && (
            <div className="mb-3">
              <div className="text-xs text-muted-foreground mb-1">Observações</div>
              <div className="text-xs text-foreground bg-slate-50 dark:bg-slate-800/50 rounded p-2 max-h-20 overflow-y-auto">
                {lead.observacoes}
              </div>
            </div>
          )}

          {/* Campaign Tags */}
          {lead.campaign_tags && lead.campaign_tags.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-1 mb-2">
                <Tag className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Campanhas</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {lead.campaign_tags.slice(0, 2).map((tag) => (
                  <Badge key={tag} className={`${getTagColor(tag)} px-1.5 py-0.5 text-xs border`}>
                    {tag}
                  </Badge>
                ))}
                {lead.campaign_tags.length > 2 && (
                  <Badge className="bg-muted/20 text-muted-foreground border-border/30 px-1.5 py-0.5 text-xs">
                    +{lead.campaign_tags.length - 2}
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* User info and Created date */}
          <div className="pt-2 border-t border-border/50 space-y-1">
            <div className="text-muted-foreground text-xs">
              {format(new Date(lead.created_at), 'dd/MM/yyyy HH:mm', { locale: pt })}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};
