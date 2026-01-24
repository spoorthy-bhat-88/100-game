import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PlayerHand from './PlayerHand';

describe('PlayerHand Component', () => {
    
    // Testing "My" Hand (Visible cards)
    describe('My Hand', () => {
        const hand = [10, 25, 40, 99];
        const onCardSelect = vi.fn();

        it('should render all cards in hand', () => {
            render(
                <PlayerHand 
                    isMyHand={true} 
                    hand={hand} 
                    playerName="Test Player" 
                    isCurrentPlayer={true}
                    onCardSelect={onCardSelect}
                />
            );
            
            expect(screen.getByText('10')).toBeInTheDocument();
            expect(screen.getByText('99')).toBeInTheDocument();
            expect(screen.getAllByText(/Test Player/)).toHaveLength(1);
        });

        it('should call onCardSelect when a card is clicked AND it is my turn', () => {
             render(
                <PlayerHand 
                    isMyHand={true} 
                    hand={hand} 
                    playerName="Test Player" 
                    isCurrentPlayer={true}
                    onCardSelect={onCardSelect}
                />
            );
            
            fireEvent.click(screen.getByText('25').closest('.card'));
            expect(onCardSelect).toHaveBeenCalledWith(1); // Index of 25 is 1
        });

        it('should NOT call onCardSelect when it is NOT my turn', () => {
             const onCardSelectNoTurn = vi.fn();
             render(
                <PlayerHand 
                    isMyHand={true} 
                    hand={hand} 
                    playerName="Test Player" 
                    isCurrentPlayer={false}
                    onCardSelect={onCardSelectNoTurn}
                />
            );
            
            fireEvent.click(screen.getByText('25').closest('.card'));
            expect(onCardSelectNoTurn).not.toHaveBeenCalled();
        });

        it('should highlight the selected card', () => {
             render(
                <PlayerHand 
                    isMyHand={true} 
                    hand={hand} 
                    playerName="Test Player" 
                    isCurrentPlayer={true}
                    selectedCard={2} // Index 2 is '40'
                    onCardSelect={() => {}}
                />
            );
            
            const selectedCardElement = screen.getByText('40').closest('.card');
            expect(selectedCardElement).toHaveClass('selected');
        });

        it('should show active turn indicator', () => {
             render(
                <PlayerHand 
                    isMyHand={true} 
                    hand={hand} 
                    playerName="Test Player" 
                    isCurrentPlayer={true}
                />
            );
            expect(screen.getByText('⏱️ Playing')).toBeInTheDocument();
        });

        it('should NOT show active turn indicator if not turn', () => {
             render(
                <PlayerHand 
                    isMyHand={true} 
                    hand={hand} 
                    playerName="Test Player" 
                    isCurrentPlayer={false}
                />
            );
            expect(screen.queryByText('⏱️ Playing')).not.toBeInTheDocument();
        });
    });

    // Testing "Opponent" Hand (Hidden cards)
    describe('Opponent Hand', () => {
        it('should NOT show card values', () => {
            render(
                <PlayerHand 
                    isMyHand={false} 
                    cardCount={5}
                    playerName="Opponent" 
                    isCurrentPlayer={false}
                />
            );
            
            const cardNumbers = screen.queryByText('10'); // Assuming 10 was in hand
            expect(cardNumbers).not.toBeInTheDocument();
        });

        it('should show card count', () => {
            render(
                <PlayerHand 
                    isMyHand={false} 
                    cardCount={5}
                    playerName="Opponent" 
                    isCurrentPlayer={false}
                />
            );
            
            expect(screen.getByText('5')).toBeInTheDocument();
            expect(screen.getByText('cards')).toBeInTheDocument();
        });
    });
});
