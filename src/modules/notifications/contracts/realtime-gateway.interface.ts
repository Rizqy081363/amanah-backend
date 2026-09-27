export abstract class RealtimeGatewayPort {
  abstract emitToUser(
    userId: string,
    event: string,
    payload: unknown,
  ): Promise<boolean>;
  abstract getConnectedUserCount(): number;
  abstract isUserOnline(userId: string): boolean;
}
