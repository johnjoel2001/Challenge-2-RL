import React, { useState, useEffect, useRef, useCallback } from 'react';
import './RewardHackingDemo.css';
import { useModelBasedSim } from '../hooks/useModelBasedSim';

const W = 500, H = 500, MID = 250, ROAD_W = 80;

// Hardcoded baseline behavior - favors EW heavily (reward hacking)
const useBaselineSim = () => {
  const [state, setState] = useState({
    phase: 0,
    t: 0,
    reward: 0,
    served: 0,
    nsWaitTotal: 0,
    greenEW: 0,
    greenNS: 0,
    wNS: 0,
    wEW: 0,
    gap: 0,
    greenPctEW: '0',
    greenPctNS: '0',
  });

  const reset = useCallback(() => {
    setState({
      phase: 0,
      t: 0,
      reward: 0,
      served: 0,
      nsWaitTotal: 0,
      greenEW: 0,
      greenNS: 0,
      wNS: 0,
      wEW: 0,
      gap: 0,
      greenPctEW: '0',
      greenPctNS: '0',
    });
  }, []);

  const step = useCallback(() => {
    setState(prev => {
      const newState = { ...prev };
      newState.t++;

      // Agent only gives NS green for 10% of the time (reward hacking!)
      // Brief green periods at t=70-79 and t=150-159
      const isNSGreen = (newState.t >= 70 && newState.t < 80) || 
                        (newState.t >= 150 && newState.t < 160);
      newState.phase = isNSGreen ? 1 : 0;

      if (newState.phase === 0) newState.greenEW++;
      else newState.greenNS++;

      let ewServed = 0;
      if (newState.phase === 0) {
        ewServed = 3 + Math.floor(Math.random() * 3);
      }
      newState.served = prev.served + ewServed;

      let nsServed = 0;
      if (newState.phase === 1) {
        nsServed = 2;
        newState.served += nsServed;
      } else {
        newState.nsWaitTotal = prev.nsWaitTotal + 2;
      }

      newState.wNS = newState.nsWaitTotal / Math.max(1, newState.t);
      newState.wEW = newState.phase === 0 ? 0.1 : (newState.greenEW > 0 ? 0.2 : 0);
      newState.gap = Math.abs(newState.wNS - newState.wEW);

      newState.reward = prev.reward + ewServed + nsServed;
      newState.greenPctEW = ((newState.greenEW / Math.max(1, newState.t)) * 100).toFixed(0);
      newState.greenPctNS = ((newState.greenNS / Math.max(1, newState.t)) * 100).toFixed(0);

      return newState;
    });
  }, []);

  return { state, step, reset };
};

// Fair agent simulation - balances wait times between directions
const useFairSim = () => {
  const [state, setState] = useState({
    phase: 0,
    t: 0,
    tss: 0,
    reward: 0,
    served: 0,
    nsWaitTotal: 0,
    greenEW: 0,
    greenNS: 0,
    wNS: 0,
    wEW: 0,
    gap: 0,
    greenPctEW: '0',
    greenPctNS: '0',
  });

  const reset = useCallback(() => {
    setState({
      phase: 0,
      t: 0,
      tss: 0,
      reward: 0,
      served: 0,
      nsWaitTotal: 0,
      greenEW: 0,
      greenNS: 0,
      wNS: 0,
      wEW: 0,
      gap: 0,
      greenPctEW: '0',
      greenPctNS: '0',
    });
  }, []);

  const step = useCallback(() => {
    setState(prev => {
      const newState = { ...prev };
      newState.t++;

      // Fair agent switches every 60 steps for more balanced service
      newState.tss = prev.tss + 1;
      if (newState.tss >= 60) {
        newState.phase = prev.phase === 0 ? 1 : 0;
        newState.tss = 0;
      } else {
        newState.phase = prev.phase;
      }

      if (newState.phase === 0) newState.greenEW++;
      else newState.greenNS++;

      let ewServed = 0;
      if (newState.phase === 0) {
        ewServed = 3 + Math.floor(Math.random() * 3);
      }
      newState.served = prev.served + ewServed;

      let nsServed = 0;
      if (newState.phase === 1) {
        nsServed = 2;
        newState.served += nsServed;
      } else {
        newState.nsWaitTotal = prev.nsWaitTotal + 2;
      }

      newState.wNS = newState.nsWaitTotal / Math.max(1, newState.t);
      newState.wEW = newState.phase === 0 ? 0.1 : (newState.greenEW > 0 ? 0.2 : 0);
      newState.gap = Math.abs(newState.wNS - newState.wEW);

      // Fair agent penalizes reward for fairness gap
      newState.reward = prev.reward + ewServed + nsServed - 0.08 * newState.gap;
      newState.greenPctEW = ((newState.greenEW / Math.max(1, newState.t)) * 100).toFixed(0);
      newState.greenPctNS = ((newState.greenNS / Math.max(1, newState.t)) * 100).toFixed(0);

      return newState;
    });
  }, []);

  return { state, step, reset };
};

const SignalIndicator = ({ isGreen }) => (
  <span className={`rh-signal-dot ${isGreen ? 'rh-signal-green' : 'rh-signal-red'}`} />
);

const Metric = ({ label, value, accent }) => (
  <div className="rh-metric">
    <span className="rh-metric-label">{label}</span>
    <span className={`rh-metric-value ${accent ? `rh-accent-${accent}` : ''}`}>{value}</span>
  </div>
);

// Visual indicator of fairness level
const FairnessBar = ({ gap }) => {
  const pct = Math.min(100, (gap / 5) * 100);
  const label = gap < 0.5 ? 'Fair' : gap < 1.5 ? 'Moderate' : gap < 3 ? 'Unfair' : 'Critical';
  const color = gap < 0.5 ? '#48bb78' : gap < 1.5 ? '#ed8936' : '#fc8181';

  return (
    <div className="rh-fairness-wrap">
      <div className="rh-fairness-bar" style={{ width: `${pct}%`, background: color }} />
      <span className="rh-fairness-label">{label}</span>
    </div>
  );
};

// Main intersection canvas with car animation
const IntersectionCanvas = ({ state, ewCars, nsCars }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';

    // Background
    ctx.fillStyle = '#0c0c12';
    ctx.fillRect(0, 0, W, H);

    // Roads
    ctx.fillStyle = '#141420';
    ctx.fillRect(0, MID - ROAD_W / 2, W, ROAD_W);
    ctx.fillRect(MID - ROAD_W / 2, 0, ROAD_W, H);

    // Subtle lane markings
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.setLineDash([12, 16]);

    ctx.beginPath();
    ctx.moveTo(0, MID);
    ctx.lineTo(MID - ROAD_W / 2, MID);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(MID + ROAD_W / 2, MID);
    ctx.lineTo(W, MID);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(MID, 0);
    ctx.lineTo(MID, MID - ROAD_W / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(MID, MID + ROAD_W / 2);
    ctx.lineTo(MID, H);
    ctx.stroke();
    ctx.setLineDash([]);

    // Direction labels
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.font = '500 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', MID, 22);
    ctx.fillText('S', MID, H - 14);
    ctx.textAlign = 'left';
    ctx.fillText('W', 14, MID - ROAD_W / 2 - 10);
    ctx.textAlign = 'right';
    ctx.fillText('E', W - 14, MID - ROAD_W / 2 - 10);

    // Draw realistic car function
    const drawCar = (x, y, width, height, color, direction, isMoving = true) => {
      ctx.save();
      
      // Car body
      ctx.fillStyle = color;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 2;
      
      // Main body with rounded corners
      ctx.beginPath();
      const radius = 2;
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + width - radius, y);
      ctx.arcTo(x + width, y, x + width, y + radius, radius);
      ctx.lineTo(x + width, y + height - radius);
      ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
      ctx.lineTo(x + radius, y + height);
      ctx.arcTo(x, y + height, x, y + height - radius, radius);
      ctx.lineTo(x, y + radius);
      ctx.arcTo(x, y, x + radius, y, radius);
      ctx.closePath();
      ctx.fill();
      
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      
      // Windows
      ctx.fillStyle = 'rgba(150, 200, 255, 0.4)';
      if (direction === 'horizontal') {
        // Front/back windows
        ctx.fillRect(x + 2, y + 2, width * 0.35, height - 4);
        ctx.fillRect(x + width - width * 0.35 - 2, y + 2, width * 0.35, height - 4);
      } else {
        // Front/back windows
        ctx.fillRect(x + 2, y + 2, width - 4, height * 0.35);
        ctx.fillRect(x + 2, y + height - height * 0.35 - 2, width - 4, height * 0.35);
      }
      
      // Headlights (only on moving cars)
      if (isMoving) {
        ctx.fillStyle = 'rgba(255, 255, 200, 0.9)';
        if (direction === 'horizontal') {
          ctx.fillRect(x + width - 1, y + 1, 2, height - 2);
        } else {
          ctx.fillRect(x + 1, y + height - 1, width - 2, 2);
        }
      }
      
      // Wheels/tires
      ctx.fillStyle = '#1a1a1a';
      if (direction === 'horizontal') {
        ctx.fillRect(x + 2, y - 1, 3, 2);
        ctx.fillRect(x + 2, y + height - 1, 3, 2);
        ctx.fillRect(x + width - 5, y - 1, 3, 2);
        ctx.fillRect(x + width - 5, y + height - 1, 3, 2);
      } else {
        ctx.fillRect(x - 1, y + 2, 2, 3);
        ctx.fillRect(x + width - 1, y + 2, 2, 3);
        ctx.fillRect(x - 1, y + height - 5, 2, 3);
        ctx.fillRect(x + width - 1, y + height - 5, 2, 3);
      }
      
      ctx.restore();
    };

    // EW flowing cars
    if (state.phase === 0) {
      ewCars.forEach(c => {
        drawCar(c.x, c.y, 20, 12, 'rgba(237, 137, 54, 0.95)', 'horizontal', true);
      });
    }

    // NS flowing cars (when NS green)
    if (state.phase === 1) {
      nsCars.forEach(c => {
        drawCar(c.x, c.y, 12, 20, 'rgba(99, 179, 237, 0.95)', 'vertical', true);
      });
    }

    // NS waiting cars (when NS red)
    if (state.phase === 0) {
      for (let i = 0; i < 2; i++) {
        drawCar(MID + 4, MID - ROAD_W / 2 - 24 - i * 20, 12, 16, 'rgba(99, 179, 237, 0.7)', 'vertical', false);
      }
      for (let i = 0; i < 2; i++) {
        drawCar(MID - 16, MID + ROAD_W / 2 + 10 + i * 20, 12, 16, 'rgba(99, 179, 237, 0.7)', 'vertical', false);
      }
    }

    // NS green glow
    if (state.phase === 1) {
      ctx.fillStyle = 'rgba(72, 187, 120, 0.12)';
      ctx.fillRect(MID - 7, MID - ROAD_W / 2, 14, ROAD_W);
    }

    // Traffic lights — realistic signal boxes
    const nsActive = state.phase === 1;
    const ewActive = state.phase === 0;

    const drawTrafficLight = (x, y, active, label) => {
      ctx.save();
      
      // Signal box housing
      ctx.fillStyle = '#2a2a2a';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
      ctx.fillRect(x - 12, y - 24, 24, 48);
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      
      // Signal box edge highlight
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 12, y - 24, 24, 48);
      
      // Red light (top)
      const isRed = !active;
      ctx.beginPath();
      ctx.arc(x, y - 12, 7, 0, Math.PI * 2);
      ctx.fillStyle = isRed ? '#ff3a3a' : 'rgba(80, 30, 30, 0.4)';
      if (isRed) {
        ctx.shadowColor = 'rgba(255, 58, 58, 0.8)';
        ctx.shadowBlur = 16;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
      
      // Add light reflection
      if (isRed) {
        ctx.beginPath();
        ctx.arc(x - 2, y - 14, 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.fill();
      }
      
      // Yellow light (middle)
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(80, 70, 30, 0.4)';
      ctx.fill();
      
      // Green light (bottom)
      const isGreen = active;
      ctx.beginPath();
      ctx.arc(x, y + 12, 7, 0, Math.PI * 2);
      ctx.fillStyle = isGreen ? '#30d158' : 'rgba(30, 80, 40, 0.4)';
      if (isGreen) {
        ctx.shadowColor = 'rgba(48, 209, 88, 0.8)';
        ctx.shadowBlur = 16;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
      
      // Add light reflection
      if (isGreen) {
        ctx.beginPath();
        ctx.arc(x - 2, y + 10, 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.fill();
      }
      
      // Label below
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.font = '600 9px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(label, x, y + 28);
      
      ctx.restore();
    };

    drawTrafficLight(MID, 55, nsActive, 'N');
    drawTrafficLight(MID, H - 55, nsActive, 'S');
    drawTrafficLight(W - 55, MID, ewActive, 'E');
    drawTrafficLight(55, MID, ewActive, 'W');
  }, [state, ewCars, nsCars]);

  return <canvas ref={canvasRef} className="rh-canvas" />;
};

// Agent Panel Component
const AgentPanel = ({ label, variant, state, ewCars, nsCars, note }) => (
  <div className={`rh-panel rh-panel-${variant}`}>
    <div className="rh-panel-head">
      <span className={`rh-panel-indicator rh-indicator-${variant}`} />
      <span className="rh-panel-label">{label}</span>
    </div>

    <div className="rh-signal-row">
      <span className="rh-signal-tag">NS</span>
      <SignalIndicator isGreen={state.phase === 1} />
      <span className="rh-signal-sep" />
      <span className="rh-signal-tag">EW</span>
      <SignalIndicator isGreen={state.phase === 0} />
    </div>

    <div className="rh-canvas-container">
      <IntersectionCanvas state={state} ewCars={ewCars} nsCars={nsCars} />
    </div>

    <div className="rh-stats">
      <div className="rh-section-label">Wait Times</div>
      <Metric label="NS avg wait" value={state.wNS.toFixed(1)} accent="blue" />
      <Metric label="EW avg wait" value={state.wEW.toFixed(1)} accent="orange" />

      <div className="rh-section-label" style={{ marginTop: 16 }}>Fairness</div>
      <Metric label="Gap" value={state.gap.toFixed(1)} accent={state.gap < 1 ? 'green' : 'red'} />
      <FairnessBar gap={state.gap} />

      <div className="rh-section-label" style={{ marginTop: 16 }}>Performance</div>
      <Metric label="Reward" value={Math.round(state.reward)} />
      <Metric label="Served" value={state.served} />
    </div>

    <div className={`rh-note rh-note-${variant}`}>{note}</div>
  </div>
);

// Main Component
const RewardHackingDemo = () => {
  const [mode, setMode] = useState('hardcoded'); // 'hardcoded' or 'model'
  const [running, setRunning] = useState(false);
  const [ewCarsBl, setEwCarsBl] = useState([]);
  const [ewCarsFa, setEwCarsFa] = useState([]);
  const [nsCarsBl, setNsCarsBl] = useState([]);
  const [nsCarsFa, setNsCarsFa] = useState([]);
  const timerRef = useRef(null);

  // Hardcoded simulation hooks
  const baselineHardcoded = useBaselineSim();
  const fairHardcoded = useFairSim();

  // Model-based simulation hooks
  const baselineModel = useModelBasedSim('baseline');
  const fairModel = useModelBasedSim('fair');

  // Select the active hooks based on mode
  const baseline = mode === 'hardcoded' ? baselineHardcoded : baselineModel;
  const fair = mode === 'hardcoded' ? fairHardcoded : fairModel;

  const spawnEWCars = (arr) => {
    const newCars = [...arr];
    if (Math.random() < 0.5) {
      newCars.push({ x: -20, y: MID - 12, speed: 4 + Math.random() * 3 });
    }
    if (Math.random() < 0.5) {
      newCars.push({ x: W + 20, y: MID + 4, speed: -(4 + Math.random() * 3) });
    }
    return newCars;
  };

  const updateEWCars = (arr) => {
    return arr
      .map(c => ({ ...c, x: c.x + c.speed }))
      .filter(c => c.x > -30 && c.x < W + 30);
  };

  const spawnNSCars = (arr) => {
    const newCars = [...arr];
    if (Math.random() < 0.4) {
      newCars.push({ x: MID + 6, y: -20, speed: 4 + Math.random() * 3 });
    }
    if (Math.random() < 0.3) {
      newCars.push({ x: MID - 16, y: H + 20, speed: -(4 + Math.random() * 3) });
    }
    return newCars;
  };

  const updateNSCars = (arr) => {
    return arr
      .map(c => ({ ...c, y: c.y + c.speed }))
      .filter(c => c.y > -30 && c.y < H + 30);
  };

  const tick = useCallback(() => {
    baseline.step();
    fair.step();
  }, [baseline, fair]);

  useEffect(() => {
    if (baseline.state.phase === 0) {
      setEwCarsBl(prev => updateEWCars(spawnEWCars(prev)));
      setNsCarsBl([]);
    } else {
      setNsCarsBl(prev => updateNSCars(spawnNSCars(prev)));
      setEwCarsBl([]);
    }
    if (fair.state.phase === 0) {
      setEwCarsFa(prev => updateEWCars(spawnEWCars(prev)));
      setNsCarsFa([]);
    } else {
      setNsCarsFa(prev => updateNSCars(spawnNSCars(prev)));
      setEwCarsFa([]);
    }
  }, [baseline.state.t, fair.state.t, baseline.state.phase, fair.state.phase]);

  useEffect(() => {
    if (running && baseline.state.t < 200) {
      timerRef.current = setInterval(tick, 160);
    } else {
      clearInterval(timerRef.current);
      if (baseline.state.t >= 200) setRunning(false);
    }
    return () => clearInterval(timerRef.current);
  }, [running, baseline.state.t, tick]);

  // Initialize model-based simulations when component mounts or mode changes
  useEffect(() => {
    if (mode === 'model' && !baseline.state.isInitialized) {
      baselineModel.reset();
      fairModel.reset();
    }
  }, [mode, baseline.state.isInitialized, baselineModel, fairModel]);

  const handleStart = () => setRunning(true);
  const handlePause = () => setRunning(false);
  const handleReset = async () => {
    setRunning(false);
    if (mode === 'model') {
      await baseline.reset();
      await fair.reset();
    } else {
      baseline.reset();
      fair.reset();
    }
    setEwCarsBl([]);
    setEwCarsFa([]);
    setNsCarsBl([]);
    setNsCarsFa([]);
  };

  const handleModeSwitch = async (newMode) => {
    setRunning(false);
    setMode(newMode);
    // Initialize model-based simulations when switching to model mode
    if (newMode === 'model') {
      await baselineModel.reset();
      await fairModel.reset();
    } else {
      baselineHardcoded.reset();
      fairHardcoded.reset();
    }
    setEwCarsBl([]);
    setEwCarsFa([]);
    setNsCarsBl([]);
    setNsCarsFa([]);
  };

  const isDone = baseline.state.t >= 200;
  const progress = (baseline.state.t / 200) * 100;

  return (
    <div className="rh-root">
      <div className="rh-container">
        {/* Header */}
        <div className="rh-header">
          <div className="rh-header-text">
            <h1 className="rh-title">Reward Hacking</h1>
            <p className="rh-subtitle">Baseline vs Fair agent under asymmetric traffic</p>
          </div>
          <div className="rh-mode-selector">
            <button
              className={`rh-mode-btn ${mode === 'hardcoded' ? 'rh-mode-active' : ''}`}
              onClick={() => handleModeSwitch('hardcoded')}
              disabled={running}
            >
              Hardcoded
            </button>
            <button
              className={`rh-mode-btn ${mode === 'model' ? 'rh-mode-active' : ''}`}
              onClick={() => handleModeSwitch('model')}
              disabled={running}
            >
              Model-Based
            </button>
          </div>
          <div className="rh-controls">
            {!running ? (
              <button className="rh-btn rh-btn-primary" onClick={handleStart} disabled={isDone}>
                {isDone ? 'Complete' : 'Start'}
              </button>
            ) : (
              <button className="rh-btn rh-btn-muted" onClick={handlePause}>
                Pause
              </button>
            )}
            <button className="rh-btn rh-btn-ghost" onClick={handleReset}>
              Reset
            </button>
          </div>
        </div>

        {/* Status Indicator */}
        {mode === 'model' && (
          <div className="rh-status-indicator">
            {baseline.state.error || fair.state.error ? (
              <div className="rh-status-error">
                API Connection Failed: {baseline.state.error || fair.state.error}
                <span className="rh-status-hint">Make sure the API server is running and accessible</span>
              </div>
            ) : baseline.state.isInitialized && fair.state.isInitialized ? (
              <div className="rh-status-success">
                Connected to Trained Models (Baseline & Fair Agents)
              </div>
            ) : (
              <div className="rh-status-loading">
                Initializing model inference...
              </div>
            )}
          </div>
        )}

        {/* Progress */}
        <div className="rh-progress-track">
          <div className="rh-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="rh-status-row">
          <span className="rh-step-label">
            {isDone ? 'Complete' : `Step ${baseline.state.t} / 200`}
          </span>
          <span className="rh-status-metrics">
            Baseline EW {baseline.state.greenPctEW}%
            <span className="rh-status-sep" />
            Fair EW {fair.state.greenPctEW}%
          </span>
        </div>

        {/* Panels */}
        <div className="rh-grid">
          <AgentPanel
            label="Baseline Agent — Reward Hacking"
            variant="bad"
            state={baseline.state}
            ewCars={ewCarsBl}
            nsCars={nsCarsBl}
            note="EW has more traffic. Agent keeps EW green indefinitely. NS cars starve."
          />
          <AgentPanel
            label="Fair Agent — Balanced"
            variant="good"
            state={fair.state}
            ewCars={ewCarsFa}
            nsCars={nsCarsFa}
            note="Fairness penalty ensures both directions receive balanced green time."
          />
        </div>
      </div>
    </div>
  );
};

export default RewardHackingDemo;
