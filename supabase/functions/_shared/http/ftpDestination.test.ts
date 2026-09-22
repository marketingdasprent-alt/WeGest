import { assert, assertEquals } from "jsr:@std/assert@1.0.19";
import { isIpPrivado, validarDestinoFtp } from "./ftpDestination.ts";

const resolveFixo = (ips: string[]) => (_host: string) => Promise.resolve(ips);

Deno.test("classifica redes internas IPv4 e IPv6", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
    assert(isIpPrivado(ip), `${ip} devia ser interno`);
  }
  for (const ip of ["8.8.8.8", "172.32.0.1", "193.136.1.1", "2001:4860:4860::8888", "::ffff:8.8.8.8"]) {
    assert(!isIpPrivado(ip), `${ip} devia ser público`);
  }
});

Deno.test("aceita host público em porta FTP/SFTP", async () => {
  const veredicto = await validarDestinoFtp("ftp.exemplo.pt", 21, resolveFixo(["193.136.1.1"]));
  assertEquals(veredicto, { permitido: true });
});

Deno.test("recusa host que resolve para rede interna, mesmo com um IP público misturado", async () => {
  const veredicto = await validarDestinoFtp("ftp.exemplo.pt", 22, resolveFixo(["193.136.1.1", "10.0.0.5"]));
  assert(!veredicto.permitido);
});

Deno.test("recusa IP literal interno sem consultar DNS", async () => {
  let resolveu = false;
  const veredicto = await validarDestinoFtp("169.254.169.254", 21, () => {
    resolveu = true;
    return Promise.resolve([]);
  });
  assert(!veredicto.permitido);
  assert(!resolveu, "não devia resolver um IP literal");
});

Deno.test("recusa localhost, .internal e IPv6 entre parênteses rectos", async () => {
  for (const host of ["localhost", "LOCALHOST", "db.internal", "[::1]"]) {
    const veredicto = await validarDestinoFtp(host, 21, resolveFixo(["8.8.8.8"]));
    assert(!veredicto.permitido, `${host} devia ser recusado`);
  }
});

Deno.test("recusa portas fora das de FTP/SFTP", async () => {
  for (const porta of [80, 443, 5432, 6379, 8080]) {
    const veredicto = await validarDestinoFtp("ftp.exemplo.pt", porta, resolveFixo(["8.8.8.8"]));
    assert(!veredicto.permitido, `porta ${porta} devia ser recusada`);
  }
});

Deno.test("recusa host que não resolve", async () => {
  const semRegistos = await validarDestinoFtp("nao-existe.exemplo.pt", 21, resolveFixo([]));
  assert(!semRegistos.permitido);
  const falha = await validarDestinoFtp("nao-existe.exemplo.pt", 21, () => Promise.reject(new Error("NXDOMAIN")));
  assert(!falha.permitido);
});
