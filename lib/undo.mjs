export function snapshotForUndo(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

export function restoreUndoSnapshot(snapshot) {
  return snapshotForUndo(snapshot);
}
