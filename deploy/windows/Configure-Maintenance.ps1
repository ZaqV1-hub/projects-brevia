$ErrorActionPreference = 'Stop'
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

# Use a dedicated task and renewal id; do not alter other applications' tasks.
$renewalAction = New-ScheduledTaskAction -Execute 'C:\Tools\win-acme\wacs.exe' -WorkingDirectory 'C:\Tools\win-acme' -Argument '--renew --id brevia-prototipos --notaskscheduler --baseuri https://acme-v02.api.letsencrypt.org/'
Register-ScheduledTask -TaskName 'BreviaPrototipos-CertificateRenewal' -Action $renewalAction -Trigger (New-ScheduledTaskTrigger -Daily -At '03:15') -Principal $principal -Settings $settings -Force | Out-Null
$backupAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File C:\BreviaPrototipos\app\deploy\windows\Backup-Portal.ps1'
Register-ScheduledTask -TaskName 'BreviaPrototipos-Backup' -Action $backupAction -Trigger (New-ScheduledTaskTrigger -Daily -At '03:45') -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName 'BreviaPrototipos-CertificateRenewal'
Start-ScheduledTask -TaskName 'BreviaPrototipos-Backup'
Write-Output 'Renovacao e backup configurados nas tarefas exclusivas do portal.'
