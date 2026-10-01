// Um destino FTP/SFTP vindo do utilizador nunca pode apontar para dentro da
// rede da Edge Function: loopback, redes privadas, link-local (onde vive o
// endpoint de metadata da cloud) ou portas fora das de FTP/SFTP. Sem isto, um
// admin de uma organização usa o botão "testar ligação" como port scanner.

export type DnsResolver = (hostname: string) => Promise<string[]>;

export const FTP_PORTS_PERMITIDAS: ReadonlySet<number> = new Set([21, 22, 990, 2121, 2222]);

const parseIpv4 = (host: string): number[] | null => {
  const partes = host.split('.');
  if (partes.length !== 4) return null;
  const octetos = partes.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return octetos.every((o) => Number.isInteger(o) && o >= 0 && o <= 255) ? octetos : null;
};

export function isIpv4Privado(ip: string): boolean {
  const o = parseIpv4(ip);
  if (!o) return false;
  const [a, b] = o;
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // 10.0.0.0/8
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 (carrier NAT)
    (a === 169 && b === 254) || // link-local + metadata cloud
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 192 && b === 0 && o[2] === 0) || // 192.0.0.0/24 (IETF)
    (a === 198 && (b === 18 || b === 19)) || // 198.18.0.0/15 (benchmark)
    a >= 224 // multicast + reservado + broadcast
  );
}

export function isIpv6Privado(ip: string): boolean {
  const normalizado = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalizado === '::' || normalizado === '::1') return true;
  if (normalizado.startsWith('::ffff:')) {
    // IPv4 embutido em IPv6: decide pelo IPv4.
    return isIpv4Privado(normalizado.slice('::ffff:'.length));
  }
  return (
    /^f[cd][0-9a-f]{2}:/.test(normalizado) || // fc00::/7 (ULA)
    /^fe[89ab][0-9a-f]:/.test(normalizado) || // fe80::/10 (link-local)
    /^ff[0-9a-f]{2}:/.test(normalizado) // multicast
  );
}

export function isIpPrivado(ip: string): boolean {
  return ip.includes(':') ? isIpv6Privado(ip) : isIpv4Privado(ip);
}

const isIpLiteral = (host: string): boolean => parseIpv4(host) !== null || host.includes(':');

export type DestinoFtpVeredicto = { permitido: true } | { permitido: false; motivo: string };

// Resolve o host em IPs e recusa se algum cair numa rede interna: o atacante
// controla o DNS do host que introduz, por isso o nome em si não chega.
export async function validarDestinoFtp(
  host: string,
  porta: number,
  resolver: DnsResolver,
): Promise<DestinoFtpVeredicto> {
  const hostLimpo = host.trim().toLowerCase().replace(/^\[|\]$/g, '');

  if (!hostLimpo) return { permitido: false, motivo: 'O servidor FTP/SFTP é obrigatório.' };
  if (hostLimpo === 'localhost' || hostLimpo.endsWith('.localhost') || hostLimpo.endsWith('.internal')) {
    return { permitido: false, motivo: 'O servidor FTP/SFTP não pode ser um endereço interno.' };
  }
  if (!FTP_PORTS_PERMITIDAS.has(porta)) {
    return {
      permitido: false,
      motivo: `A porta ${porta} não é uma porta FTP/SFTP (permitidas: ${[...FTP_PORTS_PERMITIDAS].join(', ')}).`,
    };
  }

  let enderecos: string[];
  if (isIpLiteral(hostLimpo)) {
    enderecos = [hostLimpo];
  } else {
    try {
      enderecos = await resolver(hostLimpo);
    } catch {
      return { permitido: false, motivo: 'Não foi possível encontrar o servidor FTP/SFTP. Confirme o endereço introduzido.' };
    }
    if (enderecos.length === 0) {
      return { permitido: false, motivo: 'Não foi possível encontrar o servidor FTP/SFTP. Confirme o endereço introduzido.' };
    }
  }

  if (enderecos.some(isIpPrivado)) {
    return { permitido: false, motivo: 'O servidor FTP/SFTP não pode ser um endereço interno.' };
  }

  return { permitido: true };
}

// Resolver real: A e AAAA, ignorando o tipo que falhar (host só com um deles).
export const resolverDnsDeno: DnsResolver = async (hostname) => {
  const [a, aaaa] = await Promise.allSettled([
    Deno.resolveDns(hostname, 'A'),
    Deno.resolveDns(hostname, 'AAAA'),
  ]);
  return [
    ...(a.status === 'fulfilled' ? a.value : []),
    ...(aaaa.status === 'fulfilled' ? aaaa.value : []),
  ];
};
