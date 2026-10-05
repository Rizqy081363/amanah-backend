import { beforeEach, describe, expect, it, mock } from 'bun:test';

mock.module('../../../../auth/better-auth/auth', () => ({
  auth: {
    api: {
      getSession: mock().mockResolvedValue(null),
    },
  },
}));

import { SocketIoRealtimeGateway } from './socket-io-realtime.gateway';

describe('SocketIoRealtimeGateway', () => {
  let gateway: SocketIoRealtimeGateway;
  let mockJwtService: any;
  let mockConfigService: any;
  let mockServer: any;

  let mockTicketService: any;

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
    mockTicketService = {
      consumeTicket: mock().mockResolvedValue(null),
    };

    gateway = new SocketIoRealtimeGateway(
      mockJwtService,
      mockConfigService,
      undefined,
      mockTicketService,
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

  it('should authenticate user from HttpOnly cookie and join role room', async () => {
    mockJwtService.verifyAsync.mockResolvedValue({
      id: 'admin-1',
      systemRole: 'ADMIN',
    });

    const mockSocket: any = {
      id: 'socket-admin',
      handshake: {
        headers: {
          cookie: 'amanah_access_token=valid-cookie-token; other_cookie=xyz',
        },
      },
      disconnect: mock(),
      join: mock(),
      data: {},
    };

    await gateway.handleConnection(mockSocket);

    expect(mockSocket.disconnect).not.toHaveBeenCalled();
    expect(mockSocket.join).toHaveBeenCalledWith('user:admin-1');
    expect(mockSocket.join).toHaveBeenCalledWith('role:admin');
    expect(gateway.isUserOnline('admin-1')).toBe(true);
  });

  it('should emit to role room via Socket.IO server', async () => {
    const mockEmit = mock();
    mockServer.to.mockReturnValue({ emit: mockEmit });

    const success = await gateway.emitToRole('admin', 'notification:new', {
      title: 'Alert Admin',
    });

    expect(success).toBe(true);
    expect(mockServer.to).toHaveBeenCalledWith('role:admin');
    expect(mockEmit).toHaveBeenCalledWith('notification:new', {
      title: 'Alert Admin',
    });
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

  it('should authenticate user via Better Auth session if JWT is absent or invalid', async () => {
    const { auth } = await import('../../../../auth/better-auth/auth');
    (auth.api.getSession as any).mockResolvedValueOnce({
      user: {
        id: 'better-auth-user-999',
        role: 'staff_doctor',
        email: 'doctor@amanah.id',
      },
    });

    const mockSocket: any = {
      id: 'socket-better-auth',
      handshake: {
        headers: {
          cookie: 'better-auth.session_token=some-session-token',
        },
      },
      disconnect: mock(),
      join: mock(),
      data: {},
    };

    await gateway.handleConnection(mockSocket);

    expect(mockSocket.disconnect).not.toHaveBeenCalled();
    expect(mockSocket.join).toHaveBeenCalledWith('user:better-auth-user-999');
    expect(mockSocket.join).toHaveBeenCalledWith('role:staff_doctor');
    expect(gateway.isUserOnline('better-auth-user-999')).toBe(true);
  });

  it('should authenticate user and join rooms via valid realtime ticket', async () => {
    mockTicketService.consumeTicket.mockResolvedValueOnce({
      userId: 'ticket-user-456',
      role: 'staff_midwife',
    });

    const mockSocket: any = {
      id: 'socket-ticket-1',
      handshake: {
        auth: { ticket: 'valid-csprng-ticket' },
        headers: {},
        query: {},
      },
      disconnect: mock(),
      join: mock(),
      data: {},
    };

    await gateway.handleConnection(mockSocket);

    expect(mockSocket.disconnect).not.toHaveBeenCalled();
    expect(mockSocket.join).toHaveBeenCalledWith('user:ticket-user-456');
    expect(mockSocket.join).toHaveBeenCalledWith('role:staff_midwife');
    expect(gateway.isUserOnline('ticket-user-456')).toBe(true);
  });

  it('should reject connection if realtime ticket is invalid or expired', async () => {
    mockTicketService.consumeTicket.mockResolvedValueOnce(null);

    const mockSocket: any = {
      id: 'socket-ticket-invalid',
      handshake: {
        auth: { ticket: 'invalid-or-consumed-ticket' },
        headers: {},
        query: {},
      },
      disconnect: mock(),
      join: mock(),
      emit: mock(),
      data: {},
    };

    await gateway.handleConnection(mockSocket);

    expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    expect(mockSocket.emit).toHaveBeenCalledWith('connect_error', {
      message: 'AUTH_TICKET_INVALID',
      code: 'AUTH_TICKET_INVALID',
    });
    expect(gateway.isUserOnline('ticket-user-456')).toBe(false);
  });
});

