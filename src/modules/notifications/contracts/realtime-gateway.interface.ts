export abstract class RealtimeGatewayPort {
  abstract emitToUser(
    userId: string,
    event: string,
    payload: unknown,
  ): Promise<boolean>;
  abstract emitToRole?(
    roleName: string,
    event: string,
    payload: unknown,
  ): Promise<boolean>;
  abstract emitToRoom?(
    roomName: string,
    event: string,
    payload: unknown,
  ): Promise<boolean>;
  abstract getConnectedUserCount(): number;
  abstract isUserOnline(userId: string): boolean;
  abstract isRoleOnline?(roleName: string): boolean;
}
