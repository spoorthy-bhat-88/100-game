import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Hoisted mocks to be available inside vi.mock
const mocks = vi.hoisted(() => {
  const handlers = {};
  const socket = {
    on: vi.fn((event, handler) => {
      handlers[event] = handler;
    }),
    off: vi.fn((event) => {
      delete handlers[event];
    }),
    emit: vi.fn(),
    id: 'test-socket-id',
    connected: true
  };
  return {
    socket,
    handlers
  };
});

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mocks.socket)
}));

import App from './App';

describe('App Component Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset handlers
        for (const key in mocks.handlers) delete mocks.handlers[key];
    });

    it('renders the menu screen properly', () => {
        render(<App />);
        expect(screen.getByText('🎴 The 100 Game')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Create Room/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Join Room/i })).toBeInTheDocument();
    });

    it('updates player name input', () => {
        render(<App />);
        const nameInput = screen.getByPlaceholderText(/Enter your name/i);
        fireEvent.change(nameInput, { target: { value: 'SuperPlayer' } });
        expect(nameInput.value).toBe('SuperPlayer');
    });

    it('emits create-room when Create button is clicked', () => {
        render(<App />);
        const nameInput = screen.getByPlaceholderText(/Enter your name/i);
        fireEvent.change(nameInput, { target: { value: 'Host' } });
        
        const createButton = screen.getByRole('button', { name: /Create Room/i });
        fireEvent.click(createButton);
        
        expect(mocks.socket.emit).toHaveBeenCalledWith('create-room', expect.objectContaining({
            playerName: 'Host',
            numPlayers: 2 // default
        }));
    });

    it('shows error if name is missing when creating room', () => {
        render(<App />);
        const createButton = screen.getByRole('button', { name: /Create Room/i });
        fireEvent.click(createButton);
        
        expect(screen.getByText(/Please enter your name/i)).toBeInTheDocument();
        expect(mocks.socket.emit).not.toHaveBeenCalled();
    });

    it('transitions to lobby when room-created event is received', () => {
        render(<App />);
        
        act(() => {
            // Simulate server sending 'room-created'
            if (mocks.handlers['room-created']) {
                mocks.handlers['room-created']({
                    roomCode: 'ABCD',
                    playerIndex: 0
                });
            }
             // Simulate server sending 'room-update' immediately after join/create
             if (mocks.handlers['room-update']) {
                mocks.handlers['room-update']({
                    players: [{ id: 'test-socket-id', name: 'Host', playerIndex: 0 }],
                    numPlayers: 2,
                    started: false
                });
            }
        });

        // Should now be in Lobby
        expect(screen.getByText(/Room Code:/i)).toBeInTheDocument();
        expect(screen.getByText('ABCD')).toBeInTheDocument();
        expect(screen.getByText(/Host/)).toBeInTheDocument();
    });

    it('shows Start Game button for host when room is full', () => {
        render(<App />);
        
        act(() => {
            // 1. Join as host
            if (mocks.handlers['room-created']) {
                mocks.handlers['room-created']({ roomCode: 'ABCD', playerIndex: 0 });
            }
            // 2. Update with full players
             if (mocks.handlers['room-update']) {
                mocks.handlers['room-update']({
                    players: [
                        { id: 'test-socket-id', name: 'Host', playerIndex: 0 },
                        { id: 'other-id', name: 'Guest', playerIndex: 1 }
                    ],
                    numPlayers: 2,
                    started: false
                });
            }
        });

        expect(screen.getByRole('button', { name: /Start Game/i })).toBeInTheDocument();
    });

    it('does NOT show Start Game button for non-host', () => {
        render(<App />);
        
        act(() => {
            // 1. Join as guest
             if (mocks.handlers['room-joined']) {
                mocks.handlers['room-joined']({ roomCode: 'ABCD', playerIndex: 1 });
            }
            // 2. Update with full players
             if (mocks.handlers['room-update']) {
                mocks.handlers['room-update']({
                     players: [
                        { id: 'host-id', name: 'Host', playerIndex: 0 },
                        { id: 'test-socket-id', name: 'Guest', playerIndex: 1 }
                    ],
                    numPlayers: 2,
                    started: false
                });
            }
        });
        
        expect(screen.queryByRole('button', { name: /Start Game/i })).not.toBeInTheDocument();
        expect(screen.getByText(/Waiting for host/i)).toBeInTheDocument();
    });

    it('emits join-room when Join button is clicked', () => {
        render(<App />);
        const nameInput = screen.getByPlaceholderText(/Enter your name/i);
        fireEvent.change(nameInput, { target: { value: 'Guest' } });
        
        const codeInput = screen.getByPlaceholderText(/Enter 6-character code/i);
        fireEvent.change(codeInput, { target: { value: 'XYZ123' } });
        
        const joinButton = screen.getByRole('button', { name: /Join Room/i });
        fireEvent.click(joinButton);
        
        expect(mocks.socket.emit).toHaveBeenCalledWith('join-room', {
            roomCode: 'XYZ123',
            playerName: 'Guest'
        });
    });

    it('displays alert on game error', () => {
        const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});
        render(<App />);
        
        act(() => {
            // Trigger an error event from socket - need to ensure handlers are bound
            // The component binds handlers in useEffect on mount, so they should be in mocks.handlers
            if (mocks.handlers['player-disconnected']) {
                mocks.handlers['player-disconnected']({ message: 'Player left!' });
            }
        });
        
        expect(alertMock).toHaveBeenCalledWith('Player left!');
        alertMock.mockRestore();
    });
});
