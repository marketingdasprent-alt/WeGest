import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CampaignTagsManager } from './CampaignTagsManager';
import { useCampaignTags } from '@/hooks/useCampaignTags';
import { supabase } from '@/integrations/supabase/client';
import { Save, X } from 'lucide-react';
import { PhoneInput } from '@/components/ui/phone-input';

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
  caucao_valor?: number | null;
}

interface Formulario {
  id: string;
  nome: string;
  ativo: boolean;
}

interface EditLeadDialogProps {
  lead: Lead | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedLead: Partial<Lead>) => void;
}

export const EditLeadDialog: React.FC<EditLeadDialogProps> = ({
  lead,
  isOpen,
  onClose,
  onSave,
}) => {
  const [formData, setFormData] = useState<Partial<Lead>>({});
  const [formularios, setFormularios] = useState<Formulario[]>([]);
  const { availableTags } = useCampaignTags();

  useEffect(() => {
    if (lead) {
      setFormData({
        nome: lead.nome,
        email: lead.email,
        telefone: lead.telefone || '',
        zona: lead.zona || '',
        data_aluguer: lead.data_aluguer || '',
        tipo_viatura: lead.tipo_viatura || '',
        observacoes: lead.observacoes || '',
        observacoes_gestores: lead.observacoes_gestores || '',
        campaign_tags: lead.campaign_tags || [],
        status: lead.status,
        formulario_id: lead.formulario_id || 'none',
        caucao_valor: lead.caucao_valor ?? null,
      });
    }
  }, [lead]);

  useEffect(() => {
    fetchFormularios();
  }, []);

  const fetchFormularios = async () => {
    try {
      // Using any type to handle the current type issues
      const { data, error } = await (supabase as any)
        .from('formularios')
        .select('id, nome, ativo')
        .eq('ativo', true)
        .order('nome');

      if (error) throw error;
      setFormularios(data || []);
    } catch (error) {
      console.error('Erro ao carregar formulários:', error);
    }
  };

  const handleSave = () => {
    if (lead) {
      // Convert 'none' back to null for database storage
      // Convert empty strings to null for date fields
      const dataToSave = {
        ...formData,
        formulario_id: formData.formulario_id === 'none' ? null : formData.formulario_id,
        data_aluguer: formData.data_aluguer === '' ? null : formData.data_aluguer,
        id: lead.id,
      };
      try {
        onSave(dataToSave);
        onClose();
      } catch (error) {
        console.error('EditLeadDialog - Error in onSave:', error);
      }
    } else {
      console.error('EditLeadDialog - No lead provided');
    }
  };

  const statusOptions = [
    { value: 'novo', label: 'Novo' },
    { value: 'contactado', label: 'Contactado' },
    { value: 'interessado', label: 'Interessado' },
    { value: 'convertido', label: 'Convertido' },
    { value: 'perdido', label: 'Perdido' },
  ];

  const tipoViaturaOptions = [
    { value: 'comercial', label: 'Comercial' },
    { value: 'passageiros', label: 'Passageiros' },
  ];

  if (!lead) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gradient-to-br from-card to-background border-border text-foreground w-[95vw] max-w-4xl max-h-[95vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-3">
            <div className="p-2 rounded-full bg-gradient-to-r from-yellow-500/20 to-yellow-600/20 border border-yellow-500/30">
              <Save className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-500" />
            </div>
            Editar Lead
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nome" className="text-muted-foreground text-sm sm:text-base">
                Nome Completo *
              </Label>
              <Input
                id="nome"
                value={formData.nome || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, nome: e.target.value }))}
                className="bg-card border-border text-foreground text-sm sm:text-base"
                placeholder="Nome completo"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-muted-foreground text-sm sm:text-base">
                Email *
              </Label>
              <Input
                id="email"
                type="email"
                value={formData.email || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                className="bg-card border-border text-foreground text-sm sm:text-base"
                placeholder="email@exemplo.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="telefone" className="text-muted-foreground text-sm sm:text-base">
                Telefone
              </Label>
              <PhoneInput
                id="telefone"
                value={formData.telefone || ''}
                onChange={(value) => setFormData((prev) => ({ ...prev, telefone: value }))}
                defaultCountry="PT"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="zona" className="text-muted-foreground text-sm sm:text-base">
                Zona de Interesse
              </Label>
              <Input
                id="zona"
                value={formData.zona || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, zona: e.target.value }))}
                className="bg-card border-border text-foreground text-sm sm:text-base"
                placeholder="Ex: Lisboa, Porto..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="caucao_valor" className="text-muted-foreground text-sm sm:text-base">
                Caução (€)
              </Label>
              <Input
                id="caucao_valor"
                type="number"
                min={0}
                step="0.01"
                value={formData.caucao_valor ?? ''}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    caucao_valor: e.target.value === '' ? null : Number(e.target.value),
                  }))
                }
                className="bg-card border-border text-foreground text-sm sm:text-base"
                placeholder="0,00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="data_aluguer" className="text-muted-foreground text-sm sm:text-base">
                Data Pretendida
              </Label>
              <Input
                id="data_aluguer"
                type="date"
                value={formData.data_aluguer || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, data_aluguer: e.target.value }))}
                className="bg-card border-border text-foreground text-sm sm:text-base"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tipo_viatura" className="text-muted-foreground text-sm sm:text-base">
                Tipo de Viatura
              </Label>
              <Select
                value={formData.tipo_viatura || ''}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, tipo_viatura: value }))}
              >
                <SelectTrigger className="bg-card border-border text-foreground text-sm sm:text-base">
                  <SelectValue placeholder="Selecionar tipo" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {tipoViaturaOptions.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className="text-foreground text-sm sm:text-base"
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor="formulario_id" className="text-muted-foreground text-sm sm:text-base">
                Formulário de Origem
              </Label>
              <Select
                value={formData.formulario_id || 'none'}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, formulario_id: value }))
                }
              >
                <SelectTrigger className="bg-card border-border text-foreground text-sm sm:text-base">
                  <SelectValue placeholder="Selecionar formulário" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="none" className="text-foreground text-sm sm:text-base">
                    Nenhum formulário
                  </SelectItem>
                  {formularios.map((formulario) => (
                    <SelectItem
                      key={formulario.id}
                      value={formulario.id}
                      className="text-foreground text-sm sm:text-base"
                    >
                      {formulario.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor="status" className="text-muted-foreground text-sm sm:text-base">
                Status
              </Label>
              <Select
                value={formData.status || 'novo'}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, status: value }))}
              >
                <SelectTrigger className="bg-card border-border text-foreground text-sm sm:text-base">
                  <SelectValue placeholder="Selecionar status" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {statusOptions.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className="text-foreground text-sm sm:text-base"
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 lg:col-span-2">
              <CampaignTagsManager
                tags={formData.campaign_tags || []}
                onTagsChange={(tags) => setFormData((prev) => ({ ...prev, campaign_tags: tags }))}
                availableTags={availableTags}
                placeholder="Adicionar campanha..."
              />
            </div>

            <div className="space-y-2 lg:col-span-2">
              <Label
                htmlFor="observacoes_gestores"
                className="text-muted-foreground text-sm sm:text-base"
              >
                Observações dos Gestores
              </Label>
              <Textarea
                id="observacoes_gestores"
                value={formData.observacoes_gestores || ''}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, observacoes_gestores: e.target.value }))
                }
                className="bg-card border-border text-foreground min-h-[100px] text-sm sm:text-base"
                placeholder="Adicione observações sobre este lead..."
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button
              onClick={handleSave}
              className="flex-1 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-black font-medium text-sm sm:text-base order-2 sm:order-1"
            >
              <Save className="h-4 w-4 mr-2" />
              Salvar Alterações
            </Button>
            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1 border-border text-foreground hover:bg-muted text-sm sm:text-base order-1 sm:order-2"
            >
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
