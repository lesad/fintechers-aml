/** Kebab-case each dot-separated segment; join back with dots. Idempotent. */
export function kebab(segment: string): string {
  return segment
    .split(".")
    .filter(Boolean)
    .map((part) => part.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase())
    .join(".");
}

/** Compose a dotted id `${prefix}.${local}`, each part kebab-cased. Used by the scope escape hatch. */
export function deriveTestId(prefix: string | undefined, local: string): string {
  const localId = kebab(local);
  const prefixId = prefix ? kebab(prefix) : "";
  return prefixId ? `${prefixId}.${localId}` : localId;
}
