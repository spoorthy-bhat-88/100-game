// Game Engine for the 100 Card Game

export function createDeck() {
  // Create cards numbered 1-99 (excluding 0 and 100 since they're starting pile values)
  const deck = [];
  for (let i = 1; i <= 99; i++) {
    deck.push(i);
  }
  return deck;
}

export function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function dealInitialHands(deck, numPlayers) {
  const hands = [];
  let deckIndex = 0;
  
  for (let i = 0; i < numPlayers; i++) {
    const hand = [];
    for (let j = 0; j < 4; j++) {
      if (deckIndex < deck.length) {
        hand.push(deck[deckIndex++]);
      }
    }
    hands.push(hand);
  }
  
  const remainingDeck = deck.slice(deckIndex);
  return { hands, remainingDeck };
}

export function isValidPlay(card, pileTop, isAscending) {
  if (isAscending) {
    // Can play cards greater than top, OR exactly 10 less than top
    return card > pileTop || card === pileTop - 10;
  } else {
    // Can play cards less than top, OR exactly 10 more than top
    return card < pileTop || card === pileTop + 10;
  }
}

export function hasLegalMove(hand, ascendingTop, descendingTop) {
  return hand.some(card => 
    isValidPlay(card, ascendingTop, true) || 
    isValidPlay(card, descendingTop, false)
  );
}

export function checkLossCondition(hands, ascendingTop, descendingTop, currentPlayer) {
  // Game is lost if the current player has no legal move
  const currentHand = hands[currentPlayer];
  return currentHand.length > 0 && !hasLegalMove(currentHand, ascendingTop, descendingTop);
}

export function checkWinCondition(hands, deck) {
  // Game is won when deck is empty AND all hands are empty
  return deck.length === 0 && hands.every(hand => hand.length === 0);
}

export function initializeGame(numPlayers) {
  const deck = shuffleDeck(createDeck());
  const { hands, remainingDeck } = dealInitialHands(deck, numPlayers);
  
  return {
    deck: remainingDeck,
    hands,
    ascendingPile: 0,
    descendingPile: 100,
    currentPlayer: 0,
    numPlayers,
    gameStatus: 'playing', // 'playing', 'won', 'lost'
    hints: [],
    playLog: []
  };
}

export function playCard(gameState, playerIndex, cardIndex, pileType) {
  const { hands, deck, ascendingPile, descendingPile, currentPlayer } = gameState;
  
  // Validate it's the current player's turn
  if (playerIndex !== currentPlayer) {
    return { success: false, error: "Not your turn!" };
  }
  
  const card = hands[playerIndex][cardIndex];
  const pileTop = pileType === 'ascending' ? ascendingPile : descendingPile;
  const isAscending = pileType === 'ascending';
  
  // Validate the play
  if (!isValidPlay(card, pileTop, isAscending)) {
    return { success: false, error: "Invalid move!" };
  }
  
  // Make the play
  const newHands = hands.map((hand, i) => 
    i === playerIndex 
      ? hand.filter((_, idx) => idx !== cardIndex)
      : hand
  );
  
  // Draw a card if deck has cards
  if (deck.length > 0) {
    newHands[playerIndex].push(deck[0]);
  }
  
  const newDeck = deck.slice(1);
  const newAscendingPile = pileType === 'ascending' ? card : ascendingPile;
  const newDescendingPile = pileType === 'descending' ? card : descendingPile;
  
  // Move to next player
  const nextPlayer = (currentPlayer + 1) % gameState.numPlayers;
  
  // Add to play log
  const pileSymbol = pileType === 'ascending' ? '⬆️' : '⬇️';
  const logEntry = {
    type: 'play',
    player: playerIndex,
    card: card,
    pile: pileType,
    timestamp: Date.now(),
    text: `Player ${playerIndex + 1} played ${card} on ${pileSymbol} ${pileType} pile`
  };
  
  // Create new game state
  const newGameState = {
    ...gameState,
    hands: newHands,
    deck: newDeck,
    ascendingPile: newAscendingPile,
    descendingPile: newDescendingPile,
    currentPlayer: nextPlayer,
    playLog: [...gameState.playLog, logEntry]
  };
  
  // Check win/loss conditions
  if (checkWinCondition(newHands, newDeck)) {
    newGameState.gameStatus = 'won';
  } else if (checkLossCondition(newHands, newAscendingPile, newDescendingPile, nextPlayer)) {
    newGameState.gameStatus = 'lost';
  }
  
  return { success: true, newGameState };
}

export function addHint(gameState, playerName, hintText) {
  const hint = {
    player: playerName,
    text: hintText,
    timestamp: Date.now()
  };
  
  const logEntry = {
    type: 'hint',
    player: playerName,
    text: `💡 ${playerName}: ${hintText}`,
    timestamp: Date.now()
  };
  
  return {
    ...gameState,
    hints: [...gameState.hints, hint],
    playLog: [...gameState.playLog, logEntry]
  };
}
