import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.9';
import { Client as FtpClient } from 'npm:basic-ftp@5.2.1';
import SftpClient from 'npm:ssh2-sftp-client@12.0.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const PORTAL_LOGIN_URL = 'https://mobi.pp.viaverde.pt/PartnerPortal/LoginPage.aspx';

type Payload = {
  ftp_host: string;
  ftp_porta: number;
  ftp_protocolo: 'ftp' | 'sftp';
  ftp_modo_passivo: boolean;
  ftp_utilizador: string;
  ftp_password: string;
  sync_email: string;
  sync_password: string;
};

type TestResult = {
  success: boolean;
  message: string;
  code?: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const toTrimmedString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const validatePayload = (body: Record<string, unknown>): Payload => {
  const ftp_host = toTrimmedString(body.ftp_host);
  const ftp_porta = Number(body.ftp_porta);
  const ftp_protocolo = body.ftp_protocolo === 'sftp' ? 'sftp' : 'ftp';
  const ftp_utilizador = toTrimmedString(body.ftp_utilizador);
  const ftp_password = toTrimmedString(body.ftp_password);
  const sync_email = toTrimmedString(body.sync_email);
  const sync_password = toTrimmedString(body.sync_password);

  if (!ftp_host || ftp_host.length > 255) {
    throw new Error('O servidor FTP/SFTP é obrigatório.');
  }

  if (!Number.isInteger(ftp_porta) || ftp_porta < 1 || ftp_porta > 65535) {
    throw new Error('A porta FTP/SFTP é inválida.');
  }

  if (!ftp_utilizador || ftp_utilizador.length > 255) {
    throw new Error('O utilizador FTP/SFTP é obrigatório.');
  }

  if (!ftp_password || ftp_password.length > 255) {
    throw new Error('A password FTP/SFTP é obrigatória.');
  }

  if (!sync_email || sync_email.length > 255) {
    throw new Error('O utilizador do portal é obrigatório.');
  }

  if (!sync_password || sync_password.length > 255) {
    throw new Error('A password do portal é obrigatória.');
  }

  return {
    ftp_host,
    ftp_porta,
    ftp_protocolo,
    ftp_modo_passivo: Boolean(body.ftp_modo_passivo),
    ftp_utilizador,
    ftp_password,
    sync_email,
    sync_password,
  };
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const mapConnectionError = (error: unknown): TestResult => {
  const rawMessage = getErrorMessage(error, 'Falha ao validar FTP/SFTP.');
  const normalized = rawMessage.toLowerCase();

  if (normalized.includes('enotfound') || normalized.includes('getaddrinfo')) {
    return {
      success: false,
      code: 'HOST_NOT_FOUND',
      message: 'Não foi possível encontrar o servidor FTP/SFTP. Confirme o endereço introduzido.',
    };
  }

  if (normalized.includes('econnrefused')) {
    return {
      success: false,
      code: 'CONNECTION_REFUSED',
      message: 'O servidor FTP/SFTP recusou a ligação. Confirme a porta e se o serviço está disponível.',
    };
  }

  if (normalized.includes('timed out') || normalized.includes('timeout') || normalized.includes('etimedout')) {
    return {
      success: false,
      code: 'TIMEOUT',
      message: 'O servidor FTP/SFTP demorou demasiado tempo a responder.',
    };
  }

  if (
    normalized.includes('authentication failed') ||
    normalized.includes('all configured authentication methods failed') ||
    normalized.includes('login failed') ||
    normalized.includes('530')
  ) {
    return {
      success: false,
      code: 'AUTH_FAILED',
      message: 'As credenciais FTP/SFTP parecem inválidas. Confirme o utilizador e a password.',
    };
  }

  if (normalized.includes('no such file') || normalized.includes('permission denied')) {
    return {
      success: false,
      code: 'ACCESS_FAILED',
      message: 'A ligação foi feita, mas o servidor FTP/SFTP não permitiu listar os ficheiros.',
    };
  }

  return {
    success: false,
    code: 'UNKNOWN_CONNECTION_ERROR',
    message: rawMessage,
  };
};

const ensureAdmin = async (req: Request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authHeader = req.headers.get('Authorization');

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error('Configuração Supabase incompleta.');
  }

  if (!authHeader?.startsWith('Bearer ')) {
    return json({ success: false, error: 'Não autenticado.' }, 401);
  }

  const token = authHeader.replace('Bearer ', '');
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: claimsData,
    error: claimsError,
  } = await authClient.auth.getClaims(token);

  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
    console.warn('[via-verde-test-connection] token inválido', claimsError);
    return json({ success: false, error: 'Sessão inválida.' }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) {
    console.error('[via-verde-test-connection] erro ao validar permissões', profileError);
    throw new Error('Não foi possível validar as permissões do utilizador.');
  }

  if (!profile?.is_admin) {
    return json({ success: false, error: 'Sem permissão para testar a ligação.' }, 403);
  }

  return { userId };
};

const testFtpConnection = async (payload: Payload): Promise<TestResult> => {
  if (payload.ftp_protocolo === 'sftp') {
    const client = new SftpClient();

    try {
      await client.connect({
        host: payload.ftp_host,
        port: payload.ftp_porta,
        username: payload.ftp_utilizador,
        password: payload.ftp_password,
        readyTimeout: 10000,
      });

      await client.list('.', () => true);

      return {
        success: true,
        message: 'Ligação SFTP validada com sucesso.',
      };
    } catch (error) {
      return mapConnectionError(error);
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  const client = new FtpClient(10000);
  client.ftp.verbose = false;

  try {
    await client.access({
      host: payload.ftp_host,
      port: payload.ftp_porta,
      user: payload.ftp_utilizador,
      password: payload.ftp_password,
      secure: false,
    });

    await client.list();

    return {
      success: true,
      message: payload.ftp_modo_passivo
        ? 'Ligação FTP validada em modo passivo.'
        : 'Ligação FTP validada. O teste foi executado em modo compatível do cliente.',
    };
  } catch (error) {
    return mapConnectionError(error);
  } finally {
    client.close();
  }
};

const testPortalConnection = async (payload: Payload): Promise<TestResult> => {
  const response = await fetch(PORTAL_LOGIN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      wtUserNameInput: payload.sync_email,
      wtPasswordInput: payload.sync_password,
      wt3: 'Entrar na Via Verde +',
    }),
    redirect: 'follow',
  });

  const responseText = await response.text();
  const stayedOnLogin =
    response.url.includes('LoginPage.aspx') &&
    responseText.includes('wtUserNameInput') &&
    responseText.includes('wtPasswordInput') &&
    responseText.includes('Faça login com os seus dados');

  if (!response.ok) {
    throw new Error(`Portal respondeu com estado ${response.status}.`);
  }

  if (stayedOnLogin) {
    return {
      success: false,
      message: 'Não foi possível validar o acesso ao portal Via Verde com estas credenciais.',
    };
  }

  return {
    success: true,
    message: 'Credenciais do portal Via Verde validadas.',
  };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ success: false, error: 'Método não suportado.' }, 405);
  }

  try {
    const authResult = await ensureAdmin(req);
    if (authResult instanceof Response) return authResult;

    console.info('[via-verde-test-connection] pedido recebido', {
      userId: authResult.userId,
    });

    const body = await req.json();
    const payload = validatePayload(body);

    const [ftp, portal] = await Promise.allSettled([
      testFtpConnection(payload),
      testPortalConnection(payload),
    ]);

    const ftpResult: TestResult =
      ftp.status === 'fulfilled'
        ? ftp.value
        : mapConnectionError(ftp.reason);

    const portalResult: TestResult =
      portal.status === 'fulfilled'
        ? portal.value
        : { success: false, message: getErrorMessage(portal.reason, 'Falha ao validar portal.') };

    const success = ftpResult.success && portalResult.success;

    console.info('[via-verde-test-connection] resultado do teste', {
      userId: authResult.userId,
      success,
      ftpSuccess: ftpResult.success,
      portalSuccess: portalResult.success,
    });

    return json({
      success,
      ftp: ftpResult,
      portal: portalResult,
    });
  } catch (error) {
    console.error('[via-verde-test-connection] erro', error);
    return json(
      {
        success: false,
        error: getErrorMessage(error, 'Erro inesperado ao testar a ligação.'),
      },
      500,
    );
  }
});
