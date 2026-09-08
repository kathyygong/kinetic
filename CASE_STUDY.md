# A valid model output can still be a failed product
### *How I designed Kinetic’s evaluation system to decide when AI behavior is good enough to ship*

## At a glance

**The problem:** Traditional model checks like schema validity and task accuracy were not enough to tell me whether Kinetic’s AI was producing a good product outcome.

**What I built:** A three-layer evaluation system covering **19 model-quality cases, 14 integrated AI product journeys, and 508 deterministic safety assertions**.

**What it changed:** The evals drove workload-specific model selection, stronger grounding, more trustworthy fallback behavior, and clearer boundaries around what the model can decide.

**The principle:**

> **The quality bar should rise with the responsibility the product gives the model.**

---

The eval passed. The product failed.

Kinetic had already made a weekly training decision. The model’s job was only to explain it. Its response was coherent, correctly formatted, and schema-valid.

It also recommended adding another hard workout on Friday.

Nothing was technically malformed. But the model had quietly made a new decision instead of explaining the one the product had already made.

That exposed the core problem I wanted Kinetic’s evaluation system to solve:

**Model correctness and product correctness are not the same thing.**

Kinetic is an adaptive training product I’m building that uses AI to interpret user intent, explain decisions, identify behavioral patterns, and synthesize training history.

As those capabilities became more consequential, I needed a better answer to a product question:

> **What evidence should be required before an AI behavior is good enough to ship?**

I built the evaluation system around three ideas:

1. define “good” from the user outcome backward;
2. test failures at the layer where they can actually occur;
3. raise the quality bar as the product gives the model more responsibility.

---

## 1. Define the quality bar from the product backward

Schema validity, grounding, and task accuracy are useful model metrics. But none, by itself, tells me whether Kinetic behaved well.

A correctly parsed request can still create a bad experience if it silently changes state. A grounded explanation can still contradict the decision it is supposed to explain. A fluent summary can introduce a recommendation the user never asked for.

So I defined quality around the failures a user could actually experience.

| Dimension | Product question |
|---|---|
| **Correctness** | Did the user reach the intended outcome? |
| **Grounding** | Is the response supported by information Kinetic actually knows? |
| **User control** | Can AI cause a consequential change without appropriate review? |
| **Failure recovery** | Does the product remain usable when AI is wrong or unavailable? |
| **Context discipline** | Is the model using only information relevant to its task? |
| **Latency** | Once quality passes, is the experience fast enough? |

That led to the broader product principle behind Kinetic:

> **The quality bar should rise with the responsibility the product gives the model.**

A read-only explanation and a model that can infer something new about a user should not require the same level of evidence.

---

## 2. Match the eval to the failure layer

One eval suite was not enough.

### Kinetic’s three evaluation layers

```text
┌─────────────────────────────────────────────────────┐
│ MODEL QUALITY                                       │
│ Can the model perform this task well enough?        │
│ task quality • grounding • schema • safety          │
│ stability • latency                                 │
└───────────────────────┬─────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────┐
│ PRODUCT JOURNEY                                     │
│ Does the user still reach the right outcome when   │
│ the model is wrong, ambiguous, or unavailable?     │
│ correctness • control • recovery • context          │
└───────────────────────┬─────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────┐
│ SYSTEM CONTRACT                                     │
│ What must remain true regardless of model quality?  │
│ state integrity • confirmation • privacy • safety   │
└─────────────────────────────────────────────────────┘
```

### Model quality

Kinetic currently has **19 versioned model-quality cases** across daily reasoning, natural-language intake, behavior insights, and training summaries.

The metric changes with the job: extraction F1 for intake, trace coverage for explanations, and pattern-selection F1 for the current behavior-insights implementation. Schema validity, grounding, safety, repeat stability, and latency are measured separately.

### Product journeys

Kinetic also has **14 integrated AI product journeys** that replay useful, contradictory, ambiguous, unsupported, malformed, ungrounded, and unavailable AI behavior through production backend orchestration.

They answer a different question:

**When the model fails, does the product still do the right thing?**

### System contracts

Some guarantees should not depend on model performance at all.

Kinetic currently runs **508 deterministic safety assertions across 18 gate groups**, enforcing invariants around state changes, grounding, confirmation, privacy, and fallback behavior.

The rule that emerged was:

> **The eval layer should match the layer where the failure can occur.**

A better prompt cannot enforce user confirmation. Schema validation cannot prove an explanation preserved the underlying decision. And a model benchmark cannot tell me whether the product behaves correctly when the model fails.

---

## 3. Use evals to make product decisions

The useful output of an eval is not a score. It is a better decision.

### Model-selection scorecard

| Workload | Selected model | Hard-gate result | p95 latency | Decision |
|---|---|---:|---:|---|
| **Daily reasoning** | `qwen3:8b` | 100% | 12.43s | Prefer reliability over smaller-model speed |
| **Intake** | `llama3.2:3b` | 100% | **1.28s** | Use the fastest model that clears the bar |
| **Behavior insights** | `qwen3:8b` | 100% | 12.08s | Smaller models failed grounding/task quality |
| **Training summary** | `qwen3:8b` | 100% | 6.91s | Faster alternatives missed key content |

The results challenged the idea that Kinetic should have one “best model.”

`llama3.2:3b` was a strong fit for bounded intake extraction: it cleared every evaluated hard gate and was materially faster than the alternatives.

But the same model failed quality gates on more reasoning-heavy tasks.

So I made model selection workload-specific.

The question became:

> **What is the fastest model that clears the quality bar for this specific responsibility?**

That is more useful to me than asking which model wins on average.

---

## 4. The strongest evals changed what I built

### From risk to decision

| Product risk | Eval | Finding | Decision |
|---|---|---|---|
| **Explanation quietly changes the plan** | Inject schema-valid weekly output proposing an extra workout | Format passed; product behavior failed | Add deterministic post-model grounding |
| **One fast model is good enough everywhere** | Compare candidates by workload | Smaller model won intake but failed reasoning | Route models by workload |
| **Fallback works but misrepresents its source** | Inject malformed AI into What-if | Deterministic answer could report model provenance | Make truthful provenance part of correctness |
| **Ambiguous text becomes a state change** | Have AI infer a concrete status from ambiguous intake | Model disagreed with grounded interpretation | Reject disagreement and require clarification |

### Schema-valid can still mean product-invalid

The weekly recalibration failure was the clearest example.

The model satisfied the expected format but proposed an additional training change after the deterministic decision was already complete.

The lower-level checks passed. The product-level eval failed.

I added post-model grounding that verifies the explanation stays within the decision already made. If it introduces an unsupported change, Kinetic rejects it and falls back.

That narrowed the model’s responsibility from:

**“Generate a reasonable training response.”**

to:

**“Explain this specific decision without making a new one.”**

That distinction is now part of the product contract.

### Graceful degradation still has to be trustworthy

Another journey injected malformed AI into Kinetic’s What-if experience.

The system successfully recovered with a deterministic fallback—but could still report the model as the source.

From a narrow reliability perspective, the fallback worked. From a product perspective, the system was misrepresenting what happened.

So I made provenance part of the correctness contract.

My bar for graceful degradation became:

**The product remains useful, truthful, and within its intended boundaries.**

---

## 5. Increase model responsibility deliberately

Behavior insights are where this principle becomes more interesting.

The **current implementation is intentionally bounded**: deterministic logic identifies supported pattern families, and the model selects among them.

That gives me a controlled baseline for measuring whether the model can reason over behavioral evidence reliably.

But it is not the end state.

The longer-term value of AI is its ability to notice meaningful patterns I did not pre-program—for example, an interaction across schedule, recovery, workout type, and user response that does not fit a predefined category.

So the progression I want is:

**Current**

> bounded evidence → known candidate patterns → AI selects → user reviews consequential changes

**Next**

> bounded evidence → AI discovers novel patterns → evidence and grounding checks → user reviews consequential changes

The important boundary is not whether AI can invent something new.

It is whether **inference automatically becomes execution**.

Even as the model gains more responsibility for discovering patterns, deterministic controls can still govern:

- what evidence it may inspect;
- minimum evidence and confidence thresholds;
- which downstream actions are available;
- which changes require confirmation;
- which state transitions it can never make directly.

So the principle becomes:

> **AI can gain more responsibility for inference without automatically gaining more authority over execution.**

And increasing that responsibility changes the eval problem.

A model that discovers novel patterns can no longer be judged on predefined-family selection F1. I would need to test whether its discoveries are actually supported, survive irrelevant changes to context, appear meaningful to human reviewers, and fail safely when wrong.

The eval system has to evolve with the model’s role.

---

## 6. Responsibility determines the evidence bar

Across Kinetic, model responsibility sits on a spectrum:

**Narrate → Interpret → Discover → Recommend → Mutate**

Today:

- **Training summaries** narrate deterministic facts.
- **Natural-language intake** interprets explicit intent, with review before write.
- **Behavior insights** currently operate on supported patterns, with a planned move toward novel discovery.
- **Training decisions and authoritative state changes** remain deterministic or explicitly confirmed.

The point is not to minimize AI.

It is to decide what role AI has earned the right to play.

As the consequences of being wrong increase, so should the evidence required before shipping that behavior.

For increasingly agentic products, I think that makes a second question just as important as model capability:

> **What happens after the model is wrong?**

---

## 7. What is still unproven

The automated eval system gives me useful evidence about specific failure classes. It does not prove Kinetic is ready for broad release.

The current model dataset is deliberately small and synthetic. Repeat-stability evidence is limited. Moderated testing has not yet established perceived helpfulness or trust.

The biggest unanswered question is:

> **When AI and the deterministic fallback are both correct, does AI make the product meaningfully better?**

That is the next evidence I would prioritize.

I would also test:

**Blinded AI vs. deterministic fallback**  
Does AI improve helpfulness, personalization, and clarity enough to justify its latency?

**Context perturbation**  
Does irrelevant context unexpectedly change the model’s conclusion?

**Novel-pattern discovery**  
Can the model distinguish real behavioral patterns from plausible-looking noise?

Those tests would help answer not just whether the model is capable, but what responsibility it has earned.

---

## What I took away

I started Kinetic with a model-centric question:

**Can the model perform this task reliably?**

I ended with a product-centric one:

**What evidence gives me enough confidence to let this AI behavior affect a user?**

That required separating model capability, product outcomes, and deterministic guarantees—and then using failures to change model selection, grounding, fallback behavior, and responsibility boundaries.

The principle I now use is:

> **The quality bar should rise with the responsibility the product gives the model.**

Because a valid model response is not necessarily a successful product outcome.

**The deeper role of evals is not just deciding whether AI is good enough to ship. It is deciding what role the model has earned the right to play in the product.**

---

## Evidence

- [AI boundaries and evals](./AI_BOUNDARIES_AND_EVALS.md)
- [AI product eval report](./AI_PRODUCT_EVAL_REPORT.md)
- [Model quality eval report](./MODEL_EVAL_REPORT.md)
- [AI system safety and contract report](./EVAL_REPORT.md)
- [Architecture](./ARCHITECTURE.md)
