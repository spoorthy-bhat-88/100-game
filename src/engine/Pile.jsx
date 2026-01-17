import React from 'react';
import './Pile.css';

function Pile({ type, topCard, onCardDrop, canAcceptCard, label }) {
  const isAscending = type === 'ascending';
  const direction = isAscending ? '↑' : '↓';
  const pileLabel = label || (isAscending ? 'Ascending Pile' : 'Descending Pile');
  const alternateValue = isAscending ? topCard - 10 : topCard + 10;
  const showAlternate = alternateValue >= 1 && alternateValue <= 99;
  
  return (
    <div className={`pile ${type}`}>
      <div className="pile-header">
        <h3>{pileLabel} {direction}</h3>
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
