# A valid model output can still be a failed product
### *How I designed Kinetic's evaluation system to decide when AI behavior is good enough to ship*

Updated September 19, 2026. This revision includes the implemented training-response
discovery flow. Benchmark figures retained from the
[original evaluation snapshot](https://github.com/kathyygong/kinetic/blob/9fb6d395b9d42d272044c37cd62cad93573cd30d/CASE_STUDY.md)
are historical results, not new measurements of discovery or public-service readiness.

The discovery implementation and recruiter demo have been verified locally. This
publication updates documentation and recorded evidence only; the newer application
code and public demo deployment remain separate publication steps.

## At a glance

**The problem:** Traditional model checks like schema validity and task accuracy
were not enough to tell me whether Kinetic's AI was producing a good product outcome.

**What I built:** A three-layer evaluation system, demonstrated in the original
snapshot by **19 model-quality cases, 14 integrated AI product journeys, and 508
deterministic safety assertions**. I have since extended the product with bounded
training-response discovery and separate checks for evidence and confirmation.

**What it changed:** The evals drove workload-specific model selection, stronger
grounding, more trustworthy fallback behavior, and clearer boundaries around what
the model can decide. The discovery flow extends that boundary: AI can propose a
comparison without gaining authority to change the plan.

**The principle:**

> **The quality bar should rise with the responsibility the product gives the model.**

---

The eval passed. The product failed.

Kinetic had already made a weekly training decision. The model's job was only to
explain it. Its response was coherent, correctly formatted, and schema-valid.

It also recommended adding another hard workout on Friday.

Nothing was technically malformed. But the model had quietly made a new decision
instead of explaining the one the product had already made.

That exposed the core problem I wanted Kinetic's evaluation system to solve:

**Model correctness and product correctness are not the same thing.**

Kinetic is an adaptive training product I'm building that uses AI to interpret
user intent, explain decisions, identify behavioral patterns, and synthesize
training history.

As those capabilities became more consequential, I needed a better answer to a
product question:

> **What evidence should be required before an AI behavior is good enough to ship?**

I built the evaluation system around three ideas:

1. Define "good" from the user outcome backward.
2. Test failures at the layer where they can actually occur.
3. Raise the quality bar as the product gives the model more responsibility.

---

## 1. Define the quality bar from the product backward

Schema validity, grounding, and task accuracy are useful model metrics. But none,
by itself, tells me whether Kinetic behaved well.

A correctly parsed request can still create a bad experience if it silently
changes state. A grounded explanation can still contradict the decision it is
supposed to explain. A fluent summary can introduce a recommendation the user
never asked for.

So I defined quality around the failures a user could actually experience.

| Dimension | Product question |
| --- | --- |
| **Correctness** | Did the user reach the intended outcome? |
| **Grounding** | Is the response supported by information Kinetic actually knows? |
| **User control** | Can AI cause a consequential change without appropriate review? |
| **Failure recovery** | Does the product remain usable when AI is wrong or unavailable? |
| **Context discipline** | Is the model using only information relevant to its task? |
| **Latency** | Once quality passes, is the experience fast enough? |

That led to the broader product principle behind Kinetic:

> **The quality bar should rise with the responsibility the product gives the model.**

A read-only explanation and a model that can infer something new about a user
should not require the same level of evidence.

---

## 2. Match the eval to the failure layer

One eval suite was not enough.

### Kinetic's three evaluation layers

| Layer | Question | Evidence |
| --- | --- | --- |
| **Model quality** | Can the model perform this task well enough? | Task quality, grounding, schema, safety, stability, latency |
| **Product journey** | Does the user still reach the right outcome when the model is wrong, ambiguous, or unavailable? | Correctness, control, recovery, context |
| **System contract** | What must remain true regardless of model quality? | State integrity, confirmation, privacy, safety |

### Model quality

The original benchmark contained **19 versioned model-quality cases** across
daily reasoning, natural-language intake, behavior insights, and training summaries.

The metric changes with the job: extraction F1 for intake, trace coverage for
explanations, and pattern-selection F1 for supported-pattern selection. Schema
validity, grounding, safety, repeat stability, and latency are measured separately.

Those metrics do not establish the quality of the newer comparison-proposing
discovery flow. Its evidence checks are described separately below.

### Product journeys

The published product suite contains **14 integrated AI product journeys** that
replay useful, contradictory, ambiguous, unsupported, malformed, ungrounded, and
unavailable AI behavior through production backend orchestration. These use
scripted model responses to test the product, not to benchmark live model quality.

They answer a different question:

**When the model fails, does the product still do the right thing?**

### System contracts

Some guarantees should not depend on model performance at all.

The original snapshot recorded **508 deterministic safety assertions across 18
gate groups**, enforcing invariants around state changes, grounding, confirmation,
privacy, and fallback behavior. This is a historical count, not a claim about the
size of today's expanded test suites.

The rule that emerged was:

> **The eval layer should match the layer where the failure can occur.**

A better prompt cannot enforce user confirmation. Schema validation cannot prove
an explanation preserved the underlying decision. And a model benchmark cannot
tell me whether the product behaves correctly when the model fails.

---

## 3. Use evals to make product decisions

The useful output of an eval is not a score. It is a better decision.

### Original model-selection scorecard

These are the original benchmark results and model choices. They predate the
training-response discovery and separate recovery-interpretation work; they are
not the current demo's model inventory or an end-to-end latency guarantee.

| Workload | Selected model | Hard-gate result | p95 latency | Decision |
| --- | --- | ---: | ---: | --- |
| **Daily reasoning** | `qwen3:8b` | 100% | 12.43s | Prefer reliability over smaller-model speed |
| **Intake** | `llama3.2:3b` | 100% | **1.28s** | Use the fastest model that clears the bar |
| **Behavior insights** | `qwen3:8b` | 100% | 12.08s | Smaller models failed grounding/task quality |
| **Training summary** | `qwen3:8b` | 100% | 6.91s | Faster alternatives missed key content |

The results challenged the idea that Kinetic should have one "best model."

`llama3.2:3b` was a strong fit for the bounded intake extraction cases in that
evaluation: it cleared every evaluated hard gate and was materially faster than
the alternatives.

But the same model failed quality gates on more reasoning-heavy tasks.

So I made model selection workload-specific.

The question became:

> **What is the fastest model that clears the quality bar for this specific responsibility?**

That is more useful to me than asking which model wins on average.

---

## 4. The strongest evals changed what I built

### From risk to decision

| Product risk | Eval | Finding | Decision |
| --- | --- | --- | --- |
| **Explanation quietly changes the plan** | Inject schema-valid weekly output proposing an extra workout | Format passed; product behavior failed | Add deterministic post-model grounding |
| **One fast model is good enough everywhere** | Compare candidates by workload | Smaller model won intake but failed reasoning | Route models by workload |
| **Fallback works but misrepresents its source** | Inject malformed AI into What-if | Deterministic answer could report model provenance | Make truthful provenance part of correctness |
| **Ambiguous text becomes a state change** | Have AI infer a concrete status from ambiguous intake | Model disagreed with grounded interpretation | Reject disagreement and require clarification |
| **A proposed pattern becomes unsupported advice** | Test flat, improving, and later-contradictory synthetic histories | A plausible comparison does not necessarily support easing the plan | Require verified later-period evidence and deterministic eligibility before offering a review |

### Schema-valid can still mean product-invalid

The weekly recalibration failure was the clearest example.

The model satisfied the expected format but proposed an additional training
change after the deterministic decision was already complete.

The lower-level checks passed. The product-level eval failed.

I added post-model grounding that verifies the explanation stays within the
decision already made. If it introduces an unsupported change, Kinetic rejects
it and falls back.

That narrowed the model's responsibility from:

**"Generate a reasonable training response."**

to:

**"Explain this specific decision without making a new one."**

That distinction is now part of the product contract.

### Graceful degradation still has to be trustworthy

Another journey injected malformed AI into Kinetic's What-if experience.

The system successfully recovered with a deterministic fallback, but could still
report the model as the source.

From a narrow reliability perspective, the fallback worked. From a product
perspective, the system was misrepresenting what happened.

So I made provenance part of the correctness contract.

My bar for graceful degradation became:

**The product remains useful, truthful, and within its intended boundaries.**

---

## 5. Increase model responsibility deliberately

Insights now demonstrates two different levels of AI responsibility.

**Routine insights still use supported-pattern selection.** Deterministic logic
identifies eligible patterns, and the model selects among them. The demo's
Saturday long-run preference is an example: a possible scheduling fit, not
evidence that Saturday produces better training results.

**Training-response discovery is now implemented.** Here the model proposes
comparisons rather than selecting a supplied finding. It receives chronological
training records, a data dictionary, and neutral descriptive statistics, but no
candidate finding IDs, titles, or target conclusion.

This is bounded exploration, not unrestricted novel-pattern discovery. The model
can propose up to three comparisons across four allowed measures: effort above
the prescribed target, next-day fatigue, recovery-related completion, and pace
relative to the prescribed pace. It chooses a workout group and direction of
change. It does not calculate authoritative statistics, write the displayed
claim, or prescribe the amount of a training reduction.

### What the model proposes, code verifies

The implemented flow is:

**Bounded history -> AI proposes comparisons -> code checks evidence and later
corroboration -> deterministic rules may offer a preview -> user confirms.**

The demo uses **24 synthetic session records across six weeks**, divided into
three two-week windows. The model sees the first two windows; the later window
is withheld from its prompt.

Code executes each proposed comparison across all three periods. It checks
usable sample counts, comparable prescriptions and conditions, and whether the
recent and later differences cross the same directional threshold. Unsupported
comparisons are discarded, not turned into a persuasive explanation.

In the fixed sample, the model proposed three comparisons. **Two were
corroborated: effort above the prescribed target and next-day fatigue.** The pace
comparison was discarded. This supports the visible finding that effort is
rising and fatigue is carrying over, with association and uncertainty caveats.

The thresholds are product heuristics, not significance tests or clinical
cutoffs. Corroboration in later synthetic records does not establish causation,
overtraining, injury risk, or benefit to a real runner.

### A finding is not permission to change the plan

The verified association must also satisfy completed-week and recovery-evidence
requirements before it can open an easier-week review. The existing deterministic
recalibration rule owns the eligible workouts and size of the change, not the model.

In this sample, the preview reduces the upcoming week from **255 to 245 minutes**
and **27 to 26 miles** by shortening Monday and Friday easy runs. The interval
session and long run stay unchanged. This is a bounded prototype rule, not proof
that the resulting workload is physiologically optimal.

Confirmation rebuilds the proposal against the current plan and compares it with
the preview. Stale or altered previews are rejected. The current week and later
weeks are preserved, and the same evidence cannot repeatedly reduce the plan.

The principle is the same as before:

> **AI can gain more responsibility for inference without automatically gaining more authority over execution.**

### What the recruiter demo actually runs

The fixed demo serves genuine **precomputed model results** for the exact synthetic
sample. The training-response artifact was generated with `qwen3:8b` through the
same discovery pipeline and verified before inclusion. Analyze and Refresh do
not make a new live discovery-model call. Changed sample inputs fail closed
rather than receiving a substitute finding.

The general live API and model evaluations are separate. Invalid or unavailable
model output produces no substitute discovery finding or plan action. Valid
comparisons without qualifying evidence produce no finding. The demo's live
schedule-note interpretation is a different workflow from these precomputed
Insights results.

That delivery choice makes the fixed demo reproducible without pretending that
one synthetic example establishes general discovery quality or hosted reliability.

---

## 6. Responsibility determines the evidence bar

Across Kinetic, model responsibility sits on a spectrum:

**Narrate -> Interpret -> Discover -> Recommend -> Mutate**

The implemented boundaries are:

- **Explanations and summaries** must remain within deterministic facts and decisions; containment can withhold AI generation or use a fallback.
- **Natural-language intake** interprets intent, with grounding and review before consequential changes.
- **Routine insights** select supported patterns, such as a possible preferred long-run day.
- **Training-response discovery** proposes bounded comparisons; code verifies the evidence before deterministic rules can offer an adjustment.
- **Training decisions and plan changes** remain governed by deterministic rules and explicit confirmation where required. AI does not gain write authority by proposing a finding.

The point is not to minimize AI.

It is to decide what role AI has earned the right to play.

As the consequences of being wrong increase, so should the evidence required
before shipping that behavior.

For increasingly agentic products, I think that makes a second question just as
important as model capability:

> **What happens after the model is wrong?**

---

## 7. What is still unproven

The automated eval system gives me useful evidence about specific failure classes.
It does not prove Kinetic is ready for broad release.

The evaluation data is deliberately small and synthetic. The discovery demo uses
an authored history, not a prospective runner study. Repeated checks against that
history establish software behavior, not independent evidence of a physiological
effect. Moderated testing has not yet established perceived helpfulness or trust.

The biggest unanswered question is:

> **When AI and the deterministic fallback are both correct, does AI make the product meaningfully better?**

That is the next evidence I would prioritize.

**Blinded AI vs. deterministic fallback**  
Does AI improve helpfulness, personalization, and clarity enough to justify its
latency and operating cost?

**Context perturbation**  
Does irrelevant context unexpectedly change the model's proposed comparison or
conclusion?

**Discovery beyond the authored sample**  
The bounded comparison generator is implemented. What remains unproven is how
reliably it distinguishes useful associations from noise in unseen, varied
histories, including missing data and confounding conditions. It is not an
open-ended discovery engine or a clinically validated prediction model.

**Public, self-guided use**  
The local demo has been exercised, but no public deployment was verified in this
review. A hosted release still needs cold-start, availability, access-control,
usage-limit, and inference-budget checks, plus an uncoached first-time-user test.

Those tests would help answer not just whether the model is capable, but what
responsibility it has earned.

---

## What I took away

I started Kinetic with a model-centric question:

**Can the model perform this task reliably?**

I ended with a product-centric one:

**What evidence gives me enough confidence to let this AI behavior affect a user?**

That required separating model capability, product outcomes, and deterministic
guarantees, and then using failures to change model selection, grounding,
fallback behavior, and responsibility boundaries.

The discovery work made the progression concrete: I expanded what AI could
propose, added evidence checks suited to that responsibility, and kept execution
under deterministic rules and user confirmation.

The principle I now use is:

> **The quality bar should rise with the responsibility the product gives the model.**

Because a valid model response is not necessarily a successful product outcome.

**The deeper role of evals is not just deciding whether AI is good enough to ship.
It is deciding what role the model has earned the right to play in the product.**

---

## Evidence

- [Original case study and benchmark snapshot](https://github.com/kathyygong/kinetic/blob/9fb6d395b9d42d272044c37cd62cad93573cd30d/CASE_STUDY.md)
- [Training-response discovery: implementation, thresholds, limitations, and checks](./TRAINING_RESPONSE_DISCOVERY.md)
- [Insights caching and exact-sample model artifacts](./INSIGHTS_CACHING.md)
- [Recruiter demo verification and public-release limitations](./RECRUITER_DEMO_VERIFICATION.md)
- [AI boundaries and evals](./AI_BOUNDARIES_AND_EVALS.md)
- [AI product eval report](./AI_PRODUCT_EVAL_REPORT.md)
- [Model quality eval report](./MODEL_EVAL_REPORT.md)
- [AI system safety and contract report](./EVAL_REPORT.md)
- [Architecture](./ARCHITECTURE.md)