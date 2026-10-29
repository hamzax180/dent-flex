/** Read a secret from the environment, ignoring stray whitespace/newlines from copy-paste. */
export const secret = (name: string): string | undefined => process.env[name]?.trim() || undefined;
