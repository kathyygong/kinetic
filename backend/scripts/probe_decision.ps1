param(
    [int]$Port = 8001
)

function Invoke-Decision {
    param(
        [string]$Label,
        [int]$AvailableMinutes = 0
    )
    $body = @{
        biometrics = @{ hrv = 60; hrv_baseline = 65; sleep_hours = 7; resting_hr = 60 }
        training_context = @{ planned_workout = "60 min easy run"; recent_workouts = @("easy", "rest") }
        constraints = @{ available_minutes = $AvailableMinutes }
    } | ConvertTo-Json -Depth 5

    $r = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/decision" -Method Post -Body $body -ContentType "application/json"

    Write-Host ""
    Write-Host "=== $Label ===" -ForegroundColor Cyan
    $r.decision_trace | Where-Object { $_ -like 'Calendar*' -or $_ -like 'Final*' -or $_ -like 'Selected*' } | ForEach-Object { Write-Host "  $_" }
    Write-Host ("  State        : " + $r.state)
    Write-Host ("  Action       : " + $r.selected_action.name)
    Write-Host ("  Final workout: " + $r.final_workout)
}

Invoke-Decision -Label "LIGHT CALENDAR (default mock, 3 events)" -AvailableMinutes 0
