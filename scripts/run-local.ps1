$ErrorActionPreference = 'Stop'
Write-Host 'CoronaryLens local startup helper' -ForegroundColor Cyan
Write-Host 'Open two PowerShell terminals. This script prints commands rather than leaving background processes hidden.'
Write-Host ''
Write-Host 'Terminal A (API):' -ForegroundColor Yellow
Write-Host '$env:PORT="8080"; $env:NODE_ENV="development"; pnpm --filter @workspace/api-server run build; pnpm --filter @workspace/api-server run start'
Write-Host ''
Write-Host 'Terminal B (frontend):' -ForegroundColor Yellow
Write-Host '$env:PORT="5173"; $env:BASE_PATH="/"; pnpm --filter @workspace/coronarylens-3d run dev'
Write-Host ''
Write-Host 'Then open http://localhost:5173 and check http://localhost:8080/api/health and /api/ready.'
