/** The authenticated user attached to the request by AuthGuard. */
export interface AuthUser {
  id: string;
  email: string;
}

/** Claims in the access token. `sub` is the user id. */
export interface AccessTokenPayload {
  sub: string;
}
