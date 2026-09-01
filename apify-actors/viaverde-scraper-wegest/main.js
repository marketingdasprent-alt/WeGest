import { Actor } from 'apify';
import { chromium } from 'playwright';
import fs from 'node:fs';
import XLSX from 'xlsx';

await Actor.init();
const input = await Actor.getInput();
const {
  email,
  password,
  startDate: startDateIn,
  endDate: endDateIn,
  periodo_inicio,
  periodo_fim,
  callbackUrl,
  tenantId,
} = input || {};

// Aceitar tanto startDate/endDate (DD/MM/YYYY, formato nativo do actor) como
// periodo_inicio/periodo_fim (YYYY-MM-DD, formato enviado pelo robot-execute do
// WEGEST) — sem isto o actor ignorava silenciosamente o período pedido e usava
// sempre o default 01/01/2026 → 31/12/2026.
const toDDMMYYYY = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
};
const startDate = startDateIn || toDDMMYYYY(periodo_inicio) || '01/01/2026';
const endDate = endDateIn || toDDMMYYYY(periodo_fim) || '31/12/2026';

if (!email || !password) {
  await Actor.setValue('OUTPUT', { success: false, error: 'Missing credentials' });
  await Actor.exit();
  process.exit(0);
}

console.log(`Via Verde WEGEST scraper for ${email} | ${startDate} → ${endDate}`);

// Proxy da Apify: o Via Verde parece bloquear/rejeitar logins vindos do IP de
// datacenter do runner (credenciais corretas, formulário corretamente
// preenchido — confirmado por screenshot — mas login sempre rejeitado). Sair
// por um IP de proxy diferente do da Apify testa exatamente essa hipótese.
let proxyServer;
try {
  const proxyConfiguration = await Actor.createProxyConfiguration();
  const proxyUrl = proxyConfiguration ? await proxyConfiguration.newUrl() : null;
  if (proxyUrl) {
    const u = new URL(proxyUrl);
    proxyServer = { server: `${u.protocol}//${u.host}`, username: u.username, password: u.password };
    console.log(`Usando proxy: ${u.host}`);
  }
} catch (e) {
  console.log(`Sem proxy disponível, a seguir sem proxy: ${e.message}`);
}

// headless:false (o container já corre sob xvfb-run, ver Dockerfile/base image) +
// mascarar navigator.webdriver + user-agent realista — headless puro é um dos
// sinais mais óbvios de automação e pode levar sites com deteção de bot a
// rejeitar o login com uma mensagem genérica de credenciais inválidas mesmo
// quando estão corretas.
const browser = await chromium.launch({
  headless: false,
  proxy: proxyServer,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
});
const context = await browser.newContext({
  viewport: { width: 1366, height: 900 },
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  locale: 'pt-PT',
  timezoneId: 'Europe/Lisbon',
});
await context.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
});
const page = await context.newPage();

// Screenshots de debug: gravar no key-value store do Apify (Actor.setValue),
// não em disco local — page.screenshot({ path }) grava no filesystem do
// container, que é descartado no fim do run e nunca fica acessível depois.
const saveDebugScreenshot = async (key) => {
  try {
    const buffer = await page.screenshot();
    await Actor.setValue(key, buffer, { contentType: 'image/png' });
    console.log(`Debug screenshot guardado: ${key}`);
  } catch (e) {
    console.log(`Falha ao guardar screenshot ${key}: ${e.message}`);
  }
};

try {
  console.log('Step 1: Navigate to extratos (protected page, triggers login modal)');
  await page.goto('https://www.viaverde.pt/empresas/minha-via-verde/ExtratoseMovimentos', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  console.log('Step 2: Dismiss cookie banner');
  try {
    await page.waitForSelector('#onetrust-accept-btn-handler', { timeout: 8000 });
    await page.click('#onetrust-accept-btn-handler');
    await page.waitForTimeout(1500);
  } catch { console.log('No cookie banner'); }

  console.log('Step 3: Ensure login modal is open');
  await page.waitForTimeout(2000);
  // Check which login tab/form is visible
  const formInfo = await page.evaluate(() => {
    const visibleForm = (formId) => {
      const form = document.querySelector(formId);
      if (!form) return null;
      const style = window.getComputedStyle(form);
      const parent = form.closest('.tab-pane, .modal-body, [style*="display"]');
      return {
        display: style.display,
        visibility: style.visibility,
        offsetParent: form.offsetParent !== null,
      };
    };
    return {
      loginDNN: visibleForm('#dnn_ctr4019_Login_Login_DNN_txtUsername'),
      userLogin: visibleForm('#txtUsername'),
      modalVisible: !!document.querySelector('.modal-login.show, .modal-login.in'),
    };
  });
  console.log('Form state:', JSON.stringify(formInfo));

  // Switch to the Login_DNN tab if needed
  console.log('Step 4: Click "Entrar" tab to show primary form');
  try {
    await page.evaluate(() => {
      // The tab "Entrar" / "Login" might need to be clicked to show the primary form
      const tabs = document.querySelectorAll('[data-toggle="tab"], .nav-tabs a, .modal a[href*="Login"]');
      for (const tab of tabs) {
        const text = tab.textContent.toLowerCase();
        if (text.includes('entrar') || text.includes('login')) {
          tab.click();
          return;
        }
      }
    });
    await page.waitForTimeout(1500);
  } catch {}

  // Step 5: Fill the form using whichever inputs are VISIBLE in the modal
  console.log('Step 5: Fill credentials');

  // Try Login_DNN first (visible if tab activated), fallback to UserLogin
  let filledForm = null;
  for (const selector of [
    'input[name="dnn$ctr4019$Login$Login_DNN$txtUsername"]',
    '#txtUsername',
    'input[type="email"][id*="txtUsername"]',
  ]) {
    try {
      const el = page.locator(selector).first();
      if (await el.isVisible({ timeout: 2000 })) {
        await el.click();
        await el.fill('');
        await el.pressSequentially(email, { delay: 30 });
        console.log(`Filled username via: ${selector}`);
        filledForm = selector;
        break;
      }
    } catch {}
  }

  for (const selector of [
    'input[name="dnn$ctr4019$Login$Login_DNN$txtPassword"]',
    '#txtPassword',
    'input[type="password"][id*="txtPassword"]',
  ]) {
    try {
      const el = page.locator(selector).first();
      if (await el.isVisible({ timeout: 2000 })) {
        await el.click();
        await el.fill('');
        await el.pressSequentially(password, { delay: 30 });
        console.log(`Filled password via: ${selector}`);
        break;
      }
    } catch {}
  }

  if (!filledForm) throw new Error('Could not find visible login form fields');

  // Confirmar que os valores realmente ficaram nos campos antes de submeter
  // (deteta silenciosamente um fill que não "pegou", ex: campo re-renderizado
  // por JS entre o preenchimento e a leitura).
  const filledValues = await page.evaluate(() => ({
    username: document.querySelector('#txtUsername')?.value || document.querySelector('[id*="txtUsername"]')?.value || '',
    passwordLen: (document.querySelector('#txtPassword')?.value || document.querySelector('[id*="txtPassword"]')?.value || '').length,
  }));
  console.log(`Verificação pré-submit: username="${filledValues.username}" passwordLen=${filledValues.passwordLen}`);

  // Step 6: Submit — clicar fisicamente no botão real (Playwright dispara o
  // evento de clique completo, incluindo onclick inline E qualquer
  // addEventListener adicional que a página tenha registado, ex: geração de
  // token anti-fraude/analytics antes do postback). Chamar
  // WebForm_DoPostBackWithOptions()/__doPostBack() diretamente via evaluate()
  // salta esses listeners extra — suspeito de ser a causa do "credenciais
  // inválidas" mesmo com email/password corretos.
  console.log('Step 6: Submit login');

  if (filledForm.includes('Login_DNN')) {
    console.log('Clicking cmdLogin (real click)');
    try {
      await page.locator('#dnn_ctr4019_Login_Login_DNN_cmdLogin').click({ timeout: 3000 });
    } catch {
      await page.evaluate(() => {
        if (typeof __doPostBack === 'function') __doPostBack('dnn$ctr4019$Login$Login_DNN$cmdLogin', '');
      });
    }
  } else {
    console.log('Clicking #btnLogin (real click)');
    try {
      await page.locator('#btnLogin').click({ timeout: 3000 });
    } catch {
      await page.evaluate(() => {
        if (typeof WebForm_DoPostBackWithOptions === 'function') {
          WebForm_DoPostBackWithOptions(new WebForm_PostBackOptions('dnn$UserLogin$btnLogin', '', true, '', '', false, false));
        }
      });
    }
  }

  // Step 7: Wait and verify
  await page.waitForTimeout(8000);
  const url1 = page.url();
  console.log(`URL after submit: ${url1}`);

  if (url1.includes('returnurl') || url1.match(/empresas\/?(\?|$)/)) {
    const html = await page.content();
    const err = html.match(/Email ou palavra-passe[^<]*/);
    if (err) {
      await saveDebugScreenshot('debug_login_fail');
      throw new Error(`Login failed: ${err[0]}`);
    }
    // Verify auth
    await page.goto('https://www.viaverde.pt/empresas/minha-via-verde/ExtratoseMovimentos', { waitUntil: 'networkidle', timeout: 30000 });
    if (page.url().includes('returnurl')) {
      await saveDebugScreenshot('debug_login_fail');
      throw new Error('Login failed: redirected back to login');
    }
  }

  console.log(`✅ Login OK: ${page.url()}`);

  // Step 8: Ir ao separador Movimentos (tem filtro de datas PRÓPRIO,
  // independente do filtro de Extratos — vm.fromDateTransactions/
  // toDateTransactions, dd/MM/yyyy, botão #btnListTransactions).
  console.log('Step 8: Abrir separador Movimentos');
  // Dar tempo ao Angular (mainController vm.init()) para renderizar os tabs
  // depois do redirect do login — sem isto o locator falha por o elemento
  // ainda não existir, não por seletor errado. Latência do proxy varia
  // bastante entre runs, por isso há uma segunda tentativa com mais wait.
  await page.waitForTimeout(3000);
  try {
    await page.locator('a[ng-click="vm.changeTab(1)"]').click({ timeout: 15000 });
  } catch (e) {
    console.log(`Clique em Movimentos falhou, a tentar de novo após wait extra: ${String(e).slice(0, 150)}`);
    await page.waitForTimeout(5000);
    await page.locator('a[ng-click="vm.changeTab(1)"]').click({ timeout: 20000 });
  }
  await page.waitForTimeout(2000);

  // O painel "Filtrar por:" é um acordeão fechado por defeito — os campos
  // De/Até e o botão Filtrar existem no DOM mas ficam invisíveis (e por
  // isso não clicáveis) até este toggle ser clicado. `:visible` é uma
  // extensão do Playwright — só apanha a instância do separador ativo
  // (há uma cópia igual, escondida, no separador Extratos).
  console.log('Step 8a2: Expandir "Filtrar por:"');
  // O clique em si funciona sempre (acordeão jQuery UI, sem navegação real),
  // mas o Playwright por vezes fica preso na fase pós-clique "waiting for
  // scheduled navigations to finish" (falso positivo). Tolerar esse timeout.
  try {
    await page.locator('button.expand-button:visible', { hasText: 'Filtrar por' }).click({ timeout: 8000 });
  } catch (e) {
    console.log(`Clique em "Filtrar por" excedeu o timeout (provável falso positivo, a continuar): ${String(e).slice(0, 150)}`);
  }
  await page.waitForTimeout(1000);

  console.log('Step 8b: Definir período (De/Até) via Angular scope — campos são readonly (datepicker popup)');
  const [ds, ms, ys] = startDate.split('/');
  const [de, me, ye] = endDate.split('/');
  await page.evaluate(({ from, to }) => {
    const container = document.querySelector('[ng-controller="datepickerController as datepickerPair"]');
    const scope = window.angular.element(container).scope();
    scope.vm.fromDateTransactions = new Date(from);
    scope.vm.toDateTransactions = new Date(to);
    scope.datepickerPair.changeLowerLimit(scope.vm.fromDateTransactions);
    scope.datepickerPair.changeUpperLimit(scope.vm.toDateTransactions);
    scope.$apply();
  }, { from: `${ys}-${ms}-${ds}`, to: `${ye}-${me}-${de}` });
  await page.waitForTimeout(1000);

  console.log('Step 8c: Clicar Filtrar (#btnListTransactions)');
  try {
    await page.locator('#btnListTransactions').click({ timeout: 8000 });
  } catch (e) {
    console.log(`Clique em Filtrar excedeu o timeout (provável falso positivo, a continuar): ${String(e).slice(0, 150)}`);
  }
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // Step 9: Exportar Excel (mais fiável que ler a tabela HTML — a tabela
  // pode estar paginada; o Excel traz tudo o que o filtro devolveu).
  console.log('Step 9: Exportar → Excel');
  try {
    await page
      .locator('div.btn-has-dropdown-menu:has(a[ng-click="vm.exportTransactionsExcel()"]) a.link-download')
      .click({ timeout: 8000 });
  } catch (e) {
    console.log(`Clique em Exportar excedeu o timeout (provável falso positivo, a continuar): ${String(e).slice(0, 150)}`);
  }
  await page.waitForTimeout(500);

  const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
  await page.locator('a[ng-click="vm.exportTransactionsExcel()"]').click({ timeout: 8000 });
  const download = await downloadPromise;
  const excelPath = await download.path();
  const excelBuffer = fs.readFileSync(excelPath);
  console.log(`Excel descarregado: ${excelBuffer.length} bytes`);

  const workbook = XLSX.read(excelBuffer, { type: 'buffer', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  // header:1 → matriz de linhas em bruto. Cabeçalho real (confirmado a partir
  // de um export real, uma só linha, em inglês — nada a ver com os nomes
  // mostrados na tabela HTML em pt-PT):
  // License Plate | IAI | OBU | Service | Service Description | Market |
  // Market Description | Entry Date | Exit Date | Entry Point | Exit Point |
  // Value | Is Payed | Payment Date | Contract Number | Discount VV |
  // Discount VVPercentage | Liquid Value | Discount Balance |
  // Mobility Account | Payment Method | System Entry Date
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

  const headerRowIdx = rows.findIndex((r) => r.some((c) => String(c).trim() === 'License Plate'));
  const dataRows = headerRowIdx === -1 ? rows : rows.slice(headerRowIdx + 1);

  let allMovs = dataRows
    .filter((r) => r.some((c) => String(c).trim() !== ''))
    .map((r) => ({
      matricula: String(r[0] ?? '').trim(),
      nr_equipamento: String(r[2] ?? '').trim(), // OBU
      servico: String(r[4] ?? '').trim(), // Service Description
      data_entrada: String(r[7] ?? '').trim(),
      data_saida: String(r[8] ?? '').trim(),
      local_entrada: String(r[9] ?? '').trim(),
      local_saida: String(r[10] ?? '').trim(),
      valor: String(r[11] ?? '').trim(),
      estado: String(r[12] ?? '').trim().toUpperCase() === 'TRUE' ? 'Pago' : 'Pendente',
      contrato: String(r[14] ?? '').trim(),
      contaMobilidade: String(r[19] ?? '').trim(),
      pagamento: String(r[20] ?? '').trim(),
    }));

  if (allMovs.length === 0) {
    await saveDebugScreenshot('debug_no_mov');
    // Guardar o Excel em bruto no key-value store para diagnóstico manual.
    await Actor.setValue('movimentos_excel_raw', excelBuffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    throw new Error('No movements found in Excel export');
  }

  const placas = [...new Set(allMovs.map(m => m.matricula))];
  const soma = allMovs.reduce((a, m) => a + (parseFloat(String(m.valor).replace(/[€\s]/g,'').replace(',','.'))||0), 0);
  const result = { success: true, tenantId, period: { startDate, endDate }, totalMovimentos: allMovs.length, totalMatriculas: placas.length, totalValor: soma.toFixed(2), extractedAt: new Date().toISOString(), movimentos: allMovs };
  await Actor.setValue('OUTPUT', result);
  await Actor.pushData(result);
  console.log(`✅ ${allMovs.length} movs | ${placas.length} mats | ${soma.toFixed(2)}€`);

  if (callbackUrl) {
    try {
      // robot-webhook só reconhece Via Verde se o payload tiver "transacoes"
      // (array) ou "dados_csv" — "movimentos" (nome usado internamente aqui)
      // não é procurado, e o pedido cai no 422 "formato não reconhecido".
      const cb = await fetch(callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...result, transacoes: allMovs }),
      });
      console.log(`Callback: ${cb.status}`);
    } catch (e) { console.log(`Callback fail: ${e.message}`); }
  }

} catch (err) {
  console.error(`❌ ${err.message}`);
  await saveDebugScreenshot('debug_error');
  await Actor.setValue('OUTPUT', { success: false, error: err.message });
} finally {
  await browser.close();
  await Actor.exit();
}
