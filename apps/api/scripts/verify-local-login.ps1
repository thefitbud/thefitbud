# Verifies demo password login against a running wrangler dev API (default :8787).
param(
  [string]$BaseUrl = $(if ($env:FITBUD_API_URL) { $env:FITBUD_API_URL } else { "http://127.0.0.1:8787" }),
  [string]$Password = $(if ($env:FITBUD_DEMO_PASSWORD) { $env:FITBUD_DEMO_PASSWORD } else { "FitBud-demo-2026" })
)

function Invoke-DemoLogin {
  param([string]$Email)
  $body = @{ identifier = $Email; password = $Password } | ConvertTo-Json
  $response = Invoke-WebRequest -Uri "$BaseUrl/auth/login" -Method POST -ContentType "application/json" -Body $body -UseBasicParsing
  Write-Output "=== $Email ==="
  Write-Output $response.Content
  Write-Output ""
}

Invoke-DemoLogin "rahul.coach@demo.fitbud.test"
Invoke-DemoLogin "rohan.slipping@demo.fitbud.test"
Invoke-DemoLogin "meera.ack@demo.fitbud.test"
