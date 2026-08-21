param(
    [string]$LauncherPath = (Join-Path $PSScriptRoot 'start-siyu.ps1'),
    [string]$ShortcutPath = ''
)

$expectedUrl = 'https://temporary-prompt-ridge-2fk9bxn.vercel.app/#today'
$source = Get-Content -LiteralPath $LauncherPath -Raw

if ($source -notmatch [regex]::Escape($expectedUrl)) {
    throw 'Launcher does not target the deployed Siyu website.'
}

if ($source -match '127\.0\.0\.1|localhost|npm\.cmd') {
    throw 'Launcher still depends on a local development server.'
}

$resolvedUrl = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $LauncherPath -ResolveOnly
if ($LASTEXITCODE -ne 0) {
    throw "Launcher ResolveOnly mode failed with exit code $LASTEXITCODE."
}

if (($resolvedUrl | Out-String).Trim() -ne $expectedUrl) {
    throw 'Launcher ResolveOnly mode returned an unexpected URL.'
}

if ($ShortcutPath) {
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($ShortcutPath)
    $expectedTarget = Join-Path $env:WINDIR 'explorer.exe'

    if ($shortcut.TargetPath -ine $expectedTarget) {
        throw 'Desktop shortcut does not open the website directly.'
    }

    if ($shortcut.Arguments.Trim('"') -ne $expectedUrl) {
        throw 'Desktop shortcut points to an unexpected website.'
    }

    $iconPath = $shortcut.IconLocation -replace ',\d+$', ''
    if (-not (Test-Path -LiteralPath $iconPath)) {
        throw 'Desktop shortcut icon file is missing.'
    }
}

Write-Output 'PASS: Siyu launcher targets the deployed website.'
