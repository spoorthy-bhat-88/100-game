import React from 'react';
import './Pile.css';

function Pile({ type, topCard, onCardDrop, canAcceptCard, label, backtrackAmount = 10, maxCard = 99 }) {
  const isAscending = type === 'ascending';
  const direction = isAscending ? '↑' : '↓';
  const pileLabel = label || (isAscending ? 'Ascending Pile' : 'Descending Pile');
  const alternateValue = isAscending ? topCard - backtrackAmount : topCard + backtrackAmount;
  const showAlternate = alternateValue >= 1 && alternateValue <= maxCard;
  
  return (
    <div className={`pile ${type}`}>
      <div className="pile-header">
        <h3>{pileLabel}</h3>
        <p className="pile-rule">
          {isAscending ? 'Play > ' : 'Play < '}{topCard}
        </p>
        {showAlternate && (
          <p className="pile-rule-alt">
            or play {alternateValue}
          </p>
        )}
      </div>
      <div 
        className={`pile-card ${canAcceptCard ? 'can-accept' : ''}`}
        onClick={() => canAcceptCard && onCardDrop()}
      >
        <div className="card-number">{topCard}</div>
      </div>
    </div>
  );
}

export default Pile;
