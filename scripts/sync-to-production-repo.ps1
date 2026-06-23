# Sync React staging codebase into a gis-toolbox branch for Cloudflare cutover.
# Usage (from repo root):
#   pwsh scripts/sync-to-production-repo.ps1 -TargetRepo "C:\path\to\gis-toolbox" -Branch react-migration

param(
    [Parameter(Mandatory = $true)]
    [string]$TargetRepo,
    [string]$Branch = 'react-migration',
    [string]$Tag = 'vanilla-pre-react'
)

$ErrorActionPreference = 'Stop'
$SourceRoot = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path (Join-Path $TargetRepo '.git'))) {
    throw "Target repo not found: $TargetRepo"
}

Push-Location $TargetRepo
try {
    git fetch origin
    git checkout main
    git pull origin main

    $tagExists = git tag -l $Tag
    if (-not $tagExists) {
        git tag $Tag
        Write-Host "Tagged main as $Tag"
    } else {
        Write-Host "Tag $Tag already exists"
    }

    git checkout -B $Branch

    Get-ChildItem -Force | Where-Object { $_.Name -ne '.git' } | Remove-Item -Recurse -Force

    $exclude = @('.git', 'node_modules', 'dist', '.cursor', '.dev-server.pid', '.cursorignore')
    robocopy $SourceRoot $TargetRepo /MIR /XD $exclude /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE" }

    # Cloudflare custom domain hint (GitHub Pages uses this too if ever needed)
    if (-not (Test-Path 'CNAME')) {
        Set-Content -Path 'CNAME' -Value 'gis-toolbox.com' -NoNewline
    }

    git add -A
    $status = git status --porcelain
    if ($status) {
        git commit -m "Migrate to React/Vite app from staging-GIS-toolbox"
        Write-Host "Committed React migration on branch $Branch"
    } else {
        Write-Host "No changes to commit"
    }

    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "  1. git push origin $Tag"
    Write-Host "  2. git push -u origin $Branch"
    Write-Host "  3. Cloudflare Pages: build 'npm ci && npm run build', output 'dist', Node 20"
    Write-Host "  4. Preview deploy on $Branch, then merge to main"
}
finally {
    Pop-Location
}
