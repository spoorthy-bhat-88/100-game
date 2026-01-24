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

// Room expiration settings
const ROOM_LIFETIME_MS = 3 * 60 * 60 * 1000; // 3 hours in milliseconds

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hundred-game';
let db;
let roomsCollection;

// Connect to MongoDB
async function connectDB() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    const uriDisplay = MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
    console.log('   URI:', uriDisplay);
    
    // Detect if using local or cloud MongoDB
    const isLocal = MONGODB_URI.includes('localhost') || MONGODB_URI.includes('127.0.0.1');
    
    // Configure MongoDB client options
    const options = {
      // Disable SSL for local MongoDB, enable for cloud
      tls: !isLocal,
      // Set timeouts
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    };
    
    console.log(`   Connection type: ${isLocal ? 'Local' : 'Cloud (MongoDB Atlas)'}`);
    console.log(`   TLS/SSL: ${options.tls ? 'Enabled' : 'Disabled'}`);
    
    const client = new MongoClient(MONGODB_URI, options);
    await client.connect();
    db = client.db();
    roomsCollection = db.collection('rooms');
    console.log('✅ Connected to MongoDB successfully!');
    
    // Create index on room code for faster lookups
    await roomsCollection.createIndex({ code: 1 }, { unique: true });
    
    // Load existing rooms into memory
    await loadGameRooms();
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error.message);
    console.log('⚠️  Continuing without database persistence');
    console.log('');
    console.log('💡 To enable persistence:');
    if (error.message.includes('ECONNREFUSED')) {
      console.log('   - Install MongoDB: brew install mongodb-community');
      console.log('   - Start MongoDB: brew services start mongodb-community');
    } else {
      console.log('   - Check your MONGODB_URI environment variable');
      console.log('   - Ensure your database is accessible');
      console.log('   - For MongoDB Atlas, check your network access settings');
    }
    console.log('');
  }
}

// Load game rooms from database
async function loadGameRooms() {
  try {
    if (!roomsCollection) return;
    
    console.log('📥 Loading game rooms from MongoDB...');
    const rooms = await roomsCollection.find({}).toArray();
    rooms.forEach(room => {
      gameRooms.set(room.code, room);
    });
    console.log(`✅ Loaded ${rooms.length} game room(s) from database`);
    if (rooms.length > 0) {
      rooms.forEach(room => {
        console.log(`   - Room ${room.code}: ${room.players.length}/${room.numPlayers} players, started: ${room.started}`);
      });
    }
  } catch (error) {
    console.error('❌ Error loading game rooms:', error);
  }
}

// Save a single room to database
async function saveRoom(roomCode) {
  try {
    if (!roomsCollection) {
      console.log('⚠️  Database not connected - room not saved');
      return;
    }
    
    const room = gameRooms.get(roomCode);
    if (!room) {
      console.log(`⚠️  Room ${roomCode} not found in memory - cannot save`);
      return;
    }
    
    console.log(`💾 Saving room ${roomCode} to MongoDB...`);
    console.log(`   Players: ${room.players.length}/${room.numPlayers}`);
    console.log(`   Started: ${room.started}`);
    console.log(`   Created: ${room.createdAt ? new Date(room.createdAt).toLocaleString() : 'Unknown'}`);
    if (room.gameState) {
      console.log(`   Game state version: ${room.gameState.version || 'N/A'}`);
    }
    
    // Remove _id field to prevent immutable field error
    const { _id, ...roomData } = room;
    
    const result = await roomsCollection.updateOne(
      { code: roomCode },
      { $set: roomData },
      { upsert: true }
    );
    
    if (result.upsertedCount > 0) {
      console.log(`✅ Created new room ${roomCode} in database`);
    } else if (result.modifiedCount > 0) {
      console.log(`✅ Updated room ${roomCode} in database`);
    } else {
      console.log(`ℹ️  Room ${roomCode} unchanged in database`);
    }
  } catch (error) {
    console.error('❌ Error saving room:', error);
  }
}

// Delete a room from database
async function deleteRoom(roomCode) {
  try {
    if (!roomsCollection) return;
    
    console.log(`🗑️  Deleting room ${roomCode} from MongoDB...`);
    const result = await roomsCollection.deleteOne({ code: roomCode });
    
    if (result.deletedCount > 0) {
      console.log(`✅ Deleted room ${roomCode} from database`);
    } else {
      console.log(`ℹ️  Room ${roomCode} not found in database`);
    }
  } catch (error) {
    console.error('❌ Error deleting room:', error);
  }
}

// Connect to database on startup
connectDB();

// Cleanup expired rooms every 10 minutes
setInterval(async () => {
  console.log('🧹 Running room cleanup...');
  const now = Date.now();
  let expiredCount = 0;
  
  for (const [roomCode, room] of gameRooms.entries()) {
    if (room.createdAt && (now - room.createdAt) > ROOM_LIFETIME_MS) {
      console.log(`⏰ Room ${roomCode} expired (created ${new Date(room.createdAt).toLocaleString()})`);
      gameRooms.delete(roomCode);
      await deleteRoom(roomCode);
      expiredCount++;
    }
  }
  
  if (expiredCount > 0) {
    console.log(`✅ Cleaned up ${expiredCount} expired room(s)`);
  } else {
    console.log('✅ No expired rooms found');
  }
}, 10 * 60 * 1000); // Run every 10 minutes

// Generate random room code
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Create a new game room
  socket.on('create-room', async ({ playerName, numPlayers, handSize, minCardsPerTurn, maxCard, backtrackAmount }) => {
    const roomCode = generateRoomCode();
    const room = {
      code: roomCode,
      numPlayers,
      handSize: handSize || 4,
      minCardsPerTurn: minCardsPerTurn || 2,
      maxCard: maxCard || 99,
      backtrackAmount: backtrackAmount || 10,
      players: [{
        id: socket.id,
        name: playerName,
        playerIndex: 0
      }],
      gameState: null,
      started: false,
      createdAt: Date.now() // Timestamp for room expiration
    };
    
    gameRooms.set(roomCode, room);
    socket.join(roomCode);
    
    socket.emit('room-created', { roomCode, playerIndex: 0 });
    io.to(roomCode).emit('room-update', { 
      players: room.players,
      numPlayers: room.numPlayers,
      handSize: room.handSize,
      minCardsPerTurn: room.minCardsPerTurn,
      maxCard: room.maxCard,
      backtrackAmount: room.backtrackAmount,
      started: room.started
    });
    
    await saveRoom(roomCode); // Save to database
    console.log(`Room ${roomCode} created by ${playerName} with ${handSize || 4} cards, ${minCardsPerTurn || 2} min per turn, max card ${maxCard || 99}, backtrack ${backtrackAmount || 10}`);
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
      handSize: room.handSize,
      minCardsPerTurn: room.minCardsPerTurn,
      maxCard: room.maxCard,
      backtrackAmount: room.backtrackAmount,
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

  // Leave room
  socket.on('leave-room', async ({ roomCode }) => {
    const room = gameRooms.get(roomCode);
    if (!room) return;

    console.log(`User ${socket.id} leaving room ${roomCode}`);
    
    // Remove player
    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    if (playerIndex !== -1) {
      room.players.splice(playerIndex, 1);
      
      socket.leave(roomCode);
      
      // Update remaining players
      if (room.players.length > 0) {
        io.to(roomCode).emit('room-update', { 
          players: room.players,
          numPlayers: room.numPlayers,
          started: room.started
        });
      }
      
      await saveRoom(roomCode);
    }
  });

  // Handle disconnect
  socket.on('disconnect', async () => {
    console.log('User disconnected:', socket.id);
    
    // Remove player from any rooms they were in
    for (const [roomCode, room] of gameRooms.entries()) {
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);
        
        // Keep room alive for 3 hours even if empty
        console.log(`Player left room ${roomCode}. Room will expire in ${Math.round((ROOM_LIFETIME_MS - (Date.now() - room.createdAt)) / 1000 / 60)} minutes`);
        
        if (room.players.length === 0) {
          console.log(`Room ${roomCode} is now empty but will be kept for rejoining`);
        }
        
        // Update remaining players
        if (room.players.length > 0) {
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
        
        // Save updated room state (or empty room for rejoining)
        await saveRoom(roomCode);
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`🎮 Game server is ready!`);
  if (!roomsCollection) {
    console.log(`⚠️  Running without database - game state will not persist across restarts`);
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  
  // Save all active rooms to database if connected
  if (roomsCollection) {
    console.log('Saving active rooms...');
    for (const [roomCode] of gameRooms.entries()) {
      await saveRoom(roomCode);
    }
    console.log('All rooms saved.');
  }
  
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down gracefully...');
  
  // Save all active rooms to database if connected
  if (roomsCollection) {
    console.log('Saving active rooms...');
    for (const [roomCode] of gameRooms.entries()) {
      await saveRoom(roomCode);
    }
    console.log('All rooms saved.');
  }
  
  process.exit(0);
});
