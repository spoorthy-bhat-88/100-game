// RoomManager.js
export class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.ROOM_LIFETIME_MS = 3 * 60 * 60 * 1000; // 3 hours
  }

  generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  createRoom(creationParams) {
    const { playerName, socketId, handSize, minCardsPerTurn, maxCard, backtrackAmount } = creationParams;
    const roomCode = this.generateRoomCode();
    
    const room = {
      code: roomCode,
      numPlayers: null, // Will be set when game starts based on actual number of players
      handSize: handSize || 4,
      minCardsPerTurn: minCardsPerTurn || 2,
      maxCard: maxCard || 99,
      backtrackAmount: backtrackAmount || 10,
      players: [{
        id: socketId,
        name: playerName,
        playerIndex: 0,
        connected: true
      }],
      gameState: null,
      started: false,
      createdAt: Date.now()
    };

    this.rooms.set(roomCode, room);
    return room;
  }

  getRoom(roomCode) {
    return this.rooms.get(roomCode);
  }

  getAllRooms() {
    return Array.from(this.rooms.values());
  }

  addPlayerToRoom(roomCode, playerInfo) {
    const room = this.getRoom(roomCode);
    if (!room) return { error: 'Room not found' };
    if (room.started) return { error: 'Game already started' };

    const { socketId, playerName } = playerInfo;

    // Assign lowest available player index
    const takenIndices = new Set(room.players.map(p => p.playerIndex));
    let playerIndex = 0;
    while (takenIndices.has(playerIndex)) {
      playerIndex++;
    }

    room.players.push({
      id: socketId,
      name: playerName,
      playerIndex,
      connected: true
    });

    // Sort players
    room.players.sort((a, b) => a.playerIndex - b.playerIndex);

    return { success: true, room, playerIndex };
  }

  rejoinPlayer(roomCode, playerInfo) {
    const room = this.getRoom(roomCode);
    if (!room) return { error: 'Room not found - game may have ended' };

    const { socketId, playerName, playerIndex } = playerInfo;
    const player = room.players.find(p => p.playerIndex === playerIndex);

    if (player) {
      player.id = socketId;
      player.name = playerName;
      player.connected = true;
      return { success: true, room, player };
    } 
    
    // Fallback: try to add if not found but space available
    // Since numPlayers is not a limit anymore, just add the player
    room.players.push({
      id: socketId,
      name: playerName,
      playerIndex,
      connected: true
    });
    room.players.sort((a, b) => a.playerIndex - b.playerIndex);

    return { success: true, room };
  }

  removePlayer(roomCode, socketId) {
    const room = this.getRoom(roomCode);
    if (!room) return null;

    const playerIndex = room.players.findIndex(p => p.id === socketId);
    if (playerIndex !== -1) {
      room.players.splice(playerIndex, 1);
      return room;
    }
    return null;
  }

  handleDisconnect(socketId) {
    const affectedRooms = [];
    
    for (const [roomCode, room] of this.rooms.entries()) {
      const playerIndex = room.players.findIndex(p => p.id === socketId);
      
      if (playerIndex !== -1) {
        if (room.started) {
          room.players[playerIndex].connected = false;
        } else {
          room.players.splice(playerIndex, 1);
        }
        affectedRooms.push({ roomCode, room });
      }
    }
    return affectedRooms;
  }

  getExpiredRooms() {
    const now = Date.now();
    const expired = [];
    for (const [code, room] of this.rooms.entries()) {
      if ((now - room.createdAt) > this.ROOM_LIFETIME_MS) {
        expired.push(code);
      }
    }
    return expired;
  }

  deleteRoom(roomCode) {
    return this.rooms.delete(roomCode);
  }

  loadRoom(roomData) {
    this.rooms.set(roomData.code, roomData);
  }
}
