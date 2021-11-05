import { readdirSync, statSync } from "node:fs";
import path from "node:path";

export function rearrange<T>(numContainer: number, items: T[], cb: (items: T[]) => void) {
  if (items.length < numContainer) {
    items.forEach((x) => cb([x]));
    return;
  }
  const avg = Math.floor(items.length / numContainer);
  const mod = items.length % numContainer;
  for (let i = 0; i < numContainer; i++) {
    const start = i * avg;
    const slicedItems = items.slice(start, start + avg);
    if (mod > 0 && i < mod) {
      slicedItems.push(items[items.length - mod + i]);
    }
    cb(slicedItems);
  }
}
