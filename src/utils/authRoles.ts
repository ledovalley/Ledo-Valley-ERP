/**
 * Helper to securely resolve user role.
 * Priority: app_metadata.role (service-role managed, unalterable by client)
 * Fallback: user_metadata.role (for backwards compatibility during migration)
 */
export function getUserRole(user: any): string {
  if (!user) return 'employee';
  
  const appRole = user.app_metadata?.role;
  if (appRole && typeof appRole === 'string' && appRole.trim()) {
    return appRole.toLowerCase().trim();
  }
  
  const metaRole = user.user_metadata?.role;
  if (metaRole && typeof metaRole === 'string' && metaRole.trim()) {
    return metaRole.toLowerCase().trim();
  }
  
  return 'employee';
}

