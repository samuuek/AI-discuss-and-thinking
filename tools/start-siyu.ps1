param(
    [switch]$ResolveOnly
)

$ErrorActionPreference = 'Stop'
$siteUrl = 'https://temporary-prompt-ridge-2fk9bxn.vercel.app/#today'

if ($ResolveOnly) {
    Write-Output $siteUrl
    exit 0
}

Start-Process -FilePath $siteUrl
