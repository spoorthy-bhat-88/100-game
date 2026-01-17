import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import './App.css';
import Pile from './engine/Pile';
import PlayerHand from './engine/PlayerHand';
import { initializeGame, playCard, isValidPlay, addHint } from './engine/gameEngine';

const socket = io('http://localhost:3001');

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
        setGameState({ ...gameState, hints: [...gameState.hints, hint] });
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
    } else if (screen === 'game') {
      // Restart game
      const newGame = initializeGame(numPlayers);
      setGameState(newGame);
      setSelectedCard(null);
      if (roomCode) {
        socket.emit('start-game', { roomCode, gameState: newGame });
      }
    }
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
      setGameState(result.newGameState);
      setSelectedCard(null);
      // Broadcast to other players
      socket.emit('game-action', { roomCode, gameState: result.newGameState });
    } else {
      alert(result.error);
    }
  };

  const handleSendHint = (hintType) => {
    if (!gameState) return;

    const hint = {
      player: playerName || `Player ${myPlayerIndex + 1}`,
      text: hintType,
      timestamp: Date.now()
    };

    const newGameState = addHint(gameState, hint.player, hint.text);
    setGameState(newGameState);
    
    // Broadcast hint to other players
    socket.emit('send-hint', { roomCode, hint });
  };

  const canPlayOnAscending = (card) => {
    return gameState && isValidPlay(card, gameState.ascendingPile, true);
  };

  const canPlayOnDescending = (card) => {
    return gameState && isValidPlay(card, gameState.descendingPile, false);
  };

  // Setup Screen
  if (!gameState) {
    return (
      <div className="app">
        <div className="setup-screen">
          <h1>🎴 The 100 Game</h1>
          <p className="subtitle">A Cooperative Card Game</p>
          
          <div className="setup-form">
            <label>
              Number of Players:
              <input
                type="number"
                min="2"
                max="10"
                value={numPlayers}
                onChange={(e) => setNumPlayers(parseInt(e.target.value))}
              />
            </label>
            <button onClick={startGame} className="start-button">
              Start Game
            </button>
          </div>

          <div className="rules">
            <h3>How to Play</h3>
            <ul>
              <li>🎯 <strong>Goal:</strong> Play all cards from the deck</li>
              <li>🃏 Each player starts with 4 cards</li>
              <li>⬆️ <strong>Ascending pile:</strong> Play cards higher than the top card (starts at 0)</li>
              <li>⬇️ <strong>Descending pile:</strong> Play cards lower than the top card (starts at 100)</li>
              <li>� <strong>Special:</strong> Can also play a card exactly 10 less than ascending pile top, or 10 more than descending pile top</li>
              <li> On your turn: play one card, then draw one card</li>
              <li>💡 Give hints anytime: "close", "very close", etc.</li>
              <li>🏆 <strong>Win:</strong> Deck and all hands empty</li>
              <li>💀 <strong>Lose:</strong> If any player can't make a legal move on their turn</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // Game Screen
  const currentHand = gameState.hands[gameState.currentPlayer];
  const selectedCardValue = selectedCard !== null ? currentHand[selectedCard] : null;

  return (
    <div className="app">
      <div className="game-header">
        <h1>🎴 The 100 Game</h1>
        <div className="game-stats">
          <span>Deck: {gameState.deck.length}</span>
          <span>Player {gameState.currentPlayer + 1}'s Turn</span>
        </div>
        <button onClick={startGame} className="new-game-button">
          New Game
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
        {/* Left Section - Piles and Hints */}
        <div className="left-section">
          {/* Piles */}
          <div className="piles-container">
            <Pile
              type="ascending"
              topCard={gameState.ascendingPile}
              canAcceptCard={selectedCardValue !== null && canPlayOnAscending(selectedCardValue)}
              onCardDrop={() => handlePlayCard('ascending')}
            />
            <Pile
              type="descending"
              topCard={gameState.descendingPile}
              canAcceptCard={selectedCardValue !== null && canPlayOnDescending(selectedCardValue)}
              onCardDrop={() => handlePlayCard('descending')}
            />
          </div>

          {/* Hint System */}
          <div className="hint-section">
            <div className="hint-form">
              <button 
                type="button" 
                className="hint-button close"
                onClick={() => handleSendHint('close')}
              >
                Close
              </button>
              <button 
                type="button" 
                className="hint-button very-close"
                onClick={() => handleSendHint('very close')}
              >
                Very Close
              </button>
            </div>
            
            {gameState.hints.length > 0 && (
              <div className="hints-display">
                <h4>Hints</h4>
                <div className="hints-list">
                  {gameState.hints.slice(-10).reverse().map((hint, idx) => (
                    <div key={hint.timestamp} className="hint">
                      <strong>{hint.player}:</strong> {hint.text}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Section - All Players' Hands */}
        <div className="players-container">
          {gameState.hands.map((hand, index) => (
            <PlayerHand
              key={index}
              playerIndex={index}
              hand={hand}
              isCurrentPlayer={index === gameState.currentPlayer}
              selectedCard={index === gameState.currentPlayer ? selectedCard : null}
              onCardSelect={handleCardSelect}
              canPlayOnAscending={canPlayOnAscending}
              canPlayOnDescending={canPlayOnDescending}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
