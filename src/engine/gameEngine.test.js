import { describe, it, expect, beforeEach } from 'vitest';
import * as GameEngine from './gameEngine';

describe('Game Engine', () => {
    describe('createDeck', () => {
        it('should create a deck with cards from 1 to maxCard', () => {
            const maxCard = 10;
            const deck = GameEngine.createDeck(maxCard);
            expect(deck.length).toBe(maxCard);
            expect(deck[0]).toBe(1);
            expect(deck[maxCard - 1]).toBe(maxCard);
        });

        it('should default maxCard to 99', () => {
            const deck = GameEngine.createDeck();
            expect(deck.length).toBe(99);
        });
    });

    describe('dealInitialHands', () => {
        it('should deal equal cards to all players even if hand size is small', () => {
            const deck = [1, 2, 3, 4, 5, 6, 7, 8];
            const numPlayers = 2;
            const handSize = 2;
            const { hands, remainingDeck } = GameEngine.dealInitialHands(deck, numPlayers, handSize);
            
            expect(hands.length).toBe(numPlayers);
            hands.forEach(hand => expect(hand.length).toBe(handSize));
            expect(remainingDeck.length).toBe(deck.length - (numPlayers * handSize));
            expect(remainingDeck).toEqual([5, 6, 7, 8]);
        });
    });

    describe('isValidPlay', () => {
        it('should allow playing higher card on ascending pile', () => {
            expect(GameEngine.isValidPlay(20, 10, true)).toBe(true);
        });

        it('should NOT allow playing lower card on ascending pile', () => {
            expect(GameEngine.isValidPlay(5, 10, true)).toBe(false);
        });

        it('should allow backtracking (playing exactly -10) on ascending pile', () => {
             expect(GameEngine.isValidPlay(10, 20, true, 10)).toBe(true);
        });

        it('should allow playing lower card on descending pile', () => {
            expect(GameEngine.isValidPlay(80, 90, false)).toBe(true);
        });

        it('should NOT allow playing higher card on descending pile', () => {
            expect(GameEngine.isValidPlay(95, 90, false)).toBe(false);
        });

        it('should allow backtracking (playing exactly +10) on descending pile', () => {
            expect(GameEngine.isValidPlay(90, 80, false, 10)).toBe(true);
        });
    });

    describe('hasLegalMove', () => {
        const piles = {
            ascending1: 10,
            ascending2: 20,
            descending1: 90,
            descending2: 80
        };

        it('should return true if hand has a legal move', () => {
            const hand = [15, 5, 95];
            // 15 > 10 (asc1) - valid
            expect(GameEngine.hasLegalMove(hand, piles)).toBe(true);
        });

        it('should return true if hand has a backtrack move', () => {
            const hand = [0, 100, 70]; // 70 is not +10 of 80 or 90
            const specialPiles = {
                ascending1: 50,
                ascending2: 50,
                descending1: 50,
                descending2: 50
            };
            // Need +10 on desc (60) or -10 on asc (40).
            const magicHand = [40]; 
            expect(GameEngine.hasLegalMove(magicHand, specialPiles, 10)).toBe(true);
        });

        it('should return false if hand has no moves', () => {
            const hand = [50]; 
            const impossiblePiles = {
                ascending1: 98,
                ascending2: 98,
                descending1: 2,
                descending2: 2
            };
            expect(GameEngine.hasLegalMove(hand, impossiblePiles)).toBe(false);
        });
    });

    describe('initializeGame', () => {
        it('should initialize game state correctly', () => {
            const numPlayers = 3;
            const handSize = 4;
            const state = GameEngine.initializeGame(numPlayers, handSize);

            expect(state.numPlayers).toBe(numPlayers);
            expect(state.hands.length).toBe(numPlayers);
            expect(state.hands[0].length).toBe(handSize);
            expect(state.ascending1).toBe(0);
            expect(state.descending1).toBe(100); // 99 + 1
            expect(state.currentPlayer).toBe(0);
            expect(state.gameStatus).toBe('playing');
        });
    });

    describe('checkWinCondition', () => {
        it('should return true if deck and all hands are empty', () => {
            const emptyHands = [[], []];
            const emptyDeck = [];
            expect(GameEngine.checkWinCondition(emptyHands, emptyDeck)).toBe(true);
        });

        it('should return false if deck is not empty', () => {
            const emptyHands = [[], []];
            const deck = [1];
            expect(GameEngine.checkWinCondition(emptyHands, deck)).toBe(false);
        });

        it('should return false if any hand is not empty', () => {
            const hands = [[], [1]];
            const emptyDeck = [];
            expect(GameEngine.checkWinCondition(hands, emptyDeck)).toBe(false);
        });
    });

    describe('playCard', () => {
        let gameState;
        
        beforeEach(() => {
            gameState = GameEngine.initializeGame(2, 4);
            // Setup a predictable hand for player 0
            gameState.hands[0] = [10, 20, 30, 40];
            gameState.ascending1 = 0;
            gameState.cardsPlayedThisTurn = 0;
            gameState.currentPlayer = 0;
        });

        it('should play a valid card', () => {
            // Player 0 plays 10 on ascending1 (0) -> Valid
            const result = GameEngine.playCard(gameState, 0, 0, 'ascending1'); // cardIndex 0 is value 10
            
            expect(result.success).toBe(true);
            const newState = result.newGameState;
            expect(newState.hands[0]).not.toContain(10);
            expect(newState.ascending1).toBe(10);
            expect(newState.cardsPlayedThisTurn).toBe(1);
            expect(newState.currentPlayer).toBe(0); // Turn doesn't end automatically
        });

        it('should fail if not player turn', () => {
            const result = GameEngine.playCard(gameState, 1, 0, 'ascending1');
            expect(result.success).toBe(false);
            expect(result.error).toMatch(/Not your turn/);
        });

        it('should fail if invalid move', () => {
             // Try to play 10 on descending1 (100) -> Valid (10 < 100)
             // Let's modify pile to make it invalid
             gameState.ascending1 = 50;
             // Player plays 10 on ascending1 (50) -> Invalid (10 < 50)
             const result = GameEngine.playCard(gameState, 0, 0, 'ascending1');
             expect(result.success).toBe(false);
             expect(result.error).toMatch(/Invalid move/);
        });
    });

    describe('endTurn', () => {
        let gameState;

        beforeEach(() => {
             gameState = GameEngine.initializeGame(2, 4);
             gameState.minCardsPerTurn = 2;
        });

        it('should fail if min cards not played', () => {
            gameState.cardsPlayedThisTurn = 1;
            const result = GameEngine.endTurn(gameState);
            expect(result.success).toBe(false);
            expect(result.error).toMatch(/must play at least 2 cards/);
        });

        it('should succeed if min cards played and refill hand', () => {
            gameState.cardsPlayedThisTurn = 2;
            gameState.hands[0] = [30, 40]; // Played 2 cards, 2 left
            gameState.deck = [50, 60, 70, 80];
            
            const result = GameEngine.endTurn(gameState);
            
            expect(result.success).toBe(true);
            const newState = result.newGameState;
            expect(newState.currentPlayer).toBe(1);
            expect(newState.cardsPlayedThisTurn).toBe(0);
            
            // Should have drawn 2 cards
            expect(newState.hands[0].length).toBe(4); 
            expect(newState.deck.length).toBe(2);
        });

        it('should skip player if hand is empty', () => {
            // Setup: Player 0 ends turn. Player 1 has empty hand. Should go to Player 0 (or next valid)?
            // Wait, if Player 1 has empty hand, they should be skipped.
            // Let's test 3 players. 0 plays, 1 empty, 2 has cards. 0 -> 2.
            
            gameState = GameEngine.initializeGame(3, 4);
            gameState.hands[1] = []; // Player 1 empty
            gameState.hands[2] = [10];
            gameState.cardsPlayedThisTurn = 2;
            gameState.currentPlayer = 0;
            
            const result = GameEngine.endTurn(gameState);
            expect(result.success).toBe(true);
            expect(result.newGameState.currentPlayer).toBe(2);
        });
    });
});
