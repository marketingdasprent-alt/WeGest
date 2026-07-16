export type ViaVerdeFtpProtocolo = 'ftp' | 'sftp';

export interface ViaVerdeConta {
  id: string;
  integracao_id: string;
  nome_conta: string;
  codigo_rac: string;
  ftp_host: string;
  ftp_porta: number;
  ftp_protocolo: ViaVerdeFtpProtocolo;
  ftp_modo_passivo: boolean;
  ftp_utilizador: string;
  ftp_password: string;
  ftp_ativo: boolean;
  sync_email: string;
  sync_password: string;
  sync_ativo: boolean;
  created_at: string;
  updated_at: string;
  criado_por: string | null;
  logo_url: string | null;
}

export interface ViaVerdeContaFormValues {
  nome_conta: string;
  codigo_rac: string;
  ftp_host: string;
  ftp_porta: string;
  ftp_protocolo: ViaVerdeFtpProtocolo;
  ftp_modo_passivo: boolean;
  ftp_utilizador: string;
  ftp_password: string;
  ftp_ativo: boolean;
  sync_email: string;
  sync_password: string;
  sync_ativo: boolean;
}

export const VIA_VERDE_DEFAULT_FORM_VALUES: ViaVerdeContaFormValues = {
  nome_conta: '',
  codigo_rac: '',
  ftp_host: '',
  ftp_porta: '21',
  ftp_protocolo: 'ftp',
  ftp_modo_passivo: true,
  ftp_utilizador: '',
  ftp_password: '',
  ftp_ativo: false,
  sync_email: '',
  sync_password: '',
  sync_ativo: true,
};
