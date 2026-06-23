# Década Ousada

Sistema de gestão de frotas TVDE — CRM, motoristas, viaturas, contratos e muito mais.

## Tecnologias

- React + TypeScript
- Vite
- Tailwind CSS
- Supabase (Backend & Auth)

## Instalação Local

```sh
git clone <URL_DO_REPO>
cd decada-ousada
pnpm install
pnpm dev
```

## Publicação iOS com GitHub Actions

Foi adicionado o workflow `.github/workflows/ios-release.yml` para gerar a app iOS com Capacitor e enviar para o TestFlight usando um runner macOS do GitHub Actions.

### 1. Ligar o projecto ao GitHub

No Lovable, vá a **Settings → GitHub → Connect project** e crie o repositório.

### 2. Criar os GitHub Secrets

No GitHub, abra **Settings → Secrets and variables → Actions** e adicione:

- `APPLE_TEAM_ID`
- `APPLE_KEY_ID`
- `APPLE_ISSUER_ID`
- `APPLE_API_KEY_BASE64`
- `IOS_CERTIFICATE_P12_BASE64`
- `IOS_CERTIFICATE_PASSWORD`
- `IOS_PROVISION_PROFILE_BASE64`
- `KEYCHAIN_PASSWORD`

### 3. Converter ficheiros para base64

Use estes comandos antes de colar os valores nos secrets:

```sh
base64 -i AuthKey_XXXXXX.p8 | pbcopy
base64 -i certificado-distribuicao.p12 | pbcopy
base64 -i perfil.mobileprovision | pbcopy
```

Se estiver em Windows PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('AuthKey_XXXXXX.p8'))
[Convert]::ToBase64String([IO.File]::ReadAllBytes('certificado-distribuicao.p12'))
[Convert]::ToBase64String([IO.File]::ReadAllBytes('perfil.mobileprovision'))
```

### 4. Como correr o workflow

- Abra o separador **Actions** no GitHub
- Escolha **iOS Release**
- Clique em **Run workflow**

O workflow também dispara automaticamente quando criar uma tag com o formato `ios-v*`.

### 5. O que o workflow faz

- instala dependências
- corre `pnpm build`
- corre `npx cap add ios || true` e `npx cap sync ios`
- instala certificados e provisioning profile
- gera o `.ipa`
- envia a build para o TestFlight

### 6. Notas importantes

- Faça primeiro testes no TestFlight antes de submeter para produção
- Sempre que alterar algo nativo localmente, faça `git pull` e depois `npx cap sync`
- A build de release usa os assets locais; não active live reload para produção

## Licença

Projeto privado — todos os direitos reservados.

