# Time qwen3:8b on a prompt similar to what /decision sends.
$systemPrompt = @'
You are the AI reasoning layer for Kinetic, an adaptive running training system.

You do not decide the workout.
The workout has already been selected by a deterministic decision engine.

Your job is to explain the decision clearly and concisely.

Use only the provided decision trace.
Do not invent biometric data, injuries, diagnoses, calendar events, or training history.
Do not make medical claims.
Do not recommend a workout that was not selected by the deterministic engine.

Return JSON only with this schema:
{
  "summary": string,
  "factors": [
    {
      "title": string,
      "explanation": string,
      "impact": "positive" | "negative" | "neutral"
    }
  ],
  "tradeoff": string,
  "confidence_note": string
}
'@

$userPrompt = @'
Explain the following Kinetic decision to the runner.
Stay grounded in the trace. Return JSON only — no preamble, no commentary, no <think> blocks, no markdown fences.

Decision trace:
{
  "state": "at_risk",
  "recovery_score": 0.608,
  "final_workout": "Rest day: light mobility or easy walk only.",
  "confidence": 0.9,
  "available_minutes": 40,
  "key_factors": [
    "HRV well below baseline (69%)",
    "Poor sleep (5.5h)",
    "High self-reported fatigue (Tired)"
  ],
  "scores": {
    "proceed": 0.075,
    "modify": 0.2,
    "rest": 1.0
  },
  "staleness_warnings": [],
  "selected_action": {
    "name": "rest",
    "description": "Take a rest day or do light mobility / easy walk only."
  },
  "alternatives": [
    {
      "name": "modify",
      "description": "Modify 60 min tempo run: reduce intensity and shorten duration to match current readiness."
    },
    {
      "name": "proceed",
      "description": "Proceed as planned: 60 min tempo run"
    }
  ]
}
'@

$payload = @{
    model   = "qwen3:8b"
    prompt  = $userPrompt
    system  = $systemPrompt
    stream  = $false
    options = @{ num_predict = 400 }
    keep_alive = "10m"
} | ConvertTo-Json -Depth 5

$sw = [Diagnostics.Stopwatch]::StartNew()
$r = Invoke-RestMethod -Uri "http://localhost:11434/api/generate" `
    -Method Post -ContentType "application/json" -Body $payload -TimeoutSec 600
$sw.Stop()

"Elapsed: $([math]::Round($sw.Elapsed.TotalSeconds, 1)) s"
"eval_count: $($r.eval_count), prompt_eval_count: $($r.prompt_eval_count)"
"eval_duration: $([math]::Round($r.eval_duration / 1e9, 1)) s"
"prompt_eval_duration: $([math]::Round($r.prompt_eval_duration / 1e9, 1)) s"
"--- response ---"
$r.response
