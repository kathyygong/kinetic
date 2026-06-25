# Verify Ollama 'think: false' disables thinking tokens.
$systemPrompt = 'You are a JSON-only assistant. Return exactly: {"ok":true}'

$payload = @{
    model      = "qwen3:8b"
    prompt     = 'Return {"ok":true}'
    system     = $systemPrompt
    stream     = $true
    keep_alive = "10m"
    think      = $false
    options    = @{ num_predict = 40 }
} | ConvertTo-Json

$sw = [Diagnostics.Stopwatch]::StartNew()
$response = Invoke-WebRequest -Uri "http://localhost:11434/api/generate" `
    -Method Post -ContentType "application/json" -Body $payload `
    -TimeoutSec 120
$sw.Stop()

$text = [System.Text.Encoding]::UTF8.GetString($response.Content)
"Elapsed: $([math]::Round($sw.Elapsed.TotalSeconds, 1)) s"
"Body length: $($text.Length) chars"
"--- First 1200 chars ---"
$text.Substring(0, [Math]::Min(1200, $text.Length))
