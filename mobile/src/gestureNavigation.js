const BACK_EDGE_WIDTH = 36;
const BACK_START_DISTANCE = 22;
const BACK_FINISH_DISTANCE = 76;

export function shouldStartBackSwipe(gesture, canGoBack) {
  return Boolean(canGoBack)
    && Number(gesture?.x0) <= BACK_EDGE_WIDTH
    && Number(gesture?.dx) >= BACK_START_DISTANCE
    && Number(gesture?.dx) > Math.abs(Number(gesture?.dy)) * 1.4;
}

export function shouldFinishBackSwipe(gesture) {
  return Number(gesture?.dx) >= BACK_FINISH_DISTANCE
    && Number(gesture?.dx) > Math.abs(Number(gesture?.dy)) * 1.2;
}
