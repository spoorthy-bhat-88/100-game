import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import './App.css';
import Pile from './engine/Pile';
import PlayerHand from './engine/PlayerHand';
import { initializeGame, playCard, isValidPlay, addHint } from './engine/gameEngine';

// Use environment variable for production or fall back to localhost
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 
  (window.location.hostname === 'localhost' 
    ? 'http://localhost:3001' 
    : `http://${window.location.hostname}:3001`);

const socket = io(SERVER_URL);

function App() {
  const [gameState, setGameState] = useState(null);
  const [numPlayers, setNumPlayers] = useState(2);
  const [selectedCard, setSelectedCard] = useState(null);
  
  // Multiplayer state
  const [screen, setScreen] = useState('menu'); // 'menu', 'lobby', 'game'
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [myPlayerIndex, setMyPlayerIndex] = useState(null);
  const [roomPlayers, setRoomPlayers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    // Socket event listeners
    socket.on('room-created', ({ roomCode, playerIndex }) => {
      setRoomCode(roomCode);
      setMyPlayerIndex(playerIndex);
      setIsHost(true);
      setScreen('lobby');
    });

    socket.on('room-joined', ({ roomCode, playerIndex }) => {
      setRoomCode(roomCode);
      setMyPlayerIndex(playerIndex);
      setIsHost(false);
      setScreen('lobby');
    });

    socket.on('room-update', ({ players, numPlayers: total, started }) => {
      setRoomPlayers(players);
      setNumPlayers(total);
    });

    socket.on('game-started', ({ gameState: newGameState }) => {
      setGameState(newGameState);
      setScreen('game');
      setSelectedCard(null);
    });

    socket.on('game-update', ({ gameState: newGameState }) => {
      setGameState(newGameState);
      setSelectedCard(null);
    });

    socket.on('hint-received', ({ hint }) => {
      if (gameState) {
        const logEntry = {
          type: 'hint',
          player: hint.player,
          text: `💡 ${hint.player}: ${hint.text}`,
          timestamp: hint.timestamp
        };
        setGameState({ 
          ...gameState, 
          hints: [...gameState.hints, hint],
          playLog: [...(gameState.playLog || []), logEntry]
        });
      }
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
      socket.off('game-update');
      socket.off('hint-received');
      socket.off('error');
      socket.off('player-disconnected');
    };
  }, [gameState]);

  const createRoom = () => {
    if (!playerName.trim()) {
      setErrorMessage('Please enter your name');
      setTimeout(() => setErrorMessage(''), 3000);
      return;
    }
    socket.emit('create-room', { playerName: playerName.trim(), numPlayers });
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
      const newGame = initializeGame(numPlayers);
      socket.emit('start-game', { roomCode, gameState: newGame });
    }
  };

  const returnToLobby = () => {
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
      
      setGameState(updatedGameState);
      setSelectedCard(null);
      // Broadcast to other players
      socket.emit('game-action', { roomCode, gameState: updatedGameState });
    } else {
      alert(result.error);
    }
  };

  const handleSendHint = (hintType, pileType) => {
    if (!gameState) return;

    const isAscending = pileType.includes('ascending');
    const pileEmoji = isAscending ? '⬆️' : '⬇️';
    const pileLabel = pileType.includes('1') ? '1' : '2';
    const pileName = `${isAscending ? 'Ascending' : 'Descending'} Pile ${pileLabel}`;
    const hintText = `${hintType} to ${pileEmoji} ${pileName}`;

    const hint = {
      player: playerName || `Player ${myPlayerIndex + 1}`,
      text: hintText,
      timestamp: Date.now()
    };

    const newGameState = addHint(gameState, hint.player, hint.text);
    setGameState(newGameState);
    
    // Broadcast updated game state to other players
    socket.emit('game-action', { roomCode, gameState: newGameState });
  };

  const canPlayOnPile = (card, pileType) => {
    if (!gameState) return false;
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
    
    return isValidPlay(card, pileTop, isAscending);
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
              <li>🃏 Each player starts with 4 cards</li>
              <li>⬆️ <strong>Ascending piles (×2):</strong> Play cards higher than the top card (start at 1)</li>
              <li>⬇️ <strong>Descending piles (×2):</strong> Play cards lower than the top card (start at 100)</li>
              <li>🔟 <strong>Special:</strong> Can also play a card exactly 10 less than an ascending pile, or 10 more than a descending pile</li>
              <li>🔄 On your turn: play one card on any pile, then draw one card</li>
              <li>💡 Give hints anytime: "close", "very close" to any pile</li>
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
              />
              <Pile
                type="ascending"
                topCard={gameState.ascending2}
                canAcceptCard={selectedCardValue !== null && canPlayOnPile(selectedCardValue, 'ascending2')}
                onCardDrop={() => handlePlayCard('ascending2')}
                label="Pile 2"
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
              />
              <Pile
                type="descending"
                topCard={gameState.descending2}
                canAcceptCard={selectedCardValue !== null && canPlayOnPile(selectedCardValue, 'descending2')}
                onCardDrop={() => handlePlayCard('descending2')}
                label="Pile 2"
              />
            </div>
          </div>
        </div>

        {/* Second Column - Players' Hands */}
        <div className="players-column">
          <div className="players-container">
            {gameState.hands.map((hand, index) => {
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
                  canPlayOnAscending={canPlayOnAscending}
                  canPlayOnDescending={canPlayOnDescending}
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
            <p className="hint-description">Give teammates clues about your cards</p>
            <div className="hint-form">
              <div className="hint-group">
                <label className="hint-label">⬆️ Ascending Pile 1</label>
                <div className="hint-buttons">
                  <button 
                    type="button" 
                    className="hint-button close"
                    onClick={() => handleSendHint('close', 'ascending1')}
                    title="Signal you have a card close to ascending pile 1"
                  >
                    Close
                  </button>
                  <button 
                    type="button" 
                    className="hint-button very-close"
                    onClick={() => handleSendHint('very close', 'ascending1')}
                    title="Signal you have a card very close to ascending pile 1"
                  >
                    Very Close
                  </button>
                </div>
              </div>
              <div className="hint-group">
                <label className="hint-label">⬆️ Ascending Pile 2</label>
                <div className="hint-buttons">
                  <button 
                    type="button" 
                    className="hint-button close"
                    onClick={() => handleSendHint('close', 'ascending2')}
                    title="Signal you have a card close to ascending pile 2"
                  >
                    Close
                  </button>
                  <button 
                    type="button" 
                    className="hint-button very-close"
                    onClick={() => handleSendHint('very close', 'ascending2')}
                    title="Signal you have a card very close to ascending pile 2"
                  >
                    Very Close
                  </button>
                </div>
              </div>
              <div className="hint-group">
                <label className="hint-label">⬇️ Descending Pile 1</label>
                <div className="hint-buttons">
                  <button 
                    type="button" 
                    className="hint-button close"
                    onClick={() => handleSendHint('close', 'descending1')}
                    title="Signal you have a card close to descending pile 1"
                  >
                    Close
                  </button>
                  <button 
                    type="button" 
                    className="hint-button very-close"
                    onClick={() => handleSendHint('very close', 'descending1')}
                    title="Signal you have a card very close to descending pile 1"
                  >
                    Very Close
                  </button>
                </div>
              </div>
              <div className="hint-group">
                <label className="hint-label">⬇️ Descending Pile 2</label>
                <div className="hint-buttons">
                  <button 
                    type="button" 
                    className="hint-button close"
                    onClick={() => handleSendHint('close', 'descending2')}
                    title="Signal you have a card close to descending pile 2"
                  >
                    Close
                  </button>
                  <button 
                    type="button" 
                    className="hint-button very-close"
                    onClick={() => handleSendHint('very close', 'descending2')}
                    title="Signal you have a card very close to descending pile 2"
                  >
                    Very Close
                  </button>
                </div>
              </div>
            </div>
            
            {gameState.playLog && gameState.playLog.length > 0 && (
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
    </div>
  );
}

export default App;
