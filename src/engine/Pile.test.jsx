import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Pile from './Pile';

describe('Pile Component', () => {
    it('should render the pile with the current value', () => {
        render(<Pile type="ascending" topCard={10} onCardDrop={() => {}} />);
        expect(screen.getByText('10')).toBeInTheDocument();
        expect(screen.getByText('Ascending Pile')).toBeInTheDocument();
    });

    it('should show "1" for ascending start', () => {
         render(<Pile type="ascending" topCard={1} onCardDrop={() => {}} />);
         expect(screen.getByText('1')).toBeInTheDocument();
    });

    it('should allow dropping a card (interaction test)', () => {
        const onCardDrop = vi.fn();
        render(<Pile type="ascending" topCard={10} onCardDrop={onCardDrop} canAcceptCard={true} />);
        
        const pileCard = screen.getByText('10').closest('.pile-card');
        fireEvent.click(pileCard);
        
        expect(onCardDrop).toHaveBeenCalledTimes(1);
    });

    it('should NOT allow click if canAcceptCard is false', () => {
        const onCardDrop = vi.fn();
         render(<Pile type="ascending" topCard={10} onCardDrop={onCardDrop} canAcceptCard={false} />);
        
        const pileCard = screen.getByText('10').closest('.pile-card');
        fireEvent.click(pileCard);
        
        expect(onCardDrop).not.toHaveBeenCalled();
    });

    it('should show backtrack hint if applicable', () => {
         // topCard 20, backtrack 10 -> alternate is 10. Valid.
         render(<Pile type="ascending" topCard={20} backtrackAmount={10} maxCard={99} />);
         expect(screen.getByText('or play 10')).toBeInTheDocument();
    });

    it('should NOT show backtrack hint if out of bounds', () => {
         // topCard 5, backtrack 10 -> alternate is -5 (Invalid).
         render(<Pile type="ascending" topCard={5} backtrackAmount={10} maxCard={99} />);
         expect(screen.queryByText(/or play -/)).not.toBeInTheDocument();
    });
});
