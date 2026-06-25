# End-to-end probe for the split /decision + /decision/reasoning endpoints.
# Demonstrates:
#   1. /decision is sub-100ms (no LLM)
#   2. /decision/reasoning is slow on cache miss (LLM call)
#   3. Repeating /decision/reasoning is instant (cache hit)
#   4. The cached value also piggy-backs the next /decision call.

$body = @{
    biometrics       = @{
        hrv             = 45
        hrv_baseline    = 65
        sleep_hours     = 5.5
        resting_hr      = 68
        fatigue_level   = 4
        soreness_level  = 3
    }
    training_context = @{
        planned_workout  = "60 min tempo run"
        recent_workouts  = @("intervals", "long run", "easy")
    }
    constraints      = @{ available_minutes = 40 }
    data_freshness   = @{
        recovery_age_hours = 2
        calendar_age_hours = 1
    }
    bias_toward_original = 0
} | ConvertTo-Json -Depth 5


function Measure-Request($Label, $ScriptBlock) {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $result = & $ScriptBlock
    $sw.Stop()
    Write-Host ("[{0,6} ms] {1}" -f [int]$sw.Elapsed.TotalMilliseconds, $Label)
    return $result
}


Write-Host "=== Call 1: POST /decision (cold; expects null reasoning) ==="
$r1 = Measure-Request "POST /decision" {
    Invoke-RestMethod -Uri "http://127.0.0.1:8000/decision" `
        -Method Post -ContentType "application/json" -Body $body -TimeoutSec 30
}
Write-Host "  reasoning_available: $($r1.reasoning_available)"
Write-Host "  selected_action    : $($r1.decision.selected_action.name)"
Write-Host ""

Write-Host "=== Call 2: POST /decision/reasoning (cache miss; LLM call) ==="
$reasonBody = @{ decision = $r1.decision } | ConvertTo-Json -Depth 10
$r2 = Measure-Request "POST /decision/reasoning (miss)" {
    Invoke-RestMethod -Uri "http://127.0.0.1:8000/decision/reasoning" `
        -Method Post -ContentType "application/json" -Body $reasonBody -TimeoutSec 540
}
Write-Host "  summary: $($r2.ai_reasoning.summary)"
Write-Host "  factor titles: $(($r2.ai_reasoning.factors | ForEach-Object { $_.title }) -join ' | ')"
Write-Host ""

Write-Host "=== Call 3: POST /decision/reasoning (cache hit) ==="
$r3 = Measure-Request "POST /decision/reasoning (hit )" {
    Invoke-RestMethod -Uri "http://127.0.0.1:8000/decision/reasoning" `
        -Method Post -ContentType "application/json" -Body $reasonBody -TimeoutSec 540
}
$identical = ($r2.ai_reasoning.summary -eq $r3.ai_reasoning.summary)
Write-Host "  identical to cache-miss response: $identical"
Write-Host ""

Write-Host "=== Call 4: POST /decision again (should piggy-back cached reasoning) ==="
$r4 = Measure-Request "POST /decision (piggy-back)" {
    Invoke-RestMethod -Uri "http://127.0.0.1:8000/decision" `
        -Method Post -ContentType "application/json" -Body $body -TimeoutSec 30
}
Write-Host "  reasoning_available: $($r4.reasoning_available)"
if ($r4.ai_reasoning) {
    Write-Host "  summary: $($r4.ai_reasoning.summary)"
}
