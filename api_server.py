"""
API server for serving the trained RL agents to the React frontend.
Handles initialization and step-by-step execution of both baseline and fair agents.
"""
import json
from typing import Dict, List, Optional
import os

import numpy as np
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
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

# Load models at startup
try:
    baseline_model = PPO.load("outputs/ppo_baseline_v2.zip")
    fair_model = PPO.load("outputs/ppo_mitigated_v2.zip")
    print("Models loaded successfully")
except Exception as e:
    print(f"Warning: Could not load models - {e}")
    baseline_model = None
    fair_model = None

# Global env instances
baseline_env = None
fair_env = None


class InitRequest(BaseModel):
    agent_type: str
    seed: Optional[int] = None


class StepRequest(BaseModel):
    agent_type: str


class InitResponse(BaseModel):
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


@app.get("/")
def root():
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
    global baseline_env, fair_env

    try:
        env = create_environment(request.agent_type, request.seed)
        obs, info = env.reset(seed=request.seed)
        
        # Store env in global state so we can call step() later
        if request.agent_type == "baseline":
            baseline_env = env
        else:
            fair_env = env
        
        add_extra_info(env, info)
        return InitResponse(observation=obs.tolist(), info=info)
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Error initializing environment: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/step", response_model=StepResponse)
def step_environment(request: StepRequest):
    """Run one timestep - get action from model and execute it in the environment"""
    global baseline_env, fair_env

    # Select correct env and model based on agent type
    if request.agent_type == "baseline":
        env = baseline_env
        model = baseline_model
    elif request.agent_type == "fair":
        env = fair_env
        model = fair_model
    else:
        raise HTTPException(status_code=400, detail="Invalid agent_type")
    
    if env is None or model is None:
        raise HTTPException(status_code=400, detail=f"{request.agent_type} environment not initialized")

    try:
        obs = env._get_obs()
        action, _ = model.predict(obs, deterministic=True)
        next_obs, reward, terminated, truncated, info = env.step(int(action))
        
        add_extra_info(env, info)
        
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
    global baseline_env, fair_env
    baseline_env = None
    fair_env = None
    return {"status": "reset"}


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    print(f"Starting API server on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)
