import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight,
  Calendar,
  MapPin,
  Phone,
  Mail,
  User,
  Car,
  FileText,
  CheckCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProgressIndicator } from '@/components/ui/progress-indicator';
import { DynamicFormRenderer } from '@/components/formularios/DynamicFormRenderer';
import { FormField } from '@/components/formularios/DynamicFieldEditor';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { initPixel, trackLeadOnce } from '@/lib/pixel';

interface FormData {
  [key: string]: any;
}

const FormularioPublico = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [formulario, setFormulario] = useState<any>(null);
  const [campanhas, setCampanhas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<FormData>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false); // Ref para bloqueio síncrono
  const { toast } = useToast();

  const fieldsPerStep = 3; // Quantos campos por etapa
  const totalSteps = formulario?.campos ? Math.ceil(formulario.campos.length / fieldsPerStep) : 1;

  useEffect(() => {
    // Página pública → inicializa FB Pixel para PageView + Lead attribution.
    initPixel();
    if (id) {
      fetchFormulario();
    }
  }, [id]);

  const fetchFormulario = async () => {
    try {
      // Using any type to handle the current type issues
      const { data: formularioData, error } = await (supabase as any)
        .from('formularios')
        .select('*')
        .eq('id', id)
        .eq('ativo', true)
        .single();

      if (error) throw error;

      // Buscar campanhas associadas ao formulário - using any type to handle current type issues
      const { data: campanhasData, error: campanhasError } = await (supabase as any)
        .from('formulario_campanhas')
        .select('campanha_tag')
        .eq('formulario_id', id);

      if (campanhasError) {
        console.error('Erro ao buscar campanhas:', campanhasError);
      }

      setFormulario(formularioData);
      setCampanhas(campanhasData?.map((c) => c.campanha_tag) || []);
    } catch (error) {
      console.error('Erro ao carregar formulário:', error);
      toast({
        title: 'Erro',
        description: 'Formulário não encontrado ou inativo',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (fieldId: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [fieldId]: value,
    }));
    // Limpar erro do campo quando o usuário começar a digitar
    if (formErrors[fieldId]) {
      setFormErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[fieldId];
        return newErrors;
      });
    }

    // Verificar se é campo de licença TVDE e mostrar aviso imediato
    const campo = formulario?.campos?.find((c: any) => c.id === fieldId);
    if (campo) {
      const labelLower = campo.label.toLowerCase();
      if (
        labelLower.includes('tvde') ||
        labelLower.includes('licença') ||
        labelLower.includes('formação')
      ) {
        const valorLower = String(value || '').toLowerCase();
        if (valorLower.includes('não') || valorLower === 'não') {
          toast({
            title: '⚠️ Licença TVDE Necessária',
            description:
              'Para se candidatar é necessário possuir licença TVDE. Pode obter em centros de formação TVDE certificados.',
            variant: 'destructive',
            duration: 8000,
          });
        }
      }
    }
  };

  const validateCurrentStep = () => {
    if (!formulario?.campos) return true;

    const currentFields = getCurrentStepFields();
    const errors: Record<string, string> = {};

    currentFields.forEach((field: FormField) => {
      if (field.required && (!formData[field.id] || formData[field.id] === '')) {
        errors[field.id] = `${field.label} é obrigatório`;
      }
    });

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const getCurrentStepFields = () => {
    if (!formulario?.campos) return [];
    const startIndex = currentStep * fieldsPerStep;
    const endIndex = startIndex + fieldsPerStep;
    return formulario.campos.slice(startIndex, endIndex);
  };

  const handleNext = () => {
    if (validateCurrentStep() && currentStep < totalSteps - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  // Função para verificar se o usuário tem licença TVDE
  const checkTVDELicense = (): boolean => {
    if (!formulario?.campos) return true;

    for (const campo of formulario.campos) {
      const labelLower = campo.label.toLowerCase();
      // Detectar campo de licença TVDE
      if (
        campo.id === 'field_tem_formacao_tvde' ||
        labelLower.includes('tvde') ||
        labelLower.includes('licença') ||
        labelLower.includes('formação')
      ) {
        const value = String(formData[campo.id] || '').toLowerCase();
        if (value.includes('não') || value === 'não') {
          return false;
        }
      }
    }
    return true; // Sem campo TVDE ou respondeu "Sim" = permitir
  };

  const handleSubmit = async () => {
    // Verificar licença TVDE antes de submeter
    if (!checkTVDELicense()) {
      toast({
        title: '❌ Licença TVDE Necessária',
        description:
          'Infelizmente, apenas candidatos com licença TVDE podem se candidatar. Se ainda não possui, procure um centro de formação TVDE certificado.',
        variant: 'destructive',
        duration: 10000,
      });
      return;
    }

    // Bloqueio síncrono imediato para evitar duplo clique
    if (isSubmittingRef.current) {
      return;
    }
    isSubmittingRef.current = true;

    try {
      setIsSubmitting(true);

      // Criar objeto com todos os dados do formulário incluindo labels
      const formDataWithLabels: Record<string, { label: string; value: any; type: string }> = {};

      if (formulario?.campos) {
        formulario.campos.forEach((campo: any) => {
          if (formData[campo.id] !== undefined && formData[campo.id] !== '') {
            formDataWithLabels[campo.id] = {
              label: campo.label,
              value: formData[campo.id],
              type: campo.type,
            };
          }
        });
      }

      // Dados do lead
      const leadData: any = {
        nome: 'Nome não fornecido',
        email: 'email@naoidentificado.com',
        telefone: '',
        zona: '',
        data_aluguer: null,
        tipo_viatura: null,
        observacoes: JSON.stringify(formDataWithLabels), // Salvar todos os dados com labels
        status: 'novo',
        formulario_id: formulario?.id,
        campaign_tags: campanhas || [],
        tem_formacao_tvde: null,
      };

      // Detectar campos principais pelo LABEL (não pelo ID)
      if (formulario?.campos) {
        formulario.campos.forEach((campo: any) => {
          const labelLower = campo.label.toLowerCase();
          const value = formData[campo.id];
          const valorString = String(value || '').trim();

          if (!valorString) return;

          // Detectar nome
          if (
            labelLower.includes('nome') &&
            !labelLower.includes('sobre') &&
            leadData.nome === 'Nome não fornecido'
          ) {
            leadData.nome = valorString;
          }
          // Detectar email
          else if (
            (labelLower.includes('email') || labelLower.includes('e-mail')) &&
            leadData.email === 'email@naoidentificado.com'
          ) {
            leadData.email = valorString;
          }
          // Detectar telefone
          else if (
            (labelLower.includes('telefone') ||
              labelLower.includes('whatsapp') ||
              labelLower.includes('telemóvel') ||
              labelLower.includes('telemovel')) &&
            !leadData.telefone
          ) {
            leadData.telefone = valorString;
          }
          // Detectar zona
          else if (
            (labelLower.includes('zona') ||
              labelLower.includes('cidade') ||
              labelLower.includes('região') ||
              labelLower.includes('localidade')) &&
            !leadData.zona
          ) {
            leadData.zona = valorString;
          }
          // Detectar tipo de viatura
          else if (
            (labelLower.includes('viatura') ||
              labelLower.includes('veículo') ||
              labelLower.includes('carro') ||
              labelLower.includes('marca') ||
              labelLower.includes('modelo')) &&
            !leadData.tipo_viatura
          ) {
            if (leadData.tipo_viatura) {
              leadData.tipo_viatura = `${leadData.tipo_viatura} ${valorString}`;
            } else {
              leadData.tipo_viatura = valorString;
            }
          }
          // Detectar formação TVDE
          else if (
            labelLower.includes('tvde') ||
            labelLower.includes('licença') ||
            labelLower.includes('formação')
          ) {
            if (valorString.toLowerCase().includes('não') || valorString.toLowerCase() === 'não') {
              leadData.tem_formacao_tvde = false;
            } else if (
              valorString.toLowerCase().includes('sim') ||
              valorString.toLowerCase() === 'sim'
            ) {
              leadData.tem_formacao_tvde = true;
            }
          }
        });
      }

      // Fallback: detecção por padrão se ainda não encontrou
      if (
        leadData.nome === 'Nome não fornecido' ||
        leadData.email === 'email@naoidentificado.com' ||
        !leadData.telefone
      ) {
        Object.entries(formData).forEach(([fieldId, value]) => {
          const valorString = String(value || '').trim();
          if (!valorString) return;

          // Detectar email por padrão
          if (
            leadData.email === 'email@naoidentificado.com' &&
            valorString.includes('@') &&
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valorString)
          ) {
            leadData.email = valorString;
          }
          // Detectar telefone por padrão
          else if (!leadData.telefone && /^\+?\d{9,}$/.test(valorString.replace(/[\s()-]/g, ''))) {
            leadData.telefone = valorString;
          }
          // Detectar nome por padrão
          else if (
            leadData.nome === 'Nome não fornecido' &&
            valorString.length > 2 &&
            !valorString.includes('@') &&
            !/^\d+$/.test(valorString) &&
            /^[a-zA-ZÀ-ÿ\s]+$/.test(valorString)
          ) {
            leadData.nome = valorString;
          }
        });
      }

      // Lógica para adicionar tag "Formação TVDE" automaticamente se não tem licença
      if (leadData.tem_formacao_tvde === false) {
        const campanhasArray = Array.isArray(leadData.campaign_tags) ? leadData.campaign_tags : [];
        const campanhasFiltradas = campanhasArray.filter((tag: string) => tag !== 'TVDE GERAL');
        if (!campanhasFiltradas.includes('Formação TVDE')) {
          leadData.campaign_tags = [...campanhasFiltradas, 'Formação TVDE'];
        } else {
          leadData.campaign_tags = campanhasFiltradas;
        }
      }

      // Verificar duplicidade antes de inserir (mesmo email nos últimos 5 minutos)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: existingLead } = await supabase
        .from('leads_dasprent')
        .select('id')
        .eq('email', leadData.email)
        .gte('created_at', fiveMinutesAgo)
        .maybeSingle();

      if (existingLead) {
        navigate('/obrigado');
        return;
      }

      const { error } = await supabase.from('leads_dasprent').insert(leadData);

      if (error) throw error;

      // Enviar evento de lead para Facebook Pixel
      trackLeadOnce({
        content_name: formulario.nome || 'Formulário',
        content_category: 'Lead Form',
        value: 1,
      });

      // Track form submission success
      if (typeof window !== 'undefined') {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
          event: 'form_submit_success',
          form_name: formulario?.titulo || 'formulario_publico',
          form_id: formulario?.id,
          lead_data: leadData,
        });
      }

      // Redirecionar para página de obrigado
      navigate('/obrigado');
    } catch (error) {
      console.error('Erro ao salvar lead:', error);

      toast({
        title: 'Erro ao enviar formulário',
        description: 'Ocorreu um erro ao processar sua solicitação. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
      // Aguardar antes de permitir novo envio
      setTimeout(() => {
        isSubmittingRef.current = false;
      }, 3000);
    }
  };

  const handleNewForm = () => {
    setIsSubmitted(false);
    setCurrentStep(0);
    setFormData({});
    setFormErrors({});
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500 mx-auto mb-4"></div>
          <p className="text-white text-lg">Carregando formulário...</p>
        </div>
      </div>
    );
  }

  if (!formulario) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Formulário não encontrado</h1>
          <p className="text-gray-400">
            O formulário que você está procurando não existe ou está inativo.
          </p>
        </div>
      </div>
    );
  }

  // Se não há campos dinâmicos, mostrar mensagem
  if (!formulario.campos || formulario.campos.length === 0) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Formulário em Configuração</h1>
          <p className="text-gray-400">Este formulário ainda não possui campos configurados.</p>
        </div>
      </div>
    );
  }

  const fadeInUp = {
    initial: { opacity: 0, y: 60 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, ease: 'easeOut' },
  };

  const currentFields = getCurrentStepFields();
  const stepLabels = [];
  for (let i = 0; i < totalSteps; i++) {
    const stepFields = formulario.campos.slice(i * fieldsPerStep, (i + 1) * fieldsPerStep);
    stepLabels.push(`Etapa ${i + 1}`);
  }

  return (
    <div className="min-h-screen bg-black">
      <motion.section
        className="relative py-20 px-4 text-center overflow-hidden min-h-screen flex items-center"
        initial="initial"
        animate="animate"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/5 to-yellow-600/5" />
        <div className="relative z-10 max-w-6xl mx-auto">
          {/* Logo */}
          <motion.div className="mb-12" variants={fadeInUp}>
            <img
              src="/lovable-uploads/c0c8215b-1f0f-45fd-9958-dbac63dd9d3a.png"
              alt="Distância Arrojada Logo"
              className="h-20 mx-auto"
            />
          </motion.div>

          <motion.h1
            className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight"
            variants={fadeInUp}
          >
            Revolucione Sua Jornada
          </motion.h1>

          {formulario.descricao && (
            <motion.p
              className="text-xl md:text-2xl text-gray-300 mb-8 max-w-3xl mx-auto leading-relaxed"
              variants={fadeInUp}
            >
              {formulario.descricao}
            </motion.p>
          )}

          {/* Form Modal ou Success Message */}
          <motion.div
            className="bg-gray-900 border border-yellow-500/20 rounded-3xl p-8 max-w-md w-full max-h-[90vh] overflow-y-auto mx-auto"
            variants={fadeInUp}
          >
            {isSubmitted ? (
              // Success Message
              <div className="text-center">
                <div className="mb-6">
                  <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                  <h3 className="text-2xl font-bold text-white mb-2">Formulário Enviado!</h3>
                  <p className="text-gray-300 mb-6">
                    Sua solicitação foi enviada com sucesso. Nossa equipe entrará em contacto
                    brevemente para finalizar os detalhes.
                  </p>
                  <Button
                    onClick={handleNewForm}
                    className="bg-yellow-500 hover:bg-yellow-600 text-black font-semibold"
                  >
                    Enviar Novo Formulário
                  </Button>
                </div>
              </div>
            ) : (
              // Form
              <>
                <div className="text-center mb-8">
                  <h3 className="text-2xl font-bold text-white mb-2">Complete os Dados</h3>
                  <p className="text-gray-300">Preencha as informações para continuar</p>
                </div>

                <ProgressIndicator
                  currentStep={currentStep}
                  totalSteps={totalSteps}
                  stepLabels={stepLabels}
                />

                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentStep}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                  >
                    <DynamicFormRenderer
                      fields={currentFields}
                      values={formData}
                      onValueChange={handleInputChange}
                      errors={formErrors}
                    />
                  </motion.div>
                </AnimatePresence>

                <div className="flex justify-between mt-8">
                  <Button
                    variant="outline"
                    onClick={handlePrevious}
                    disabled={currentStep === 0}
                    className="border-yellow-500/30 hover:bg-gray-800 text-zinc-950"
                  >
                    Anterior
                  </Button>

                  {currentStep < totalSteps - 1 ? (
                    <Button
                      onClick={handleNext}
                      className="bg-yellow-500 hover:bg-yellow-600 text-black font-semibold"
                    >
                      Continuar
                    </Button>
                  ) : (
                    <Button
                      onClick={handleSubmit}
                      disabled={isSubmitting}
                      className="bg-yellow-500 hover:bg-yellow-600 text-black font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? 'Enviando...' : 'Enviar Formulário'}
                    </Button>
                  )}
                </div>

                <div className="text-center mt-6">
                  <p className="text-sm text-yellow-500 font-medium">
                    ⚡ Preencha todos os campos obrigatórios
                  </p>
                </div>
              </>
            )}
          </motion.div>
        </div>
      </motion.section>

      {/* Footer */}
      <footer className="py-8 px-4 text-center">
        <p className="text-gray-400 text-sm">© 2024 DasPrent. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
};

export default FormularioPublico;
