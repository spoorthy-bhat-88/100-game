import React from 'react';
import './Pile.css';

function Pile({ type, topCard, onCardDrop, canAcceptCard }) {
  const isAscending = type === 'ascending';
  const direction = isAscending ? '↑' : '↓';
  const label = isAscending ? 'Ascending Pile' : 'Descending Pile';
  const alternateValue = isAscending ? topCard - 10 : topCard + 10;
  const showAlternate = alternateValue >= 0 && alternateValue <= 100;
  
  return (
    <div className={`pile ${type}`}>
      <div className="pile-header">
        <h3>{label} {direction}</h3>
        <p className="pile-rule">
          {isAscending ? 'Play cards > ' : 'Play cards < '}{topCard}
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
