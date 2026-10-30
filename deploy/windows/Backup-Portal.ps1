$ErrorActionPreference = 'Stop'
$env:DATA_DIR = 'C:\BreviaPrototipos\data'
& 'C:\BreviaPrototipos\runtime\node-v22.23.4-win-x64\node.exe' 'C:\BreviaPrototipos\app\scripts\backup.js'
if ($LASTEXITCODE -ne 0) { throw 'O backup do portal falhou.' }
