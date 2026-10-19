import { z } from "zod";

/** A person who works the queue (`GET /api/users`): a reviewer takes the first line, a manager the escalations. */
export const userSchema = z.object({
  id: z.number(),
  name: z.string(),
  role: z.enum(["REVIEWER", "MANAGER"]),
});

export type User = z.infer<typeof userSchema>;

/** `J. Novák` → `JN` */
export const initials = (name: string) =>
  name
    .split(/[\s.]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
    .slice(0, 2);

export const ROLE_LABEL: Record<User["role"], string> = {
  REVIEWER: "Reviewer",
  MANAGER: "Manager",
};

const KEY = "aml.user";

/** The user picked in the header, remembered in this browser; null when none was picked or storage is blocked. */
export function savedUser(): User | null {
  try {
    const parsed = userSchema.safeParse(JSON.parse(localStorage.getItem(KEY) ?? "null"));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveUser(user: User) {
  try {
    localStorage.setItem(KEY, JSON.stringify(user));
  } catch {
    // Storage blocked (private window, policy): the choice just isn't remembered.
  }
}

/** Goes with every call to the engine, so it knows who acted. */
export function userHeaders(): Record<string, string> {
  const user = savedUser();
  return user ? { "X-User-Id": String(user.id) } : {};
}

export async function fetchUsers(signal?: AbortSignal): Promise<User[]> {
  const res = await fetch("/api/users", { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`/api/users: HTTP ${res.status}`);
  return z.array(userSchema).parse(await res.json());
}
