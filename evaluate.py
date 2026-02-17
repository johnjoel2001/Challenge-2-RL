"""
Evaluation script for testing trained PPO agents on traffic intersection control.
Runs multiple episodes and collects metrics on fairness, safety, and performance.
"""
import argparse
import json
from typing import Any, Dict, List, Optional

import numpy as np
from stable_baselines3 import PPO

from traffic_env import TrafficIntersectionEnv


def load_model(path: Optional[str]) -> Optional[PPO]:
    """Load a trained PPO model, or return None for random baseline"""
    if not path:
        return None
    return PPO.load(path)


def run_episode(env: TrafficIntersectionEnv, model: Optional[PPO], deterministic: bool) -> Dict[str, Any]:
    """
    Run a single episode and collect all relevant metrics.
    Tracks fairness gaps, wait times, collisions, and hard cases for analysis.
    """
    obs, info = env.reset()
    done = False
    episode_reward = 0.0
    fairness_gaps: List[float] = []
    waits_ns: List[float] = []
    waits_ew: List[float] = []
    collisions = 0
    hard_cases: List[Dict[str, float]] = []

    while not done:
        # Random baseline if no model provided
        if model is None:
            action = env.action_space.sample()
        else:
            action, _ = model.predict(obs, deterministic=deterministic)
        
        obs, reward, terminated, truncated, info = env.step(action)
        done = terminated or truncated
        episode_reward += float(reward)
        
        fairness_gaps.append(info["fairness_gap"])
        waits_ns.append(info["avg_wait_ns"])
        waits_ew.append(info["avg_wait_ew"])
        collisions += int(info["collision"])
        
        # Save scenarios that cause problems for later analysis
        if info["collision"] or info["fairness_gap"] > 3.0:
            hard_cases.append(info["scenario"])

    return {
        "reward": episode_reward,
        "fairness_gap": float(np.mean(fairness_gaps)),
        "avg_wait_ns": float(np.mean(waits_ns)),
        "avg_wait_ew": float(np.mean(waits_ew)),
        "collisions": collisions,
        "hard_cases": hard_cases,
    }


def evaluate(
    model: Optional[PPO],
    episodes: int,
    env_kwargs: Dict[str, Any],
    deterministic: bool,
    hard_case_out: Optional[str],
) -> Dict[str, Any]:
    """
    Run multiple evaluation episodes and aggregate results.
    Optionally saves hard cases (collisions or high fairness gaps) to a JSON file.
    """
    metrics = []
    hard_cases: List[Dict[str, float]] = []
    
    for _ in range(episodes):
        env = TrafficIntersectionEnv(**env_kwargs)
        result = run_episode(env, model, deterministic)
        metrics.append(result)
        hard_cases.extend(result["hard_cases"])

    summary = {
        "reward_mean": float(np.mean([m["reward"] for m in metrics])),
        "reward_std": float(np.std([m["reward"] for m in metrics])),
        "fairness_gap_mean": float(np.mean([m["fairness_gap"] for m in metrics])),
        "avg_wait_ns": float(np.mean([m["avg_wait_ns"] for m in metrics])),
        "avg_wait_ew": float(np.mean([m["avg_wait_ew"] for m in metrics])),
        "collisions": int(np.sum([m["collisions"] for m in metrics])),
    }

    # Save hard cases
    if hard_case_out:
        with open(hard_case_out, "w", encoding="utf-8") as handle:
            json.dump(hard_cases, handle, indent=2)
        summary["hard_cases_saved"] = hard_case_out
        summary["hard_cases_count"] = len(hard_cases)

    return summary


def main() -> None:
    """Parse args and run evaluation on a trained model"""
    parser = argparse.ArgumentParser(description="Evaluate PPO policy for fairness and safety.")
    parser.add_argument("--model", default=None)
    parser.add_argument("--episodes", type=int, default=30)
    parser.add_argument("--deterministic", action="store_true")
    parser.add_argument("--hard-cases-out", default=None)
    parser.add_argument("--fairness-weight", type=float, default=0.0)
    parser.add_argument("--safety-weight", type=float, default=2.0)
    parser.add_argument("--scenario-prob", type=float, default=0.0)
    parser.add_argument("--ttc-threshold", type=float, default=1.2)
    args = parser.parse_args()

    env_kwargs = {
        "ns_rate_range": (0.05, 0.15),
        "ew_rate_range": (0.28, 0.5),
        "visibility_range": (0.4, 1.0),
        "fast_car_prob_range": (0.02, 0.18),
        "fairness_weight": args.fairness_weight,
        "safety_weight": args.safety_weight,
        "scenario_pool_prob": args.scenario_prob,
        "ttc_threshold": args.ttc_threshold,
    }

    model = load_model(args.model)
    summary = evaluate(
        model=model,
        episodes=args.episodes,
        env_kwargs=env_kwargs,
        deterministic=args.deterministic,
        hard_case_out=args.hard_cases_out,
    )
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
