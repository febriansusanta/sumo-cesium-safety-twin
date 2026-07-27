param(
    [Parameter(Position = 0, Mandatory = $true)]
    [ValidateSet('setup', 'build', 'up', 'down', 'reset', 'test', 'lint', 'demo', 'clean-runs', 'rebuild-network', 'smoke')]
    [string]$Task
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $ProjectRoot
try {
    switch ($Task) {
        'setup' { python scripts/bootstrap.py }
        'build' { python scripts/bootstrap.py; Push-Location web; npm run build; Pop-Location }
        'up' { python scripts/dev.py }
        'down' {
            $rootPattern = [regex]::Escape($ProjectRoot)
            $processes = Get-CimInstance Win32_Process | Where-Object {
                $_.CommandLine -match $rootPattern -and $_.CommandLine -match 'scripts[\\/]dev\.py'
            }
            foreach ($process in $processes) { taskkill /PID $process.ProcessId /T /F | Out-Host }
            if (-not $processes) { Write-Host 'No project dev process is running.' }
        }
        'reset' { python scripts/clean.py all --yes; python scripts/bootstrap.py }
        'test' { python scripts/test_all.py }
        'lint' {
            .\.venv\Scripts\python.exe -m ruff check api pipeline scripts
            Push-Location web; npm run lint; Pop-Location
        }
        'demo' { .\.venv\Scripts\python.exe scripts/demo.py }
        'clean-runs' { python scripts/clean.py runs --yes }
        'rebuild-network' { .\.venv\Scripts\python.exe -m pipeline.entrypoint network --force-build }
        'smoke' { .\.venv\Scripts\python.exe scripts/smoke.py }
    }
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
    Pop-Location
}
