export type PersistenceMirror = (storageKey: string) => void;

let activeMirror: PersistenceMirror | null = null;

export function registerPersistenceMirror(
  mirror: PersistenceMirror | null,
): () => void {
  activeMirror = mirror;
  return () => {
    if (activeMirror === mirror) activeMirror = null;
  };
}

/**
 * Notify the optional remote adapter after a synchronous localStorage write.
 * Storage modules depend only on this tiny dispatcher, so importing them in
 * smoke tests never initializes Firebase.
 */
export function mirrorLocalStorageKey(storageKey: string): void {
  activeMirror?.(storageKey);
}
