export type FormState =
  | { ok?: boolean; error?: string; fieldErrors?: Record<string, string[] | undefined> }
  | undefined;
