# Tiny Ollama probe — measures whether the daemon is responsive or queueing.
$payload = @{
    model      = "qwen3:8b"
    prompt     = 'Reply with exactly: HI'
    stream     = $false
    options    = @{ num_predict = 10 }
    keep_alive = "10m"
} | ConvertTo-Json

$sw = [Diagnostics.Stopwatch]::StartNew()
$r = Invoke-RestMethod -Uri "http://localhost:11434/api/generate" `
    -Method Post -ContentType "application/json" -Body $payload -TimeoutSec 120
$sw.Stop()

"Elapsed: $([math]::Round($sw.Elapsed.TotalSeconds, 1)) s"
"Response: $($r.response)"
