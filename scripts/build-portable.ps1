param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $projectRoot
try {
    $version = (Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json).version
    $tauriVersion = (Get-Content -LiteralPath 'src-tauri/tauri.conf.json' -Raw | ConvertFrom-Json).version
    if ($version -ne $tauriVersion) { throw 'Package and desktop versions must match.' }
    if ($env:CARGO_TARGET_DIR) { throw 'Use the default Cargo target directory for portable packaging.' }

    & npm.cmd run tauri -- build --no-bundle --config src-tauri/tauri.portable.conf.json --target x86_64-pc-windows-msvc -- --locked
    if ($LASTEXITCODE -ne 0) { throw 'Portable application build failed.' }

    $name = "FinTrack_${version}_windows-x64-portable"
    $output = Join-Path $projectRoot 'release'
    $staging = Join-Path $output ([guid]::NewGuid().ToString())
    $package = Join-Path $staging $name
    New-Item -ItemType Directory -Path $package -Force | Out-Null
    Copy-Item -LiteralPath 'src-tauri/target/x86_64-pc-windows-msvc/release/fintrack.exe' -Destination (Join-Path $package 'FinTrack.exe')
    Copy-Item -LiteralPath 'docs/PORTABLE.md' -Destination (Join-Path $package 'README.txt')
    Copy-Item -LiteralPath 'CHANGELOG.md' -Destination $package
    # Stage only these public files. Never package an existing user's data folder.
    $archive = Join-Path $output "$name.zip"
    if (Test-Path -LiteralPath $archive) { throw "Release archive already exists: $archive" }
    Compress-Archive -LiteralPath $package -DestinationPath $archive -CompressionLevel Optimal
    $stream = [System.IO.File]::OpenRead($archive)
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $hash = [System.BitConverter]::ToString($sha256.ComputeHash($stream)).Replace('-', '').ToLowerInvariant()
    } finally {
        $stream.Dispose()
        $sha256.Dispose()
    }
    [System.IO.File]::WriteAllText((Join-Path $output "$name.sha256"), "$hash  $name.zip`n", [System.Text.UTF8Encoding]::new($false))
    Write-Output "Portable ZIP: $archive"
    Write-Output "SHA256: $hash"
} finally {
    Pop-Location
}
