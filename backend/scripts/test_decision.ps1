# Test /decision end-to-end with the fatigued + time-constrained scenario.
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

Write-Host "Posting to /decision (expecting 4-6 min for qwen3:8b on CPU)..."
$start = Get-Date
try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:8000/decision" `
        -Method Post -ContentType "application/json" -Body $body -TimeoutSec 540
    $elapsed = ((Get-Date) - $start).TotalSeconds
    Write-Host ("Done in {0:N1}s" -f $elapsed)
} catch {
    $elapsed = ((Get-Date) - $start).TotalSeconds
    Write-Host ("FAILED after {0:N1}s: {1}" -f $elapsed, $_.Exception.Message)
    exit 1
}

Write-Host ""
Write-Host "=== AI REASONING ==="
$response.ai_reasoning | ConvertTo-Json -Depth 5
