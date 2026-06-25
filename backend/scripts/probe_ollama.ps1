# Probe qwen3:8b through Ollama to measure latency and inspect raw output.
$prompt = 'Return JSON only with this shape: {"summary":"...","factors":[],"tradeoff":"...","confidence_note":"..."}. Explain that a runner is at_risk and should rest today.'
$payload = @{
    model  = "qwen3:8b"
    prompt = $prompt
    stream = $false
} | ConvertTo-Json -Depth 4

$sw = [Diagnostics.Stopwatch]::StartNew()
$r = Invoke-RestMethod -Uri "http://localhost:11434/api/generate" `
    -Method Post -ContentType "application/json" -Body $payload -TimeoutSec 300
$sw.Stop()

"Elapsed: $([math]::Round($sw.Elapsed.TotalSeconds, 1)) s"
"Response length: $($r.response.Length) chars"
"--- response head (1500 chars) ---"
$r.response.Substring(0, [Math]::Min(1500, $r.response.Length))
