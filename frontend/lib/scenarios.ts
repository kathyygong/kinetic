// Demo scenarios for Kinetic.
// Each one mirrors the backend `/decision` request body exactly:
//   { biometrics, training_context, constraints }

export type Biometrics = {
  hrv: number;
  hrv_baseline: number;
  sleep_hours: number;
  resting_hr: number;
  // Optional self-reports (1=best..5=worst), captured on the Recovery
  // page. Backend folds these into recovery-state estimation when
  // present so the final decision reacts to how the athlete feels.
  fatigue_level?: number;
  soreness_level?: number;
};

export type TrainingContext = {
  planned_workout: string;
  recent_workouts: string[];
};

export type Constraints = {
  available_minutes: number;
};

export type Scenario = {
  id: "normal_day" | "poor_sleep" | "busy_day";
  label: string;
  description: string;
  biometrics: Biometrics;
  training_context: TrainingContext;
  constraints: Constraints;
};

export const scenarios: Scenario[] = [
  {
    id: "normal_day",
    label: "Normal day",
    description: "Good HRV, good sleep, moderate time available.",
    biometrics: {
      hrv: 65,
      hrv_baseline: 65,
      sleep_hours: 8,
      resting_hr: 58,
    },
    training_context: {
      planned_workout: "60 min interval run",
      recent_workouts: ["easy run", "rest", "long run"],
    },
    constraints: {
      available_minutes: 75,
    },
  },
  {
    id: "poor_sleep",
    label: "Poor sleep",
    description: "Low HRV vs baseline and short sleep before a hard session.",
    biometrics: {
      hrv: 42,
      hrv_baseline: 65,
      sleep_hours: 4.5,
      resting_hr: 72,
    },
    training_context: {
      planned_workout: "60 min interval run",
      recent_workouts: ["intervals", "long run"],
    },
    constraints: {
      available_minutes: 60,
    },
  },
  {
    id: "busy_day",
    label: "Busy day",
    description: "Decent recovery but very limited time to train.",
    biometrics: {
      hrv: 60,
      hrv_baseline: 65,
      sleep_hours: 7,
      resting_hr: 60,
    },
    training_context: {
      planned_workout: "60 min easy run",
      recent_workouts: ["tempo", "rest"],
    },
    constraints: {
      available_minutes: 20,
    },
  },
];

export const scenariosById = Object.fromEntries(
  scenarios.map((s) => [s.id, s])
) as Record<Scenario["id"], Scenario>;
