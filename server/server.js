import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { RoomManager } from './RoomManager.js';

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

// Initialize Room Manager
const roomManager = new RoomManager();

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
      roomManager.rooms.set(room.code, room);
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
    
    const room = roomManager.getRoom(roomCode);
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
  const expiredRooms = roomManager.getExpiredRooms();
  let expiredCount = 0;
  
  for (const roomCode of expiredRooms) {
    console.log(`⏰ Room ${roomCode} expired`);
    roomManager.deleteRoom(roomCode);
    await deleteRoom(roomCode);
    expiredCount++;
  }
  
  if (expiredCount > 0) {
    console.log(`✅ Cleaned up ${expiredCount} expired room(s)`);
  } else {
    console.log('✅ No expired rooms found');
  }
}, 10 * 60 * 1000); // Run every 10 minutes

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Create a new game room
  socket.on('create-room', async ({ playerName, numPlayers, handSize, minCardsPerTurn, maxCard, backtrackAmount }) => {
    const room = roomManager.createRoom({
      playerName, 
      socketId: socket.id,
      numPlayers, 
      handSize, 
      minCardsPerTurn, 
      maxCard, 
      backtrackAmount
    });
    
    const roomCode = room.code;
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
    const result = roomManager.addPlayerToRoom(roomCode, {
      socketId: socket.id,
      playerName
    });
    
    if (result.error) {
      socket.emit('error', { message: result.error });
      return;
    }
    
    const { room, playerIndex } = result;
    
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
    const result = roomManager.rejoinPlayer(roomCode, {
      socketId: socket.id,
      playerName,
      playerIndex
    });
    
    if (result.error) {
      socket.emit('error', { message: result.error });
      return;
    }
    
    const { room } = result;
    
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
    const room = roomManager.getRoom(roomCode);
    
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    
    // Check if player is host (index 0) OR if they are the first player in the list
    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1 || room.players[playerIndex].playerIndex !== 0) {
       // Graceful fallback: if player index 0 is gone, maybe allow the first connected player to start? 
       // For now, strict check on playerIndex 0 as per existing logic, but robust check against list
       if (room.players[0].id !== socket.id) {
         socket.emit('error', { message: 'Only host can start the game' });
         return;
       }
    }
    
    // Set numPlayers to the actual number of players in the room
    room.numPlayers = room.players.length;
    
    room.gameState = gameState;
    room.started = true;
    
    io.to(roomCode).emit('game-started', { gameState });
    await saveRoom(roomCode); // Save to database
    console.log(`Game started in room ${roomCode} with ${room.numPlayers} players`);
  });

  // Sync game state with validation
  socket.on('game-action', async ({ roomCode, gameState }, callback) => {
    const room = roomManager.getRoom(roomCode);
    
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
    const room = roomManager.removePlayer(roomCode, socket.id);
    if (!room) return;

    console.log(`User ${socket.id} leaving room ${roomCode}`);
      
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
  });

  // Handle disconnect
  socket.on('disconnect', async () => {
    console.log('User disconnected:', socket.id);
    
    const affectedRooms = roomManager.handleDisconnect(socket.id);

    for (const { roomCode, room } of affectedRooms) {
      if (room.started) {
          console.log(`Player disconnected from active game in room ${roomCode}`);
      } else {
          console.log(`Player left lobby ${roomCode}`);
      }
      
      // Keep room alive for 3 hours even if empty
      const timeLeft = roomManager.ROOM_LIFETIME_MS - (Date.now() - room.createdAt);
      console.log(`Room will expire in ${Math.round(timeLeft / 1000 / 60)} minutes`);
      
      if (room.players.length === 0 || room.players.every(p => !p.connected)) {
        console.log(`Room ${roomCode} is now empty (or all disconnected)`);
      }
      
      // Update remaining players (even if disconnected, we want to update the UI for others)
      io.to(roomCode).emit('room-update', { 
        players: room.players,
        numPlayers: room.numPlayers,
        started: room.started
      });
        
      if (room.started) {
          io.to(roomCode).emit('player-disconnected', { 
            message: `Player disconnected` 
          });
      }
      
      // Save updated room state
      await saveRoom(roomCode);
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
    const rooms = roomManager.getAllRooms();
    for (const room of rooms) {
      await saveRoom(room.code);
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
    const rooms = roomManager.getAllRooms();
    for (const room of rooms) {
      await saveRoom(room.code);
    }
    console.log('All rooms saved.');
  }
  
  process.exit(0);
});
