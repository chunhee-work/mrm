/** When PHOTO_WORKER=on the on-site model names photos. Claude runs only if that worker is down or it reports failure. */

export function photoWorkerOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.PHOTO_WORKER === "on";
}
export function photoFallbackOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.PHOTO_WORKER_FALLBACK !== "off";
}

export function namingOwner(i: { photoWorker: boolean; workerOnline: boolean; pending: number; workerFailed: number; fallback: boolean }): "worker" | "claude" {
  if (!i.photoWorker) return "claude";
  if (!i.workerOnline && i.fallback) return "claude";
  if (i.pending === 0 && i.workerFailed > 0 && i.fallback) return "claude";
  return "worker";
}
