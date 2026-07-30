import React, { useState } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { PromoteAdminForm } from '@/components/admin/PromoteAdminForm';
import { InviteGenerationForm } from '@/components/admin/InviteGenerationForm';
import { GeneratedInviteDisplay } from '@/components/admin/GeneratedInviteDisplay';
import { AdminLoadingState } from '@/components/admin/AdminLoadingState';
import { AdminAccessDenied } from '@/components/admin/AdminAccessDenied';
import { MotoristaInviteLink } from '@/components/admin/MotoristaInviteLink';

const AdminInvites = () => {
  const [generatedLink, setGeneratedLink] = useState('');
  const { isAdmin, loading: adminLoading } = usePermissions();

  if (adminLoading) {
    return <AdminLoadingState message="A verificar permissões..." />;
  }

  if (!isAdmin) {
    return <AdminAccessDenied />;
  }

  const handleInviteGenerated = (link: string) => {
    setGeneratedLink(link);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-grid-white/[0.02] dark:bg-grid-white/[0.02] bg-grid-black/[0.02] bg-[size:60px_60px] pointer-events-none" />

      <div className="relative z-10 container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <PromoteAdminForm />

          <InviteGenerationForm onInviteGenerated={handleInviteGenerated} />

          {generatedLink && <GeneratedInviteDisplay inviteLink={generatedLink} />}

          <MotoristaInviteLink />
        </div>
      </div>
    </div>
  );
};

export default AdminInvites;
