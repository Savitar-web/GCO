/** Game snapshots contain only JSON data; this fallback supports older Safari. */
export function clonePlain<T>(value:T):T{return typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value)) as T}
