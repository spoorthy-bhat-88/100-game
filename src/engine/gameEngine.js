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

export function hasLegalMove(hand, piles) {
  return hand.some(card => 
    isValidPlay(card, piles.ascending1, true) || 
    isValidPlay(card, piles.ascending2, true) ||
    isValidPlay(card, piles.descending1, false) || 
    isValidPlay(card, piles.descending2, false)
  );
}

export function checkLossCondition(hands, piles, currentPlayer) {
  // Game is lost if the current player has no legal move
  const currentHand = hands[currentPlayer];
  return currentHand.length > 0 && !hasLegalMove(currentHand, piles);
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
    ascending1: 0,
    ascending2: 0,
    descending1: 100,
    descending2: 100,
    currentPlayer: 0,
    numPlayers,
    gameStatus: 'playing', // 'playing', 'won', 'lost'
    hints: [],
    playLog: []
  };
}

export function playCard(gameState, playerIndex, cardIndex, pileType) {
  const { hands, deck, ascending1, ascending2, descending1, descending2, currentPlayer } = gameState;
  
  // Validate it's the current player's turn
  if (playerIndex !== currentPlayer) {
    return { success: false, error: "Not your turn!" };
  }
  
  const card = hands[playerIndex][cardIndex];
  let pileTop;
  let isAscending;
  
  // Determine pile top and direction
  switch(pileType) {
    case 'ascending1':
      pileTop = ascending1;
      isAscending = true;
      break;
    case 'ascending2':
      pileTop = ascending2;
      isAscending = true;
      break;
    case 'descending1':
      pileTop = descending1;
      isAscending = false;
      break;
    case 'descending2':
      pileTop = descending2;
      isAscending = false;
      break;
    default:
      return { success: false, error: "Invalid pile type!" };
  }
  
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
  
  // Update the appropriate pile
  const newAscending1 = pileType === 'ascending1' ? card : ascending1;
  const newAscending2 = pileType === 'ascending2' ? card : ascending2;
  const newDescending1 = pileType === 'descending1' ? card : descending1;
  const newDescending2 = pileType === 'descending2' ? card : descending2;
  
  // Move to next player
  const nextPlayer = (currentPlayer + 1) % gameState.numPlayers;
  
  // Add to play log
  const pileSymbol = isAscending ? '⬆️' : '⬇️';
  const pileLabel = pileType.includes('1') ? '1' : '2';
  const logEntry = {
    type: 'play',
    player: playerIndex,
    card: card,
    pile: pileType,
    timestamp: Date.now(),
    text: `Player ${playerIndex + 1} played ${card} on ${pileSymbol} ${isAscending ? 'Ascending' : 'Descending'} Pile ${pileLabel}`
  };
  
  // Create new game state
  const newGameState = {
    ...gameState,
    hands: newHands,
    deck: newDeck,
    ascending1: newAscending1,
    ascending2: newAscending2,
    descending1: newDescending1,
    descending2: newDescending2,
    currentPlayer: nextPlayer,
    playLog: [...gameState.playLog, logEntry]
  };
  
  // Check win/loss conditions
  const piles = {
    ascending1: newAscending1,
    ascending2: newAscending2,
    descending1: newDescending1,
    descending2: newDescending2
  };
  
  if (checkWinCondition(newHands, newDeck)) {
    newGameState.gameStatus = 'won';
  } else if (checkLossCondition(newHands, piles, nextPlayer)) {
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
