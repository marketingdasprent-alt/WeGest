import { usePermissions } from '@/hooks/usePermissions';
import { RECURSOS } from '@/utils/permissions';
import { AdminLoadingState } from '@/components/admin/AdminLoadingState';
import { AdminAccessDenied } from '@/components/admin/AdminAccessDenied';
import { MinhaOrganizacaoTab } from '@/components/admin/MinhaOrganizacaoTab';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { Building2 } from 'lucide-react';

const MinhaOrganizacao = () => {
  const { isAdmin, hasAccessToResource, loading } = usePermissions();

  if (loading) {
    return <AdminLoadingState message="A carregar organização..." />;
  }

  if (!isAdmin && !hasAccessToResource(RECURSOS.ADMIN_MINHA_ORGANIZACAO)) {
    return <AdminAccessDenied />;
  }

  return (
    <div className="container mx-auto py-6 px-4 space-y-6">
      <StickyPageHeader
        title="Minha Organização"
        description="Dados da sua organização"
        icon={Building2}
        className="pb-0"
      />
      <MinhaOrganizacaoTab />
    </div>
  );
};

export default MinhaOrganizacao;
