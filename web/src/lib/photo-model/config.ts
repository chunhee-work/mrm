// Committed settings of the photo-model service (plan chunhee-work/mrm#26). Numbers come from the dry run, not from guesses.
// While `measuredFor` is null the feature stays OFF whatever the environment says: nothing has been measured yet.
export const photoModelConfig = {
  /** Set after the dry run: which Space revision (commit sha of the model repo) the numbers below were measured for. */
  measuredFor: null as string | null,
  maxPhotos: 120, // more than this: "name by hand" (set from the measured run time)
  submitWindowS: 20 * 60, // how long a job may wait to be accepted by the Space (it may be asleep)
  runWindowS: 40 * 60, // how long the Space may take once accepted
  leaseS: 90, // one submit attempt at a time
  healthTimeoutMs: 8_000,
  submitTimeoutMs: 120_000,
  statusTimeoutMs: 10_000,
  maxSubmitAttempts: 30,
} as const;

/** OFF unless PHOTO_MODEL_ENABLED is exactly "1" AND the dry run has set measuredFor. Unset or invalid = OFF. */
export function photoModelOn(env = process.env, cfg = photoModelConfig): boolean {
  return env.PHOTO_MODEL_ENABLED === "1" && !!cfg.measuredFor && !!env.PHOTO_MODEL_URL && !!env.PHOTO_MODEL_SECRET && !!env.HF_SPACE_TOKEN;
}
