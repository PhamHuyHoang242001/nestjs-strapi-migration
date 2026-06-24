/**
 * Signals that a transform-file request lacks a usable auth token and the
 * browser user should be sent to the login page instead of receiving a JSON
 * 401. Carries the absolute login URL (with a return `url` query param).
 *
 * Thrown by TransformFileAuthGuard, caught by TransformFileAuthRedirectFilter.
 */
export class TransformFileAuthRedirectException extends Error {
  constructor(public readonly url: string) {
    super('transform_file_auth_redirect');
  }
}
