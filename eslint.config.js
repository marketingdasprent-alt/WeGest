import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

// Ficheiros legacy com >500 linhas — isentos de max-lines (refactor futuro)
// Gerado com: find src -type f \( -name '*.ts' -o -name '*.tsx' \) \! -name 'types.ts' | while read f; do
//   [ $(wc -l < "$f") -gt 500 ] && echo "$f"; done | sort
const filesExceedingMaxLines = [
  'src/components/admin/BoltIntegrationPanel.tsx',
  'src/components/admin/DocumentTemplateEditor.tsx',
  'src/components/admin/IntegracaoDetailModal.tsx',
  'src/components/admin/IntegracaoDialog.tsx',
  'src/components/admin/IntegracoesTab.tsx',
  'src/components/admin/RichTextEditor.tsx',
  'src/components/admin/UsersTab.tsx',
  'src/components/administrativo/BoltDataTab.tsx',
  'src/components/administrativo/CartoesFlotaTab.tsx',
  'src/components/administrativo/ContasResumoTab.tsx',
  'src/components/administrativo/DispositivosObeTab.tsx',
  'src/components/administrativo/FaturacaoTab.tsx',
  'src/components/administrativo/ImportarDadosWizard.tsx',
  'src/components/administrativo/ImportarRecibosDialog.tsx',
  'src/components/administrativo/MotoristaResumoDialog.tsx',
  'src/components/administrativo/RelatorioPagamentoDialog.tsx',
  'src/components/administrativo/UberDataTab.tsx',
  'src/components/assistencia/ticket/TicketChat.tsx',
  'src/components/calendario/CheckinDadosSection.tsx',
  'src/components/calendario/CheckOutPendentesDrawer.tsx',
  'src/components/calendario/ContratoEntregaStep.tsx',
  'src/components/calendario/NovoEventoPage.tsx',
  'src/components/calendario/RecolhaCheckinStep.tsx',
  'src/components/calendario/RecolhasPendentesDrawer.tsx',
  'src/components/calendario/TrocaCheckinStep.tsx',
  'src/components/crm/LeadDetailsDialog.tsx',
  'src/components/dashboard/CheckinCheckoutDetailDialog.tsx',
  'src/components/faturacao/NovaFaturaDialog.tsx',
  'src/components/marketing/ImportarTab.tsx',
  'src/components/motorista-portal/CandidaturaFormulario.tsx',
  'src/components/motorista-portal/MotoristaDashboard.tsx',
  'src/components/motorista-portal/MotoristaRecibosCard.tsx',
  'src/components/motorista-portal/MotoristaViaturaCard.tsx',
  'src/components/motoristas/GenerateDocumentsDialog.tsx',
  'src/components/motoristas/MotoristasPlataformaNaoAssociados.tsx',
  'src/components/motoristas/tabs/MotoristaRecibosSection.tsx',
  'src/components/motoristas/tabs/MotoristaTabContratos.tsx',
  'src/components/motoristas/tabs/MotoristaTabDados.tsx',
  'src/components/motoristas/tabs/MotoristaTabDocumentos.tsx',
  'src/components/motoristas/tabs/MotoristaTabViaturas.tsx',
  'src/components/RentCarLanding.tsx',
  'src/components/renting/ClienteDialog.tsx',
  'src/components/renting/contratos/ContratoFaturarDialog.tsx',
  'src/components/renting/contratos/ContratoTabFaturar.tsx',
  'src/components/renting/contratos/FecharContratoDialog.tsx',
  'src/pages/renting/contrato/useContratoForm.ts',
  'src/components/renting/reservas/tabs/ReservaTabFaturar.tsx',
  'src/components/renting/reservas/tabs/ReservaTabGeral.tsx',
  'src/components/renting/shared/CondutoresFields.tsx',
  'src/components/ui/sidebar.tsx',
  'src/components/viaturas/tabs/ViaturaTabDados.tsx',
  'src/components/viaturas/tabs/ViaturaTabDanos.tsx',
  'src/components/viaturas/tabs/ViaturaTabFinanceira.tsx',
  'src/components/viaturas/tabs/ViaturaTabReparacoes.tsx',
  'src/components/viaturas/ViaturaDialog.tsx',
  'src/hooks/useContratosRenting.ts',
  'src/pages/Assistencia.tsx',
  'src/pages/AssistenciaNova.tsx',
  'src/pages/Contratos.tsx',
  'src/pages/CRM.tsx',
  'src/pages/Dashboard.tsx',
  'src/pages/FormularioPublico.tsx',
  'src/pages/LeadDetails.tsx',
  'src/pages/MotoristaCandidaturas.tsx',
  'src/pages/Motoristas.tsx',
  'src/pages/renting/ContratoForm.tsx',
  'src/pages/renting/RealizarEntregaPage.tsx',
  'src/pages/renting/RentingClientes.tsx',
  'src/pages/renting/RentingGrupoForm.tsx',
  'src/pages/renting/RentingReservaForm.tsx',
  'src/pages/renting/RentingTarifaForm.tsx',
  'src/pages/TicketDetails.tsx',
  'src/pages/Viaturas.tsx',
  'src/pages/viaturas/ViaturaMarcasModelos.tsx',
  'src/routes/NativeAppRoutes.tsx',
  'src/routes/WebAppRoutes.tsx',
  'src/utils/generateDocumentFromTemplate.ts',
];

// Ficheiros em components/pages com supabase.from() directo (dívida
// pré-existente) — isentos da regra no-restricted-syntax abaixo. Gerado
// percorrendo src/components e src/pages à procura de `supabase.from(`.
// Código novo não deve crescer esta lista — extrai para um hook.
const filesWithDirectSupabaseFrom = [
  'src/components/admin/BoltIntegrationPanel.tsx',
  'src/components/admin/CategoriasAssistenciaTab.tsx',
  'src/components/admin/DocumentTemplateEditor.tsx',
  'src/components/admin/DocumentosTab.tsx',
  'src/components/admin/EmpresaImagemUpload.tsx',
  'src/components/admin/EmpresasTab.tsx',
  'src/components/admin/EstacoesTab.tsx',
  'src/components/admin/FormulariosTab.tsx',
  'src/components/admin/GruposTab.tsx',
  'src/components/admin/IntegracaoDetailModal.tsx',
  'src/components/admin/IntegracaoDialog.tsx',
  'src/components/admin/IntegracoesTab.tsx',
  'src/components/admin/InviteGenerationForm.tsx',
  'src/components/admin/MinhaOrganizacaoTab.tsx',
  'src/components/admin/OrganizacoesTab.tsx',
  'src/components/admin/PermissionsSelector.tsx',
  'src/components/admin/PlataformasPanel.tsx',
  'src/components/admin/UsersTab.tsx',
  'src/components/admin/ViaturasTiposTab.tsx',
  'src/components/admin/combustivel/CombustivelPanel.tsx',
  'src/components/admin/faturacao/FaturacaoIntegracaoDialog.tsx',
  'src/components/administrativo/BPDataTab.tsx',
  'src/components/administrativo/BoltDataTab.tsx',
  'src/components/administrativo/ContasResumoTab.tsx',
  'src/components/administrativo/DispositivosObeTab.tsx',
  'src/components/administrativo/EdpDataTab.tsx',
  'src/components/administrativo/FaturacaoTab.tsx',
  'src/components/administrativo/ImportarDadosWizard.tsx',
  'src/components/administrativo/ImportarRecibosDialog.tsx',
  'src/components/administrativo/MotoristaResumoDialog.tsx',
  'src/components/administrativo/RelatorioPagamentoDialog.tsx',
  'src/components/administrativo/ReparaCartoes.tsx',
  'src/components/administrativo/RepsolDataTab.tsx',
  'src/components/administrativo/SlotMensalidadeCard.tsx',
  'src/components/administrativo/UberDataTab.tsx',
  'src/components/administrativo/UberViagensTab.tsx',
  'src/components/administrativo/ViaVerdeDataTab.tsx',
  'src/components/administrativo/contasResumoExports.ts',
  'src/components/administrativo/motorista-resumo/useMotoristaResumoData.ts',
  'src/components/assinatura/AssinaturasHandoverSection.tsx',
  'src/components/assistencia/NovoTicketDialog.tsx',
  'src/components/assistencia/NovoTicketPage.tsx',
  'src/components/assistencia/TicketAccessPanel.tsx',
  'src/components/assistencia/ticket/AssistenteResponsavelField.tsx',
  'src/components/calendario/CalendarioConfig.tsx',
  'src/components/calendario/CheckOutPendentesDrawer.tsx',
  'src/components/calendario/CheckinDadosSection.tsx',
  'src/components/calendario/ContratoEntregaStep.tsx',
  'src/components/calendario/EventoDialog.tsx',
  'src/components/calendario/EventoHistoricoDialog.tsx',
  'src/components/calendario/ListaEsperaDrawer.tsx',
  'src/components/calendario/NovoEventoPage.tsx',
  'src/components/calendario/RecolhaCheckinStep.tsx',
  'src/components/calendario/RecolhasPendentesDrawer.tsx',
  'src/components/calendario/RelatorioDialog.tsx',
  'src/components/calendario/TrocaCheckinStep.tsx',
  'src/components/contratos/ContractHistoryDialog.tsx',
  'src/components/contratos/EditContractDialog.tsx',
  'src/components/crm/ExportLeadsButton.tsx',
  'src/components/crm/ImportLeadsDialog.tsx',
  'src/components/crm/LeadDetailsDialog.tsx',
  'src/components/crm/LeadStatusHistory.tsx',
  'src/components/crm/filters/FilterControls.tsx',
  'src/components/dashboard/CheckinCheckoutDetailDialog.tsx',
  'src/components/faturacao/NovaFaturaDialog.tsx',
  'src/components/faturacao/RecibosDialog.tsx',
  'src/components/faturacao/ReservaFaturarDialog.tsx',
  'src/components/financeiro/RecibosTable.tsx',
  'src/components/landing/SmartForm.tsx',
  'src/components/marketing/AssinaturaDialog.tsx',
  'src/components/marketing/AssinaturasTab.tsx',
  'src/components/marketing/CampanhasTab.tsx',
  'src/components/marketing/ContactosListaDialog.tsx',
  'src/components/marketing/EnviarCampanhaDialog.tsx',
  'src/components/marketing/EstatisticasTab.tsx',
  'src/components/marketing/HistoricoEnviosDialog.tsx',
  'src/components/marketing/ImportarTab.tsx',
  'src/components/marketing/ListasTab.tsx',
  'src/components/marketing/NovaCampanhaDialog.tsx',
  'src/components/marketing/NovaListaDialog.tsx',
  'src/components/motorista-portal/CandidaturaFormulario.tsx',
  'src/components/motorista-portal/CandidaturaRejeitada.tsx',
  'src/components/motorista-portal/MotoristaCombustivelCard.tsx',
  'src/components/motorista-portal/MotoristaDanosCard.tsx',
  'src/components/motorista-portal/MotoristaDashboard.tsx',
  'src/components/motorista-portal/MotoristaDocumentosCard.tsx',
  'src/components/motorista-portal/MotoristaHistoricoViaturasCard.tsx',
  'src/components/motorista-portal/MotoristaMovimentosCard.tsx',
  'src/components/motorista-portal/MotoristaRecibosCard.tsx',
  'src/components/motorista-portal/MotoristaRelatoriosCard.tsx',
  'src/components/motorista-portal/MotoristaViaturaCard.tsx',
  'src/components/motoristas/BpNaoAssociadas.tsx',
  'src/components/motoristas/CartoesNaoReconhecidos.tsx',
  'src/components/motoristas/CondutorProvisiorioDialog.tsx',
  'src/components/motoristas/GenerateDocumentsDialog.tsx',
  'src/components/motoristas/MotoristaDeleteDialog.tsx',
  'src/components/motoristas/MotoristaDetailsDrawer.tsx',
  'src/components/motoristas/MotoristaDialog.tsx',
  'src/components/motoristas/MotoristaFormDadosPessoais.tsx',
  'src/components/motoristas/MotoristasPlataformaNaoAssociados.tsx',
  'src/components/motoristas/PortagensNaoAssociadas.tsx',
  'src/components/motoristas/tabs/MotoristaRecibosSection.tsx',
  'src/components/motoristas/tabs/MotoristaTabContratos.tsx',
  'src/components/motoristas/tabs/MotoristaTabDados.tsx',
  'src/components/motoristas/tabs/MotoristaTabDanos.tsx',
  'src/components/motoristas/tabs/MotoristaTabDocumentos.tsx',
  'src/components/motoristas/tabs/MotoristaTabFinanceiro.tsx',
  'src/components/motoristas/tabs/MotoristaTabOutrosCustos.tsx',
  'src/components/motoristas/tabs/MotoristaTabViaturas.tsx',
  'src/components/motoristas/tabs/NovoMovimentoFinanceiroOverlay.tsx',
  'src/components/motoristas/useGestoresTvde.ts',
  'src/components/my-account/PeriodoInatividadeSection.tsx',
  'src/components/renting/AdicionarViaturaGrupo.tsx',
  'src/components/renting/contratos/ContratoFaturarDialog.tsx',
  'src/components/renting/contratos/ContratoTabDanos.tsx',
  'src/components/renting/contratos/ContratoTabFaturar.tsx',
  'src/components/renting/contratos/FecharContratoDialog.tsx',
  'src/components/renting/contratos/NotaCreditoDialog.tsx',
  'src/components/renting/contratos/RenovarContratoDialog.tsx',
  'src/components/renting/reservas/tabs/ReservaTabFaturar.tsx',
  'src/components/renting/shared/CondutoresFields.tsx',
  'src/components/viaturas/DanoFotosGallery.tsx',
  'src/components/viaturas/ViaturaDetailsModal.tsx',
  'src/components/viaturas/ViaturaDialog.tsx',
  'src/components/viaturas/tabs/ViaturaTabAnexos.tsx',
  'src/components/viaturas/tabs/ViaturaTabDados.tsx',
  'src/components/viaturas/tabs/ViaturaTabDanos.tsx',
  'src/components/viaturas/tabs/ViaturaTabFinanceira.tsx',
  'src/components/viaturas/tabs/ViaturaTabHistorico.tsx',
  'src/components/viaturas/tabs/ViaturaTabMultas.tsx',
  'src/components/viaturas/tabs/ViaturaTabOBE.tsx',
  'src/components/viaturas/tabs/ViaturaTabReparacoes.tsx',
  'src/components/viaturas/tabs/ViaturaTabReservas.tsx',
  'src/components/viaturas/tabs/ViaturaTabSeguro.tsx',
  'src/pages/AdminDocumentos.tsx',
  'src/pages/Administrativo.tsx',
  'src/pages/Assistencia.tsx',
  'src/pages/AssistenciaNova.tsx',
  'src/pages/CRM.tsx',
  'src/pages/Calendario.tsx',
  'src/pages/Contatos.tsx',
  'src/pages/Contratos.tsx',
  'src/pages/Dashboard.tsx',
  'src/pages/DasprentLeads.tsx',
  'src/pages/FormularioPublico.tsx',
  'src/pages/Formularios.tsx',
  'src/pages/LeadDetails.tsx',
  'src/pages/Login.tsx',
  'src/pages/MeusTickets.tsx',
  'src/pages/MotoristaCandidaturas.tsx',
  'src/pages/MotoristaDetalhe.tsx',
  'src/pages/MyAccount.tsx',
  'src/pages/NotificacoesPage.tsx',
  'src/pages/RegistarOrg.tsx',
  'src/pages/Register.tsx',
  'src/pages/TicketDetails.tsx',
  'src/pages/ViaturaDetalhe.tsx',
  'src/pages/Viaturas.tsx',
  'src/pages/motorista/PainelMotorista.tsx',
  'src/pages/renting/RealizarEntregaPage.tsx',
  'src/pages/renting/RentingCoberturas.tsx',
  'src/pages/renting/RentingExtras.tsx',
  'src/pages/renting/RentingGrupoForm.tsx',
  'src/pages/renting/RentingGrupos.tsx',
  'src/pages/renting/RentingReservaForm.tsx',
  'src/pages/renting/RentingTarifaForm.tsx',
  'src/pages/renting/RentingTarifas.tsx',
  'src/pages/renting/RentingTaxas.tsx',
  'src/pages/renting/contrato/useContratoForm.ts',
  'src/pages/renting/entrega/entregaOperations.ts',
  'src/pages/viaturas/ViaturaCombustiveis.tsx',
  'src/pages/viaturas/ViaturaMarcasModelos.tsx',
  'src/pages/viaturas/ViaturaTipos.tsx',
];

export default tseslint.config(
  {
    ignores: [
      'dist',
      'android/**',
      'ios/**',
      'supabase/**', // Edge Functions Deno — sintaxe diferente
      '*.js', // ficheiros JS na raiz (scripts utilitários)
      'src/integrations/supabase/types.ts', // ficheiro auto-gerado pelo Supabase CLI
      '.claude/**', // worktrees internos do Claude
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended, prettierConfig],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // Desligado — projecto usa `any` extensivamente com Supabase e dados dinâmicos
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',

      // Desligado — tailwind.config.ts usa require(); padrão legítimo em configs
      '@typescript-eslint/no-require-imports': 'off',

      // Desligado — interfaces vazias usadas como extensão de tipo (padrão shadcn)
      '@typescript-eslint/no-empty-object-type': 'off',

      // Desligado — escapes em regex são intencionais (validações PT)
      'no-useless-escape': 'off',

      // Rebaixado a warning — não bloqueia CI mas permanece visível
      'prefer-const': 'warn',
      'no-empty': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      // warn em vez de error: violações existem em produção a funcionar; corrigir gradualmente
      'react-hooks/rules-of-hooks': 'warn',
    },
  },
  // no-restricted-syntax: um único bloco combinado — o ESLint flat config
  // SUBSTITUI (não junta) o valor de uma regra quando dois config objects a
  // definem para os mesmos ficheiros, por isso todos os selectors desta regra
  // vivem aqui, nunca espalhados por vários blocos. Âmbito components/pages —
  // é onde ambos os problemas (forms com useFieldArray, fetch directo) vivem;
  // hooks/lib/utils/repositories ficam de fora (supabase.from() aí é normal).
  {
    files: ['src/components/**/*.{ts,tsx}', 'src/pages/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}', ...filesWithDirectSupabaseFrom],
    rules: {
      'no-restricted-syntax': [
        'error',
        // Bloqueia a reincidência do bug de reserva/contrato #56 (fix a5c928d):
        // 'condutores'/'coberturas'/'extras'/'taxas' são SEMPRE desenhados por
        // useFieldArray — um form.setValue(...) isolado nessas listas atualiza o
        // valor em bruto mas não a cópia interna do useFieldArray que a tabela
        // lê, e a lista fica vazia/desatualizada até outra mutação (append/
        // remove/replace) sincronizar por acaso. Usa sempre append()/replace()/
        // update() da própria instância de useFieldArray (partilhando o
        // `control`, se precisares de o fazer noutro componente).
        {
          selector:
            "CallExpression[callee.property.name='setValue'][arguments.0.value='condutores']",
          message:
            "Não uses form.setValue('condutores', ...) — usa append()/replace()/update() do useFieldArray (ver fix a5c928d).",
        },
        {
          selector:
            "CallExpression[callee.property.name='setValue'][arguments.0.value='coberturas']",
          message:
            "Não uses form.setValue('coberturas', ...) — usa append()/replace()/update() do useFieldArray (ver fix a5c928d).",
        },
        {
          selector: "CallExpression[callee.property.name='setValue'][arguments.0.value='extras']",
          message:
            "Não uses form.setValue('extras', ...) — usa append()/replace()/update() do useFieldArray (ver fix a5c928d).",
        },
        {
          selector: "CallExpression[callee.property.name='setValue'][arguments.0.value='taxas']",
          message:
            "Não uses form.setValue('taxas', ...) — usa append()/replace()/update() do useFieldArray (ver fix a5c928d).",
        },
        // Dados vivem em hooks (src/hooks/), não em componentes/páginas — evita
        // escopo de org/permissões e caching inconsistentes espalhados pela UI.
        // `filesWithDirectSupabaseFrom` grandfathers o que já existe (~173
        // ficheiros, mesmo padrão do `filesExceedingMaxLines` acima); código
        // novo não pode adicionar mais chamadas directas.
        {
          selector: "CallExpression[callee.object.name='supabase'][callee.property.name='from']",
          message:
            'Evita supabase.from() directo em components/pages — extrai para um hook em src/hooks/.',
        },
      ],
    },
  },
  // max-lines: ficheiros novos (ou refactorados) não devem exceder 500 linhas
  {
    files: ['**/*.{ts,tsx}'],
    ignores: [
      '**/types.ts',
      '.sisyphus/**',
      '**/src/pages/renting/contrato/useContratoForm.ts',
      ...filesExceedingMaxLines,
    ],
    rules: {
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
    },
  }
);
