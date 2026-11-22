$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$scriptDirectory = if ($PSScriptRoot) { $PSScriptRoot } else { Join-Path (Get-Location).Path 'scripts' }
$projectDirectory = [IO.Path]::GetFullPath((Join-Path $scriptDirectory '..'))
$iconDirectory = Join-Path $projectDirectory 'src/assets/icons/formats'
$exportDirectory = Join-Path $projectDirectory 'exports'
[IO.Directory]::CreateDirectory($exportDirectory) | Out-Null
$iconNames = @('blender','unreal','unity','fbx','obj','gltf','glb','3d-unknown','texture','material','animation','audio','document','file-unknown')
$entries = @()
foreach ($name in $iconNames) {
    $entries += @{source=(Join-Path $iconDirectory "$name.svg"); destination="svg/$name.svg"}
    foreach ($size in @(512,256,48,32,24)) {
        $path = if ($size -eq 512) { Join-Path $iconDirectory "$name.png" } else { Join-Path $iconDirectory "$size/$name.png" }
        $entries += @{source=$path;destination="png/$size/$name.png"}
    }
}
$manifest = foreach ($entry in $entries) {
    if (!(Test-Path -LiteralPath $entry.source)) { throw "Missing icon: $($entry.source)" }
    [pscustomobject]@{file=$entry.destination;bytes=(Get-Item -LiteralPath $entry.source).Length;sha256=(Get-FileHash -LiteralPath $entry.source -Algorithm SHA256).Hash.ToLowerInvariant()}
}
if ($manifest.Count -ne 84) { throw 'Expected 14 SVGs and 70 PNGs.' }
$manifestPath = Join-Path $iconDirectory 'manifest.json'
$manifest | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding utf8
$entries += @{source=(Join-Path $iconDirectory 'README.md');destination='README.md'}
$entries += @{source=(Join-Path $iconDirectory 'export-validation.json');destination='export-validation.json'}
$entries += @{source=$manifestPath;destination='manifest.json'}
$zipPath = Join-Path $exportDirectory 'rocketbox-icons.zip'
$stream = [IO.File]::Open($zipPath, [IO.FileMode]::Create)
$archive = [IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($entry in $entries) { [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$entry.source,$entry.destination,[IO.Compression.CompressionLevel]::Optimal) | Out-Null }
} finally { $archive.Dispose(); $stream.Dispose() }
$check = [IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    if ($check.Entries.Count -ne 87) { throw 'Unexpected ZIP contents.' }
    foreach ($item in $manifest) {
        $entry = $check.GetEntry($item.file)
        $source = $entry.Open()
        try { $sha = [Security.Cryptography.SHA256]::Create(); $digest=[BitConverter]::ToString($sha.ComputeHash($source)).Replace('-','').ToLowerInvariant(); $sha.Dispose() } finally { $source.Dispose() }
        if ($digest -ne $item.sha256) { throw "ZIP hash mismatch: $($item.file)" }
    }
} finally { $check.Dispose() }
Write-Output "Validated ZIP: 14 SVGs, 70 PNGs, README, validation and SHA-256 manifest."
Write-Output $zipPath
