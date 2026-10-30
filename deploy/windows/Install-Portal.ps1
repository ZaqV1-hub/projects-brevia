$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Import-Module WebAdministration
$base = 'C:\BreviaPrototipos'
$site = 'BreviaPrototipos'
$domain = 'prototipos.brevia.company'
$proxy = 'C:\Sites\BreviaPrototipos'
$node = "$base\runtime\node-v22.23.4-win-x64\node.exe"

if (!(Test-Path $node)) { throw 'Instale o runtime privado do Node antes de continuar.' }
if (!(Test-Path "$base\data\portal.sqlite")) { throw 'Restaure o banco privado antes de continuar.' }
if ((Get-Website | Where-Object {$_.Name -ne $site -and ($_.Bindings.Collection.bindingInformation -contains "*:80:$domain" -or $_.Bindings.Collection.bindingInformation -contains "*:443:$domain")})) { throw 'O dominio ja esta vinculado a outro site.' }
if (!(Get-Service $site -ErrorAction SilentlyContinue) -and (Get-NetTCPConnection -LocalPort 4607 -State Listen -ErrorAction SilentlyContinue)) { throw 'A porta privada 4607 ja esta em uso.' }

Backup-WebConfiguration -Name ('Before-BreviaPrototipos-' + (Get-Date -Format 'yyyyMMdd-HHmmss')) | Out-Null
New-Item -ItemType Directory -Force -Path $proxy | Out-Null
Copy-Item "$base\app\deploy\windows\web.config" "$proxy\web.config" -Force
if (!(Test-Path "IIS:\AppPools\$site")) { New-WebAppPool $site | Out-Null }
Set-ItemProperty "IIS:\AppPools\$site" managedRuntimeVersion ''
if (!(Test-Path "IIS:\Sites\$site")) { New-Website -Name $site -PhysicalPath $proxy -ApplicationPool $site -Port 80 -HostHeader $domain | Out-Null }

$variables = Get-WebConfiguration -PSPath 'MACHINE/WEBROOT/APPHOST' -Location $site -Filter 'system.webServer/rewrite/allowedServerVariables'
if (!($variables.Collection | Where-Object {$_.name -eq 'HTTP_X_FORWARDED_PROTO'})) {
  Add-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Location $site -Filter 'system.webServer/rewrite/allowedServerVariables' -Name '.' -Value @{name='HTTP_X_FORWARDED_PROTO'}
}

Copy-Item "$base\app\deploy\windows\BreviaPrototipos.xml" "$base\service\BreviaPrototipos.xml" -Force
if (!(Test-Path "$base\service\BreviaPrototipos.exe")) { Copy-Item 'C:\LumiAdmin\service\BreviaLumiAdmin.exe' "$base\service\BreviaPrototipos.exe" }
if (!(Get-Service $site -ErrorAction SilentlyContinue)) {
  & "$base\service\BreviaPrototipos.exe" install
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar o servico.' }
  & sc.exe config $site obj= "NT SERVICE\$site"
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao configurar a identidade privada do servico.' }
}
& icacls $base /grant:r "NT SERVICE\${site}:(OI)(CI)RX" | Out-Null
& icacls "$base\data" /grant:r "NT SERVICE\${site}:(OI)(CI)M" | Out-Null
& icacls "$base\logs" /grant:r "NT SERVICE\${site}:(OI)(CI)M" | Out-Null
if ((Get-Service $site).Status -eq 'Running') { Restart-Service $site } else { Start-Service $site }
Get-Service $site | Select-Object Name,Status
Write-Output 'Servico instalado. Vincule o certificado ao site para concluir a publicacao HTTPS.'
