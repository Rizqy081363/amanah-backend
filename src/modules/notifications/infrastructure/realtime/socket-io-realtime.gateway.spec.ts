import { describe, expect, it, mock, beforeEach } from 'bun:test';
import { SocketIoRealtimeGateway } from './socket-io-realtime.gateway';

describe('SocketIoRealtimeGateway', () => {
  let gateway: SocketIoRealtimeGateway;
  let mockJwtService: any;
  let mockConfigService: any;
  let mockServer: any;

  beforeEach(() => {
    mockJwtService = {
      verifyAsync: mock(),
    };
    mockConfigService = {
      getOrThrow: mock(() => 'jwt-test-secret'),
    };
    mockServer = {
      to: mock(() => ({
        emit: mock(),
      })),
      adapter: mock(),
    };

    gateway = new SocketIoRealtimeGateway(
      mockJwtService,
      mockConfigService,
      undefined,
    );
    gateway.afterInit(mockServer);
  });

  it('should reject connection if no token is provided', async () => {
    const mockSocket: any = {
      id: 'socket-1',
      handshake: {
        auth: {},
        headers: {},
        query: {},
      },
      disconnect: mock(),
      join: mock(),
      data: {},
    };

    await gateway.handleConnection(mockSocket);

    expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    expect(mockSocket.join).not.toHaveBeenCalled();
    expect(gateway.isUserOnline('user-1')).toBe(false);
  });

  it('should reject connection if token verification fails', async () => {
    mockJwtService.verifyAsync.mockRejectedValue(new Error('Invalid token'));

    const mockSocket: any = {
      id: 'socket-1',
      handshake: {
        auth: { token: 'invalid-token' },
        headers: {},
        query: {},
      },
      disconnect: mock(),
      join: mock(),
      data: {},
    };

    await gateway.handleConnection(mockSocket);

    expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    expect(mockSocket.join).not.toHaveBeenCalled();
    expect(gateway.isUserOnline('user-1')).toBe(false);
  });

  it('should authenticate user and join room user:<userId> on valid token', async () => {
    mockJwtService.verifyAsync.mockResolvedValue({
      id: 'user-123',
      email: 'test@amanah.id',
    });

    const mockSocket: any = {
      id: 'socket-1',
      handshake: {
        headers: { authorization: 'Bearer valid-jwt-token' },
      },
      disconnect: mock(),
      join: mock(),
      data: {},
    };

    await gateway.handleConnection(mockSocket);

    expect(mockSocket.disconnect).not.toHaveBeenCalled();
    expect(mockSocket.join).toHaveBeenCalledWith('user:user-123');
    expect(mockSocket.data.userId).toBe('user-123');
    expect(gateway.isUserOnline('user-123')).toBe(true);
    expect(gateway.getConnectedUserCount()).toBe(1);
  });

  it('should track multiple sockets for the same user and untrack on disconnect', async () => {
    mockJwtService.verifyAsync.mockResolvedValue({
      id: 'user-multi',
    });

    const socket1: any = {
      id: 'sock-1',
      handshake: { auth: { token: 'token-1' } },
      join: mock(),
      disconnect: mock(),
      data: {},
    };
    const socket2: any = {
      id: 'sock-2',
      handshake: { auth: { token: 'token-2' } },
      join: mock(),
      disconnect: mock(),
      data: {},
    };

    await gateway.handleConnection(socket1);
    await gateway.handleConnection(socket2);

    expect(gateway.isUserOnline('user-multi')).toBe(true);
    expect(gateway.getConnectedUserCount()).toBe(1);

    // Disconnect one socket
    gateway.handleDisconnect(socket1);
    expect(gateway.isUserOnline('user-multi')).toBe(true);
    expect(gateway.getConnectedUserCount()).toBe(1);

    // Disconnect the second socket
    gateway.handleDisconnect(socket2);
    expect(gateway.isUserOnline('user-multi')).toBe(false);
    expect(gateway.getConnectedUserCount()).toBe(0);
  });

  it('should emit to user room via Socket.IO server', async () => {
    const mockEmit = mock();
    mockServer.to.mockReturnValue({ emit: mockEmit });

    const success = await gateway.emitToUser('user-123', 'notification:new', {
      title: 'Halo Pasien',
    });

    expect(success).toBe(true);
    expect(mockServer.to).toHaveBeenCalledWith('user:user-123');
    expect(mockEmit).toHaveBeenCalledWith('notification:new', {
      title: 'Halo Pasien',
    });
  });
});
