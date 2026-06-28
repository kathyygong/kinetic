import type { LearnedPreference, RecommendationEvent } from "@/lib/behaviorTypes";
import {
  clearDismissedPreferences,
  clearLearnedPreferences,
  dismissPreference,
  listDismissedPreferenceIds,
  listLearnedPreferences,
  listRecommendationEvents,
  removeLearnedPreference,
  restoreDismissedPreference,
  saveLearnedPreference,
} from "@/lib/behaviorStorage";

export interface BehaviorRepository {
  listEvents(): RecommendationEvent[];
  listConfirmedPreferences(): LearnedPreference[];
  listDismissedPatternIds(): string[];
  confirmPreference(preference: LearnedPreference): void;
  removeConfirmedPreference(id: string): void;
  dismissPattern(id: string): void;
  restorePattern(id: string): void;
  clearMemory(): void;
}

/**
 * Synchronous local facade. The persistence mirror registered by
 * PersistenceBoundary asynchronously copies every mutation to the signed-in
 * user's Firestore documents.
 */
export const behaviorRepository: BehaviorRepository = {
  listEvents: listRecommendationEvents,
  listConfirmedPreferences: listLearnedPreferences,
  listDismissedPatternIds: listDismissedPreferenceIds,
  confirmPreference(preference) {
    restoreDismissedPreference(preference.id);
    saveLearnedPreference(preference);
  },
  removeConfirmedPreference: removeLearnedPreference,
  dismissPattern: dismissPreference,
  restorePattern: restoreDismissedPreference,
  clearMemory() {
    clearLearnedPreferences();
    clearDismissedPreferences();
  },
};
