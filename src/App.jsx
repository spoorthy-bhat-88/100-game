import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import './App.css';
import Pile from './engine/Pile';
import PlayerHand from './engine/PlayerHand';
import { initializeGame, playCard, isValidPlay, addHint, endTurn } from './engine/gameEngine';

// Use environment variable for production or fall back to localhost
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 
  (window.location.hostname === 'localhost' 
    ? 'http://localhost:3001' 
    : `http://${window.location.hostname}:3001`);

const socket = io(SERVER_URL);

function App() {
  const [gameState, setGameState] = useState(null);
  const [numPlayers, setNumPlayers] = useState(2);
  const [handSize, setHandSize] = useState(4);
  const [minCardsPerTurn, setMinCardsPerTurn] = useState(2);
  const [maxCard, setMaxCard] = useState(99);
  const [backtrackAmount, setBacktrackAmount] = useState(10);
  const [selectedCard, setSelectedCard] = useState(null);
  const [customHint, setCustomHint] = useState('');
  
  // Multiplayer state
  const [screen, setScreen] = useState('menu'); // 'menu', 'lobby', 'game'
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [myPlayerIndex, setMyPlayerIndex] = useState(null);
  const [roomPlayers, setRoomPlayers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isConnected, setIsConnected] = useState(true);
  const [pendingActions, setPendingActions] = useState([]);
  
  // Track if we've already auto-skipped for the current turn
  const autoSkipProcessedRef = useRef(null);

  // Retry mechanism for failed actions
  const sendGameAction = (gameState, retryCount = 0) => {
    const maxRetries = 3;
    
    // Queue action if disconnected
    if (!isConnected) {
      console.log('Offline - queuing action');
      // Check if this version is already queued to prevent duplicates
      const alreadyQueued = pendingActions.some(a => a.gameState.version === gameState.version);
      if (!alreadyQueued) {
        setPendingActions(prev => [...prev, { gameState, timestamp: Date.now() }]);
      } else {
        console.log('Action already queued, skipping duplicate');
      }
      return;
    }
    
    // Set a timeout in case callback never comes back
    const timeout = setTimeout(() => {
      console.error(`Timeout waiting for server response (attempt ${retryCount + 1})`);
      if (retryCount < maxRetries) {
        console.log(`Retrying in 1 second... (${retryCount + 1}/${maxRetries})`);
        sendGameAction(gameState, retryCount + 1);
      } else {
        console.error('Failed to sync game state after multiple attempts.');
        // Don't alert on every failure, just log it
      }
    }, 5000); // 5 second timeout
    
    socket.emit('game-action', { roomCode, gameState }, (response) => {
      clearTimeout(timeout);
      
      if (!response) {
        console.error(`No response from server (attempt ${retryCount + 1})`);
        if (retryCount < maxRetries) {
          console.log(`Retrying in 1 second... (${retryCount + 1}/${maxRetries})`);
          setTimeout(() => sendGameAction(gameState, retryCount + 1), 1000);
        } else {
          console.error('Failed to sync game state after multiple attempts.');
        }
        return;
      }
      
      if (response.error) {
        console.error(`Failed to sync game state (attempt ${retryCount + 1}):`, response.error);
        
        if (retryCount < maxRetries) {
          console.log(`Retrying in 1 second... (${retryCount + 1}/${maxRetries})`);
          setTimeout(() => sendGameAction(gameState, retryCount + 1), 1000);
        } else {
          console.error('Failed to sync game state after multiple attempts.');
        }
      } else {
        console.log('Game state synced successfully', response);
      }
    });
  };

  useEffect(() => {
    // Monitor connection status
    socket.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);
      
      // Process pending actions when reconnected
      if (pendingActions.length > 0) {
        console.log(`Processing ${pendingActions.length} pending actions...`);
        pendingActions.forEach(action => {
          sendGameAction(action.gameState);
        });
        setPendingActions([]);
      }
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      setIsConnected(false);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
    };
  }, [pendingActions]);

  useEffect(() => {
    // Try to rejoin from localStorage on mount
    const savedRoomCode = localStorage.getItem('roomCode');
    const savedPlayerIndex = localStorage.getItem('playerIndex');
    const savedPlayerName = localStorage.getItem('playerName');
    
    if (savedRoomCode && savedPlayerIndex !== null && savedPlayerName) {
      setRoomCode(savedRoomCode);
      setMyPlayerIndex(parseInt(savedPlayerIndex));
      setPlayerName(savedPlayerName);
      socket.emit('rejoin-room', { 
        roomCode: savedRoomCode, 
        playerIndex: parseInt(savedPlayerIndex),
        playerName: savedPlayerName
      });
    }
  }, []);

  useEffect(() => {
    // Socket event listeners
    socket.on('room-created', ({ roomCode, playerIndex }) => {
      setRoomCode(roomCode);
      setMyPlayerIndex(playerIndex);
      setIsHost(true);
      setScreen('lobby');
      // Save to localStorage
      localStorage.setItem('roomCode', roomCode);
      localStorage.setItem('playerIndex', playerIndex);
      localStorage.setItem('playerName', playerName);
    });

    socket.on('room-joined', ({ roomCode, playerIndex }) => {
      setRoomCode(roomCode);
      setMyPlayerIndex(playerIndex);
      setIsHost(false);
      setScreen('lobby');
      // Save to localStorage
      localStorage.setItem('roomCode', roomCode);
      localStorage.setItem('playerIndex', playerIndex);
      localStorage.setItem('playerName', playerName);
    });

    socket.on('room-update', ({ players, numPlayers: total, handSize: roomHandSize, minCardsPerTurn: roomMinCards, maxCard: roomMaxCard, backtrackAmount: roomBacktrack, started }) => {
      setRoomPlayers(players);
      setNumPlayers(total);
      if (roomHandSize) {
        setHandSize(roomHandSize);
      }
      if (roomMinCards) {
        setMinCardsPerTurn(roomMinCards);
      }
      if (roomMaxCard) {
        setMaxCard(roomMaxCard);
      }
      if (roomBacktrack) {
        setBacktrackAmount(roomBacktrack);
      }
    });

    socket.on('game-started', ({ gameState: newGameState }) => {
      setGameState(newGameState);
      setScreen('game');
      setSelectedCard(null);
    });

    socket.on('rejoined', ({ gameState: newGameState, players, screen: savedScreen }) => {
      setGameState(newGameState);
      setRoomPlayers(players);
      setScreen(savedScreen || 'game');
      setSelectedCard(null);
    });

    socket.on('game-update', ({ gameState: newGameState }) => {
      console.log('Received game-update:', newGameState.currentPlayer, newGameState.cardsPlayedThisTurn, 'version:', newGameState.version);
      
      // Only update if version is strictly newer (changed from >=)
      if (!gameState || !newGameState.version || !gameState.version || newGameState.version > gameState.version) {
        setGameState(newGameState);
        setSelectedCard(null);
      } else {
        console.log('Ignoring duplicate/older state version:', newGameState.version, 'current:', gameState.version);
      }
    });

    socket.on('hint-received', ({ hint }) => {
      setGameState(prevState => {
        if (!prevState) return prevState;
        
        const logEntry = {
          type: 'hint',
          player: hint.player,
          text: `💡 ${hint.player}: ${hint.text}`,
          timestamp: hint.timestamp
        };
        
        return { 
          ...prevState, 
          hints: [...prevState.hints, hint],
          playLog: [...(prevState.playLog || []), logEntry]
        };
      });
    });

    socket.on('error', ({ message }) => {
      setErrorMessage(message);
      setTimeout(() => setErrorMessage(''), 3000);
    });

    socket.on('player-disconnected', ({ message }) => {
      alert(message);
    });

    return () => {
      socket.off('room-created');
      socket.off('room-joined');
      socket.off('room-update');
      socket.off('game-started');
      socket.off('rejoined');
      socket.off('game-update');
      socket.off('hint-received');
      socket.off('error');
      socket.off('player-disconnected');
    };
  }, [gameState, playerName]);

  // Auto-skip turn if current player has no cards
  useEffect(() => {
    if (!gameState || myPlayerIndex !== gameState.currentPlayer) return;
    
    const currentHand = gameState.hands[myPlayerIndex] || [];
    
    // If this player has no cards, automatically end their turn
    if (currentHand.length === 0) {
      // Create a unique key for this turn to prevent duplicate skips
      const turnKey = `${gameState.currentPlayer}-${gameState.version}`;
      
      // Only auto-skip if we haven't already processed this exact turn
      if (autoSkipProcessedRef.current !== turnKey) {
        autoSkipProcessedRef.current = turnKey;
        console.log('Auto-skipping turn - player has no cards');
        
        setTimeout(() => {
          // Create a fake endTurn that just advances to next player
          const result = endTurn(gameState);
          if (result.success) {
            sendGameAction(result.newGameState);
          }
        }, 500); // Reduced delay
      }
    }
  }, [gameState, myPlayerIndex]);

  const createRoom = () => {
    if (!playerName.trim()) {
      setErrorMessage('Please enter your name');
      setTimeout(() => setErrorMessage(''), 3000);
      return;
    }
    socket.emit('create-room', { playerName: playerName.trim(), numPlayers, handSize, minCardsPerTurn, maxCard, backtrackAmount });
  };

  const joinRoom = () => {
    if (!playerName.trim()) {
      setErrorMessage('Please enter your name');
      setTimeout(() => setErrorMessage(''), 3000);
      return;
    }
    if (!roomCode.trim()) {
      setErrorMessage('Please enter a room code');
      setTimeout(() => setErrorMessage(''), 3000);
      return;
    }
    socket.emit('join-room', { roomCode: roomCode.trim().toUpperCase(), playerName: playerName.trim() });
  };

  const startGame = () => {
    if (screen === 'lobby' && isHost) {
      // Host starts multiplayer game
      const newGame = initializeGame(numPlayers, handSize, minCardsPerTurn, maxCard, backtrackAmount);
      socket.emit('start-game', { roomCode, gameState: newGame });
    }
  };

  const returnToLobby = () => {
    // Clear localStorage when intentionally leaving
    localStorage.removeItem('roomCode');
    localStorage.removeItem('playerIndex');
    localStorage.removeItem('playerName');
    
    setScreen('menu');
    setGameState(null);
    setSelectedCard(null);
    setRoomCode('');
    setRoomPlayers([]);
    setMyPlayerIndex(null);
    setIsHost(false);
  };

  const handleCardSelect = (cardIndex) => {
    if (myPlayerIndex !== gameState.currentPlayer) return;
    setSelectedCard(selectedCard === cardIndex ? null : cardIndex);
  };

  const handlePlayCard = (pileType) => {
    if (!gameState || selectedCard === null) return;
    if (myPlayerIndex !== gameState.currentPlayer) return;

    const result = playCard(gameState, gameState.currentPlayer, selectedCard, pileType);
    
    if (result.success) {
      // Update player name in the last log entry
      let updatedGameState = { ...result.newGameState };
      if (updatedGameState.playLog && updatedGameState.playLog.length > 0) {
        const currentPlayerName = roomPlayers[myPlayerIndex]?.name || `Player ${myPlayerIndex + 1}`;
        const isAscending = pileType.includes('ascending');
        const pileSymbol = isAscending ? '⬆️' : '⬇️';
        const pileLabel = pileType.includes('1') ? '1' : '2';
        const cardPlayed = gameState.hands[myPlayerIndex][selectedCard];
        
        // Create a new log array with updated last entry
        const updatedLog = [...updatedGameState.playLog];
        updatedLog[updatedLog.length - 1] = {
          ...updatedLog[updatedLog.length - 1],
          text: `${currentPlayerName} played ${cardPlayed} on ${pileSymbol} ${isAscending ? 'Ascending' : 'Descending'} Pile ${pileLabel}`
        };
        updatedGameState = { ...updatedGameState, playLog: updatedLog };
      }
      
      // Don't update local state - wait for server broadcast
      setSelectedCard(null);
      // Broadcast to server (which will broadcast back to all players including us)
      console.log('Broadcasting game-action:', updatedGameState.currentPlayer, updatedGameState.cardsPlayedThisTurn);
      sendGameAction(updatedGameState);
    } else {
      alert(result.error);
    }
  };

  const handleEndTurn = () => {
    if (!gameState) return;
    if (myPlayerIndex !== gameState.currentPlayer) return;

    const result = endTurn(gameState);
    
    if (result.success) {
      console.log('End turn - Broadcasting:', result.newGameState.currentPlayer, result.newGameState.cardsPlayedThisTurn);
      // Don't update local state - wait for server broadcast
      setSelectedCard(null);
      // Broadcast to server
      sendGameAction(result.newGameState);
    } else {
      alert(result.error);
    }
  };

  const handleSendHint = () => {
    if (!gameState || !customHint.trim()) return;
    
    const text = customHint.trim();
    // Block hints containing numbers
    if (/\d/.test(text)) {
      alert('Hints cannot contain numbers!');
      return;
    }

    const hint = {
      player: playerName || `Player ${myPlayerIndex + 1}`,
      text: text,
      timestamp: Date.now()
    };

    const newGameState = addHint(gameState, hint.player, hint.text);
    setGameState(newGameState);
    setCustomHint('');
    
    // Broadcast hint to other players
    socket.emit('send-hint', { roomCode, hint });
  };

  const canPlayOnPile = (card, pileType) => {
    if (!gameState) return false;
    const backtrack = gameState.backtrackAmount || 10;
    let pileTop;
    let isAscending;
    
    switch(pileType) {
      case 'ascending1':
        pileTop = gameState.ascending1;
        isAscending = true;
        break;
      case 'ascending2':
        pileTop = gameState.ascending2;
        isAscending = true;
        break;
      case 'descending1':
        pileTop = gameState.descending1;
        isAscending = false;
        break;
      case 'descending2':
        pileTop = gameState.descending2;
        isAscending = false;
        break;
      default:
        return false;
    }
    
    return isValidPlay(card, pileTop, isAscending, backtrack);
  };

  // Menu Screen
  if (screen === 'menu') {
    return (
      <div className="app">
        <div className="setup-screen">
          <h1>🎴 The 100 Game</h1>
          <p className="subtitle">Multiplayer Cooperative Card Game</p>
          
          {errorMessage && (
            <div className="error-message">{errorMessage}</div>
          )}
          
          <div className="setup-form">
            <label>
              YOUR NAME:
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name"
              />
            </label>
            
            <label>
              NUMBER OF PLAYERS:
              <input
                type="number"
                min="2"
                max="10"
                value={numPlayers}
                onChange={(e) => setNumPlayers(parseInt(e.target.value))}
              />
            </label>
            
            <label>
              CARDS PER PLAYER:
              <input
                type="number"
                min="3"
                max="10"
                value={handSize}
                onChange={(e) => setHandSize(parseInt(e.target.value))}
              />
            </label>
            
            <label>
              MIN. CARDS PER TURN:
              <input
                type="number"
                min="1"
                max="5"
                value={minCardsPerTurn}
                onChange={(e) => setMinCardsPerTurn(parseInt(e.target.value))}
              />
            </label>
            
            <label>
              MAX CARD NUMBER:
              <input
                type="number"
                min="20"
                max="200"
                value={maxCard}
                onChange={(e) => setMaxCard(parseInt(e.target.value))}
              />
            </label>
            
            <label>
              BACKTRACK AMOUNT:
              <input
                type="number"
                min="5"
                max="20"
                value={backtrackAmount}
                onChange={(e) => setBacktrackAmount(parseInt(e.target.value))}
              />
            </label>
            
            <button onClick={createRoom} className="start-button">
              Create Room
            </button>
            
            <div className="divider">OR</div>
            
            <label>
              ROOM CODE:
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="Enter 6-character code"
                maxLength="6"
              />
            </label>
            
            <button onClick={joinRoom} className="start-button join-button">
              Join Room
            </button>
          </div>

          <div className="rules">
            <h3>How to Play</h3>
            <ul>
              <li>🎯 <strong>Goal:</strong> Play all cards from the deck</li>
              <li>🃏 Each player starts with a configurable number of cards (3-10)</li>
              <li>🔢 <strong>Card range:</strong> Configurable from 1 to max card number (20-200)</li>
              <li>⬆️ <strong>Ascending piles (×2):</strong> Play cards higher than the top card (start at 0)</li>
              <li>⬇️ <strong>Descending piles (×2):</strong> Play cards lower than the top card (start at max+1)</li>
              <li>↩️ <strong>Backtrack move:</strong> Can play a card exactly [backtrack amount] less than ascending pile, or [backtrack amount] more than descending pile (configurable 5-20)</li>
              <li>🔄 On your turn: play minimum required cards (configurable 1-5), then click "End Turn"</li>
              <li>🎴 After playing, draw one card for each card played</li>
              <li>💡 Give custom hints anytime (no numbers allowed!)</li>
              <li>🏆 <strong>Win:</strong> Deck and all hands empty</li>
              <li>💀 <strong>Lose:</strong> If any player can't make a legal move on their turn</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // Lobby Screen
  if (screen === 'lobby') {
    return (
      <div className="app">
        <div className="setup-screen">
          <h1>🎴 Game Lobby</h1>
          <p className="subtitle">Room Code: <strong>{roomCode}</strong></p>
          
          <div className="lobby-info">
            <div className="game-settings">
              <p>👥 Players: {numPlayers}</p>
              <p>🃏 Cards per player: {handSize}</p>
              <p>🎯 Min. cards per turn: {minCardsPerTurn}</p>
              <p>🔢 Max card: {maxCard}</p>
              <p>↩️ Backtrack: {backtrackAmount}</p>
            </div>
            
            <h3>Players ({roomPlayers.length}/{numPlayers})</h3>
            <ul className="player-list">
              {roomPlayers.map((player, idx) => (
                <li key={player.id}>
                  {player.name} {player.id === socket.id && '(You)'}
                  {idx === 0 && ' 👑 Host'}
                </li>
              ))}
            </ul>
            
            {roomPlayers.length < numPlayers && (
              <p className="waiting-text">Waiting for more players to join...</p>
            )}
            
            {isHost && roomPlayers.length === numPlayers && (
              <button onClick={startGame} className="start-button">
                Start Game
              </button>
            )}
            
            {!isHost && (
              <p className="waiting-text">Waiting for host to start the game...</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Game Screen
  if (!gameState) return null;
  
  const currentHand = gameState.hands[myPlayerIndex] || [];
  const selectedCardValue = selectedCard !== null ? currentHand[selectedCard] : null;

  return (
    <div className="app">
      <div className="game-header">
        <h1>🎴 The 100 Game</h1>
        <div className="game-stats">
          <span>Deck: {gameState.deck.length}</span>
          <span>Player {gameState.currentPlayer + 1}'s Turn</span>
          {!isConnected && (
            <span className="connection-warning">⚠️ Disconnected</span>
          )}
          {myPlayerIndex === gameState.currentPlayer && (
            <span className="turn-progress">
              Cards played: {gameState.cardsPlayedThisTurn}/{gameState.deck.length === 0 ? 1 : gameState.minCardsPerTurn}
              {gameState.deck.length === 0 && ' 🃏'}
            </span>
          )}
        </div>
        <button onClick={returnToLobby} className="new-game-button">
          Leave Game
        </button>
      </div>

      {/* Win/Loss Messages */}
      {gameState.gameStatus === 'won' && (
        <div className="game-message victory">
          🎉 Victory! You exhausted the entire deck! 🎉
        </div>
      )}
      {gameState.gameStatus === 'lost' && (
        <div className="game-message defeat">
          😞 Game Over! No legal moves remaining.
        </div>
      )}
      
      {/* Show when current player has no cards but game is still ongoing */}
      {gameState.gameStatus === 'playing' && currentHand.length === 0 && myPlayerIndex === gameState.currentPlayer && (
        <div className="game-message" style={{backgroundColor: '#4CAF50', color: 'white'}}>
          ✨ You're out of cards! Your turn is being skipped.
        </div>
      )}
      {gameState.gameStatus === 'playing' && currentHand.length === 0 && myPlayerIndex !== gameState.currentPlayer && (
        <div className="game-message" style={{backgroundColor: '#2196F3', color: 'white'}}>
          ✨ You're out of cards! Waiting for others to finish...
        </div>
      )}

      <div className="game-container">
        {/* First Column - Piles */}
        <div className="piles-column">
          <div className="piles-container">
            <h3>⬆️ Ascending Piles</h3>
            <div className="pile-row">
              <Pile
                type="ascending"
                topCard={gameState.ascending1}
                canAcceptCard={selectedCardValue !== null && canPlayOnPile(selectedCardValue, 'ascending1')}
                onCardDrop={() => handlePlayCard('ascending1')}
                label="Pile 1"
                backtrackAmount={gameState.backtrackAmount || 10}
                maxCard={gameState.maxCard || 99}
              />
              <Pile
                type="ascending"
                topCard={gameState.ascending2}
                canAcceptCard={selectedCardValue !== null && canPlayOnPile(selectedCardValue, 'ascending2')}
                onCardDrop={() => handlePlayCard('ascending2')}
                label="Pile 2"
                backtrackAmount={gameState.backtrackAmount || 10}
                maxCard={gameState.maxCard || 99}
              />
            </div>
            <h3>⬇️ Descending Piles</h3>
            <div className="pile-row">
              <Pile
                type="descending"
                topCard={gameState.descending1}
                canAcceptCard={selectedCardValue !== null && canPlayOnPile(selectedCardValue, 'descending1')}
                onCardDrop={() => handlePlayCard('descending1')}
                label="Pile 1"
                backtrackAmount={gameState.backtrackAmount || 10}
                maxCard={gameState.maxCard || 99}
              />
              <Pile
                type="descending"
                topCard={gameState.descending2}
                canAcceptCard={selectedCardValue !== null && canPlayOnPile(selectedCardValue, 'descending2')}
                onCardDrop={() => handlePlayCard('descending2')}
                label="Pile 2"
                backtrackAmount={gameState.backtrackAmount || 10}
                maxCard={gameState.maxCard || 99}
              />
            </div>
          </div>
          
          {/* End Turn Button */}
          {myPlayerIndex === gameState.currentPlayer && (
            <div>
              {/* Debug info */}
              <p style={{fontSize: '12px', color: '#666'}}>
                Cards played: {gameState.cardsPlayedThisTurn || 0} / Min required: {gameState.deck.length === 0 ? 1 : (gameState.minCardsPerTurn || 0)}
                {gameState.deck.length === 0 && ' (Deck empty!)'}
              </p>
              {gameState.cardsPlayedThisTurn >= (gameState.deck.length === 0 ? 1 : gameState.minCardsPerTurn) && (
                <button 
                  className="end-turn-button" 
                  onClick={handleEndTurn}
                >
                  ✓ End Turn
                </button>
              )}
            </div>
          )}
        </div>

        {/* Second Column - Players' Hands */}
        <div className="players-column">
          <div className="players-container">
            {gameState.hands && Array.isArray(gameState.hands) && gameState.hands.map((hand, index) => {
              const player = roomPlayers.find((_, idx) => idx === index);
              const playerDisplayName = player ? player.name : `Player ${index + 1}`;
              
              return (
                <PlayerHand
                  key={index}
                  playerIndex={index}
                  playerName={playerDisplayName}
                  hand={index === myPlayerIndex ? hand : []}
                  isCurrentPlayer={index === gameState.currentPlayer}
                  selectedCard={index === myPlayerIndex ? selectedCard : null}
                  onCardSelect={handleCardSelect}
                  cardCount={hand.length}
                  isMyHand={index === myPlayerIndex}
                />
              );
            })}
          </div>
        </div>

        {/* Third Column - Hints */}
        <div className="hints-column">
          {/* Hint System */}
          <div className="hint-section">
            <h4 className="hint-title">💡 Send Hints to Other Players</h4>
            <p className="hint-description">Give teammates clues about your cards (no numbers allowed)</p>
            <div className="hint-form">
              <div className="custom-hint-group">
                <input
                  type="text"
                  className="custom-hint-input"
                  placeholder="Type your hint here..."
                  value={customHint}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Block numbers from being typed
                    if (!/\d/.test(value)) {
                      setCustomHint(value);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSendHint();
                    }
                  }}
                  maxLength={100}
                />
                <button 
                  type="button" 
                  className="send-hint-button"
                  onClick={handleSendHint}
                  disabled={!customHint.trim()}
                >
                  Send Hint
                </button>
              </div>
            </div>
          </div>
            
          {gameState.playLog && Array.isArray(gameState.playLog) && gameState.playLog.length > 0 && (
            <div className="play-log">
              <h4>Play Log</h4>
              <div className="log-list">
                {gameState.playLog.slice(-15).reverse().map((entry, idx) => (
                  <div key={entry.timestamp} className={`log-entry ${entry.type}`}>
                    {entry.text}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
