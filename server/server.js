import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // Allow any localhost origin or if no origin (like mobile apps)
      if (!origin || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        callback(null, true);
      } else if (process.env.CLIENT_URL && origin === process.env.CLIENT_URL) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Store active game rooms
const gameRooms = new Map();

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hundred-game';
let db;
let roomsCollection;

// Connect to MongoDB
async function connectDB() {
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db();
    roomsCollection = db.collection('rooms');
    console.log('Connected to MongoDB');
    
    // Create index on room code for faster lookups
    await roomsCollection.createIndex({ code: 1 }, { unique: true });
    
    // Load existing rooms into memory
    await loadGameRooms();
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    console.log('Continuing without database persistence');
  }
}

// Load game rooms from database
async function loadGameRooms() {
  try {
    if (!roomsCollection) return;
    
    const rooms = await roomsCollection.find({}).toArray();
    rooms.forEach(room => {
      gameRooms.set(room.code, room);
    });
    console.log(`Loaded ${rooms.length} game rooms from database`);
  } catch (error) {
    console.error('Error loading game rooms:', error);
  }
}

// Save a single room to database
async function saveRoom(roomCode) {
  try {
    if (!roomsCollection) return;
    
    const room = gameRooms.get(roomCode);
    if (!room) return;
    
    await roomsCollection.updateOne(
      { code: roomCode },
      { $set: room },
      { upsert: true }
    );
  } catch (error) {
    console.error('Error saving room:', error);
  }
}

// Delete a room from database
async function deleteRoom(roomCode) {
  try {
    if (!roomsCollection) return;
    
    await roomsCollection.deleteOne({ code: roomCode });
    console.log(`Deleted room ${roomCode} from database`);
  } catch (error) {
    console.error('Error deleting room:', error);
  }
}

// Connect to database on startup
connectDB();

// Generate random room code
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Create a new game room
  socket.on('create-room', async ({ playerName, numPlayers, handSize, minCardsPerTurn }) => {
    const roomCode = generateRoomCode();
    const room = {
      code: roomCode,
      numPlayers,
      handSize: handSize || 4,
      minCardsPerTurn: minCardsPerTurn || 2,
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
      handSize: room.handSize,
      minCardsPerTurn: room.minCardsPerTurn,
      started: room.started
    });
    
    await saveRoom(roomCode); // Save to database
    console.log(`Room ${roomCode} created by ${playerName} with ${handSize || 4} cards per player and ${minCardsPerTurn || 2} min cards per turn`);
  });

  // Join an existing room
  socket.on('join-room', async ({ roomCode, playerName }) => {
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
    
    await saveRoom(roomCode); // Save to database
    console.log(`${playerName} joined room ${roomCode}`);
  });

  // Rejoin an existing room
  socket.on('rejoin-room', ({ roomCode, playerIndex, playerName }) => {
    const room = gameRooms.get(roomCode);
    
    if (!room) {
      socket.emit('error', { message: 'Room not found - game may have ended' });
      return;
    }
    
    // Find and update the player's socket ID
    const player = room.players.find(p => p.playerIndex === playerIndex);
    
    if (player) {
      player.id = socket.id;
      player.name = playerName;
    } else {
      // Player not in room, try to add them back if there's space
      if (room.players.length >= room.numPlayers) {
        socket.emit('error', { message: 'Cannot rejoin - room is full' });
        return;
      }
      room.players.push({
        id: socket.id,
        name: playerName,
        playerIndex
      });
    }
    
    socket.join(roomCode);
    
    // Send current game state
    socket.emit('rejoined', { 
      gameState: room.gameState,
      players: room.players,
      screen: room.started ? 'game' : 'lobby'
    });
    
    // Notify other players
    io.to(roomCode).emit('room-update', { 
      players: room.players,
      numPlayers: room.numPlayers,
      started: room.started
    });
    
    console.log(`${playerName} rejoined room ${roomCode}`);
  });

  // Start the game
  socket.on('start-game', async ({ roomCode, gameState }) => {
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
    await saveRoom(roomCode); // Save to database
    console.log(`Game started in room ${roomCode}`);
  });

  // Sync game state with validation
  socket.on('game-action', async ({ roomCode, gameState }, callback) => {
    const room = gameRooms.get(roomCode);
    
    if (!room) {
      console.log('game-action: Room not found:', roomCode);
      if (callback) callback({ error: 'Room not found' });
      return;
    }
    
    console.log(`game-action in room ${roomCode}: currentPlayer=${gameState.currentPlayer}, cardsPlayed=${gameState.cardsPlayedThisTurn}`);
    
    // Server sets the version (increment from stored state)
    const oldState = room.gameState;
    gameState.version = (oldState?.version || 0) + 1;
    room.gameState = gameState;
    
    console.log(`Set version to ${gameState.version}`);
    
    // Broadcast to ALL players in the room (including sender)
    io.to(roomCode).emit('game-update', { gameState });
    
    // Save to database
    await saveRoom(roomCode);
    
    // Send acknowledgment back to sender
    if (callback) callback({ success: true });
  });

  // Send hint
  socket.on('send-hint', ({ roomCode, hint }) => {
    socket.to(roomCode).emit('hint-received', { hint });
  });

  // Handle disconnect
  socket.on('disconnect', async () => {
    console.log('User disconnected:', socket.id);
    
    // Remove player from any rooms they were in
    for (const [roomCode, room] of gameRooms.entries()) {
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);
        
        // If room is empty, delete it
        if (room.players.length === 0) {
          gameRooms.delete(roomCode);
          await deleteRoom(roomCode);
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
          
          // Save updated room state
          await saveRoom(roomCode);
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

// Graceful shutdown - save state on exit
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  saveGameRooms();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down gracefully...');
  saveGameRooms();
  process.exit(0);
});
