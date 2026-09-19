# Recruiter demo verification

Latest local verification: September 19, 2026. The sample clock displayed by the demo remains fixed at September 9, 2026. Earlier sections preserve their historical acceptance results.

This documentation-only publication includes recorded evidence, not the newer
application code or a deployed demo. Commands and implementation details below
refer to the locally verified working tree and may not be available in the public
code at this documentation revision.

## Requested error polish

- Removed the two intake source labels added during the earlier review, at the
	owner's request. API metadata and existing Insights evidence are unchanged.
- Replaced raw HTTP and endpoint errors with plain-language service, connection,
	timeout and rate-limit messages. Retry remains available; validation feedback
	is preserved and messages state that the plan has not changed.
- The isolated production build and TypeScript check, targeted ESLint,
	`demo:check` and focused error-message regressions passed. Browser checks
	covered Today and intake HTTP 503s, connection failure, HTTP 429, successful
	retries, unchanged plans and removal of the intake labels. Desktop and
	320/390-pixel mobile checks found no error-text overflow.
- The case study now describes implemented bounded discovery and precomputed
	Insights results, with historical benchmark figures clearly identified. Its
	demo entry link targets the current public document. No application deployment,
	provider switch, credential change or billing change was performed.

## Self-guided recruiter readiness

Audience confirmed for this review: product/AI product recruiters and hiring
managers, using a public link without a guided walkthrough. The owner confirmed
that only the local demo currently exists.

**Verdict: ready for a local recruiter walkthrough, not yet cleared for public,
self-guided sharing.** Public access is the release blocker; the tested local
workflows are functional. This is not a broad product or medical-safety sign-off.

### Criteria

| Criterion | Acceptance bar | Current result |
| --- | --- | --- |
| Public reliability | Fresh, signed-out HTTPS visit works without the owner's laptop; cold starts, CORS, protected-route auth, usage limits and inference budget verified on the real host. | Not met: no public deployment to test; this export targets the local API. |
| First-use clarity | A new visitor understands the purpose within 15 seconds and completes a meaningful change in about two minutes without coaching. | Functional path verified; comprehension and discovery still need an uncoached first-time-user check. |
| End-to-end correctness | Preview leaves the plan unchanged; confirmation matches the preview across Today and Your week; failure does not silently substitute or mutate results. | Passed the tested local flows, including sequential Insights changes and service retries. |
| AI credibility and control | Synthetic data, live versus precomputed output, fallback, supporting evidence and uncertainty are distinguishable; consequential changes require confirmation. | Insights evidence and confirmation passed. Intake source metadata remains in API responses; its inline labels were removed at the owner's request. The revised case study distinguishes implemented discovery from historical benchmarks. |
| Usability and presentation | Desktop and mobile views remain readable and operable, assets load, invalid input is contained, and failures offer recovery. | Passed the sampled layouts and interactions; service-error wording was polished and retested on September 19. Not a complete accessibility audit. |

### Fresh verification

- Rebuilt and served the production export at `http://127.0.0.1:3101/demo/` with
	`http://127.0.0.1:8000` as its explicit API. Production TypeScript, targeted
	ESLint and `npm run demo:check` passed.
- `demo:check:live` passed all nine cases: six advertised examples, the same-day
	25-minute note and two pain phrasings. The seven non-pain cases used Ollama
	schedule parsing plus Groq recovery interpretation in 0.93-1.99 seconds on
	this local run. Pain routing used no model inference. These are not hosted
	latency or availability guarantees.
- A custom compound request reached a valid preview without changing the
	calendar, then applied the shown changes on confirmation. Its schedule-model
	result failed grounding and used deterministic fallback; recovery used Groq.
	Both sources remain available in the API response. The intake labels briefly
	added to Request details were subsequently removed at the owner's request.
- Confirming a 25-minute constraint preserved the reviewed 17-minute / 2.0-mile
	workout in Today and synchronized the time control. Confirming an easier week
	produced 245 minutes / 26 miles; subsequently confirming Saturday long runs
	preserved those totals and the earlier adjustment.
- Simulated decision and intake HTTP 503s hid unavailable results, preserved the
	saved plan and recovered on retry. Future-week browsing remained available.
	A pain report paused today's recommendation and did not expose ordinary plan
	confirmation. An invalid 241-minute input was rejected; Escape restored 30.
- All four destinations at 320, 390, 981 and 1440 CSS pixels had no horizontal
	overflow, offscreen headings/controls or broken visible images in the sampled
	states. Desktop and mobile screenshots were inspected.
- The public case-study link was readable. Both Insights findings exposed model
	provenance, precomputed delivery, supporting records and association caveats.

### Remaining release work

1. Host the frontend and reachable inference/API services, rebuild with the
	 approved HTTPS API origin, and repeat the critical journeys from a fresh,
	 signed-out browser on another device. Verify the operational controls in the
	 public-reliability criterion before sending the link.
2. Publish the newer application code separately from this documentation update,
	preserving the corrected case-study entry link in the deployed demo.
3. Run an uncoached first-time-user check against the 15-second/two-minute bar.

No deployment, commit, model/provider change or credential change was made during
the original local readiness review. This later publication is documentation-only.
Git diff checks were unavailable because system Git required accepting the Xcode
license; that prompt was canceled without accepting terms.

## Shared pain follow-up

- The main web intake, dashboard and recruiter demo now use the same safety
	follow-up and rest-review contract. Pain-routed requests retain the complete
	note and offer **Review a rest day** and **Edit your note**. They do not expose
	a normal schedule confirmation or a misleading service-error retry action.
- The main dashboard pauses workout recommendations and automatic plan refresh
	while the caution is active. The demo suppresses stale/current exercise advice
	and marks the current-day calendar entry as a pain follow-up. Recovery scoring,
	deterministic pain routing, authentication and model configuration are unchanged.
- Rest review changes nothing. Confirmation is bound to the exact note, plan,
	date and preview, and removes only today's session. Other days, future weeks,
	profile, readings and time settings remain intact. A stale/tampered preview or
	race-day change fails safely. The caution remains after confirmation.
- Editing alone keeps the caution. A corrected note must be reviewed and the
	runner must explicitly acknowledge that the earlier pain report was incorrect.
	This is not medical clearance. Clearing an inaccurate report does not restore
	a workout already removed by rest confirmation.
- The main app retains its same-day report in per-tab, per-account session
	storage; it is not mirrored to account storage. The demo uses its existing
	in-memory session. This is not persistent or cross-device injury tracking.

### Final checks

- `pain:check`, the full frontend `smoke`, `demo:check`, TypeScript, targeted
	ESLint and editor diagnostics pass. The complete main-app webpack build and
	isolated `demo:build -- --api-base-url http://127.0.0.1:8000` both pass.
- The shared regression covers pain versus recovery routing, retained text,
	day/account isolation, immutable rest review, exact confirmation, repeated
	rest, stale/tampered rejection, race protection and explicit correction.
	Today tests verify that pain takes precedence over loading, failed and stale
	decision responses without changing the recovery score.
- A fresh browser against the rebuilt export at
	`http://127.0.0.1:3101/demo/` verified both audited pain phrasings. Both used the
	deterministic safety route and showed no normal schedule confirmation or
	Try again button. The original request remained accessible.
- Desktop/mobile checks exercised Today caution, rest review/cancel/confirm,
	explicit correction and navigation. Confirmation removed Wednesday only;
	every other visible workout and Week 2 stayed unchanged. Correcting the
	report left the confirmed rest day in place and the time setting at 30 minutes.
	The follow-up and review fit at 320, 390 and 1440px without horizontal overflow
	or clipped text, with 44px action targets and Newsreader preserved.
- The resumed soreness workflow confirmed the existing 17 min / 2.0 mi preview
	with no pain hold. A fresh negated-pain request also avoided the hold and kept
	its 25-minute draft. The existing recovery interpreter treated "I have no knee
	pain" as a no-soreness observation and asked to confirm the sample's 2/5 soreness
	reading. That extra clarification remains a semantic limitation; no reading
	or workout was silently changed.

### Remaining limits

- Earlier local main-app checks exercised retained notes through navigation and
	reload plus rest confirmation. Signed-in dashboard browser verification was
	not performed; the existing auth guard was not bypassed. Account scoping is
	regression-tested, but signed-in and cross-device workflows still need QA.
- The Python-environment/backend recheck was cancelled at the interruption and
	was not retried. No backend code or environment was changed during this
	follow-up; the fresh export exercised the existing live safety endpoints.
	The completed frontend gates and both builds were retained, not inferred.
- The fresh export test session and its viewport/focus overrides were reset.
	Pre-existing main-app test data was left intact on resume because its original
	backup was unavailable. No deployment, commit, credential or provider changes
	were made. Public-hosted verification remains outstanding.

## Shared week browsing

- Added week-by-week browsing to both the main Kinetic Plan page and recruiter
	demo using shared controls and a shared saved-plan view model. Each week shows
	its dates, phase, daily sessions/rest days, distance and duration. Numbered
	buttons, previous/next bounds and a current-week shortcut distinguish selected
	versus current week. Future schedules remain read-only.
- The demo overview no longer reads the original generated-plan constant.
	Selected schedules and phase summaries derive from the current session plan.
	Browsing does not request a new decision, never applies current recovery to a
	future week, and preserves the selection across Insights navigation.
- Confirming the demo's easier-week Insight changed the browsed Week 2 from
	255 to 245 minutes and 27 to 26 miles. Its preview left the week unchanged.
	A subsequent confirmed Saturday preference moved the long run while preserving
	the 40-minute easy sessions. These checks also passed in the rebuilt production
	export at `http://127.0.0.1:3101/demo/` in a fresh session.
- The main application subscribes to confirmed local writes, other-tab storage
	changes and remote hydration. A real signed-out browser test saved a synthetic
	goal through Settings, reviewed and confirmed a preferred-day change through
	the normal intake/plan-generation API, and observed another already-open Plan
	tab update its Saturday long run and totals while staying on Week 2. No plan
	mutation appeared before confirmation. Regenerating seven weeks to four removed
	obsolete controls and returned the old Week 7 selection to a valid Week 1.
- `plan:check` covers all weeks, updated workouts/totals/phase summaries,
	current-week/date boundaries, empty/shortened/renumbered plans, stale generation
	rejection, and the real shared confirmation/persistence path. Notification
	tests cover hydration, cross-tab events, deletion, unsubscribe and no feedback
	into remote mirroring. Existing persistence and sign-in hydration tests pass.
- Full `npm run smoke`, `npm run demo:check`, TypeScript, targeted ESLint,
	the complete Kinetic `build -- --webpack`, and the isolated `demo:build` pass.
	No backend decision, scoring, inference or authentication code changed in this
	week-browsing work.
- Browser checks covered the main controls at 320, 390 and 1440px and export
	controls at 320, 390, 981 and 1440px: no horizontal overflow or clipped controls,
	with at least 44px targets. Keyboard selection, first/last bounds, race week,
	selection retention, and current-versus-future Today markers passed. A simulated
	Today HTTP 503 hid current-week results but left future weeks and confirmed
	totals available; retry restored Today. The demo retains Newsreader.
- The integrated browser's hidden-tab state initially suspended the main app's
	existing entrance animation; temporary focus emulation allowed normal interaction.
	Screenshot captures had a viewport-scaling mismatch, so viewport claims rely on
	DOM geometry and workflow checks rather than those misleading image artifacts.
	Temporary synthetic local data and browser emulation settings were restored.
	Signed-in remote-account end-to-end testing and public hosting were not performed;
	remote hydration is covered by the shared repository regression. Public-release
	requirements in the reliability section below still apply.

## Reliability audit fixes

**Verdict: ready for local recruiter review; public-hosted readiness is not yet verified.**
All four audited failures were reproduced before their fixes. This section
supersedes earlier build-only acceptance claims for the isolated export.

### Reproductions and fixes

- The live API returned a ready 25-minute draft for "My knee hurts when I run"
	while "I have knee pain when I run" blocked changes. Deterministic routing now
	recognizes physical hurts/aching/swelling descriptions before model inference.
	Regression coverage includes negation, ordinary soreness, explicit resolution,
	hypothetical/third-party/emotional context, and separate active symptom clauses.
	Both original phrases now produce no confirmable draft and leave the week unchanged.
- The old export at port 3101 reproduced `auth/invalid-api-key` before any API
	request. The demo now has an allowlisted, credential-free transport and opt-in
	stateless API namespace. Browser testing also found and fixed a second Firebase
	dependency in preferred-day plan generation, missed by Node-only tests.
	Strict-auth tests verify production decision, intake, account, calendar and
	plan endpoints still return 401 without authentication. Demo decision requests
	cannot read the production calendar or reasoning cache.
- The time-only note reproduced 25 min / 2.9 mi in review followed by 17 min /
	2.0 mi after confirmation. Recovery and time now apply before review. The
	browser confirmed 17 min / 2.0 mi in the preview, Today and Your week, with
	zero extra decision requests at confirmation. Repeated reviews and readiness/time
	round trips do not compound reductions. A focused regression additionally caught
	and fixed loss of the unadjusted baseline after a future-only plan edit.
- "Move my Sunday long run to Saturday" failed in the real parser, not the
	example button. The grammar now accepts weekday-qualified workout names and
	verifies the named long-run source against plan context. Tests cover other
	source days, possessives, negation, missing context and changed workout types.
	Mobile confirmation moves the 90-minute / 9.5-mile run to Saturday, leaving Sunday rest.

### Executed checks

- `npm run demo:check`, the full `npm run smoke`, TypeScript (`tsc --noEmit`),
	targeted ESLint and `demo:build -- --api-base-url http://127.0.0.1:8000` passed.
- Backend intake regressions: 57 HTTP fixtures plus expanded safety/model-bypass
	checks passed. Demo API isolation, recovery interpretation and shared plan
	generation contract tests passed. Deterministic safety gates passed all
	20 groups / 609 assertions. Recovery parity passed 1,733 executable
	frontend/backend cases plus seven API rejection checks.
- The new `demo:check:live` command exercises the actual demo API, frontend
	validators and confirmation builders, and rejects any protected-route request.
	All nine cases passed: six advertised examples, both pain phrasings, and the
	time-only note. The final recorded live run used Ollama schedule extraction and
	Groq recovery for all seven non-pain notes, with no schedule fallback;
	interpretation took 1.20-6.01 seconds. Pain routing took 11-192 ms without inference.
	Full requests, responses and preview values are recorded in
	[reliability-live-2026-09-16.json](docs/recruiter-demo-review/reliability-live-2026-09-16.json).
- Served the actual export at `http://127.0.0.1:3101/demo/` and opened fresh browser
	sessions. Anonymous Today, intake and plan-generation requests reached only
	`/demo/...`, with no Firebase error or Authorization header. The additional
	local origin initially failed CORS; explicitly allowing it fixed the preflight,
	without a wildcard or production-auth change.
- Desktop (1440px) and mobile (390px) workflows verified preview/confirm/cancel,
	matching Today/week values, time-control synchronization, repeat reviews,
	readiness changes and at-risk rest. All six mobile example buttons reached
	review in 2.8-5.4 seconds and cancellation preserved the week. Preferred-day
	confirmation passed in the export. Simulated decision and intake HTTP 503s
	hid stale results, preserved the plan and recovered through Try again.
- Soreness matching the recorded mild level produced a combined workout preview;
	conflicting soreness against None (1/5) required an explicit check-in response.
	Saving the rating reused interpretation rather than calling the model again.
	Desktop/mobile screenshots retained the existing Newsreader UI and loaded image.
- The final export preserved 17 min / 2.0 mi after confirming an Insights
	preferred-day change to six future weeks, including a readiness round trip.
	Sixteen checks across all four destinations at 320, 390, 981 and 1440px found
	no horizontal overflow or clipped controls/headings. Image decoding and font
	readiness passed. Browser viewport overrides were cleared after verification.

### Environment and limits

- The original API process used Python 3.12 with packages loaded from
	`/tmp/kinetic-backend-venv312`, whose environment configuration and package
	sources were no longer complete on disk. The editor environment also lacked
	`pydantic`. Tests and the replacement local API use the isolated
	`/tmp/kinetic-reliability-venv` with pinned backend requirements and the original
	runtime's compatible `cryptography==45.0.7` wheel. No repository dependency pins
	or credential files were changed.
- The API remains at port 8000. Its captured Ollama/Groq model settings and existing
	backend environment file were retained. Only the new demo opt-in and explicit
	local CORS origins were added to the local launch. A Pylance snippet tool still
	selected an unrelated interpreter, so executable backend results use the
	explicit tested Python path. System Git was not invoked or its Xcode license
	accepted; Git-based diff validation was unavailable.
- No commit, branch, deployment, paid-service upgrade or credential change occurred.
	No public host was tested. Before sharing a public recruiter URL, verify the
	configured HTTPS API/base path, signed-out fresh-browser flows, exact CORS
	origins, strict production auth, cold-start/model availability, timeouts,
	abuse/concurrency limits and inference budget on that actual host. The current
	export intentionally points to the explicit local API and must be rebuilt
	with the approved public API URL. Deterministic text safety coverage is bounded,
	not a general medical-language understanding guarantee.

## Exact time entry

- Replaced the read-only time value with an accessible native number field beside
	the existing slider. It accepts whole minutes from 0 to 240 and commits on Enter
	or blur; Escape restores the committed value. Local drafts remain separate from
	the shared time setting, and unchanged values do not dispatch another decision.
- Browser checks verified that blank, negative, over-limit and fractional entries
	leave the slider and recommendation unchanged. Valid Enter/blur edits and slider
	changes stay synchronized, with one request per committed numeric change.
- Zero minutes still produces rest. The 240-minute upper boundary and intermediate
	values match the outgoing decision request, while Today and Your week retain
	matching workouts. A live confirmed 25-minute schedule limit updates both controls.
- Reset initially left an invalid draft when the committed time was already 30;
	Today's transient inputs now reset with the existing reset/retry revision. The
	same Reset check passes after validation errors and after a confirmed schedule edit.
- Seven viewport checks at 320, 390, 768, 980, 981, 1200 and 1440px found no clipped
	controls or horizontal overflow. The numeric field stays 76px wide and 44px tall,
	with 16px text. Reserved error space prevents validation from shifting the layout;
	invalid-state descriptions are associated with the input. Screenshots were reviewed.
- `demo:check`, TypeScript, targeted ESLint, editor diagnostics and `demo:build`
	pass. The original accessible tab retained all 28 state values. Reset and schedule
	confirmation tests used a separate session, reset afterward; viewport overrides
	and temporary snapshots were cleared. Earlier shared tab IDs were unavailable.
- Typography, scoring, plan generation and inference configuration are unchanged.

## Clear comparisons and previews

- The long-run takeaway now states 4 of 4 Saturday sessions completed versus 1
	of 2 on Sunday, using the existing recorded counts. It suggests a possible
	scheduling fit, not better training results, and retains the small-sample and
	association caution. Model selection, confidence and provenance are unchanged.
- Schedule, training-day preference and easier-week previews lead with changed
	workouts and before/after values, then weekly totals. Full calendar exposes both
	complete weeks; Request details retains schedule constraints and recovery facts.
	Schedule comparisons explicitly use the saved-plan baseline, avoiding false
	changes caused by the separate daily workout projection.
- A shared immutable comparison helper omits unchanged sessions, matches only
	unambiguous moves, and preserves swaps, pace/type edits, additions and removals.
	Ambiguous identities are not guessed. Removing a workout does not imply a rest
	day when another session still occupies that day. Its smoke test runs under
	`demo:check`.
- Twenty collapsed/expanded insight-preview checks and eight schedule-preview
	checks passed across 320, 390, 768, 981 and 1440px, with no clipped text or
	horizontal overflow. A preview-only icon gap adjustment keeps Intervals readable
	at the narrow desktop breakpoint. Desktop/mobile screenshots were reviewed.
- Keyboard calendar/request disclosures, invalid preferred-day blocking and
	review cancellation passed. Preference and easier-week confirmations applied
	the exact previews while preserving current and race weeks.
- Live Friday availability and combined soreness/25-minute requests produced
	validated previews. Schedule and recovery confirmation matched the exact saved
	proposal; the combined case displayed 17 minutes / 2.0 miles in both Today and
	Your week, with matching totals. No confirmation or workout logic changed.
- Both original tabs retained all 28 captured state values, including the open
	preference review. Confirmation tests used a separate session, reset afterward;
	temporary snapshots were removed and test browser sizing returned to natural.
- `demo:check`, TypeScript, targeted ESLint, editor diagnostics and `demo:build`
	pass. Typography, recovery scoring, inference configuration and the remaining
	precise-time-entry suggestion are unchanged.

## Decision-first Insights

- Moved the rising-fatigue training-response finding before the scheduling
	preference. Both findings now show the takeaway, confidence/association caution
	and review action before detailed evidence. Existing comparison values, source
	sessions, provenance and limitations are retained in the evidence disclosures.
- Ten collapsed/expanded layout checks at 320, 390, 768, 980 and 1440px verified
	ordering, unchanged comparison values and no clipped text or horizontal overflow.
	The easier-week action is visible in the first viewport at each tested width.
	Desktop/mobile screenshots were reviewed; evidence opens and closes by keyboard.
- Separate-tab checks verified that evidence and cancelled reviews do not mutate
	the plan, profile, check-in or time. Invalid preferred-day counts still block
	confirmation. Both confirmations apply the exact reviewed plan, preserve current
	and race weeks, and retain access to the evidence after success.
- The original tab retained all 28 captured state values. The separate test plan
	was reset after confirmation checks, and browser sizing was returned to natural.
- `demo:check`, TypeScript, targeted ESLint, editor diagnostics and `demo:build`
	pass. Findings, scoring, inference configuration, typography and the other
	destinations are unchanged; broader preview redesign remains deferred.

## Responsive navigation

- Moved the single destination navigation into the sticky header above 980px,
	between the brand and quieter Reset/Case study actions. Smaller viewports keep
	the bottom navigation and safe-area spacing; desktop no longer reserves space
	for a bottom bar. No duplicated buttons or alternate routing logic were added.
- Disabled the header's backdrop filter on smaller viewports so its fixed-position
	navigation stays anchored to the viewport rather than the header. The bottom bar
	retains its own background treatment.
- Placement and scroll checks at 320, 390, 980, 981 and 1440px passed. Twelve
	navigation checks across all four destinations at 320, 980 and 1440px verified
	active indicators, reachable 44px-minimum targets, heading focus and Goal summary
	visibility. Footer controls remain clear of the mobile bar. Desktop/mobile
	screenshots were reviewed.
- Keyboard Tab/Enter navigation and Plan overview focus still work under the
	sticky header. All 28 original session state values, the 30-minute availability,
	view and scroll position were preserved; natural browser sizing was restored.
- `demo:check`, TypeScript, targeted ESLint, editor diagnostics and `demo:build`
	pass. Goal placement, content, typeface, recovery scoring and workout logic
	are unchanged. Insights ordering and the other proposed edits remain deferred.

## Shared Goal placement

- Moved the compact race summary beneath the page heading on all four destinations.
	It shows NYC Marathon, Nov 1, 53 days, and Build / Week 1 of 8 in one desktop row
	or two mobile lines. Removed the duplicated full Goal area from Today; its
	sidebar now contains only recovery context.
- The detailed phase strip and training-block overview live in Your week. The
	shared Plan overview action navigates there, expands the details and focuses
	the overview below the sticky header, including when already viewing Your week.
- Twenty checks across all destinations at 320, 390, 768, 980 and 1440px verified
	first-viewport visibility, no clipped summary text or horizontal overflow, and
	working navigation/focus. The eight-week strip appears only in Your week and
	retains exactly one current-week marker. Desktop/mobile screenshots were reviewed.
- Keyboard activation while a weekly intake request was held open preserved the
	request and draft. The test request was aborted locally afterward, without
	forwarding it to the parser. All 28 original session state values were restored,
	including the 30-minute availability; natural browser sizing was restored.
- `demo:check`, TypeScript, targeted ESLint, editor diagnostics and `demo:build`
	pass. Fonts, colors, workout logic, recovery scoring and inference configuration
	are unchanged. Other proposed design edits remain deferred.

## Spacing and update feedback

- Added shared 12px content spacing and 32px section gaps across the demo. Forms
	and evidence have tighter heading/content spacing; the connected workout and
	calendar workspaces remain intact. Typography, imagery and training logic are unchanged.
- A display-only tracker highlights changed workout values and the matching
	current-day calendar entry once per view after a completed decision. The 1.1-second
	background fade does not resize or move either target. Initial loads, identical
	results, repeated navigation, pending requests and errors produce no new cue.
- A held-request test caught a transient input-derived change before the loading
	effect. Feedback now requires a fresh decision when the workout signature changes.
	Browser checks verified zero calls while pending and one after completion.
- Reduced-motion mode skips feedback and spinner animation, uses instant tab
	scrolling, and cancels an active fade when the preference changes. Text contrast
	at the strongest highlight is 4.69:1. Rest transitions target the actual rest state.
- Sixteen layout checks across all four destinations at 320, 390, 768 and 1440px
	passed without clipped controls or horizontal overflow. Desktop/mobile screenshots
	were reviewed. Animation geometry, final background restoration and no-replay
	behavior were checked in the browser.
- The active tab retained all 28 original state values and its 30-minute setting;
	original view/scroll and natural browser sizing were restored, with temporary
	probes removed. The other shared tab became unavailable before its final state
	recheck; no interaction tests were run in that tab.
- The new immutable feedback regression suite runs under `demo:check`. That gate,
	TypeScript, targeted ESLint, editor diagnostics and `demo:build` pass.

## Panoramic workout image

- Moved the existing running photograph above Today's connected workout section.
	Its height is now 176px on desktop and 128px at widths up to 720px, with a 16px
	gap before the summary. The revised crop keeps the runner in frame without overlays.
- Six layout checks at 320, 390, 768, 980, 1200 and 1440px verified image loading,
	matching photo/workout widths, a visible first-screen workout heading and no
	clipped text or horizontal overflow. Desktop/mobile screenshots were reviewed.
- Workout values, timeline segments, typography, colors and the recovery sidebar
	are unchanged. Both shared tabs retained all 28 original state values; original
	views and inputs were restored and test viewport sizing was cleared.
- TypeScript, targeted ESLint, editor diagnostics and `demo:build` pass.

## Workout and phase timelines

- Today's summary now includes a proportional segment bar with labels and minutes
	from the existing resolved workout. The tired/30-minute sample is warm-up 9,
	tempo 12 and cool-down 9 minutes. Screen-reader descriptions include elapsed ranges.
- The shared goal area in Today and Your week shows all eight generated weeks,
	with phase colors, a visible legend and a non-color current-week marker. Existing
	phase details remain available. Recovery and Insights content is unchanged.
- A focused smoke suite checks exact labels, duration totals, short windows, rest,
	single-segment workouts, inconsistent input rejection and immutability. It runs
	under `demo:check`. No workout segments, scores or recommendations are invented.
- Ten Today/week layout checks at 320, 390, 768, 1200 and 1440px passed without
	clipped visible text or horizontal overflow. Bar widths match duration ratios;
	phase weeks have equal widths. Desktop and mobile screenshots were reviewed.
- Held and failed requests show no stale bars or workout numbers. A reserved
	timeline slot avoids introducing a loading-height jump; the desktop slider
	position stayed fixed. Live readiness/time cases, including rest and zero time,
	kept the segment totals and weekly calendar synchronized.
- Chart contrast is at least 3.71:1 and timeline text contrast at least 4.91:1.
	Both shared tabs retained all 28 original state values; test sizing was cleared
	and the original views, scroll positions and 30/97-minute controls restored.
- `demo:check`, TypeScript, targeted ESLint, editor diagnostics and `demo:build`
	pass. No backend, provider, typography or recovery-scoring changes.

## Demo-wide grouping and surfaces

- Extended the neutral canvas and summary/body treatment to Your week, Recovery
	and Insights. The weekly calendar and editor now share one workspace, with an
	Adjust week shortcut that reveals and focuses the input on mobile and desktop.
- Recovery uses a centered, coordinated summary/biometrics/check-in layout. Its
	score, metric labels, values and form behavior are unchanged. Insights' initial
	and analyzed views use tinted headers and white evidence/action areas; existing
	confirmation previews render as integrated bands instead of nested frames.
- Twenty layout checks across all four destinations at 320, 390, 768, 980 and
	1440px found no clipped text or horizontal overflow. New header text contrast
	is at least 4.91:1. Desktop/mobile screenshots were reviewed.
- Preference validation still blocks invalid day counts. Preference/easier-week
	previews fit at 320px; cancellation preserves the plan. Recovery form edits can
	be cancelled without changing readings. A live Friday time-limit request produced
	a validated mobile preview without changing the active calendar before confirmation.
- The live parser rejected "Move my Sunday long run to Saturday." during this
	verification session. No parser or backend changes were made in this design pass;
	this is not an all-green claim for every live intake example.
- The original session's 28 state values were preserved, including its 97-minute
	availability. Temporary review tests used a separate tab and left the plan,
	profile, recovery and time unchanged. Browser sizing was returned to natural.
- `demo:check`, TypeScript, targeted ESLint, editor diagnostics and `demo:build`
	pass. Typography, scoring and inference configuration are unchanged.

## Today surface contrast

- CSS-only styling adds a light neutral canvas on Today, a pale cobalt workout
	summary and a continuous white surface for controls and rationale. Removed the
	workout's top rule and rationale divider without adding rounded section cards.
- Typography, content, recovery sidebar, photograph dimensions/crop and workout
	logic are unchanged. Other destinations retain their existing backgrounds.
- Desktop/mobile screenshots and layout checks at 320, 390, 768, 1200 and 1440px
	show no clipped text or horizontal overflow. Summary text has at least 4.91:1
	contrast; keyboard focus remains visible inside the readiness controls.
- All 28 captured state values match the original session. Your week, its scroll
	position, 97-minute availability and natural 689x807 browser sizing were restored.
- CSS editor diagnostics and the isolated `demo:build` production export pass.

## Connected Today layout

- Grouped the workout summary, readiness/time controls and rationale in one open
	section. Removed the separate control frame and repeated workout heading. The
	existing photo follows the group with its dimensions and crop unchanged.
- Typography, colors, recovery sidebar, navigation and workout logic are unchanged.
	All 28 captured session state values matched after browser interaction checks.
- Desktop/mobile screenshots and layout checks at 320, 390, 768, 1200 and 1440px
	found no clipped text or horizontal overflow. Live checks covered pending
	recommendations, time changes, zero-time rest and matching Today/week workouts.
	Original inputs and natural 689x807 browser sizing were restored.
- `demo:check`, TypeScript, targeted ESLint, editor diagnostics and `demo:build` pass.

## Today and week consistency

- Today and the current-day calendar entry now share one resolved workout. The
	initial tired/30-minute scenario shows 30 minutes and 3.2 miles in both views;
	weekly totals are 230 minutes and 23.7 miles. Other days remain unchanged.
- The projection does not mutate the base plan or reapply confirmed recovery
	reductions. Regression cases cover time changes, rest, rescheduling, exact
	accepted workouts, input immutability and repeated resolution.
- Pending and failed decisions hide today's old workout and weekly totals.
	Live browser checks verified matching workouts after readiness/time changes,
	zero-time rest, and held/failed requests without a substitute calendar workout.
- `demo:check`, TypeScript, targeted ESLint, editor diagnostics and `demo:build`
	pass. Desktop 1440x1000 and mobile 390x844 screenshots were reviewed; the review
	tab's original tired/30-minute inputs and natural 689x807 sizing were restored
	afterward. Git-based checks were blocked by the local Xcode license prompt;
	no license acceptance was performed.
- No backend, scoring, typography, recovery presentation or layout changes.

## Parenthetical travel availability

- Reproduced "I'm sore today and traveling Friday (only have 20 min)" from the
	user's active session. The parser recognized travel and soreness, but its direct
	day/time rule skipped parentheses. The sentence-level fallback saw both today
	and Friday and requested clarification; the live model output was then rejected
	as ungrounded against that incomplete reference.
- Backend extraction and frontend grounding now recognize an explicit availability
	statement in parentheses immediately after a day or day list. The time remains
	attached to that adjacent day, not a separate recovery statement. Complete
	day/time evidence is required. An explicit day inside the parentheses still
	owns its minutes; ambiguous relative days, negated limits, driving durations and
	sleep durations do not become inferred availability.
- Combined travel/time summaries now show both "20 minutes available" and
	"Easy effort only" rather than hiding the numeric limit. No schedule, recovery
	weights or decision thresholds changed.
- The exact note passed repeated live calls through the existing Ollama schedule
	model and Groq recovery interpreter without fallback. The first corrected live
	review completed in 5.7 seconds. It returned Friday: 20 minutes, easy-only, and
	today's soreness separately. The original 42-minute Today window and recorded
	sleep 7.7h, fatigue 2/5, soreness 3/5, HRV 55ms and resting HR 52bpm were retained.
- The existing planner's preview moves Friday's longer easy run to Thursday and
	renders today's workout within the separate 42-minute window. Confirmation was
	tested only in a separate tab: the exact preview was applied, later weeks and
	readings were unchanged, and confirmation/Today navigation made no extra API
	requests. The original tab was re-reviewed and left with the corrected preview
	unconfirmed; its note, profile, saved plan, readings and time control are unchanged.
- All 50 backend intake fixtures, 609 deterministic safety assertions, recovery
	interpretation checks, mirrored frontend grounding tests and all 33 frontend
	smoke suites pass. `demo:check`, TypeScript, targeted ESLint, Python syntax/editor
	diagnostics and `demo:build` also pass. Desktop 1440px and mobile 320/390px preview
	checks found no clipped text or overflow and reachable confirmation controls;
	screenshots were reviewed and natural test-browser sizing restored to 689x807.
- Reloaded the local API with the existing documented live-mode/model exports
	and private environment file. Credentials were not inspected or changed, and no
	providers, model choices, backend decision logic or deployment configuration were
	changed. Temporary test snapshots were removed after verification.

## Newsreader typography

- After browser-only comparisons, the user chose Newsreader throughout the demo,
	including headings, body text, controls and numbers. Headings use regular weight;
	existing emphasis, sizes, layout, icons, photographs and behavior are unchanged.
- One local font definition loads the vendored Fontsource 5.3.0 Latin variable
	WOFF2 file (58,084 bytes, weights 200-800), with its license and a metric-adjusted
	serif fallback. Earlier font files remain unreferenced. Builds need no remote
	font downloads, and a fresh browser load requested no remote fonts.
- Twenty layout checks across all four destinations at 320, 390, 768, 1200 and
	1440px passed with no clipped text or horizontal overflow. Desktop/mobile
	screenshots were reviewed. Notes survived navigation; recovery form cancellation,
	preference/easier-week previews, the time control and keyboard focus still worked.
- The available tab's 28 captured state values matched immediately after the font
	change. Earlier shared tab IDs were no longer accessible before editing. All
	interaction tests used the separate comparison tab, which was reset afterward;
	its plan, note and readings matched the snapshot. Temporary font overrides were
	removed and natural browser sizing restored to 689x807.
- `demo:check`, TypeScript, targeted ESLint, editor diagnostics and `demo:build`
	passed. A fresh load had no page errors, with Newsreader and the photograph
	loaded. No hooks, decision logic, providers or backend files changed.

## Deterministic plan-adjuster fixture

- Pinned the plan-adjuster smoke fixture's generation date to September 9, 2026,
	so the busy-week drop scenario no longer changes with the wall clock. All five
	existing no-op, swap, shorten, drop and keep assertions remain unchanged.
- The focused test, full `npm run smoke` chain (33/33 suites), TypeScript,
	targeted ESLint and editor diagnostics pass. This resolves the 32/33 limitation
	from the audit below. No production adjustment logic or browser state changed.

## Post-polish functional regression audit

- Fixed the shared workout formatter treating a zero-minute cap as unlimited.
	Zero time now renders rest with no segments or mileage. Segment rounding no
	longer exceeds one- or two-minute limits. The demo also caps displayed duration
	by the current time control and the decision response. Backend scoring and
	provider configuration are unchanged, including the raw zero-time `proceed`
	response noted below; that response can no longer produce a runnable workout
	in the demo when no time is available.
- Added a tested demo Today display resolver. Loading and failed requests cannot
	expose stale or unconfirmed workout numbers. Failures show "Recommendation
	unavailable" instead of a planned workout heading. Pending recovery scores use
	the current readings, not a previous response. Confirmed recovery workouts are
	reused exactly without another reduction. Both new regression suites run under
	`demo:check`.
- All 27 live combinations of three readiness choices and nine time limits
	(0, 1, 2, 5, 10, 25, 30, 60, 240 minutes) stayed within the selected window.
	Separate-tab fault injection verified HTTP failure, malformed response rejection,
	the eight-second decision timeout, retry and out-of-order response protection.
	No failure or cancelled request changed the saved plan.
- Live intake checks covered blank requests, schedule preview/cancel/confirmation,
	editing invalidating a preview, navigation/Reset cancelling in-flight parsing,
	service failure and rejection of late responses. Injury notes kept the care
	message visible without confirmation; a vague request remained non-mutating.
- Combined soreness/time intake preserved the 25-minute limit and all unedited
	readings. Saving only soreness did not repeat interpretation; confirmation and
	Today matched the preview exactly and made no additional requests. Invalid sleep
	was blocked, cancelled edits retained readings, and changing recovery invalidated
	a pending combined preview without changing the plan or note.
- Insights analysis, evidence disclosures, dismissal and previews were read-only.
	Invalid training-day choices disabled confirmation. Confirming a preference
	preserved the current/race weeks; confirming an easier week applied exactly its
	next-week preview. Refresh could not repeat the adjustment. Notes survived all
	destination changes, and the recovery link focused the correct visible heading.
- Twelve layout checks across all four destinations at 320, 390 and 1440px passed
	without overflow or clipped control text. Keyboard focus and desktop/mobile
	screenshots, including failed-request and zero-time views, were checked. Reset
	restored the test session. A fresh load had no page errors or remote font requests;
	the photo and local fonts loaded. Natural sizing was restored to 689x807.
- The user's original tab remained untouched by mutation tests. Its 28 captured
	React state values, form fields, scroll position and natural viewport matched
	the pre-edit snapshot after the audit, including its saved plan and readings.
- Required gates passed: `demo:check`, TypeScript, targeted ESLint, editor
	diagnostics and `demo:build`. The broader frontend smoke run passed 32/33 suites.
	The unchanged `smoke-plan-adjuster.ts` fixture uses the wall clock: on September
	15 its generated easy runs fit the busy-week slots, so its expected drop assertion
	fails. Running that same test with September 9 frozen passes. It does not depend
	on the changed formatter and was left untouched. This is not an all-green claim
	for `npm run smoke`. No backend changes, commits or deployments were performed.

## Training journal UI polish

- Demo-only typography uses locally vendored Space Grotesk for headings and key
	numbers and Public Sans for body text. Fontsource 5.3.0 Latin variable WOFF2
	files total 49,120 bytes, with their licenses retained. `next/font/local` and
	the existing demo export copy these files without remote font downloads.
- Today leads with the workout and readable duration/distance, followed by the
	existing sunlit running photo without a tint or overlay. Recovery and race
	context move to the side on desktop. Shared photography components, the logo,
	blue brand accents, backend logic and providers are unchanged.
- Your week leads with the seven-day calendar. Dates derive from the sample plan
	start, September 9 has a labeled Today marker and `aria-current="date"`, and
	workout colors always accompany text labels. Mileage and duration use separate
	readable lines. Mobile uses continuous log rows, including confirmation previews.
- Insights retains the analysis/refresh flow and leads with "What Kinetic found."
	The gradient banner and technical marketing headline are removed. Findings,
	comparison bars, metrics, race context and supporting details use open sections
	and fine dividers. Inputs and confirmation previews retain small-radius borders.
	Sample-data disclosure and medical/causation cautions remain visible.
- Desktop 1440x1000 and mobile 390x844 screenshots were inspected for all four
	destinations and recovery/schedule forms. Sixteen layout checks across 320,
	768, 1024 and 1440px found no horizontal overflow, clipped control text or
	overlapping Today labels. The 320px schedule preview also fits. Keyboard focus
	is visible inside the segmented control; numbers and units have actual spaces.
- Separate-tab interactions verified readiness/time controls, live schedule
	preview/cancel/confirm, unchanged plans before confirmation, preferred-day
	confirmation with current/race weeks protected, a next-week-only easier-week
	confirmation, recovery cancel/save preserving HRV/RHR, notes across navigation,
	and Reset. A fresh load had no page errors and no remote font requests.
- The original accessible tab's 73-character note and all 28 React state values
	were backed up in its session storage before editing and matched after the first
	CSS changes. That page subsequently became unavailable to browser tools, so its
	final state could not be rechecked. No mutation tests ran in that tab. The test
	tab was reset separately and natural browser sizing restored to 689x807.
- A separate upstream issue was observed, not changed: after confirming a
	25-minute Wednesday workout, the live response to a zero-minute slider value
	reported `available_minutes: 0` but selected `proceed` for 25 minutes. This UI
	pass does not correct or validate that decision behavior.
- Final `demo:check`, TypeScript (`tsc --noEmit`), targeted demo ESLint, editor
	diagnostics and `demo:build` passed. No commit, deployment or provider change
	was performed.

## Shared semantic recovery intake

This supersedes the phrase-specific soreness detection below.

- Removed the frontend soreness phrase matcher. The shared intake endpoint now
	returns grounded sleep, fatigue and soreness statements, including meaning,
	current-person scope, exact evidence, explicit values and interpretation status.
	Numeric values are compared with saved readings, never applied automatically.
- Local Llama 3.2 3B, Llama 3.1 8B and Qwen 3 8B did not pass the paraphrase and
	scope evaluation. With explicit user approval, recovery interpretation now uses
	Groq `openai/gpt-oss-120b`; schedule normalization remains local. New notes are
	sent to Groq for this step, using the existing private backend key. No paid
	upgrade, deployment or scoring-policy change was made.
- All 21 distinct live evaluation cases have passing latest results: varied body
	parts and soreness wording, drained/wiped-out/low-energy phrasing, restless sleep,
	numeric and spelled-out hours, negation, past and hypothetical symptoms, another
	person's symptoms, schedule-only notes, explicit ratings and multiple concerns.
	Median end-to-end intake time was 1.957s, maximum 5.281s. Earlier failed quote
	wrappers and an omitted numeric rating were retained in the evaluation record
	and fixed through exact-evidence normalization and numeric extraction.
- Shared client conflict rules drive single-field **Adjust soreness**, **Adjust
	fatigue**, **Adjust sleep**, or combined **Adjust recovery** forms. Parsed
	schedule changes remain visible, unedited readings are preserved, and save
	reuses the already-validated interpretation. Exact-note/check-in confirmation
	accepts a deliberately unchanged value without looping. Missing, stale or
	unverified interpretation requires explicit confirmation; provider failures do
	not silently become successful recovery interpretation.
- Live browser checks verified all three single-metric paths and the combined
	path. Saving sleep 4h, fatigue 4/5 and soreness 3/5 retained the 25-minute limit,
	left the plan unchanged before confirmation, and produced a 17-minute / 2-mile
	workout with recovery score 69. Confirmation and Today matched it exactly, with
	zero further interpretation calls on save and zero extra decision calls on
	confirmation/navigation. Desktop 1280px and mobile 390px forms fit without
	horizontal overflow; save controls were reachable. Natural sizing was restored.
- The 43 existing offline intake regressions, frontend schedule grounding,
	generic recovery/conflict tests, 609 backend safety assertions, TypeScript,
	targeted lint, editor diagnostics and standalone build passed. This is broader
	semantic interpretation, not a guarantee of every wording. Ambiguous or failed
	interpretation remains a confirmation path. The separate tagged native intake
	flow was not migrated; its existing compatibility gates still pass.

## Soreness adjustment prompt

- A current soreness report conflicting with a fresh 1/5 (None) check-in now
	shows **Adjust soreness**, a single soreness selector and **Save soreness**.
	The parsed time limit stays visible. Sleep, fatigue and objective readings are
	reused, and the weekly workout cannot be confirmed before the conflict is
	resolved. Missing or stale readings still use the complete check-in flow.
- No severity is inferred from text. Explicitly saving 1/5 is allowed without a
	repeat prompt; confirmation is scoped to the exact note and check-in. Editing
	either invalidates it. Focused tests cover affirmative, negated and historical
	soreness statements, freshness and unchanged recovery/plan inputs.
- A separate live browser test preserved sleep 7.7 hours, fatigue 2/5, HRV 55 ms
	and resting heart rate 52 bpm while changing only soreness from 1/5 to 3/5.
	The displayed recovery score changed from 95 to 91. The existing engine still
	selected a 25-minute workout within the 25-minute limit; no thresholds changed.
	The saved plan stayed unchanged until confirmation, and Today then reused the
	confirmed workout without a second decision call.
- Recovery smoke tests, demo checks, TypeScript, targeted lint, editor diagnostics
	and the standalone build passed. Desktop 1280px and mobile 390px screenshots
	showed a contained single-field form and reachable save action without horizontal
	overflow. Natural browser sizing was restored. After hot reload, the active tab
	was restored to its captured note and steady readings, with soreness still 1/5
	and the adjustment prompt awaiting the user's choice; its plan is unconfirmed.

## Reordered recovery and availability

- Reproduced the exact note, "I'm feeling sore today and only have 25 min free".
	Its word order bypassed availability extraction, so the recovery-only route
	returned metrics without a schedule preview. Backend extraction and frontend
	grounding now resolve explicit availability across the same sentence when
	there is one unambiguous day, preserving the original evidence.
- Explicit day/time links still take precedence, including "25 min free on
	Friday". Recognized time requests with missing or ambiguous days ask which day
	the limit applies to. Conflicts, invalid limits, completed workout durations
	and sleep durations are covered by regressions.
- All 43 offline cases, 13 live Llama 3.2 3B cases without fallback, frontend
	grounding/confirmation checks, 609 shared backend assertions, demo checks,
	TypeScript, targeted lint and editor diagnostics passed.
- After restarting the local API, the user's unchanged note produced a live
	combined preview: Wednesday availability 25 minutes, tempo 17 minutes / 2 miles,
	recorded soreness 2/5, fatigue 3/5, sleep 5.8 hours and recovery score 75/100.
	The decision request included both the time constraint and those readings.
	The original 45-minute workout remains saved; the new preview is unconfirmed.

## Combined soreness and time preview

This supersedes the time-only intake preview described below. The fixed Wednesday
sample date is retained, as requested.

- Intake preview now calls the existing decision engine with the constrained plan,
	recorded soreness, fatigue and sleep, then uses the shared Today workout renderer.
	Recovery affects the proposed calendar workout before confirmation. No new
	recovery weights or thresholds were introduced, and no values are inferred from
	free text.
- The exact mixed note, with soreness 3/5, fatigue 4/5 and 5.8 hours of sleep, used
	live Ollama parsing without fallback and a decision request containing all those
	readings plus the 25-minute limit. The combined preview showed a 17-minute tempo
	session, 2 miles, and recovery score 69/100. Other days and later weeks stayed
	unchanged. A test increase to soreness 5/5 lowered the score to 65 and rebuilt
	the preview; the existing engine still selected modify. Original values were
	restored. A score change need not cross an action-selection boundary.
- Missing, previous-day or invalid-timestamp check-ins block confirmation and
	require explicit entry/reconfirmation. Updates invalidate the old preview and
	rebuild it; unit tests reject changed plan/time/readings and tampered previews.
	Rest decisions remove the day's workout rather than overriding recovery safety.
- A separate browser test confirmed that the saved calendar and Today both matched
	the 17-minute preview. Opening Today made no second decision call or repeated
	reduction for those same inputs. Repeating the same note did not reduce it again.
- Combined-preview regressions, existing demo checks, TypeScript, targeted lint,
	editor diagnostics, missing/stale check-in render checks and standalone build
	passed. Desktop 1280px and mobile 390px checks found no horizontal overflow and
	reachable confirmation controls. Natural browser sizing was restored. The user's
	original tab retains the note, original recovery readings and an unconfirmed
	combined preview; its saved plan remains unchanged.

## Same-day time limits

- Reproduced "I'm feeling sore and only have 25 free minutes today." Weekday-only
	parsing dropped the time limit and treated the note as recovery-only before an
	AI call. Backend extraction and frontend grounding now resolve today from the
	explicit request date, preserve the original evidence span, and recognize
	free/available/spare minutes. Wrong-day and conflicting constraints are rejected.
- The preview now shortens Wednesday's tempo from 45 to 25 minutes without moving
	it or changing other workouts. Below-floor same-day limits propose rest rather
	than overrun the stated window; races are protected. Schedule and recovery
	responses remain separate, so neither intent hides the other.
- Confirmation synchronizes the plan and Today's available-minute control. A live
	check exposed a second time defect: feasibility always assumed a 60-minute
	workout. It now uses explicitly recorded duration. The test tab confirmed a
	25-minute planned session and then displayed a 17-minute recovery-modified tempo
	within that window. No biometric values were inferred or changed.
- All 33 offline intake cases, frontend grounding/confirmation checks, explicit
	duration and safety tests, TypeScript, targeted lint, editor diagnostics,
	demo regressions, 609 shared backend safety assertions and the standalone build
	passed. All 10 live Llama 3.2 3B cases passed without fallback; the exact mixed
	note took 3.823 seconds in the live regression run.
- The original browser note and recovery values were preserved. Its current
	workout remains unchanged with the 25-minute preview unconfirmed; confirmation
	was tested in a separate temporary tab. Time is an upper bound, and recovery
	can shorten the recommendation further. No scoring weights, paid provider or
	hosted-model selection were changed.

## Recovery metrics destination

This supersedes the training-pattern destination in the earlier follow-up below.

- Renamed the action to **View recovery metrics** and routed it to a dedicated
	**Recovery** view and navigation tab. It shows the current score, HRV, resting
	heart rate, personal baselines, sleep, fatigue and soreness. It no longer opens
	or loads the training-pattern Insights card.
- Browser checks verified the user's existing check-in, including fatigue 4/5
	and soreness 3/5. Saving a test edit updated the metrics and score consistently
	with the decision response. The original readings were restored, and the note,
	saved weekly plan and normal readiness storage were unchanged.
- Rendering checks covered current, missing and previous-day readings. Missing
	metrics stay unrecorded and open the existing explicit check-in form. The
	Recovery view does not show a link to itself or substitute training patterns.
- Demo checks, typechecking, targeted lint, editor diagnostics and the standalone
	build passed. Desktop 1280px and mobile 390px layout, navigation and check-in
	checks passed. Natural browser sizing was restored with Recovery metrics open.

## Targeted recovery follow-up

This replaces the generic "Review today's workout" navigation described below.

- A recovery note now shows today's recorded sleep, fatigue and soreness. Missing
	values open an inline check-in instead; stale-day and invalid values count as
	missing. Existing values are prefilled for explicit correction. No readings are
	inferred from the note and no weekly-plan mutation is performed by check-in.
- Render checks exercised missing soreness, an empty check-in and a complete
	check-in. Missing soreness remained blank with a save action; complete metrics
	showed Update check-in and Check recovery insights without redundant entry.
- Live browser checks confirmed required-value validation, cancel preserving
	values, and explicit save reaching the actual decision request. Test values of
	4.5 hours sleep, fatigue 4 and soreness 3 were sent while HRV/RHR stayed unchanged.
	The saved weekly plan and normal readiness local storage were unchanged.
- Check recovery insights opens Insights, loads the existing result as needed,
	and focuses the training-response heading below the fixed header. This passed
	on desktop and mobile; it does not require a second Analyze action or land on
	Today. The current note remains intact when navigating back.
- The new recovery follow-up regressions, existing demo checks, TypeScript,
	targeted lint, editor diagnostics and standalone demo build passed. Desktop
	1280px and mobile 390px checks/screenshots found no horizontal overflow and a
	reachable save action. Original sample readings, the user's note and natural
	browser sizing were restored after testing.

## Recovery input and a single weekly review

This supersedes the duplicate weekly-review block described in the earlier
acceptance below.

- Removed the lighter-week block from **Your week**, including its state,
	callbacks and styles. Insights retains the evidence-based review, exact preview,
	confirmation and applied-signature protection against repeating a reduction.
- Reproduced the user's exact input: "I'm feeling sore and didn't get much sleep
	last night." The parser previously returned `needs_clarification`, which the
	UI labeled "One detail is missing". It now returns a non-mutating
	`review_readiness` next step with "Check today's recovery" and a working
	"Review today's workout" button. Recovery-only notes do not call a model,
	fabricate numeric readings or create a plan draft.
- Pain/injury notes use a distinct caution route without a schedule draft.
	Recovery plus an explicit schedule constraint still permits a grounded schedule
	preview. Conflicting schedule details remain a specific clarification, including
	when the note also mentions soreness. Negated soreness is not routed as recovery.
- All 25 parser cases, frontend draft/confirmation regressions, demo checks,
	TypeScript, targeted lint, editor diagnostics, all 609 backend safety assertions
	and the standalone demo build passed.
- Live browser checks verified the exact note, Today navigation with unchanged
	metrics, a custom move/time-limit preview and a specific conflicting-time
	clarification. The normal schedule request used Ollama without fallback. The
	conflicting-time case retained the safe deterministic clarification after the
	model response failed grounding. The Insights preview/cancel flow still worked
	with the duplicate block absent. No plan changes were applied.
- Desktop 1280px and mobile 390px checks/screenshots found no horizontal overflow
	and a reachable recovery action. The original note and corrected response were
	restored; natural browser sizing was restored after testing.

## Week review and schedule intake

- Replaced "Make room for life" with "Your schedule / Adjust your week". The
	textbox starts empty; six editable examples live in a collapsed disclosure.
	Empty requests are disabled and text is bounded to the API's 1,000-character
	limit. The three original examples are not an input allowlist.
- Verified two non-example requests through the live Ollama route with no
	fallback: a Wednesday-to-Thursday workout move plus a 35-minute Friday limit,
	and different preferred training days plus an easy-only Thursday. Both produced
	grounded calendar previews and were cancelled without changing the plan.
- Added the custom move/time request to the regression fixture. All 18 parser
	cases and the frontend draft/confirmation checks passed, including current-week
	moves, the requested time constraint, future-week preservation and immutability.
- Renamed the optional block "Lighter-week review" and separated completed
	Aug 31-Sep 6 data (3/4 runs, 190/245 minutes, 4 low-recovery days) from the
	proposed Sep 14-20 plan (255 to 245 minutes, 27 to 26 miles). Labels explicitly
	distinguish past completed minutes from next week's planned minutes.
- Browser checks verified keep-plan/review-again behavior, exact confirmation,
	the updated next-week schedule, and unchanged current-week workouts. Test
	confirmation was reset; an empty schedule input and unconfirmed weekly preview
	remain. Desktop 1280px and mobile 390px layout checks/screenshots passed, with
	reachable confirmation controls and no horizontal overflow. Natural browser
	sizing was restored and examples were left collapsed.
- Demo regressions, TypeScript, targeted lint and the standalone demo build passed.
	No intake model, scoring rule or plan-adjustment priority was changed.

## User-facing Insights presentation

This presentation update supersedes references to visible AI-generated badges
in the earlier checks below.

- Removed source badges from intake review, weekly recalibration and both
	Insights cards. Model, generation time and cache provenance remain available
	in the Insights evidence details; unavailable-state messages are unchanged.
- The long-run summary now begins "You completed 4 long runs on Saturday" and
	refers to "your future long runs". Both blocks use "WHAT KINETIC FOUND", and
	the long-run secondary action is "Keep current plan".
- The training-response summary reports effort and next-day fatigue, followed by
	"Consider a lighter week and reassess how you feel" only when review is
	available. Copy regressions ensure that missing workout duration or
	schedule-driven misses cannot trigger that suggestion. Backend-verification
	narration stays out of the main summary.
- Focused backend copy/evidence regressions, regenerated-artifact verification,
	demo regressions, typechecking, targeted lint and the standalone build passed.
	Desktop 1280px and mobile 390px browser checks/screenshots found no horizontal
	overflow. The current sample plan stayed unchanged, evidence details were
	retained, and natural browser sizing was restored.

## Cached AI Insights and model comparison

The recruiter Insights path now uses real precomputed model output for its exact
synthetic history, with no live inference request during a visit. This supersedes
the earlier live-only delivery behavior without changing the priority-ordered
plan adjustment below. Details are in [Insights caching](INSIGHTS_CACHING.md).

- Live, cache-disabled model comparison: Qwen3 8B passed 5/5 cases; Llama 3.1 8B
	passed 4/5 and returned invalid comparisons on the improving-history case.
	Median latencies were 12.086 and 11.531 seconds respectively. One repeat per
	case is exploratory acceptance, not a reliability guarantee.
- Once the key was configured privately, live Groq testing exposed an unsupported
	`uniqueItems` schema keyword. The adapter now omits it only from the provider
	payload; local duplicate-ID validation remains intact. Scheduling passed after
	the fix. The first burst then passed four requests and hit six HTTP 429 limits.
	Focused follow-up passed the later-corroboration counterexample, but improving
	history returned `json_validate_failed`. Four of five distinct cases have passed;
	the full two-repeat suite has not. Valid hosted responses took 0.282-1.698 seconds
	(0.500-second median), excluding rejected requests. See the
	[hosted report](docs/insights-hosted-benchmark.json).
- The benchmark now stops at the first quota rejection, records only safe error
	codes and rate-limit headers, and separates failed requests from latency results.
	Focused mocked checks cover stop-on-quota, selected cases, privacy and the schema
	compatibility fix. The real local-model demo artifact was regenerated and
	verified after the adapter source changed; model routing and key contents were
	left unchanged. No paid upgrade was performed.
- The demo artifact was produced by actual Llama 3.2 3B scheduling selection and
	Qwen3 8B discovery calls on September 14. Stored raw model proposals were
	replayed through the current verifier before writing. Source versions, exact
	inputs, provenance and valid contracts are checked by the demo build; a
	separate verification command rejects altered results and model proposals.
- With Insights API requests blocked, three browser refreshes completed in
	44-74 ms and made zero Insights requests. Both cards remained AI-generated,
	with precomputed delivery, model and generation time in their evidence details.
- Desktop 1280px and mobile 390px checks and screenshots found no horizontal
	overflow in the evidence, provenance or preview. Confirmation was reachable.
	Preview/cancel preserved the plan. Confirmation changed only the two easy
	runs; refresh and the alternate review entry point could not repeat the cut.
	Current-week workouts stayed fixed. The test confirmation was reset and the
	natural viewport restored, leaving a fresh unconfirmed preview.
- A real backend discovery generation took 8.66 seconds; its exact-context
	cache hit took 4.8 ms with the same freshly verified finding. Cache regressions
	cover owner isolation, full-history/model/verifier invalidation, expiry, bounded
	eviction, safe copies, coalesced requests, no cached transport/malformed
	failures, valid no-findings, new discomfort and account-cleanup eviction.
- All 609 backend safety assertions, focused cache/provider/artifact tests,
	demo/discovery frontend regressions, TypeScript, targeted lint, editor
	diagnostics, five native behavior-contract tests and the standalone demo
	build passed. Hosted adapter tests use a mocked SDK and are not live evidence.
- The full frontend smoke command stopped at
	[the existing busy-week assertion](frontend/scripts/smoke-plan-adjuster.ts#L139):
	`very busy week should exercise the low-priority drop path`. That test and
	planner were not changed by this cache work; later full-suite steps did not run.
- No paid provider or public deployment was enabled. General personal caching is
	currently single-worker/process-local; shared deletion invalidation is required
	before a multi-worker rollout. Today and live intake still need the backend.

## Priority-ordered recovery review

This is the current adjustment policy. It supersedes both the simultaneous
workout-type changes and the uniform duration cuts recorded below. The order is
easy-run pace/mileage, long-run pace, speed-workout pace/mileage, then long-run
mileage. Only the first feasible priority is proposed; workout types are retained.

- The sample uses priority 1: Monday and Friday easy runs change from 45 to 40
	minutes and 4.5 to 4 miles. The 45-minute interval workout and 120-minute long
	run remain exactly unchanged, including pace and mileage. Totals are 255 to
	245 minutes and 27 to 26 miles.
- Regression tests exercise all four priorities, including easy pace before
	long-run pace, long-run pace before speed work, and speed work before long-run
	mileage. They cover unchanged types, duration floors, missing pace references,
	non-finite/missing/non-positive pace rejection, the persistent-recovery gate
	for last-priority mileage, race protection, and stale/tampered confirmation.
- Pace-only tests preserve mileage and update the time estimate for slower
	running. No adjustment increases mileage or prescribed speed. A longer time
	estimate is not represented as a volume reduction or proven recovery benefit.
- Browser checks verified both preview entry points and cancel without mutation.
	Insights confirmation produced exactly 40/45/40/120 minutes with the interval
	and long-run types intact, preserved the current week, and blocked repeat
	application through either review path. Unit tests preserve every later week.
- Desktop (1280px) and mobile (390px) preview checks and screenshots passed with
	no horizontal overflow; confirmation was reachable. The test confirmation was
	reset, natural browser sizing restored, and a fresh easy-only preview left
	unconfirmed. Other open sample sessions were untouched.
- A live discovery request returned unavailable without changing the plan;
	one retry returned a supported Ollama result and enabled the verified preview.
	Discovery settings and recovery-score calculation were not changed.
- Discovery/demo regressions, TypeScript, targeted lint, editor diagnostics and
	the standalone demo production build passed. The priority order and numerical
	limits are prototype training rules, not validated physiological prescriptions.

## Workout-type-aware recovery review

This intermediate version replaced the duration-only adjustments recorded in
the earlier discovery acceptance below. It is superseded by the priority-ordered
review above. The LLM discovery and recovery-score calculation were unchanged.

- The persistent-fatigue sample proposed 40-minute easy runs, a 35-minute
	easy replacement for intervals, and a 100-minute long run: 255 to 215 minutes
	and 27 to 22 miles. The interval target pace changes from 7:56/mi to the existing
	9:46/mi easy pace. Each preview shows type, duration, distance, pace and reason.
- Regression checks cover easy, tempo, intervals, and long runs; lighter evidence
	preserving the long run; no-action evidence; different initial durations;
	duration floors; missing easy-pace references; race-week protection; no increases
	in distance/duration/intensity; and tampered confirmation rejection. Existing
	current/later-week and stale-discovery safeguards remain in place.
- Browser checks verified both review entry points, cancel without mutation,
	exact confirmed workout types/durations, current-week preservation, and blocked
	repeated application through either review path. The user's previously accepted
	duration-only plan was left intact in the original tab; verification used a
	fresh sample.
- A live discovery request initially returned unavailable and left the plan
	unchanged. After explicitly warming the configured Qwen model, discovery and
	confirmation passed. No inference settings or thresholds were changed.
- Demo/discovery regressions, TypeScript, targeted lint and standalone demo
	production build passed. Reduction scales remain prototype training rules,
	not clinical injury-prevention recommendations.

## Training-response discovery and easier-week review

The initial acceptance below used uniform easy/quality duration cuts. The
priority-ordered review above supersedes those before/after values.

This is the current second Insights example, superseding the fixed comparisons
and intensity-preference examples recorded below. Details and limitations are in
[training-response discovery](TRAINING_RESPONSE_DISCOVERY.md).

- The LLM proposes metric/group/direction comparisons from the first four weeks
	of a canonical 24-session synthetic history, without candidate finding IDs or
	the intended conclusion. The final two weeks are withheld from its prompt and
	used by code for corroboration. The long-run card projects six records from
	the same history; both views agree on dates and outcomes.
- Both installed 8B models produced the verified effort/fatigue concern. Warm
	diagnostic inference took 6.098 seconds for Qwen and 13.722 seconds for Llama
	3.1. Qwen is configured for discovery only; other model assignments are unchanged.
	The 3B model failed open-comparison generation in the recorded trials.
- Live endpoint acceptance repeated the supported result twice at 6.119 and
	6.081 seconds. Flat data returned no finding; improving data returned a supported
	improvement with no easing review; disagreement in the later window rejected
	the trend. The verifier discarded unsupported pace hypotheses in these runs.
- Cold/contended requests also timed out during testing and returned unavailable,
	with no substitute finding or plan mutation. Startup warmup is non-fatal and
	was added; it does not guarantee that future local requests cannot time out.
- Browser review and cancel preserved the plan. Confirmation applied exactly
	255 to 240 minutes and 27 to 25.5 miles in week 2: three 45-minute sessions
	became 40 minutes, while the 120-minute long run stayed unchanged. Current-week
	workouts and the recovery score stayed unchanged. Unit checks also preserve
	every later week and reject stale/tampered previews.
- Refreshing analysis did not permit a second reduction, and the other weekly
	review path was blocked after apply. Subsequently confirming the Saturday
	preference retained the reviewed volume reduction and did not reopen it.
- Desktop (1280px) and mobile (390px) evidence/confirmation views had no horizontal
	overflow. All 24 records were inspectable; one schedule miss and two recovery
	misses were labeled distinctly. Test confirmations were reset and natural
	browser sizing restored, leaving a fresh discovery ready for review.
- Discovery and demo regressions, full frontend smoke, 609 shared backend safety
	assertions, 14 product journeys, TypeScript, targeted lint, full app production
	build and standalone demo build passed. Software checks are not clinical
	validation or evidence of observed runner benefit.

## Recovery update

The deterministic recovery calculation now uses prior-only personal HRV/RHR
variability alongside sleep and self-reports. The demo's 30 prior readings are
explicitly synthetic; its tired scenario now rounds to 75 rather than 70.
See [recovery scoring](RECOVERY_SCORING.md) for research sources, exact prototype
weights and limits. These checks establish software behavior, not clinical validity.

- Recovery regression and demo checks pass, including an isolated RHR change.
- 1,733 executable frontend/backend scoring cases match; seven invalid API
	summary inputs are rejected. RHR and persistent-RHR explanations are checked.
- Full frontend smoke suite, TypeScript and targeted UI lint pass.
- Backend deterministic gates pass: 20 groups / 609 assertions. Additional
	round-trip smoke and all 14 scripted product journeys pass.
- All 12 native Today contract tests pass, including prior-only variability
	and cross-platform request-fixture parity.
- Full application and isolated recruiter-demo production builds pass.
- Live browser keyboard checks show 95/recovered, 75/fatigued and 49/at-risk
	for the three scenarios, matching the API. The tired scenario includes the
	RHR factor. Natural browser sizing and the existing unconfirmed week preview
	were preserved.
- An isolated live request changing only RHR from 52 to 58 bpm, with a 52 bpm
	baseline and 2 bpm SD, changes 100 to 96 and returns the corresponding RHR
	explanation. This is a deterministic behavior check, not clinical evidence.

## Earlier compact selection and contextual response

This records the previous fixed, read-only comparison. It superseded the blanket
intensity-preference example below and is itself superseded by discovery above.

- Both model calls now use JSON schemas restricted to supported IDs, 256 output
	tokens and a 15-second deadline. Model-authored explanation text is no longer
	requested or accepted; server-owned evidence, confidence and actions remain
	unchanged by selection/ranking.
- Three consecutive live request pairs (six calls) reported `source=ollama`,
	`fallback_used=false`, `failure=none`. Observed per-call latency was
	0.295-1.143 seconds on the local warm model. This is local acceptance, not a
	public-service latency guarantee.
- The second card now shows a read-only recovery/effort observation: 7.5/10
	average effort across four lower-recovery easy runs versus 3.5/10 across four
	higher-recovery easy runs. All eight sessions are explicitly synthetic,
	accepted and completed. Counts and averages come from returned evidence facts.
- A balanced 4-too-hard/4-accepted adjustment history no longer produces an
	intensity preference. Regression checks cover relevant denominators, limited
	confidence, missing inputs, duplicate days, rejected recommendations, sparse
	groups and absent contrasts.
- Browser verification confirmed both live source labels, correct group counts,
	eight supporting rows, no preference-confirmation controls on the observation,
	and unchanged current/upcoming weeks. Expanded evidence has no horizontal
	overflow at 1280px and 390px; normal browser sizing was restored.
- Focused selection and response regressions, 609 shared backend assertions,
	all 14 product journeys, seven native pattern-analysis tests, frontend contract
	tests, TypeScript, targeted lint and the isolated demo build pass. Generation
	tests verify per-call token limits reach Ollama without changing other calls.

## Earlier intensity-preference verification

The following records the previous example and its fallback diagnosis. Its
blanket preference and mixed-feedback copy are replaced by the contextual
read-only observation above.

The second insight now demonstrates `adjustment_tolerance`, replacing the
weekday-skipping example. Four of eight synthetic adjustment responses explicitly
reject a suggestion as too hard; the other four accept it. The original eight
long-run outcomes remain unchanged. No inferred physiological tolerance or
learned recovery weighting is claimed.

- The current endpoint returns both `long_run_day_preference` and
	`adjustment_tolerance`, without `specific_day_skips`. The observed calls used
	`source=deterministic`, `fallback_used=true`, `failure=malformed_ai`; the UI
	labels these as fallback. Successful live-model acceptance is not established
	for this revised pair by these runs.
- Cancel and dismiss remain isolated. Confirmation uses the shared confirmed
	preference builder and reaches `POST /decision` as `intensity_tolerance`,
	without feedback prose. The calendar, training-day preferences and recovery
	score are unchanged. Applying the long-run preference retains the intensity
	preference; Reset clears both.
- With 60 minutes available, live decision comparisons show the existing 0.05
	increase in the `modify` candidate score for steady/tired scenarios, with no
	change to the rest candidate. The at-risk scenario has no score or selected
	action change. All three sample selected actions happen to remain the same;
	the UI does not claim a workout change just because a preference was saved.
- Demo regressions, behavior-result contract checks, TypeScript, targeted lint
	and the standalone demo build pass. Browser checks verify the non-scheduling
	review, request isolation, confirmation, reset, and no horizontal overflow at
	1280px and 390px. Test viewport overrides were cleared.

## Earlier scheduling insight verification

The following records the previous two-schedule-pattern version. Its second
example is superseded by the workout-intensity insight above; race-week and
long-run preference safeguards remain applicable.

- Sleep baseline display rounds to one decimal (`7.6 h`) without changing the
	underlying recovery calculation. The extra eight-outcome introduction is removed.
- The live Ollama endpoint returned both `long_run_day_preference` and
	`specific_day_skips` from sixteen synthetic events, with `fallback_used=false`.
	Each observation cites four supporting outcomes. The UI keeps the eight
	long-run rows separate from the eight weekday rows and displays actual counts.
- Browser checks verified independent cancellation/dismissal, editable-day
	validation, and sequential confirmations. Weekday-first then long-run review
	preserves both Thursday sessions and Saturday long runs. The current week is
	unchanged, and the all-weeks preview identifies all seven remaining weeks.
- A regression caught the old shared remapper moving Sunday's race to Saturday.
	Race weeks are now fixed and each other week is remapped independently. Tests
	verify six changed training weeks, race/current-week preservation, unchanged
	mileage/phase, stale previews, later-week-only changes, no-change preference
	persistence, and unsafe-spacing rejection.
- Full frontend smoke, TypeScript, targeted ESLint, and the isolated demo build
	pass. Desktop (1280px) and mobile (390px) expanded previews have no horizontal
	overflow; weekday labels have 44px touch targets. Test-browser sizing was
	restored after screenshots.

## Live-model acceptance

These checks used the installed `llama3.2:3b` Ollama model with `KINETIC_AI_MODE=local_ollama`. They are intentionally separate from deterministic fallback and scripted product gates.

- Live intake regression: 7/7 cases passed through `POST /ai/parse-intake`; every result reported `source=ollama`, `fallback_used=false`. Observed latency was 0.385–2.509 seconds.
- Live recruiter intake: the travel/long-run request returned three grounded changes, passed product validation, rendered a read-only calendar preview, and changed the sample week only after confirmation.
- Live behavior analysis: `POST /behavior-insights` reported `source=ollama`, `fallback_used=false`, and selected the deterministically supported high-confidence `long_run_day_preference` for Saturday from four completed Saturday long runs.
- Confirmed insight effect: shared planning logic moved the Sep 14–20 long run from Sunday to Saturday while preserving 27 miles, 255 minutes, workout types, phase, taper, and the current week.

## Deterministic and fallback gates

- `python -m evals.run_product_evals --check`: 14/14 scripted product journeys passed, including malformed, ungrounded, unavailable-model, and deterministic fallback behavior.
- `npm run smoke`: the full frontend smoke suite passed, including plan safety, Today, intake validation/regressions, behavior contracts, persistence isolation, and weekly recalibration.
- `npm run demo:check`: fixed marathon block, recovery state, bounded evidence, preferred-day planning, and confirmed recalibration passed.
- The deterministic Today endpoint honored caller-authoritative availability. A 30-minute input rendered the endpoint's final 30-minute workout rather than the pre-feasibility action description.

## Build and browser verification

- `npm run build -- --webpack`: passed for the full application.
- `npm run demo:build`: passed for the isolated static artifact; `demo-out/demo/index.html` and both athletic photographs were present.
- Targeted ESLint and `tsc --noEmit`: passed without warnings.
- Desktop browser flow: `POST /decision`, `POST /ai/parse-intake`, and `POST /behavior-insights` returned HTTP 200; browser error log was empty.
- Simulated endpoint failures showed no substitute recommendation or preview, preserved state, and recovered through Retry after the route was restored.
- Reset restored the isolated sample, and confirmation controls disappeared after a successful apply, preventing repeated confirmation.
- Mobile viewport (390 × 844): Today, Your week, and Insights rendered without horizontal overflow (`scrollWidth=innerWidth=390`). The fixed navigation remained usable and the compact header no longer clipped Reset.
- Axe WCAG A/AA audit: 0 violations. One contrast check remained automated-incomplete because the Insights hero uses a gradient; its light text on the dark hero was visually reviewed.

## Release boundary

The complete experience requires a live API plus an inference provider. The repository contains a local working preview and a verified static frontend artifact, but no public deployment was created.
