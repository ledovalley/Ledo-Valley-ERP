// Delete password: a simple shared code asked for before anything is deleted,
// so nothing is removed by mistake when someone is in a hurry.
// It is a safety catch, not a security measure: logins and roles still decide
// who may delete at all.
//
// Default "2222". To change it without editing code, set DELETE_PASSWORD in the
// Vercel environment variables and redeploy. It is checked on the server only,
// so it never appears in the browser's code.

const DEFAULT_DELETE_PASSWORD = '2222';

export function checkDeletePassword(password: unknown): string | null {
  const expected = (process.env.DELETE_PASSWORD || DEFAULT_DELETE_PASSWORD).trim();
  if (String(password ?? '').trim() !== expected) {
    return 'Incorrect delete password. Nothing was deleted.';
  }
  return null;
}
