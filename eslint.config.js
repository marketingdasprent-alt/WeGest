import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

// Ficheiros legacy com >500 linhas — isentos de max-lines (refactor futuro)
// Gerado com: find src -type f \( -name '*.ts' -o -name '*.tsx' \) \! -name 'types.ts' | while read f; do
//   [ $(wc -l < "$f") -gt 500 ] && echo "$f"; done | sort
const filesExceedingMaxLines = [
  "src/components/admin/BoltIntegrationPanel.tsx",
  "src/components/admin/DocumentTemplateEditor.tsx",
  "src/components/admin/IntegracaoDetailModal.tsx",
  "src/components/admin/IntegracaoDialog.tsx",
  "src/components/admin/IntegracoesTab.tsx",
  "src/components/admin/RichTextEditor.tsx",
  "src/components/admin/UsersTab.tsx",
  "src/components/administrativo/BoltDataTab.tsx",
  "src/components/administrativo/CartoesFlotaTab.tsx",
  "src/components/administrativo/ContasResumoTab.tsx",
  "src/components/administrativo/DispositivosObeTab.tsx",
  "src/components/administrativo/FaturacaoTab.tsx",
  "src/components/administrativo/ImportarDadosWizard.tsx",
  "src/components/administrativo/ImportarRecibosDialog.tsx",
  "src/components/administrativo/MotoristaResumoDialog.tsx",
  "src/components/administrativo/RelatorioPagamentoDialog.tsx",
  "src/components/administrativo/UberDataTab.tsx",
  "src/components/assistencia/ticket/TicketChat.tsx",
  "src/components/calendario/CheckinDadosSection.tsx",
  "src/components/calendario/CheckOutPendentesDrawer.tsx",
  "src/components/calendario/ContratoEntregaStep.tsx",
  "src/components/calendario/NovoEventoPage.tsx",
  "src/components/calendario/RecolhaCheckinStep.tsx",
  "src/components/calendario/RecolhasPendentesDrawer.tsx",
  "src/components/calendario/TrocaCheckinStep.tsx",
  "src/components/crm/LeadDetailsDialog.tsx",
  "src/components/dashboard/CheckinCheckoutDetailDialog.tsx",
  "src/components/faturacao/NovaFaturaDialog.tsx",
  "src/components/marketing/ImportarTab.tsx",
  "src/components/motorista-portal/CandidaturaFormulario.tsx",
  "src/components/motorista-portal/MotoristaDashboard.tsx",
  "src/components/motorista-portal/MotoristaRecibosCard.tsx",
  "src/components/motorista-portal/MotoristaViaturaCard.tsx",
  "src/components/motoristas/GenerateDocumentsDialog.tsx",
  "src/components/motoristas/MotoristasPlataformaNaoAssociados.tsx",
  "src/components/motoristas/tabs/MotoristaRecibosSection.tsx",
  "src/components/motoristas/tabs/MotoristaTabContratos.tsx",
  "src/components/motoristas/tabs/MotoristaTabDados.tsx",
  "src/components/motoristas/tabs/MotoristaTabDocumentos.tsx",
  "src/components/motoristas/tabs/MotoristaTabFinanceiro.tsx",
  "src/components/motoristas/tabs/MotoristaTabViaturas.tsx",
  "src/components/RentCarLanding.tsx",
  "src/components/renting/ClienteDialog.tsx",
  "src/components/renting/contratos/ContratoFaturarDialog.tsx",
  "src/components/renting/contratos/ContratoTabFaturar.tsx",
  "src/components/renting/contratos/FecharContratoDialog.tsx",
  "src/pages/renting/contrato/useContratoForm.ts",
  "src/components/renting/reservas/tabs/ReservaTabFaturar.tsx",
  "src/components/renting/reservas/tabs/ReservaTabGeral.tsx",
  "src/components/renting/shared/CondutoresFields.tsx",
  "src/components/ui/sidebar.tsx",
  "src/components/viaturas/tabs/ViaturaTabDados.tsx",
  "src/components/viaturas/tabs/ViaturaTabDanos.tsx",
  "src/components/viaturas/tabs/ViaturaTabFinanceira.tsx",
  "src/components/viaturas/tabs/ViaturaTabReparacoes.tsx",
  "src/components/viaturas/ViaturaDialog.tsx",
  "src/hooks/useContratosRenting.ts",
  "src/pages/Assistencia.tsx",
  "src/pages/AssistenciaNova.tsx",
  "src/pages/Contratos.tsx",
  "src/pages/CRM.tsx",
  "src/pages/Dashboard.tsx",
  "src/pages/FormularioPublico.tsx",
  "src/pages/LeadDetails.tsx",
  "src/pages/MotoristaCandidaturas.tsx",
  "src/pages/Motoristas.tsx",
  "src/pages/renting/ContratoForm.tsx",
  "src/pages/renting/RealizarEntregaPage.tsx",
  "src/pages/renting/RentingClientes.tsx",
  "src/pages/renting/RentingGrupoForm.tsx",
  "src/pages/renting/RentingReservaForm.tsx",
  "src/pages/renting/RentingTarifaForm.tsx",
  "src/pages/TicketDetails.tsx",
  "src/pages/Viaturas.tsx",
  "src/pages/viaturas/ViaturaMarcasModelos.tsx",
  "src/routes/NativeAppRoutes.tsx",
  "src/routes/WebAppRoutes.tsx",
  "src/utils/generateDocumentFromTemplate.ts",
];

export default tseslint.config(
  {
    ignores: [
      "dist",
      "android/**",
      "ios/**",
      "supabase/**",                          // Edge Functions Deno — sintaxe diferente
      "*.js",                                 // ficheiros JS na raiz (scripts utilitários)
      "src/integrations/supabase/types.ts",   // ficheiro auto-gerado pelo Supabase CLI
      ".claude/**",                           // worktrees internos do Claude
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended, prettierConfig],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

      // Desligado — projecto usa `any` extensivamente com Supabase e dados dinâmicos
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",

      // Desligado — tailwind.config.ts usa require(); padrão legítimo em configs
      "@typescript-eslint/no-require-imports": "off",

      // Desligado — interfaces vazias usadas como extensão de tipo (padrão shadcn)
      "@typescript-eslint/no-empty-object-type": "off",

      // Desligado — escapes em regex são intencionais (validações PT)
      "no-useless-escape": "off",

      // Rebaixado a warning — não bloqueia CI mas permanece visível
      "prefer-const": "warn",
      "no-empty": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "react-hooks/exhaustive-deps": "warn",
      // warn em vez de error: violações existem em produção a funcionar; corrigir gradualmente
      "react-hooks/rules-of-hooks": "warn",
    },
  },
  // max-lines: ficheiros novos (ou refactorados) não devem exceder 500 linhas
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["**/types.ts", ".sisyphus/**"],
    rules: {
      "max-lines": ["error", { max: 500, skipBlankLines: true, skipComments: true }],
    },
  },
  // Desactiva max-lines para ficheiros legacy >500 linhas (refactor futuro)
  {
    files: [...filesExceedingMaxLines],
    rules: {
      "max-lines": "off",
    },
  }
);
