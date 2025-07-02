import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Chess } from 'chess.js';
import './App.css';

// Chess piece Unicode symbols
const PIECES = {
  'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
  'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
};

// Sound effects (using Web Audio API for offline functionality)
const playSound = (frequency, duration, type = 'move') => {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
    
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch (error) {
    console.log('Audio not supported');
  }
};

// Minimax AI Implementation
const evaluateBoard = (game) => {
  const board = game.board();
  let evaluation = 0;
  
  const pieceValues = {
    'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9, 'k': 0,
    'P': -1, 'N': -3, 'B': -3, 'R': -5, 'Q': -9, 'K': 0
  };
  
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const piece = board[i][j];
      if (piece) {
        evaluation += pieceValues[piece.type] || 0;
      }
    }
  }
  
  return evaluation;
};

const minimax = (game, depth, isMaximizing, alpha = -Infinity, beta = Infinity) => {
  if (depth === 0 || game.isGameOver()) {
    return evaluateBoard(game);
  }
  
  const moves = game.moves();
  
  if (isMaximizing) {
    let maxEval = -Infinity;
    for (let move of moves) {
      game.move(move);
      const evaluation = minimax(game, depth - 1, false, alpha, beta);
      game.undo();
      maxEval = Math.max(maxEval, evaluation);
      alpha = Math.max(alpha, evaluation);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (let move of moves) {
      game.move(move);
      const evaluation = minimax(game, depth - 1, true, alpha, beta);
      game.undo();
      minEval = Math.min(minEval, evaluation);
      beta = Math.min(beta, evaluation);
      if (beta <= alpha) break;
    }
    return minEval;
  }
};

const getBestMove = (game, difficulty) => {
  const depths = { easy: 2, medium: 3, hard: 4 };
  const depth = depths[difficulty] || 2;
  
  const moves = game.moves();
  let bestMove = null;
  let bestValue = -Infinity;
  
  for (let move of moves) {
    game.move(move);
    const value = minimax(game, depth - 1, false);
    game.undo();
    
    if (value > bestValue) {
      bestValue = value;
      bestMove = move;
    }
  }
  
  return bestMove;
};

// Main Chess Game Component
function App() {
  const [game, setGame] = useState(new Chess());
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [gameMode, setGameMode] = useState('pvp'); // 'pvp' or 'pve'
  const [difficulty, setDifficulty] = useState('medium');
  const [theme, setTheme] = useState('wood');
  const [gameStatus, setGameStatus] = useState('');
  const [moveHistory, setMoveHistory] = useState([]);
  const [aiThinking, setAiThinking] = useState(false);
  const [showCrown, setShowCrown] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showRetry, setShowRetry] = useState(false);
  const [capturedPieces, setCapturedPieces] = useState({ white: [], black: [] });
  const gameEndedRef = useRef(false);
  
  // Stats from localStorage
  const [stats, setStats] = useState(() => {
    const saved = localStorage.getItem('chessStats');
    return saved ? JSON.parse(saved) : { wins: 0, losses: 0, draws: 0 };
  });

  // Update stats function
  const updateStats = (result) => {
    setStats(prevStats => {
      const newStats = { ...prevStats };
      if (result === 'win') {
        newStats.wins++;
      } else if (result === 'loss') {
        newStats.losses++;
      } else if (result === 'draw') {
        newStats.draws++;
      }
      localStorage.setItem('chessStats', JSON.stringify(newStats));
      return newStats;
    });
  };

  // Update game status
  useEffect(() => {
    // Reset game ended flag when game starts
    if (moveHistory.length === 0) {
      gameEndedRef.current = false;
      setShowRetry(false);
    }

    if (game.isCheckmate() && !gameEndedRef.current) {
      gameEndedRef.current = true;
      const winner = game.turn() === 'w' ? 'Black' : 'White';
      setGameStatus(`Checkmate! ${winner} wins!`);
      setShowCrown(true);
      setShowRetry(true);
      playSound(523, 0.8); // Victory sound
      
      // Update stats for PvE mode
      if (gameMode === 'pve') {
        // Player is always white, AI is black
        if (winner === 'White') {
          updateStats('win');
        } else {
          updateStats('loss');
        }
      }
      
      setTimeout(() => setShowCrown(false), 3000);
    } else if (game.isDraw() && !gameEndedRef.current) {
      gameEndedRef.current = true;
      setGameStatus('Draw!');
      setShowRetry(true);
      if (gameMode === 'pve') {
        updateStats('draw');
      }
    } else if (game.isCheck()) {
      setGameStatus('Check!');
      playSound(440, 0.3);
    } else if (!game.isGameOver()) {
      setGameStatus(`${game.turn() === 'w' ? 'White' : 'Black'}'s turn`);
    }
  }, [game, gameMode, moveHistory.length]);

  // AI Move Handler
  const makeAIMove = useCallback(async () => {
    if (gameMode === 'pve' && game.turn() === 'b' && !game.isGameOver()) {
      setAiThinking(true);
      
      setTimeout(() => {
        const bestMove = getBestMove(game, difficulty);
        if (bestMove) {
          const newGame = new Chess(game.fen());
          const move = newGame.move(bestMove);
          setGame(newGame);
          setMoveHistory(prev => [...prev, move]);
          
          // Track captured pieces for AI moves
          if (move.captured) {
            setCapturedPieces(prev => ({
              ...prev,
              white: [...prev.white, move.captured]
            }));
            playSound(330, 0.4); // Capture sound
          } else {
            playSound(220, 0.2); // Move sound
          }
        }
        setAiThinking(false);
      }, 1000);
    }
  }, [game, gameMode, difficulty]);

  useEffect(() => {
    makeAIMove();
  }, [makeAIMove]);

  // Handle square click
  const handleSquareClick = (square) => {
    if (gameMode === 'pve' && game.turn() === 'b') return; // AI's turn
    if (game.isGameOver()) return;

    const piece = game.get(square);
    
    if (selectedSquare) {
      if (selectedSquare === square) {
        setSelectedSquare(null);
        return;
      }
      
      try {
        const move = game.move({
          from: selectedSquare,
          to: square,
          promotion: 'q' // Always promote to queen for simplicity
        });
        
        if (move) {
          const newGame = new Chess(game.fen());
          setGame(newGame);
          setMoveHistory(prev => [...prev, move]);
          setSelectedSquare(null);
          
          // Track captured pieces
          if (move.captured) {
            setCapturedPieces(prev => ({
              ...prev,
              [move.color === 'w' ? 'black' : 'white']: [
                ...prev[move.color === 'w' ? 'black' : 'white'],
                move.captured
              ]
            }));
            playSound(330, 0.4); // Capture sound
          } else {
            playSound(220, 0.2); // Move sound
          }
        } else {
          setSelectedSquare(piece && piece.color === game.turn() ? square : null);
        }
      } catch (error) {
        setSelectedSquare(piece && piece.color === game.turn() ? square : null);
      }
    } else {
      if (piece && piece.color === game.turn()) {
        setSelectedSquare(square);
      }
    }
  };

  // Get possible moves for selected piece
  const getPossibleMoves = () => {
    if (!selectedSquare) return [];
    return game.moves({ square: selectedSquare, verbose: true }).map(move => move.to);
  };

  // New Game
  const startNewGame = () => {
    setGame(new Chess());
    setSelectedSquare(null);
    setMoveHistory([]);
    setCapturedPieces({ white: [], black: [] });
    setGameStatus("White's turn");
    setShowCrown(false);
  };

  // Undo Move
  const undoMove = () => {
    if (moveHistory.length > 0) {
      const newGame = new Chess();
      const newHistory = [...moveHistory];
      const lastMove = newHistory.pop();
      
      if (gameMode === 'pve' && newHistory.length > 0) {
        const aiMove = newHistory.pop(); // Also undo AI move
        // Remove AI captured piece
        if (aiMove.captured) {
          setCapturedPieces(prev => ({
            ...prev,
            white: prev.white.slice(0, -1)
          }));
        }
      }
      
      // Remove player captured piece
      if (lastMove && lastMove.captured) {
        setCapturedPieces(prev => ({
          ...prev,
          [lastMove.color === 'w' ? 'black' : 'white']: prev[lastMove.color === 'w' ? 'black' : 'white'].slice(0, -1)
        }));
      }
      
      newHistory.forEach(move => {
        newGame.move(move);
      });
      
      setGame(newGame);
      setMoveHistory(newHistory);
      setSelectedSquare(null);
    }
  };

  // Render board
  const renderBoard = () => {
    const board = game.board();
    const possibleMoves = getPossibleMoves();
    
    return (
      <div className={`chess-board theme-${theme}`}>
        {board.map((row, i) => 
          row.map((piece, j) => {
            const square = String.fromCharCode(97 + j) + (8 - i);
            const isLight = (i + j) % 2 === 0;
            const isSelected = selectedSquare === square;
            const isPossibleMove = possibleMoves.includes(square);
            
            return (
              <div
                key={square}
                className={`chess-square ${isLight ? 'light' : 'dark'} ${isSelected ? 'selected' : ''} ${isPossibleMove ? 'possible-move' : ''}`}
                onClick={() => handleSquareClick(square)}
              >
                {piece && (
                  <div className={`chess-piece ${piece.color === 'w' ? 'white-piece' : 'black-piece'}`}>
                    {PIECES[piece.type.toUpperCase()]}
                  </div>
                )}
                {isPossibleMove && <div className="move-indicator" />}
              </div>
            );
          })
        )}
      </div>
    );
  };

  const totalGames = stats.wins + stats.losses + stats.draws;
  const winPercentage = totalGames > 0 ? ((stats.wins / totalGames) * 100).toFixed(1) : 0;
  const lossPercentage = totalGames > 0 ? ((stats.losses / totalGames) * 100).toFixed(1) : 0;

  return (
    <div className="app">
      {showCrown && (
        <div className="crown-celebration">
          <div className="crown">👑</div>
          <div className="celebration-text">Victory!</div>
        </div>
      )}
      
      {/* Stats Modal */}
      {showStats && (
        <div className="modal-overlay" onClick={() => setShowStats(false)}>
          <div className="stats-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📊 Game Statistics</h3>
              <button className="close-btn" onClick={() => setShowStats(false)}>×</button>
            </div>
            <div className="stats-grid">
              <div className="stat-item">
                <span className="stat-label">Wins:</span>
                <span className="stat-value">{stats.wins}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Losses:</span>
                <span className="stat-value">{stats.losses}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Draws:</span>
                <span className="stat-value">{stats.draws}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Win %:</span>
                <span className="stat-value">{winPercentage}%</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Loss %:</span>
                <span className="stat-value">{lossPercentage}%</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Total Games:</span>
                <span className="stat-value">{totalGames}</span>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <div className="game-header">
        <div className="header-top">
          <div className="logo">
            <div className="luxury-accent"></div>
            <div className="tech-pattern"></div>
            
            <div className="energy-rings"></div>
            <div className="energy-rings"></div>
            
            <div className="tactical-lines line-1"></div>
            <div className="tactical-lines line-2"></div>
            <div className="tactical-lines line-3"></div>
            <div className="tactical-lines line-4"></div>
            
            <div className="corner-indicators indicator-1"></div>
            <div className="corner-indicators indicator-2"></div>
            <div className="corner-indicators indicator-3"></div>
            <div className="corner-indicators indicator-4"></div>
            
            <div className="power-level"></div>
            
            <div className="knight-horse">♞</div>
            <div className="brand-text">KNIGHT CLASH</div>
          </div>
          
          <h1 className="game-title">KNIGHT CLASH</h1>
        </div>
        
        <div className="game-controls">
          <div className="control-group">
            <label>Game Mode:</label>
            <select 
              value={gameMode} 
              onChange={(e) => setGameMode(e.target.value)}
              disabled={!game.isGameOver() && moveHistory.length > 0}
            >
              <option value="pvp">Player vs Player</option>
              <option value="pve">Player vs AI</option>
            </select>
          </div>
          
          {gameMode === 'pve' && (
            <div className="control-group">
              <label>Difficulty:</label>
              <select 
                value={difficulty} 
                onChange={(e) => setDifficulty(e.target.value)}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          )}
          
          <div className="control-group">
            <label>Theme:</label>
            <select 
              value={theme} 
              onChange={(e) => setTheme(e.target.value)}
            >
              <option value="wood">Wood</option>
              <option value="marble">Marble</option>
              <option value="digital">Digital</option>
            </select>
          </div>
        </div>
        
        <div className="action-buttons">
          <button onClick={startNewGame} className="btn btn-primary">New Game</button>
          <button onClick={undoMove} className="btn btn-secondary" disabled={moveHistory.length === 0}>Undo Move</button>
        </div>
      </div>

      <div className="game-container">
        <div className="captured-pieces left">
          <h4>Captured Black</h4>
          <div className="captured-grid">
            {capturedPieces.black.map((piece, index) => (
              <div key={index} className="captured-piece black-piece">
                {PIECES[piece.toUpperCase()]}
              </div>
            ))}
          </div>
        </div>

        <div className="game-center">
          <div className="board-container">
            {renderBoard()}
          </div>
          
          {/* Minimalist Game Status */}
          <div className="status-bar">
            <div className="status-text">{gameStatus}</div>
            {aiThinking && <div className="ai-indicator">🤖 AI thinking...</div>}
          </div>
          
          {/* Retry Button - Only show when game ends */}
          {showRetry && gameMode === 'pve' && (
            <button onClick={startNewGame} className="btn btn-retry-center">
              🔄 Play Again
            </button>
          )}
        </div>

        <div className="captured-pieces right">
          <h4>Captured White</h4>
          <div className="captured-grid">
            {capturedPieces.white.map((piece, index) => (
              <div key={index} className="captured-piece white-piece">
                {PIECES[piece.toUpperCase()]}
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Stats Button - Bottom Right Corner */}
      <button 
        onClick={() => setShowStats(true)} 
        className="stats-button-corner"
        title="View Statistics"
      >
        📊
      </button>
    </div>
  );
}

export default App;