// Main app component with navigation between demo modes
import { useState } from 'react';
import TrafficSimulation from './components/TrafficSimulation';
import RewardHackingDemo from './components/RewardHackingDemo';
import './App.css';

function App() {
  const [activeDemo, setActiveDemo] = useState('reward-hacking');

  return (
    <div className="app">
      <nav className="nav-bar">
        <div className="nav-brand">
          <span className="nav-brand-icon" />
          Traffic Signal RL
        </div>
        <div className="nav-tabs">
          <button
            className={`nav-tab ${activeDemo === 'reward-hacking' ? 'nav-tab-active' : ''}`}
            onClick={() => setActiveDemo('reward-hacking')}
          >
            Reward Hacking Demo
          </button>
          <button
            className={`nav-tab ${activeDemo === 'normal' ? 'nav-tab-active' : ''}`}
            onClick={() => setActiveDemo('normal')}
          >
            Standard Sim
          </button>
        </div>
      </nav>
      
      <main className="main-content">
        {activeDemo === 'reward-hacking' ? <RewardHackingDemo /> : <TrafficSimulation />}
      </main>
    </div>
  );
}

export default App;
