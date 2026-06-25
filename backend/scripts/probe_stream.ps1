# Inspect Ollama's actual streaming format chunk-by-chunk.
$systemPrompt = @'
You are a JSON-only assistant. Return exactly: {"ok":true}
'@

$payload = @{
    model      = "qwen3:8b"
    prompt     = 'Return {"ok":true}'
    system     = $systemPrompt
    stream     = $true
    keep_alive = "10m"
    options    = @{ num_predict = 20 }
} | ConvertTo-Json

$sw = [Diagnostics.Stopwatch]::StartNew()
$response = Invoke-WebRequest -Uri "http://localhost:11434/api/generate" `
    -Method Post -ContentType "application/json" -Body $payload `
    -TimeoutSec 120
$sw.Stop()

$text = [System.Text.Encoding]::UTF8.GetString($response.Content)
"Elapsed: $([math]::Round($sw.Elapsed.TotalSeconds, 1)) s"
"Status: $($response.StatusCode)"
"Content-Type: $($response.Headers['Content-Type'])"
"Body length: $($text.Length) chars"
"--- First 1500 chars ---"
$text.Substring(0, [Math]::Min(1500, $text.Length))
"--- Last 400 chars ---"
$tail = [Math]::Max(0, $text.Length - 400)
$text.Substring($tail)
