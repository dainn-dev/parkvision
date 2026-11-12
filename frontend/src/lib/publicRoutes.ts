export type PublicViewType =
  | 'landing'
  | 'download'
  | 'login'
  | 'register'
  | 'privacy'
  | 'terms'
  | 'sla'
  | 'activate'
  | 'reset-password'
  | 'find-car';

export const PUBLIC_ROUTES: Record<PublicViewType, string> = {
  landing: '/',
  download: '/download',
  login: '/login',
  register: '/register',
  privacy: '/privacy',
  terms: '/terms',
  sla: '/sla',
  activate: '/activate',
  'reset-password': '/reset-password',
  'find-car': '/find-my-car',
};

const VIEW_BY_PATH: ReadonlyMap<string, PublicViewType> = new Map(
  (Object.entries(PUBLIC_ROUTES) as [PublicViewType, string][]).map(([view, path]) => [path, view]),
);

export function viewFromPath(pathname: string): PublicViewType {
  const normalized = pathname.toLowerCase().replace(/\/+$/, '') || '/';
  return VIEW_BY_PATH.get(normalized) ?? 'landing';
}

/**
 * Signed-in users leave any public path for the workspace root, except an admin
 * previewing the public site, who must be able to navigate it freely.
 */
export function shouldResetToLanding(args: {
  isAuthenticated: boolean;
  isPreviewing: boolean;
  pathname: string;
}): boolean {
  return args.isAuthenticated && !args.isPreviewing && args.pathname !== PUBLIC_ROUTES.landing;
}
