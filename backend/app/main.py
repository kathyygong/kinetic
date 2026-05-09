"""Run a few illustrative Kinetic decision scenarios."""

from .types import Biometrics, TrainingContext, Constraints, DecisionOutput
from .decision_engine import make_decision


def _print_decision(title: str, decision: DecisionOutput) -> None:
    print(f"\n=== {title} ===")
    print(f"  state            : {decision.state}")
    print(f"  recovery_score   : {decision.recovery_score:.3f}")
    print(f"  selected_action  : {decision.selected_action.name}")
    print(f"  final_workout    : {decision.final_workout}")
    print(f"  confidence       : {decision.confidence:.3f}")
    print(f"  key_factors      : {decision.key_factors}")
    print(f"  scores           : {decision.scores}")
    print( "  alternatives     :")
    for alt in decision.alternatives:
        print(f"    - {alt.name}: {alt.description}")
    print( "  decision_trace   :")
    for step in decision.decision_trace:
        print(f"    - {step}")


def main() -> None:
    # 1) Normal day: well rested, plenty of time.
    normal = make_decision(
        biometrics=Biometrics(hrv=65, hrv_baseline=65, sleep_hours=8.0, resting_hr=58),
        training_context=TrainingContext(
            planned_workout="60 min tempo run",
            recent_workouts=["easy run", "rest", "long run"],
        ),
        constraints=Constraints(available_minutes=75),
    )
    _print_decision("Scenario 1: Normal day", normal)

    # 2) Poor sleep: low HRV + short sleep -> at-risk.
    poor_sleep = make_decision(
        biometrics=Biometrics(hrv=40, hrv_baseline=65, sleep_hours=4.5, resting_hr=74),
        training_context=TrainingContext(
            planned_workout="60 min intervals",
            recent_workouts=["intervals", "long run"],
        ),
        constraints=Constraints(available_minutes=60),
    )
    _print_decision("Scenario 2: Poor sleep", poor_sleep)

    # 3) Limited time: recovered but only 25 minutes available.
    limited_time = make_decision(
        biometrics=Biometrics(hrv=63, hrv_baseline=65, sleep_hours=7.5, resting_hr=60),
        training_context=TrainingContext(
            planned_workout="60 min easy run",
            recent_workouts=["tempo", "rest"],
        ),
        constraints=Constraints(available_minutes=25),
    )
    _print_decision("Scenario 3: Limited time", limited_time)


if __name__ == "__main__":
    main()
