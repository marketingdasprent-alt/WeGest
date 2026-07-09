import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { DashboardLayout } from '@/components/DashboardLayout';
import { usePageTracking } from '@/hooks/usePageTracking';
import { RECURSOS } from '@/utils/permissions';
import { Loader2 } from 'lucide-react';

const EntradaNativa = lazy(() => import('@/pages/EntradaNativa'));
const EntradaMotoristaNativa = lazy(() => import('@/pages/motorista/EntradaMotoristaNativa'));
const LoginMotorista = lazy(() => import('@/pages/motorista/LoginMotorista'));
const PainelMotorista = lazy(() => import('@/pages/motorista/PainelMotorista'));
const RegistoMotorista = lazy(() => import('@/pages/motorista/RegistoMotorista'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const Login = lazy(() => import('@/pages/Login'));
const CRMContatos = lazy(() => import('@/pages/CRMContatos'));
const LeadDetails = lazy(() => import('@/pages/LeadDetails'));
const Motoristas = lazy(() => import('@/pages/Motoristas'));
const MotoristaDetalhe = lazy(() => import('@/pages/MotoristaDetalhe'));
const Viaturas = lazy(() => import('@/pages/Viaturas'));
const ViaturaDetalhe = lazy(() => import('@/pages/ViaturaDetalhe'));
const Contratos = lazy(() => import('@/pages/Contratos'));
const Assistencia = lazy(() => import('@/pages/Assistencia'));
const AssistenciaNova = lazy(() => import('@/pages/AssistenciaNova'));
const TicketDetails = lazy(() => import('@/pages/TicketDetails'));
const MyAccount = lazy(() => import('@/pages/MyAccount'));
const MotoristaCandidaturas = lazy(() => import('@/pages/MotoristaCandidaturas'));
const Calendario = lazy(() => import('@/pages/Calendario'));
const Administrativo = lazy(() => import('@/pages/Administrativo'));
const Marketing = lazy(() => import('@/pages/Marketing'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const MeusTickets = lazy(() => import('@/pages/MeusTickets'));
const AdminSettings = lazy(() => import('@/pages/AdminSettings'));
const AdminInvites = lazy(() => import('@/pages/AdminInvites'));
const AdminDocumentos = lazy(() => import('@/pages/AdminDocumentos'));
// Renting + configuração de viaturas — mantidos em sincronia com WebAppRoutes
// (sem isto, no Android estas rotas caíam no catch-all → dashboard).
const RentingContratos = lazy(() => import('@/pages/renting/RentingContratos'));
const ContratoForm = lazy(() => import('@/pages/renting/ContratoForm'));
const PedidosTrocaKms = lazy(() => import('@/pages/renting/PedidosTrocaKms'));
const RealizarEntregaPage = lazy(() => import('@/pages/renting/RealizarEntregaPage'));
const DanosPublicosPage = lazy(() => import('@/pages/DanosPublicosPage'));
const RentingReservas = lazy(() => import('@/pages/renting/RentingReservas'));
const RentingReservaForm = lazy(() => import('@/pages/renting/RentingReservaForm'));
const RentingMovimentacoes = lazy(() => import('@/pages/renting/RentingMovimentacoes'));
const RentingMovimentacaoForm = lazy(() => import('@/pages/renting/RentingMovimentacaoForm'));
const RentingClientes = lazy(() => import('@/pages/renting/RentingClientes'));
const RentingClienteForm = lazy(() => import('@/pages/renting/RentingClienteForm'));
const RentingGrupos = lazy(() => import('@/pages/renting/RentingGrupos'));
const RentingGrupoForm = lazy(() => import('@/pages/renting/RentingGrupoForm'));
const RentingTarifas = lazy(() => import('@/pages/renting/RentingTarifas'));
const RentingTarifaForm = lazy(() => import('@/pages/renting/RentingTarifaForm'));
const RentingCoberturas = lazy(() => import('@/pages/renting/RentingCoberturas'));
const RentingExtras = lazy(() => import('@/pages/renting/RentingExtras'));
const RentingTaxas = lazy(() => import('@/pages/renting/RentingTaxas'));
const ViaturaMarcasModelos = lazy(() => import('@/pages/viaturas/ViaturaMarcasModelos'));
const ViaturaCombustiveis = lazy(() => import('@/pages/viaturas/ViaturaCombustiveis'));
const ViaturaTipos = lazy(() => import('@/pages/viaturas/ViaturaTipos'));

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

const NativeAppRoutes = () => {
  usePageTracking();

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<EntradaNativa />} />

        <Route path="/motorista" element={<EntradaMotoristaNativa />} />
        <Route path="/motorista/login" element={<LoginMotorista />} />
        <Route path="/motorista/registo" element={<RegistoMotorista />} />
        <Route
          path="/motorista/painel"
          element={
            <ProtectedRoute requiredResource={RECURSOS.MOTORISTA_PAINEL}>
              <PainelMotorista />
            </ProtectedRoute>
          }
        />

        <Route path="/login" element={<LoginMotorista />} />
        <Route path="/equipa" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route
          path="/crm"
          element={
            <ProtectedRoute requiredResource={RECURSOS.MOTORISTAS_CRM}>
              <DashboardLayout>
                <CRMContatos />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/crm/lead/:id"
          element={
            <ProtectedRoute requiredResource={RECURSOS.MOTORISTAS_CRM}>
              <DashboardLayout>
                <LeadDetails />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/motoristas"
          element={
            <ProtectedRoute requiredResource={RECURSOS.MOTORISTAS_GESTAO}>
              <DashboardLayout>
                <Motoristas />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/motoristas/:id"
          element={
            <ProtectedRoute requiredResource={RECURSOS.MOTORISTAS_GESTAO}>
              <DashboardLayout>
                <MotoristaDetalhe />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/motoristas/candidaturas"
          element={
            <ProtectedRoute requiredResource={RECURSOS.MOTORISTAS_GESTAO}>
              <DashboardLayout>
                <MotoristaCandidaturas />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/viaturas"
          element={
            <ProtectedRoute requiredResource={RECURSOS.VIATURAS_VER}>
              <DashboardLayout>
                <Viaturas />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/viaturas/:id"
          element={
            <ProtectedRoute requiredResource={RECURSOS.VIATURAS_VER}>
              <DashboardLayout>
                <ViaturaDetalhe />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/contratos"
          element={
            <ProtectedRoute requiredResource={RECURSOS.MOTORISTAS_CONTRATOS}>
              <DashboardLayout>
                <Contratos />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/assistencia"
          element={
            <ProtectedRoute requiredResource={RECURSOS.ASSISTENCIA_TICKETS}>
              <DashboardLayout>
                <Assistencia />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/assistencia/nova"
          element={
            <ProtectedRoute requiredResource={RECURSOS.ASSISTENCIA_TICKETS}>
              <DashboardLayout>
                <AssistenciaNova />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/assistencia/:id"
          element={
            <ProtectedRoute requiredResource={RECURSOS.ASSISTENCIA_TICKETS}>
              <DashboardLayout>
                <TicketDetails />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-account"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <MyAccount />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/calendario"
          element={
            <ProtectedRoute requiredResource={RECURSOS.CALENDARIO_VER}>
              <DashboardLayout>
                <Calendario />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/financeiro"
          element={
            <ProtectedRoute requiredResource={RECURSOS.FINANCEIRO_RECIBOS}>
              <DashboardLayout>
                <Administrativo />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/marketing"
          element={
            <ProtectedRoute requiredResource={RECURSOS.MARKETING_VER}>
              <DashboardLayout>
                <Marketing />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute requiredResource={RECURSOS.MOTORISTAS_GESTAO}>
              <DashboardLayout>
                <Dashboard />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/meus-tickets"
          element={
            <ProtectedRoute requiredResource={RECURSOS.MOTORISTAS_CRM}>
              <DashboardLayout>
                <MeusTickets />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/meus-tickets/:id"
          element={
            <ProtectedRoute requiredResource={RECURSOS.MOTORISTAS_CRM}>
              <DashboardLayout>
                <TicketDetails />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/settings"
          element={
            <ProtectedRoute requireAdmin={true} requiredResource={RECURSOS.ADMIN_CONFIGURACOES}>
              <DashboardLayout>
                <AdminSettings />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/invites"
          element={
            <ProtectedRoute requireAdmin={true} requiredResource={RECURSOS.ADMIN_CONVITES}>
              <DashboardLayout>
                <AdminInvites />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/documentos"
          element={
            <ProtectedRoute requiredResource={RECURSOS.ADMIN_DOCUMENTOS}>
              <DashboardLayout>
                <AdminDocumentos />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />

        {/* ── Renting (sincronizado com WebAppRoutes) ── */}
        <Route
          path="/renting/contratos"
          element={
            <ProtectedRoute requiredResource="renting_contratos">
              <DashboardLayout>
                <RentingContratos />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/renting/contratos/novo"
          element={
            <ProtectedRoute requiredResource="renting_contratos">
              <DashboardLayout>
                <ContratoForm />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/renting/pedidos-kms"
          element={
            <ProtectedRoute requiredResource="renting_contratos">
              <DashboardLayout>
                <PedidosTrocaKms />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/renting/contratos/:id"
          element={
            <ProtectedRoute requiredResource="renting_contratos">
              <DashboardLayout>
                <ContratoForm />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        {/* Galeria pública de danos (QR da folha de danos) — sem login */}
        <Route path="/danos/:token" element={<DanosPublicosPage />} />
        {/* Deep link via QR — usado pelo modal de "Realizar agora" */}
        <Route
          path="/realizar/:token"
          element={
            <ProtectedRoute>
              <RealizarEntregaPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/renting/reservas"
          element={
            <ProtectedRoute requiredResource="renting_reservas">
              <DashboardLayout>
                <RentingReservas />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/renting/reservas/nova"
          element={
            <ProtectedRoute requiredResource="renting_reservas">
              <DashboardLayout>
                <RentingReservaForm />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/renting/reservas/:id"
          element={
            <ProtectedRoute requiredResource="renting_reservas">
              <DashboardLayout>
                <RentingReservaForm />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/renting/movimentacoes"
          element={
            <ProtectedRoute requiredResource="renting_movimentacoes">
              <DashboardLayout>
                <RentingMovimentacoes />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/renting/movimentacoes/novo"
          element={
            <ProtectedRoute requiredResource="renting_movimentacoes">
              <DashboardLayout>
                <RentingMovimentacaoForm />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/renting/movimentacoes/:id"
          element={
            <ProtectedRoute requiredResource="renting_movimentacoes">
              <DashboardLayout>
                <RentingMovimentacaoForm />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/renting/clientes"
          element={
            <ProtectedRoute requiredResource="renting_clientes">
              <DashboardLayout>
                <RentingClientes />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/renting/clientes/novo"
          element={
            <ProtectedRoute requiredResource="renting_clientes">
              <DashboardLayout>
                <RentingClienteForm />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/renting/clientes/:id"
          element={
            <ProtectedRoute requiredResource="renting_clientes">
              <DashboardLayout>
                <RentingClienteForm />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/renting/tarifas"
          element={
            <ProtectedRoute requiredResource="renting_contratos">
              <DashboardLayout>
                <RentingTarifas />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/renting/tarifas/nova"
          element={
            <ProtectedRoute requiredResource="renting_contratos">
              <DashboardLayout>
                <RentingTarifaForm />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/renting/tarifas/:id"
          element={
            <ProtectedRoute requiredResource="renting_contratos">
              <DashboardLayout>
                <RentingTarifaForm />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/renting/tarifas/coberturas"
          element={
            <ProtectedRoute requiredResource="renting_contratos">
              <DashboardLayout>
                <RentingCoberturas />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/renting/tarifas/extras"
          element={
            <ProtectedRoute requiredResource="renting_contratos">
              <DashboardLayout>
                <RentingExtras />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/renting/tarifas/taxas"
          element={
            <ProtectedRoute requiredResource="renting_contratos">
              <DashboardLayout>
                <RentingTaxas />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />

        {/* ── Configuração de viaturas (sincronizado com WebAppRoutes) ── */}
        <Route
          path="/viaturas/grupos"
          element={
            <ProtectedRoute requiredResource="viaturas_ver">
              <DashboardLayout>
                <RentingGrupos />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/viaturas/grupos/novo"
          element={
            <ProtectedRoute requiredResource="viaturas_ver">
              <DashboardLayout>
                <RentingGrupoForm />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/viaturas/grupos/:id"
          element={
            <ProtectedRoute requiredResource="viaturas_ver">
              <DashboardLayout>
                <RentingGrupoForm />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/viaturas/marcas-modelos"
          element={
            <ProtectedRoute requiredResource="viaturas_ver">
              <DashboardLayout>
                <ViaturaMarcasModelos />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/viaturas/combustiveis"
          element={
            <ProtectedRoute requiredResource="viaturas_ver">
              <DashboardLayout>
                <ViaturaCombustiveis />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/viaturas/tipos"
          element={
            <ProtectedRoute requiredResource="viaturas_ver">
              <DashboardLayout>
                <ViaturaTipos />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
};

export default NativeAppRoutes;
