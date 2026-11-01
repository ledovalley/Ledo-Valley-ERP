/**
 * Resolve a user's role securely.
 * Only app_metadata.role is trusted: it can be changed only with the service-role
 * key (server side). user_metadata can be edited by the user from the browser, so
 * it is never used for permissions.
 */
export function getUserRole(user: any): string {
  const role = user?.app_metadata?.role;
  if (typeof role === 'string' && role.trim()) {
    return role.toLowerCase().trim();
  }
  return 'employee';
}
