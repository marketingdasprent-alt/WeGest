import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProgressIndicator } from '@/components/ui/progress-indicator';
import { DynamicFormRenderer } from '@/components/formularios/DynamicFormRenderer';
import { FormField } from '@/components/formularios/DynamicFieldEditor';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { initPixel } from '@/lib/pixel';
import { useFormularioPorNome } from '@/hooks/useFormularios';
import { useSubmeterLeadLanding } from '@/hooks/useLeadsLanding';

/** O formulário desta landing é identificado pelo nome — não há id à mão. */
const NOME_FORMULARIO = 'Formulário TVDE Distância Arrojada';

export const RentCarLanding = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false); // Ref para bloqueio síncrono
  const { toast } = useToast();
  const navigate = useNavigate();
  const fieldsPerStep = 2; // Número de campos por step

  const { data: formulario, isLoading: loading } = useFormularioPorNome(NOME_FORMULARIO);
  const submeterLead = useSubmeterLeadLanding();

  // `campos` é uma coluna jsonb → `Json` nos tipos gerados; a forma do array
  // de campos tem de ser afirmada aqui.
  const formFields = (formulario?.campos ?? []) as unknown as FormField[];

  useEffect(() => {
    // Landing pública → carrega FB Pixel + dispara PageView.
    initPixel();
  }, []);
  const handleInputChange = (fieldId: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [fieldId]: value,
    }));

    // Verificar se é campo de licença TVDE e mostrar aviso imediato
    const campo = formFields.find((c: any) => c.id === fieldId);
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
  const totalSteps = Math.ceil(formFields.length / fieldsPerStep);
  const currentStepFields = formFields.slice(
    currentStep * fieldsPerStep,
    (currentStep + 1) * fieldsPerStep
  );
  const stepLabels = Array.from(
    {
      length: totalSteps,
    },
    (_, i) => `Passo ${i + 1}`
  );
  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
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
    for (const campo of formFields) {
      const labelLower = campo.label.toLowerCase();
      // Detectar campo de licença TVDE
      if (
        campo.id === 'field_tem_formacao_tvde' ||
        campo.id === 'field_1748938811761' ||
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

      // Preparar dados do lead com valores padrão. As campanhas do formulário
      // e a regra da formação TVDE são aplicadas dentro de useSubmeterLeadLanding.
      const leadData = {
        nome: 'Nome não fornecido',
        email: 'email@naoidentificado.com',
        telefone: '',
        zona: '',
        tipo_viatura: null as string | null,
        observacoes: '',
        status: 'novo',
        formulario_id: formulario?.id,
        tem_formacao_tvde: null as boolean | null,
      };

      // Mapear campos específicos baseado nos IDs conhecidos
      Object.entries(formData).forEach(([fieldId, value]) => {
        const valorString = String(value || '').trim();

        // Verificar campo de licença/curso TVDE em diferentes formulários e variações de ID
        if (
          fieldId === 'field_1748938811761' || // Campo específico do formulário TVDE
          fieldId === 'field_tvde_licenca' || // Alternativo
          fieldId === 'field_teste_tvde_licenca' || // Alternativo de teste
          fieldId === 'field_tem_formacao_tvde' || // Campo garantido pelo trigger no DB
          fieldId.includes('licenca_tvde') || // Padrão genérico
          fieldId.includes('formacao_tvde') // Padrão genérico
        ) {
          const lower = valorString.toLowerCase();
          if (lower.includes('não') || lower === 'não') {
            leadData.tem_formacao_tvde = false;
          } else if (lower.includes('sim') || lower === 'sim') {
            leadData.tem_formacao_tvde = true;
          }
        }

        // Mapeamento direto dos IDs de campo para campos da tabela
        switch (fieldId) {
          // Formulário TVDE Distância Arrojada
          case 'field_1748938792037': // Nome
          case 'field_1748939842786':
            // Nome alternativo
            if (valorString) leadData.nome = valorString;
            break;
          case 'field_1748938798127': // Email
          case 'field_1748939848328':
            // Email alternativo
            if (valorString) leadData.email = valorString;
            break;
          case 'field_1748938804488': // Telefone
          case 'field_1748939855085':
            // Telefone alternativo
            if (valorString) leadData.telefone = valorString;
            break;

          // Formulário Alugar Carro
          case 'field_1752479687722':
            // Nome
            if (valorString) leadData.nome = valorString;
            break;
          case 'field_1752479709053':
            // E-mail
            if (valorString) leadData.email = valorString;
            break;
          case 'field_1752479700842':
            // WhatsApp
            if (valorString) leadData.telefone = valorString;
            break;
          case 'field_1752479719050':
            // Marca da Viatura
            if (valorString) leadData.tipo_viatura = valorString;
            break;
          case 'field_1752479732842':
            // Modelo da Viatura
            if (valorString) {
              // Combinar marca + modelo se já tiver marca
              if (leadData.tipo_viatura) {
                leadData.tipo_viatura = `${leadData.tipo_viatura} ${valorString}`;
              } else {
                leadData.tipo_viatura = valorString;
              }
            }
            break;
          case 'field_1752479750070':
            // Ano da Viatura
            if (valorString) {
              // Adicionar ano ao tipo_viatura
              if (leadData.tipo_viatura) {
                leadData.tipo_viatura = `${leadData.tipo_viatura} (${valorString})`;
              } else {
                leadData.tipo_viatura = `Ano ${valorString}`;
              }
            }
            break;
        }
      });

      // Se não tem licença, mover lead para campanha de Formação TVDE automaticamente
      // Campanhas do formulário, regra da formação TVDE e deduplicação (mesmo
      // email nos últimos 5 minutos) vivem agora em useSubmeterLeadLanding.
      const { duplicado } = await submeterLead.mutateAsync({
        formularioId: formulario?.id,
        lead: leadData,
      });

      if (duplicado) {
        navigate('/obrigado');
        return;
      }

      // Track form submission success
      if (typeof window !== 'undefined') {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
          event: 'form_submit_success',
          form_name: 'candidatura_dasprent',
          lead_data: {
            nome: leadData.nome,
            email: leadData.email,
            telefone: leadData.telefone,
            tipo_viatura: leadData.tipo_viatura,
          },
        });
      }

      // Redirecionar para página de obrigado
      navigate('/obrigado');
    } catch (error) {
      console.error('Erro ao salvar lead TVDE:', error);
      toast({
        title: '❌ Erro ao Enviar',
        description:
          'Ocorreu um problema ao processar sua candidatura. Tente novamente ou contacte-nos diretamente.',
        variant: 'destructive',
        duration: 5000,
      });
    } finally {
      setIsSubmitting(false);
      // Aguardar antes de permitir novo envio
      setTimeout(() => {
        isSubmittingRef.current = false;
      }, 3000);
    }
  };
  const canProceed = () => {
    // Verificar se os campos obrigatórios do step atual estão preenchidos
    return currentStepFields.every((field) => {
      if (field.required) {
        const value = formData[field.id];
        return value !== undefined && value !== null && value !== '';
      }
      return true;
    });
  };
  const fadeInUp = {
    initial: {
      opacity: 0,
      y: 60,
    },
    animate: {
      opacity: 1,
      y: 0,
    },
    transition: {
      duration: 0.6,
      ease: 'easeOut',
    },
  };
  const stagger = {
    animate: {
      transition: {
        staggerChildren: 0.2,
      },
    },
  };
  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: '#000000',
      }}
    >
      {/* Hero Section */}
      <motion.section
        className="relative py-8 sm:py-12 md:py-16 lg:py-20 px-4 text-center overflow-hidden min-h-screen flex items-center"
        initial="initial"
        animate="animate"
        variants={stagger}
      >
        <div className="relative z-10 max-w-6xl mx-auto w-full">
          {/* Logo */}
          <motion.div className="mb-6 sm:mb-8 md:mb-10 lg:mb-12" variants={fadeInUp}>
            <img
              src="/lovable-uploads/c0c8215b-1f0f-45fd-9958-dbac63dd9d3a.png"
              alt="Distância Arrojada Logo"
              className="h-12 sm:h-16 md:h-20 lg:h-24 xl:h-28 mx-auto"
            />
          </motion.div>

          <motion.h1
            className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl 2xl:text-7xl font-bold text-white mb-4 sm:mb-6 leading-tight px-2"
            variants={fadeInUp}
          >
            Torne-se <span className="text-yellow-500">Motorista TVDE</span>
            <br className="hidden sm:block" />
            <span className="block sm:inline">com o Apoio da </span>
            <span className="text-yellow-400">DISTÂNCIA ARROJADA</span>
          </motion.h1>

          <motion.p
            className="text-base sm:text-lg md:text-xl lg:text-2xl text-gray-300 mb-6 sm:mb-8 max-w-4xl mx-auto leading-relaxed px-4"
            variants={fadeInUp}
          >
            Acompanhamento completo, gestão profissional e tudo o que você precisa para crescer na{' '}
            <strong>Uber</strong> ou <strong>Bolt</strong>. Faça parte de uma equipa que valoriza o
            seu trabalho.
          </motion.p>

          <motion.div variants={fadeInUp} className="px-4 mb-8 sm:mb-12 md:mb-16">
            <Button
              onClick={() => setShowForm(true)}
              size="lg"
              className="bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-black px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-lg font-semibold rounded-full shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 w-full sm:w-auto"
              disabled={loading}
            >
              {loading ? 'Carregando...' : 'Quero ser motorista TVDE'}
              {!loading && <ChevronRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />}
            </Button>
          </motion.div>

          {/* Features Section */}
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 lg:gap-10 max-w-5xl mx-auto px-4"
            variants={fadeInUp}
          >
            <div className="text-center">
              <div className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl mx-auto mb-4 sm:mb-6">
                🛡️
              </div>
              <h3 className="text-lg sm:text-xl md:text-2xl font-semibold text-white mb-2 sm:mb-3">
                Apoio Total
              </h3>
              <p className="text-gray-400 text-sm sm:text-base md:text-lg leading-relaxed">
                Acompanhamento desde o primeiro dia até ao seu sucesso como motorista TVDE
              </p>
            </div>
            <div className="text-center">
              <div className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl mx-auto mb-4 sm:mb-6">
                🚗
              </div>
              <h3 className="text-lg sm:text-xl md:text-2xl font-semibold text-white mb-2 sm:mb-3">
                Gestão Profissional
              </h3>
              <p className="text-gray-400 text-sm sm:text-base md:text-lg leading-relaxed">
                Otimização de rotas, horários e estratégias para maximizar os seus ganhos
              </p>
            </div>
            <div className="text-center sm:col-span-2 lg:col-span-1">
              <div className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl mx-auto mb-4 sm:mb-6">
                ✅
              </div>
              <h3 className="text-lg sm:text-xl md:text-2xl font-semibold text-white mb-2 sm:mb-3">
                Equipa de Elite
              </h3>
              <p className="text-gray-400 text-sm sm:text-base md:text-lg leading-relaxed">
                Junte-se aos melhores motoristas TVDE de Portugal
              </p>
            </div>
          </motion.div>
        </div>
      </motion.section>

      {/* Footer */}
      <footer className="py-6 sm:py-8 px-4 text-center">
        <p className="text-gray-400 text-xs sm:text-sm">
          © 2024 Distancia Arrojada Todos os direitos reservados.
        </p>
      </footer>

      {/* Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            className="fixed inset-0 bg-black/80 flex items-center justify-center p-3 sm:p-4 z-50"
            initial={{
              opacity: 0,
            }}
            animate={{
              opacity: 1,
            }}
            exit={{
              opacity: 0,
            }}
            onClick={() => setShowForm(false)}
          >
            <motion.div
              className="bg-gradient-to-br from-gray-900 to-black border border-yellow-500/30 rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 max-w-sm sm:max-w-md w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto"
              initial={{
                scale: 0.9,
                opacity: 0,
              }}
              animate={{
                scale: 1,
                opacity: 1,
              }}
              exit={{
                scale: 0.9,
                opacity: 0,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-6 sm:mb-8">
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">
                  {formulario?.nome || 'Candidatura Motorista TVDE'}
                </h3>
                <p className="text-gray-300 text-sm sm:text-base">
                  {formulario?.descricao || 'Complete os dados para se juntar à nossa equipa'}
                </p>
              </div>

              {formFields.length > 0 && (
                <ProgressIndicator
                  currentStep={currentStep}
                  totalSteps={totalSteps}
                  stepLabels={stepLabels}
                />
              )}

              {loading ? (
                <div className="flex justify-center items-center py-8">
                  <div className="text-white">Carregando formulário...</div>
                </div>
              ) : formFields.length > 0 ? (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentStep}
                    initial={{
                      opacity: 0,
                      x: 20,
                    }}
                    animate={{
                      opacity: 1,
                      x: 0,
                    }}
                    exit={{
                      opacity: 0,
                      x: -20,
                    }}
                    transition={{
                      duration: 0.3,
                    }}
                  >
                    <DynamicFormRenderer
                      fields={currentStepFields}
                      values={formData}
                      onValueChange={handleInputChange}
                    />
                  </motion.div>
                </AnimatePresence>
              ) : (
                <div className="flex justify-center items-center py-8">
                  <div className="text-gray-400">Nenhum campo encontrado no formulário</div>
                </div>
              )}

              {formFields.length > 0 && (
                <div className="flex flex-col sm:flex-row justify-between gap-3 sm:gap-0 mt-6 sm:mt-8">
                  <Button
                    variant="outline"
                    onClick={handlePrevious}
                    disabled={currentStep === 0}
                    className="border-yellow-500/40 hover:bg-yellow-500/10 text-white hover:text-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base order-2 sm:order-1"
                  >
                    Anterior
                  </Button>

                  {currentStep < totalSteps - 1 ? (
                    <Button
                      onClick={handleNext}
                      disabled={!canProceed()}
                      className="bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-black font-semibold disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base order-1 sm:order-2"
                    >
                      Continuar
                    </Button>
                  ) : (
                    <Button
                      id="enviar-candidatura-btn"
                      onClick={() => {
                        // Track button click
                        if (typeof window !== 'undefined') {
                          window.dataLayer = window.dataLayer || [];
                          window.dataLayer.push({
                            event: 'button_click',
                            button_text: 'Enviar Candidatura',
                            button_id: 'enviar-candidatura-btn',
                            form_step: currentStep + 1,
                            total_steps: totalSteps,
                          });
                        }
                        handleSubmit();
                      }}
                      disabled={!canProceed() || isSubmitting}
                      className="bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-black font-semibold disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base order-1 sm:order-2"
                    >
                      {isSubmitting ? 'Enviando...' : 'Enviar Candidatura'}
                    </Button>
                  )}
                </div>
              )}

              <div className="text-center mt-4 sm:mt-6">
                <p className="text-xs sm:text-sm text-yellow-500 font-medium">
                  ⚡ A DISTÂNCIA ARROJADA entrará em contacto nas próximas 24h
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
