$body = @{
    biometrics = @{ hrv = 60; hrv_baseline = 65; sleep_hours = 7; resting_hr = 60 }
    training_context = @{ planned_workout = "60 min easy run"; recent_workouts = @("easy", "rest") }
    constraints = @{ available_minutes = 0 }
} | ConvertTo-Json -Depth 5

$r = Invoke-RestMethod -Uri "http://127.0.0.1:8003/decision" -Method Post -Body $body -ContentType "application/json"

Write-Host ""
Write-Host "=== /decision response ===" -ForegroundColor Cyan
Write-Host ("available_minutes : " + $r.available_minutes)
Write-Host ("final_workout     : " + $r.final_workout)
Write-Host ("response keys     : " + ($r.PSObject.Properties.Name -join ', '))
