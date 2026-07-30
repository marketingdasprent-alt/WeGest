import React, { useState } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { useTenant } from '@/contexts/TenantContext';
import { AdminAccessDenied } from '@/components/admin/AdminAccessDenied';
import { AdminLoadingState } from '@/components/admin/AdminLoadingState';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UsersTab } from '@/components/admin/UsersTab';
import { ConvitesTab } from '@/components/admin/ConvitesTab';
import { GruposTab } from '@/components/admin/GruposTab';
import { DocumentosTab } from '@/components/admin/DocumentosTab';
import { CamposTab } from '@/components/admin/CamposTab';
import { FormulariosTab } from '@/components/admin/FormulariosTab';
import { CategoriasAssistenciaTab } from '@/components/admin/CategoriasAssistenciaTab';
import { MecanicosTab } from '@/components/admin/MecanicosTab';
import { IntegracoesTab } from '@/components/admin/IntegracoesTab';
import { EstacoesTab } from '@/components/admin/EstacoesTab';
import { EmpresasTab } from '@/components/admin/EmpresasTab';
import { ViaturasTiposTab } from '@/components/admin/ViaturasTiposTab';
import { FiscalTab } from '@/components/admin/FiscalTab';
import { PrivacidadeTab } from '@/components/admin/PrivacidadeTab';
import { MinhaOrganizacaoTab } from '@/components/admin/MinhaOrganizacaoTab';
import { OrganizacoesTab } from '@/components/admin/OrganizacoesTab';
import { ImportExcelDialog } from '@/components/admin/ImportExcelDialog';
import { RECURSOS } from '@/utils/permissions';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { Settings2, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';

const DECADA_OUSADA_ORG_ID = '11111111-1111-1111-1111-111111111111';

const AdminSettings = () => {
  const { isAdmin, loading, hasAccessToResource } = usePermissions();
  const { orgId } = useTenant();
  const [importOpen, setImportOpen] = useState(false);
  const isDecadaOusada = orgId === DECADA_OUSADA_ORG_ID;
  const canConvites = hasAccessToResource(RECURSOS.ADMIN_CONVITES);

  if (loading) {
    return <AdminLoadingState message="A verificar permissões..." />;
  }

  if (!isAdmin) {
    return <AdminAccessDenied />;
  }

  return (
    <Tabs defaultValue="users" className="w-full">
      <ImportExcelDialog open={importOpen} onOpenChange={setImportOpen} />

      <StickyPageHeader
        title="Configurações do Sistema"
        description="Gerir utilizadores, grupos, documentos, formulários e categorias"
        icon={Settings2}
        className="pb-0"
      >
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setImportOpen(true)}>
          <FileSpreadsheet className="h-4 w-4" />
          Importar Excel
        </Button>
      </StickyPageHeader>

      <TabsList className="bg-transparent border-b rounded-none h-auto p-0 gap-6 overflow-x-auto justify-start no-scrollbar mb-6">
        <TabsTrigger
          value="users"
          className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 pb-2 h-auto text-xs"
        >
          Utilizadores
        </TabsTrigger>
        <TabsTrigger
          value="minha-organizacao"
          className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 pb-2 h-auto text-xs"
        >
          Minha Organização
        </TabsTrigger>
        {canConvites && (
          <TabsTrigger
            value="convites"
            className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 pb-2 h-auto text-xs"
          >
            Convites
          </TabsTrigger>
        )}
        <TabsTrigger
          value="grupos"
          className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 pb-2 h-auto text-xs"
        >
          Grupos
        </TabsTrigger>
        <TabsTrigger
          value="documentos"
          className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 pb-2 h-auto text-xs"
        >
          Documentos
        </TabsTrigger>
        <TabsTrigger
          value="campos"
          className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 pb-2 h-auto text-xs"
        >
          Campos
        </TabsTrigger>
        <TabsTrigger
          value="formularios"
          className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 pb-2 h-auto text-xs"
        >
          Formulários
        </TabsTrigger>
        <TabsTrigger
          value="categorias"
          className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 pb-2 h-auto text-xs"
        >
          Assistência
        </TabsTrigger>
        <TabsTrigger
          value="mecanicos"
          className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 pb-2 h-auto text-xs"
        >
          Mecânicos
        </TabsTrigger>
        <TabsTrigger
          value="integracoes"
          className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 pb-2 h-auto text-xs"
        >
          Integrações
        </TabsTrigger>
        <TabsTrigger
          value="estacoes"
          className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 pb-2 h-auto text-xs"
        >
          Estações
        </TabsTrigger>
        <TabsTrigger
          value="empresas"
          className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 pb-2 h-auto text-xs"
        >
          Empresas
        </TabsTrigger>
        <TabsTrigger
          value="viatura-tipos"
          className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 pb-2 h-auto text-xs"
        >
          Tipos Viatura
        </TabsTrigger>
        <TabsTrigger
          value="fiscal"
          className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 pb-2 h-auto text-xs"
        >
          Fiscal
        </TabsTrigger>
        <TabsTrigger
          value="privacidade"
          className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 pb-2 h-auto text-xs"
        >
          Privacidade
        </TabsTrigger>
        {isDecadaOusada && (
          <TabsTrigger
            value="organizacoes"
            className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 pb-2 h-auto text-xs"
          >
            Organizações
          </TabsTrigger>
        )}
      </TabsList>

      <div className="space-y-6">
        <TabsContent value="users" className="mt-0">
          <UsersTab />
        </TabsContent>

        <TabsContent value="minha-organizacao" className="mt-0">
          <MinhaOrganizacaoTab />
        </TabsContent>

        {canConvites && (
          <TabsContent value="convites" className="mt-0">
            <ConvitesTab />
          </TabsContent>
        )}

        <TabsContent value="grupos" className="mt-0">
          <GruposTab />
        </TabsContent>

        <TabsContent value="documentos" className="mt-0">
          <DocumentosTab />
        </TabsContent>

        <TabsContent value="campos" className="mt-0">
          <CamposTab />
        </TabsContent>

        <TabsContent value="formularios" className="mt-0">
          <FormulariosTab />
        </TabsContent>

        <TabsContent value="categorias" className="mt-0">
          <CategoriasAssistenciaTab />
        </TabsContent>

        <TabsContent value="mecanicos" className="mt-0">
          <MecanicosTab />
        </TabsContent>

        <TabsContent value="integracoes" className="mt-0">
          <IntegracoesTab />
        </TabsContent>

        <TabsContent value="estacoes" className="mt-0">
          <EstacoesTab />
        </TabsContent>

        <TabsContent value="empresas" className="mt-0">
          <EmpresasTab />
        </TabsContent>

        <TabsContent value="viatura-tipos" className="mt-0">
          <ViaturasTiposTab />
        </TabsContent>

        <TabsContent value="fiscal" className="mt-0">
          <FiscalTab />
        </TabsContent>

        <TabsContent value="privacidade" className="mt-0">
          <PrivacidadeTab />
        </TabsContent>

        {isDecadaOusada && (
          <TabsContent value="organizacoes" className="mt-0">
            <OrganizacoesTab />
          </TabsContent>
        )}
      </div>
    </Tabs>
  );
};

export default AdminSettings;
