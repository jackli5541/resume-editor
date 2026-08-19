export function createProposalSelection(changes = []) {
  return changes.map(() => true);
}

export function setProposalDecision(selection, index, accepted) {
  if (!Array.isArray(selection) || !Number.isInteger(index) || index < 0 || index >= selection.length) return selection;
  selection[index] = Boolean(accepted);
  return selection;
}

export function selectedProposalChanges(changes = [], selection = []) {
  return changes.filter((_, index) => selection[index] !== false);
}
