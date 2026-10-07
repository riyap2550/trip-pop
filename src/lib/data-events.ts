type Listener = () => void;

const listeners = new Set<Listener>();

/** Tell every screen that trips or deals changed (after an edit or chat), so open screens reload. */
export const emitDataChanged = () => listeners.forEach((listener) => listener());

export function onDataChanged(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
