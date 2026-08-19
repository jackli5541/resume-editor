export function dragAutoScrollSpeed(pointerY, { top = 0, bottom, edgeSize = 96, maxSpeed = 22 } = {}) {
  if (![pointerY, top, bottom, edgeSize, maxSpeed].every(Number.isFinite) || bottom <= top || edgeSize <= 0 || maxSpeed <= 0) return 0;
  const usableEdge = Math.min(edgeSize, (bottom - top) / 2);
  if (pointerY < top + usableEdge) {
    return -maxSpeed * Math.min(1, Math.max(0, (top + usableEdge - pointerY) / usableEdge));
  }
  if (pointerY > bottom - usableEdge) {
    return maxSpeed * Math.min(1, Math.max(0, (pointerY - (bottom - usableEdge)) / usableEdge));
  }
  return 0;
}
