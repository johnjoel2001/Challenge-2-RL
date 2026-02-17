"""
API server for serving the trained RL agents to the React frontend.
Handles initialization and step-by-step execution of both baseline and fair agents.
"""
import json
from typing import Dict, List, Optional
import os
from pathlib import Path
import uuid

import numpy as np
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from stable_baselines3 import PPO

from traffic_env import TrafficIntersectionEnv

app = FastAPI(title="Traffic Signal RL API", version="1.0.0")

# Get CORS origins from environment variable or use defaults for local dev
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load models at startup (configurable via environment variables)
BASELINE_MODEL_PATH = os.getenv("BASELINE_MODEL_PATH", "outputs/ppo_baseline.zip")
FAIR_MODEL_PATH = os.getenv("FAIR_MODEL_PATH", "outputs/ppo_mitigated.zip")

try:
    baseline_model = PPO.load(BASELINE_MODEL_PATH)
    print(f"Baseline model loaded from {BASELINE_MODEL_PATH}")
except Exception as e:
    print(f"Warning: Could not load baseline model from {BASELINE_MODEL_PATH} - {e}")
    baseline_model = None

try:
    fair_model = PPO.load(FAIR_MODEL_PATH)
    print(f"Fair model loaded from {FAIR_MODEL_PATH}")
except Exception as e:
    print(f"Warning: Could not load fair model from {FAIR_MODEL_PATH} - {e}")
    fair_model = None

# Session storage: maps episode_id to (env, agent_type, model) tuples
active_sessions: Dict[str, tuple] = {}


class InitRequest(BaseModel):
    agent_type: str
    seed: Optional[int] = None


class StepRequest(BaseModel):
    episode_id: str


class InitResponse(BaseModel):
    episode_id: str
    observation: List[float]
    info: Dict


class StepResponse(BaseModel):
    action: int
    observation: List[float]
    reward: float
    done: bool
    info: Dict


def create_environment(agent_type, seed=None):
    """
    Create and configure an environment based on agent type.
    
    Baseline agent: no fairness penalty, lower safety weight, stricter TTC threshold
    Fair agent: includes fairness penalty, higher safety weight, more lenient TTC threshold
    """
    if agent_type == "baseline":
        env = TrafficIntersectionEnv(
            max_steps=200,
            ns_rate_range=(0.05, 0.15),
            ew_rate_range=(0.28, 0.5),
            visibility_range=(0.4, 1.0),
            fast_car_prob_range=(0.02, 0.18),
            fairness_weight=0.0,  # baseline doesn't care about fairness
            safety_weight=2.0,
            scenario_pool=None,
            scenario_pool_prob=0.0,
            seed=seed,
        )
        env.ttc_threshold = 1.2
    elif agent_type == "fair":
        env = TrafficIntersectionEnv(
            max_steps=200,
            ns_rate_range=(0.05, 0.15),
            ew_rate_range=(0.28, 0.5),
            visibility_range=(0.4, 1.0),
            fast_car_prob_range=(0.02, 0.18),
            fairness_weight=0.08,  # penalizes unfair wait times
            safety_weight=3.0,
            scenario_pool=None,
            scenario_pool_prob=0.4,
            seed=seed,
        )
        env.ttc_threshold = 1.4
    else:
        raise ValueError(f"Unknown agent_type: {agent_type}")
    
    return env


def add_extra_info(env, info):
    """Augment info dict with current phase and queue sizes for visualization"""
    info['phase'] = env.phase
    info['queue_ns'] = env.queue_n + env.queue_s
    info['queue_ew'] = env.queue_e + env.queue_w
    return info


@app.get("/api/status")
def status():
    return {
        "service": "Traffic Signal RL API",
        "status": "running",
        "models": {
            "baseline": baseline_model is not None,
            "fair": fair_model is not None,
        },
    }


@app.post("/init", response_model=InitResponse)
def initialize_episode(request: InitRequest):
    """Initialize a new episode with the specified agent and optional seed"""
    try:
        # Create environment
        env = create_environment(request.agent_type, request.seed)
        obs, info = env.reset(seed=request.seed)
        
        # Select model based on agent type
        if request.agent_type == "baseline":
            model = baseline_model
        elif request.agent_type == "fair":
            model = fair_model
        else:
            raise ValueError(f"Unknown agent_type: {request.agent_type}")
        
        # Generate unique episode ID and store session
        episode_id = str(uuid.uuid4())
        active_sessions[episode_id] = (env, request.agent_type, model)
        
        add_extra_info(env, info)
        return InitResponse(episode_id=episode_id, observation=obs.tolist(), info=info)
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Error initializing environment: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/step", response_model=StepResponse)
def step_environment(request: StepRequest):
    """Run one timestep - get action from model and execute it in the environment"""
    # Lookup session by episode_id
    if request.episode_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Episode not found. Call /init first.")
    
    env, agent_type, model = active_sessions[request.episode_id]
    
    if model is None:
        raise HTTPException(status_code=500, detail=f"Model for {agent_type} not loaded")

    try:
        obs = env._get_obs()
        action, _ = model.predict(obs, deterministic=True)
        next_obs, reward, terminated, truncated, info = env.step(int(action))
        
        add_extra_info(env, info)
        
        # Clean up session if episode is done
        if terminated or truncated:
            del active_sessions[request.episode_id]
        
        return StepResponse(
            action=int(action),
            observation=next_obs.tolist(),
            reward=float(reward),
            done=terminated or truncated,
            info=info,
        )
    except Exception as e:
        print(f"Step error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/reset")
def reset_environments():
    """Clear all active environment instances"""
    active_sessions.clear()
    return {"status": "reset", "cleared_sessions": True}


# Mount static files for the React frontend 
STATIC_DIR = Path(__file__).parent / "react-demo" / "dist"
if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="static")
    
    @app.get("/{full_path:path}")
    async def serve_react_app(full_path: str):
        """Serve React app for all non-API routes"""
        # Don't interfere with API routes
        if full_path.startswith(("api", "docs", "openapi.json", "redoc")):
            raise HTTPException(status_code=404, detail="Not found")
        
        # Check if a static file exists for this path
        file_path = STATIC_DIR / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        
        # Otherwise, serve the React app's index.html (for SPA routing)
        index_file = STATIC_DIR / "index.html"
        if index_file.exists():
            return FileResponse(index_file)
        
        raise HTTPException(status_code=404, detail="Not found")
else:
    print("Warning: React frontend dist directory not found. Only API will be available.")


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    print(f"Starting API server on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)
