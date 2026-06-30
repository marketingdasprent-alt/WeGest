import React, { useState } from 'react';
import { InviteGenerationForm } from '@/components/admin/InviteGenerationForm';
import { GeneratedInviteDisplay } from '@/components/admin/GeneratedInviteDisplay';
import { MotoristaInviteLink } from '@/components/admin/MotoristaInviteLink';

/**
 * Aba "Convites" das Configurações: convite de colaborador (email + grupo)
 * e link de registo de motorista (por código da org ativa).
 */
export const ConvitesTab = () => {
  const [generatedLink, setGeneratedLink] = useState('');

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
      <div className="space-y-6">
        <InviteGenerationForm onInviteGenerated={setGeneratedLink} />
        {generatedLink && <GeneratedInviteDisplay inviteLink={generatedLink} />}
      </div>

      <div className="space-y-6">
        <MotoristaInviteLink />
      </div>
    </div>
  );
};
