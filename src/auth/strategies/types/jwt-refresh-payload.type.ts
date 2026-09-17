export type JwtRefreshPayloadType = {
  sessionId: string | number;
  hash: string;
  iat: number;
  exp: number;
};
