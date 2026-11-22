param([switch]$Create, [switch]$Test, [switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$moduleRoot = Split-Path -Parent $PSScriptRoot
$config = Get-Content -Raw -LiteralPath (Join-Path $moduleRoot 'config/model.config.json') | ConvertFrom-Json
$endpoint = [Uri]$config.endpoint
if ($endpoint.Scheme -ne 'http' -or $endpoint.Host -notin @('localhost','127.0.0.1','[::1]','::1')) { throw 'Configure um endpoint HTTP local.' }
$cli = Get-Command ollama -ErrorAction SilentlyContinue
$ollamaExe = if ($cli) { $cli.Source } else { Join-Path $env:LOCALAPPDATA 'Programs/Ollama/ollama.exe' }
if (-not (Test-Path -LiteralPath $ollamaExe)) { throw 'Ollama não instalado. Instale pelo site oficial e execute este script novamente.' }
& $ollamaExe --version
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível executar o Ollama.' }
try { $tags = Invoke-RestMethod -Uri ($config.endpoint.TrimEnd('/') + '/api/tags') -TimeoutSec 10 } catch { throw 'Ollama instalado, mas o serviço não respondeu. Abra o Ollama ou execute ollama serve.' }
$models = @($tags.models | Where-Object { -not $_.remote_host -and -not $_.remote_model -and $_.name -notmatch 'cloud' } | ForEach-Object { $_.name })
Write-Output ('Modelos locais: ' + ($models -join ', '))
if ($models -notcontains $config.baseModel) { throw ('Base ausente. Se desejar instalá-la, execute manualmente: ollama pull ' + $config.baseModel + '. Nenhum download foi realizado.') }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js é necessário para montar o Modelfile.' }
$content = & node (Join-Path $PSScriptRoot 'prepare.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Falha na geração das instruções.' }
if ($CheckOnly) { Write-Output 'Dependências validadas. Use -Create para criar NautIA.'; return }
if (-not $Create) { $answer = Read-Host ('Criar/atualizar ' + $config.modelName + ' usando somente a base local? [s/N]'); if ($answer -notmatch '^[sS]$') { return } }
$modelFile = Join-Path $moduleRoot 'Modelfile'
[IO.File]::WriteAllText($modelFile, ($content -join "`n").TrimEnd() + "`n", [Text.UTF8Encoding]::new($false))
$previousHost = $env:OLLAMA_HOST
try {
    $env:OLLAMA_HOST = $config.endpoint
    & $ollamaExe create $config.modelName -f $modelFile
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar o perfil NautIA.' }
} finally { $env:OLLAMA_HOST = $previousHost }
if ($Test) {
    $body = @{ model=$config.modelName; stream=$false; think=$false; messages=@(@{role='user';content='Oi! Quem é você? Responda em duas frases.'}); options=@{ num_predict=120;num_ctx=$config.numCtx } } | ConvertTo-Json -Depth 8
    $result = Invoke-RestMethod -Uri ($config.endpoint.TrimEnd('/') + '/api/chat') -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 120
    if (-not $result.message.content) { throw 'O modelo não retornou texto no teste.' }
    Write-Output $result.message.content
}
