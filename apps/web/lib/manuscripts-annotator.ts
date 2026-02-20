export interface ImageMetrics {
  naturalWidth: number;
  naturalHeight: number;
  displayWidth: number;
  displayHeight: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function normalizeDragRect(start: { x: number; y: number }, current: { x: number; y: number }): Rect {
  return {
    x: Math.min(start.x, current.x),
    y: Math.min(start.y, current.y),
    w: Math.abs(current.x - start.x),
    h: Math.abs(current.y - start.y),
  };
}

export function imageRectToDisplayRect(rect: Rect, metrics: ImageMetrics): Rect {
  return {
    x: (rect.x / metrics.naturalWidth) * metrics.displayWidth,
    y: (rect.y / metrics.naturalHeight) * metrics.displayHeight,
    w: (rect.w / metrics.naturalWidth) * metrics.displayWidth,
    h: (rect.h / metrics.naturalHeight) * metrics.displayHeight,
  };
}

export function displayRectToImageRect(rect: Rect, metrics: ImageMetrics): Rect {
  return {
    x: Math.round((rect.x / metrics.displayWidth) * metrics.naturalWidth),
    y: Math.round((rect.y / metrics.displayHeight) * metrics.naturalHeight),
    w: Math.round((rect.w / metrics.displayWidth) * metrics.naturalWidth),
    h: Math.round((rect.h / metrics.displayHeight) * metrics.naturalHeight),
  };
}

export function upsertRegion<T extends { id: string }>(regions: T[], region: T): T[] {
  const idx = regions.findIndex((item) => item.id === region.id);
  if (idx === -1) return [...regions, region];
  const next = [...regions];
  next[idx] = region;
  return next;
}

export function deleteRegionById<T extends { id: string }>(regions: T[], regionId: string): T[] {
  return regions.filter((region) => region.id !== regionId);
}
