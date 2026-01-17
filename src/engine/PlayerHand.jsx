import React from 'react';
import './PlayerHand.css';

function PlayerHand({ 
  playerIndex, 
  playerName,
  hand, 
  isCurrentPlayer, 
  selectedCard, 
  onCardSelect,
  canPlayOnAscending,
  canPlayOnDescending,
  cardCount,
  isMyHand
}) {
  return (
    <div className={`player-hand ${isCurrentPlayer ? 'current-player' : ''} ${!isMyHand ? 'other-player' : ''}`}>
      <div className="player-info">
        <h3>
          {isMyHand ? `👤 ${playerName} (You)` : playerName}
        </h3>
        {isCurrentPlayer && <span className="turn-indicator">⏱️ Playing</span>}
      </div>
      {isMyHand ? (
        <div className="cards">
          {hand.map((card, index) => {
            const isSelected = selectedCard === index;
            const canPlay = isCurrentPlayer && (
              canPlayOnAscending(card) || canPlayOnDescending(card)
            );
            
            return (
              <div
                key={`${card}-${index}`}
                className={`card ${isSelected ? 'selected' : ''} ${!canPlay && isCurrentPlayer ? 'unplayable' : ''}`}
                onClick={() => isCurrentPlayer && onCardSelect(index)}
              >
                <div className="card-number">{card}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card-count">
          <div className="count-icon">🃏</div>
          <div className="count-text">{cardCount}</div>
          <div className="count-label">{cardCount === 1 ? 'card' : 'cards'}</div>
        </div>
      )}
    </div>
  );
}

export default PlayerHand;
