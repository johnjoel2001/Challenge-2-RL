import React, { useState, useEffect, useRef, useCallback } from 'react';
import './TrafficSimulation.css';

const W = 500, H = 500, MID = 250, RW = 80;

// Basic traffic simulation with fixed-time signals
const useTrafficSimulation = () => {
  const [state, setState] = useState({
    phase: 1,
    t: 0,
    q: { n: 0, s: 0, e: 0, w: 0 },
    cw: { n: 0, s: 0, e: 0, w: 0 },
    reward: 0,
    served: 0,
    tss: 0,
    wNS: 0,
    wEW: 0,
    gap: 0,
  });

  const rate = 0.25;

  const reset = useCallback(() => {
    setState({
      phase: 1,
      t: 0,
      q: { n: 0, s: 0, e: 0, w: 0 },
      cw: { n: 0, s: 0, e: 0, w: 0 },
      reward: 0,
      served: 0,
      tss: 0,
      wNS: 0,
      wEW: 0,
      gap: 0,
    });
  }, []);

  const step = useCallback(() => {
    setState(prev => {
      const newState = { ...prev };
      newState.t++;

      // Spawn new cars randomly based on arrival rate
      const q = { ...prev.q };
      if (Math.random() < rate) q.n = Math.min(20, q.n + 1);
      if (Math.random() < rate) q.s = Math.min(20, q.s + 1);
      if (Math.random() < rate) q.e = Math.min(20, q.e + 1);
      if (Math.random() < rate) q.w = Math.min(20, q.w + 1);
      newState.q = q;

      // Switch phases every 50 timesteps
      newState.tss = prev.tss + 1;
      if (newState.tss >= 50) {
        newState.phase = prev.phase === 0 ? 1 : 0;
        newState.tss = 0;
      } else {
        newState.phase = prev.phase;
      }

      // Serve cars based on current green phase
      const flow = 3;
      let sv = 0;
      if (newState.phase === 0) {
        sv += Math.min(q.e, flow);
        q.e = Math.max(0, q.e - flow);
        sv += Math.min(q.w, flow);
        q.w = Math.max(0, q.w - flow);
      } else {
        sv += Math.min(q.n, flow);
        q.n = Math.max(0, q.n - flow);
        sv += Math.min(q.s, flow);
        q.s = Math.max(0, q.s - flow);
      }
      newState.served = prev.served + sv;
      newState.q = q;

      // Accumulate wait times for fairness calculation
      const cw = { ...prev.cw };
      cw.n += q.n;
      cw.s += q.s;
      cw.e += q.e;
      cw.w += q.w;
      newState.cw = cw;

      newState.wNS = (cw.n + cw.s) / Math.max(1, newState.t);
      newState.wEW = (cw.e + cw.w) / Math.max(1, newState.t);
      newState.gap = Math.abs(newState.wNS - newState.wEW);
      newState.reward = prev.reward + sv - 0.01 * (q.n + q.s + q.e + q.w);

      return newState;
    });
  }, [rate]);

  return { state, step, reset };
};

// Signal Indicator Component
const SignalIndicator = ({ isGreen }) => (
  <span className={`ts-signal-dot ${isGreen ? 'ts-signal-green' : 'ts-signal-red'}`} />
);

// Stats Metric Component
const Metric = ({ label, value, accent }) => (
  <div className="ts-metric">
    <span className="ts-metric-label">{label}</span>
    <span className={`ts-metric-value ${accent ? `ts-accent-${accent}` : ''}`}>{value}</span>
  </div>
);

// Canvas Component
const TrafficCanvas = ({ state, ewCars, nsCars }) => {
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
    ctx.fillRect(0, MID - RW / 2, W, RW);
    ctx.fillRect(MID - RW / 2, 0, RW, H);

    // Subtle lane markings
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.setLineDash([12, 16]);

    ctx.beginPath();
    ctx.moveTo(0, MID);
    ctx.lineTo(MID - RW / 2, MID);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(MID + RW / 2, MID);
    ctx.lineTo(W, MID);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(MID, 0);
    ctx.lineTo(MID, MID - RW / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(MID, MID + RW / 2);
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
    ctx.fillText('W', 14, MID - RW / 2 - 10);
    ctx.textAlign = 'right';
    ctx.fillText('E', W - 14, MID - RW / 2 - 10);

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

    // NS flowing cars
    if (state.phase === 1) {
      nsCars.forEach(c => {
        drawCar(c.x, c.y, 12, 20, 'rgba(99, 179, 237, 0.95)', 'vertical', true);
      });
    }

    // Waiting cars
    if (state.phase === 0) {
      for (let i = 0; i < Math.min(state.q.n, 8); i++) {
        drawCar(MID + 4, MID - RW / 2 - 24 - i * 20, 12, 16, 'rgba(99, 179, 237, 0.7)', 'vertical', false);
      }
      for (let i = 0; i < Math.min(state.q.s, 8); i++) {
        drawCar(MID - 16, MID + RW / 2 + 10 + i * 20, 12, 16, 'rgba(99, 179, 237, 0.7)', 'vertical', false);
      }
    } else {
      for (let i = 0; i < Math.min(state.q.e, 8); i++) {
        drawCar(MID + RW / 2 + 10 + i * 20, MID - 14, 18, 12, 'rgba(237, 137, 54, 0.7)', 'horizontal', false);
      }
      for (let i = 0; i < Math.min(state.q.w, 8); i++) {
        drawCar(MID - RW / 2 - 28 - i * 20, MID + 2, 18, 12, 'rgba(237, 137, 54, 0.7)', 'horizontal', false);
      }
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

  return <canvas ref={canvasRef} className="ts-canvas" />;
};

// Main Component
const TrafficSimulation = () => {
  const { state, step, reset } = useTrafficSimulation();
  const [running, setRunning] = useState(false);
  const [ewCars, setEwCars] = useState([]);
  const [nsCars, setNsCars] = useState([]);
  const timerRef = useRef(null);

  const spawnFlowCars = useCallback((arr, isHorizontal) => {
    const newCars = [...arr];
    if (Math.random() < 0.45) {
      if (isHorizontal) {
        newCars.push({ x: -20, y: MID - 12, speed: 4 + Math.random() * 3 });
        if (Math.random() < 0.4) {
          newCars.push({ x: W + 20, y: MID + 4, speed: -(4 + Math.random() * 3) });
        }
      } else {
        newCars.push({ x: MID + 6, y: -20, speed: 4 + Math.random() * 3 });
        if (Math.random() < 0.4) {
          newCars.push({ x: MID - 16, y: H + 20, speed: -(4 + Math.random() * 3) });
        }
      }
    }
    return newCars;
  }, []);

  const updateFlowCars = useCallback((arr, isHorizontal) => {
    return arr
      .map(c => ({
        ...c,
        x: isHorizontal ? c.x + c.speed : c.x,
        y: !isHorizontal ? c.y + c.speed : c.y,
      }))
      .filter(c => c.x > -30 && c.x < W + 30 && c.y > -30 && c.y < H + 30);
  }, []);

  const tick = useCallback(() => {
    step();
  }, [step]);

  useEffect(() => {
    if (state.phase === 0) {
      setEwCars(prev => updateFlowCars(spawnFlowCars(prev, true), true));
      setNsCars([]);
    } else {
      setNsCars(prev => updateFlowCars(spawnFlowCars(prev, false), false));
      setEwCars([]);
    }
  }, [state.t, state.phase, spawnFlowCars, updateFlowCars]);

  useEffect(() => {
    if (running && state.t < 200) {
      timerRef.current = setInterval(tick, 160);
    } else {
      clearInterval(timerRef.current);
      if (state.t >= 200) setRunning(false);
    }
    return () => clearInterval(timerRef.current);
  }, [running, state.t, tick]);

  const handleStart = () => setRunning(true);
  const handlePause = () => setRunning(false);
  const handleReset = () => {
    setRunning(false);
    reset();
    setEwCars([]);
    setNsCars([]);
  };

  const isDone = state.t >= 200;
  const progress = (state.t / 200) * 100;

  return (
    <div className="ts-root">
      <div className="ts-container">
        {/* Subtitle and Controls */}
        <div className="ts-header">
          <p className="ts-subtitle">Symmetric traffic distribution / no reward hacking</p>
          <div className="ts-controls">
            {!running ? (
              <button className="ts-btn ts-btn-primary" onClick={handleStart} disabled={isDone}>
                {isDone ? 'Complete' : 'Start'}
              </button>
            ) : (
              <button className="ts-btn ts-btn-muted" onClick={handlePause}>
                Pause
              </button>
            )}
            <button className="ts-btn ts-btn-ghost" onClick={handleReset}>
              Reset
            </button>
          </div>
        </div>

        {/* Progress */}
        <div className="ts-progress-track">
          <div className="ts-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="ts-step-label">
          {isDone
            ? `Complete — fairness gap: ${state.gap.toFixed(2)}`
            : `Step ${state.t} of 200`}
        </div>

        {/* Main Layout */}
        <div className="ts-layout">
          {/* Canvas */}
          <div className="ts-canvas-wrap">
            <div className="ts-signal-row">
              <span className="ts-signal-label">NS</span>
              <SignalIndicator isGreen={state.phase === 1} />
              <span className="ts-signal-divider" />
              <span className="ts-signal-label">EW</span>
              <SignalIndicator isGreen={state.phase === 0} />
            </div>
            <TrafficCanvas state={state} ewCars={ewCars} nsCars={nsCars} />
          </div>

          {/* Stats Sidebar */}
          <div className="ts-sidebar">
            <div className="ts-sidebar-section">
              <div className="ts-section-label">Average Wait</div>
              <Metric label="NS" value={state.wNS.toFixed(1)} accent="blue" />
              <Metric label="EW" value={state.wEW.toFixed(1)} accent="orange" />
            </div>

            <div className="ts-sidebar-section">
              <div className="ts-section-label">Queue</div>
              <Metric label="NS waiting" value={state.q.n + state.q.s} />
              <Metric label="EW waiting" value={state.q.e + state.q.w} />
            </div>

            <div className="ts-sidebar-section">
              <div className="ts-section-label">Performance</div>
              <Metric label="Fairness gap" value={state.gap.toFixed(2)} accent={state.gap < 0.5 ? 'green' : 'red'} />
              <Metric label="Total reward" value={Math.round(state.reward)} />
              <Metric label="Cars served" value={state.served} />
            </div>
          </div>
        </div>

        {/* Explanation */}
        <div className="ts-explanation">
          <div className="ts-explanation-title">How this differs from reward hacking</div>
          <div className="ts-explanation-grid">
            <div className="ts-explanation-card">
              <div className="ts-card-heading">Normal Environment</div>
              <p>Traffic is equal in all directions (~0.25 spawn rate). The agent alternates the green light naturally because there is no incentive to favor one direction.</p>
            </div>
            <div className="ts-explanation-card">
              <div className="ts-card-heading">Reward Hacking Scenario</div>
              <p>EW has 5x more traffic than NS. The baseline agent learns to keep EW green forever, maximizing throughput while NS cars wait indefinitely.</p>
            </div>
            <div className="ts-explanation-card">
              <div className="ts-card-heading">Fair Agent</div>
              <p>A fairness penalty prevents exploitation, ensuring all directions receive service even when traffic is asymmetric.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrafficSimulation;
