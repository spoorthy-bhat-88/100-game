import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Store active game rooms
const gameRooms = new Map();

// Generate random room code
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Create a new game room
  socket.on('create-room', ({ playerName, numPlayers }) => {
    const roomCode = generateRoomCode();
    const room = {
      code: roomCode,
      numPlayers,
      players: [{
        id: socket.id,
        name: playerName,
        playerIndex: 0
      }],
      gameState: null,
      started: false
    };
    
    gameRooms.set(roomCode, room);
    socket.join(roomCode);
    
    socket.emit('room-created', { roomCode, playerIndex: 0 });
    io.to(roomCode).emit('room-update', { 
      players: room.players,
      numPlayers: room.numPlayers,
      started: room.started
    });
    
    console.log(`Room ${roomCode} created by ${playerName}`);
  });

  // Join an existing room
  socket.on('join-room', ({ roomCode, playerName }) => {
    const room = gameRooms.get(roomCode);
    
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    
    if (room.started) {
      socket.emit('error', { message: 'Game already started' });
      return;
    }
    
    if (room.players.length >= room.numPlayers) {
      socket.emit('error', { message: 'Room is full' });
      return;
    }
    
    const playerIndex = room.players.length;
    room.players.push({
      id: socket.id,
      name: playerName,
      playerIndex
    });
    
    socket.join(roomCode);
    socket.emit('room-joined', { roomCode, playerIndex });
    io.to(roomCode).emit('room-update', { 
      players: room.players,
      numPlayers: room.numPlayers,
      started: room.started
    });
    
    console.log(`${playerName} joined room ${roomCode}`);
  });

  // Start the game
  socket.on('start-game', ({ roomCode, gameState }) => {
    const room = gameRooms.get(roomCode);
    
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    
    if (room.players[0].id !== socket.id) {
      socket.emit('error', { message: 'Only host can start the game' });
      return;
    }
    
    room.gameState = gameState;
    room.started = true;
    
    io.to(roomCode).emit('game-started', { gameState });
    console.log(`Game started in room ${roomCode}`);
  });

  // Sync game state
  socket.on('game-action', ({ roomCode, gameState }) => {
    const room = gameRooms.get(roomCode);
    
    if (!room) {
      return;
    }
    
    room.gameState = gameState;
    socket.to(roomCode).emit('game-update', { gameState });
  });

  // Send hint
  socket.on('send-hint', ({ roomCode, hint }) => {
    socket.to(roomCode).emit('hint-received', { hint });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Remove player from any rooms they were in
    for (const [roomCode, room] of gameRooms.entries()) {
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);
        
        // If room is empty, delete it
        if (room.players.length === 0) {
          gameRooms.delete(roomCode);
          console.log(`Room ${roomCode} deleted (empty)`);
        } else {
          // Update remaining players
          io.to(roomCode).emit('room-update', { 
            players: room.players,
            numPlayers: room.numPlayers,
            started: room.started
          });
          
          if (room.started) {
            io.to(roomCode).emit('player-disconnected', { 
              message: 'A player disconnected' 
            });
          }
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
