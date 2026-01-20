// Game Engine for the 100 Card Game

export function createDeck(maxCard = 99) {
  // Create cards numbered 1 to maxCard (excluding 0 and maxCard+1 since they're starting pile values)
  const deck = [];
  for (let i = 1; i <= maxCard; i++) {
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

export function dealInitialHands(deck, numPlayers, handSize = 4) {
  const hands = [];
  let deckIndex = 0;
  
  for (let i = 0; i < numPlayers; i++) {
    const hand = [];
    for (let j = 0; j < handSize; j++) {
      if (deckIndex < deck.length) {
        hand.push(deck[deckIndex++]);
      }
    }
    hands.push(hand);
  }
  
  const remainingDeck = deck.slice(deckIndex);
  return { hands, remainingDeck };
}

export function isValidPlay(card, pileTop, isAscending, backtrackAmount = 10) {
  if (isAscending) {
    // Can play cards greater than top, OR exactly backtrackAmount less than top
    return card > pileTop || card === pileTop - backtrackAmount;
  } else {
    // Can play cards less than top, OR exactly backtrackAmount more than top
    return card < pileTop || card === pileTop + backtrackAmount;
  }
}

export function hasLegalMove(hand, piles, backtrackAmount = 10) {
  return hand.some(card => 
    isValidPlay(card, piles.ascending1, true, backtrackAmount) || 
    isValidPlay(card, piles.ascending2, true, backtrackAmount) ||
    isValidPlay(card, piles.descending1, false, backtrackAmount) || 
    isValidPlay(card, piles.descending2, false, backtrackAmount)
  );
}

export function checkLossCondition(hands, piles, currentPlayer, backtrackAmount = 10) {
  // Game is lost if the current player has no legal move
  const currentHand = hands[currentPlayer];
  return currentHand.length > 0 && !hasLegalMove(currentHand, piles, backtrackAmount);
}

export function checkWinCondition(hands, deck) {
  // Game is won when deck is empty AND all hands are empty
  return deck.length === 0 && hands.every(hand => hand.length === 0);
}

export function initializeGame(numPlayers, handSize = 4, minCardsPerTurn = 2, maxCard = 99, backtrackAmount = 10) {
  const deck = shuffleDeck(createDeck(maxCard));
  const { hands, remainingDeck } = dealInitialHands(deck, numPlayers, handSize);
  
  return {
    deck: remainingDeck,
    hands,
    ascending1: 0,
    ascending2: 0,
    descending1: maxCard + 1,
    descending2: maxCard + 1,
    currentPlayer: 0,
    numPlayers,
    handSize,
    minCardsPerTurn,
    maxCard,
    backtrackAmount,
    cardsPlayedThisTurn: 0,
    version: 0,
    gameStatus: 'playing', // 'playing', 'won', 'lost'
    hints: [],
    playLog: []
  };
}

export function playCard(gameState, playerIndex, cardIndex, pileType) {
  const { hands, deck, ascending1, ascending2, descending1, descending2, currentPlayer, minCardsPerTurn, cardsPlayedThisTurn, backtrackAmount = 10 } = gameState;
  
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
  if (!isValidPlay(card, pileTop, isAscending, backtrackAmount)) {
    return { success: false, error: "Invalid move!" };
  }
  
  // Make the play - remove card from hand
  const newHands = hands.map((hand, i) => 
    i === playerIndex 
      ? hand.filter((_, idx) => idx !== cardIndex)
      : hand
  );
  
  // Don't draw cards yet - wait until turn ends
  const newDeck = deck;
  
  // Update the appropriate pile
  const newAscending1 = pileType === 'ascending1' ? card : ascending1;
  const newAscending2 = pileType === 'ascending2' ? card : ascending2;
  const newDescending1 = pileType === 'descending1' ? card : descending1;
  const newDescending2 = pileType === 'descending2' ? card : descending2;
  
  // Increment cards played this turn
  const newCardsPlayedThisTurn = cardsPlayedThisTurn + 1;
  
  // Player stays as current player - they must manually end turn
  const nextPlayer = currentPlayer;
  const finalCardsPlayedThisTurn = newCardsPlayedThisTurn;
  
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
    cardsPlayedThisTurn: finalCardsPlayedThisTurn,
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
  } else if (checkLossCondition(newHands, piles, nextPlayer, backtrackAmount)) {
    newGameState.gameStatus = 'lost';
  }
  
  return { success: true, newGameState };
}

export function endTurn(gameState) {
  const { currentPlayer, cardsPlayedThisTurn, minCardsPerTurn, hands, deck, numPlayers } = gameState;
  
  // If current player has no cards, allow them to skip without playing
  if (hands[currentPlayer].length === 0) {
    // Skip to next player with cards
    let nextPlayer = (currentPlayer + 1) % numPlayers;
    let skippedPlayers = 0;
    
    while (hands[nextPlayer].length === 0 && skippedPlayers < numPlayers) {
      nextPlayer = (nextPlayer + 1) % numPlayers;
      skippedPlayers++;
    }
    
    return {
      success: true,
      newGameState: {
        ...gameState,
        currentPlayer: nextPlayer,
        cardsPlayedThisTurn: 0
      }
    };
  }
  
  // When deck is empty, only require 1 card per turn; otherwise use configured minimum
  const requiredCards = deck.length === 0 ? 1 : minCardsPerTurn;
  
  // Can only end turn if minimum cards have been played
  if (cardsPlayedThisTurn < requiredCards) {
    return { 
      success: false, 
      error: `You must play at least ${requiredCards} card${requiredCards > 1 ? 's' : ''} per turn!${deck.length === 0 ? ' (Deck empty - only 1 card required)' : ''}` 
    };
  }
  
  // Draw cards equal to the number of cards played this turn
  const newHands = [...hands];
  let newDeck = [...deck];
  let cardsDrawn = 0;
  
  for (let i = 0; i < cardsPlayedThisTurn && newDeck.length > 0; i++) {
    newHands[currentPlayer].push(newDeck[0]);
    newDeck = newDeck.slice(1);
    cardsDrawn++;
  }
  
  // Find next player with cards (skip players with empty hands)
  let nextPlayer = (currentPlayer + 1) % numPlayers;
  let skippedPlayers = 0;
  
  while (newHands[nextPlayer].length === 0 && skippedPlayers < numPlayers) {
    nextPlayer = (nextPlayer + 1) % numPlayers;
    skippedPlayers++;
  }
  
  const newGameState = {
    ...gameState,
    hands: newHands,
    deck: newDeck,
    currentPlayer: nextPlayer,
    cardsPlayedThisTurn: 0
  };
  
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
