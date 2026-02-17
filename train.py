"""
Training script for PPO agents on traffic intersection control.
Supports baseline (reward hacking) and mitigated (fair) configurations.
"""
import argparse
import json
import os
from typing import Any, Dict, List, Optional

from stable_baselines3 import PPO
from stable_baselines3.common.env_util import make_vec_env

from traffic_env import TrafficIntersectionEnv


def load_scenarios(path: Optional[str]) -> List[Dict[str, float]]:
    """Load hard case scenarios from JSON for curriculum learning"""
    if not path:
        return []
    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    return list(data)


def build_env(
    scenarios: List[Dict[str, float]],
    scenario_prob: float,
    fairness_weight: float,
    safety_weight: float,
    seed: Optional[int],
) -> TrafficIntersectionEnv:
    """Create environment with specified hyperparameters"""
    return TrafficIntersectionEnv(
        ns_rate_range=(0.05, 0.15),
        ew_rate_range=(0.28, 0.5),
        visibility_range=(0.4, 1.0),
        fast_car_prob_range=(0.02, 0.18),
        fairness_weight=fairness_weight,
        safety_weight=safety_weight,
        scenario_pool=scenarios,
        scenario_pool_prob=scenario_prob,
        seed=seed,
    )


def resolve_hyperparams(args: argparse.Namespace) -> Dict[str, Any]:
    """
    Set hyperparameters based on mode (baseline vs mitigated).
    Baseline ignores fairness, mitigated includes fairness penalties and curriculum learning.
    """
    if args.mode == "baseline":
        defaults = {
            "fairness_weight": 0.0,
            "scenario_prob": 0.0,
            "safety_weight": 2.0,
            "ttc_threshold": 1.2,
        }
    else:
        defaults = {
            "fairness_weight": 0.08,
            "scenario_prob": 0.4,
            "safety_weight": 3.0,
            "ttc_threshold": 1.4,
        }
    return {
        "fairness_weight": args.fairness_weight
        if args.fairness_weight is not None
        else defaults["fairness_weight"],
        "scenario_prob": args.scenario_prob
        if args.scenario_prob is not None
        else defaults["scenario_prob"],
        "safety_weight": args.safety_weight
        if args.safety_weight is not None
        else defaults["safety_weight"],
        "ttc_threshold": args.ttc_threshold
        if args.ttc_threshold is not None
        else defaults["ttc_threshold"],
    }


def main() -> None:
    """Parse arguments, configure environment, and train PPO model"""
    parser = argparse.ArgumentParser(description="Train PPO on the traffic intersection.")
    parser.add_argument("--mode", choices=["baseline", "mitigated"], default="baseline")
    parser.add_argument("--timesteps", type=int, default=200_000)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--model-out", default=None)
    parser.add_argument("--hard-cases", default=None)
    parser.add_argument("--scenario-prob", type=float, default=None)
    parser.add_argument("--fairness-weight", type=float, default=None)
    parser.add_argument("--safety-weight", type=float, default=None)
    parser.add_argument("--ttc-threshold", type=float, default=None)
    args = parser.parse_args()

    params = resolve_hyperparams(args)
    scenarios = load_scenarios(args.hard_cases)

    # Factory function for creating identical envs in the vectorized wrapper
    def env_factory():
        env = build_env(
            scenarios=scenarios,
            scenario_prob=params["scenario_prob"],
            fairness_weight=params["fairness_weight"],
            safety_weight=params["safety_weight"],
            seed=args.seed,
        )
        env.ttc_threshold = params["ttc_threshold"]
        return env

    # Use 4 parallel envs to speed up training
    vec_env = make_vec_env(env_factory, n_envs=4)

    model = PPO("MlpPolicy", vec_env, verbose=1, n_steps=512, batch_size=256)
    model.learn(total_timesteps=args.timesteps)

    if args.model_out is None:
        args.model_out = f"outputs/ppo_{args.mode}.zip"

    model_dir = os.path.dirname(args.model_out)
    if model_dir:  
        os.makedirs(model_dir, exist_ok=True)
    model.save(args.model_out)
    print(f"Saved model to {args.model_out}")


if __name__ == "__main__":
    main()
