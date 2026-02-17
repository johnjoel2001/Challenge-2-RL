# Safe Self‑Driving Intersection RL

This project simulates a stochastic, procedurally generated traffic intersection where an RL agent controls a traffic light
(NS vs EW). Traffic demand is **asymmetric**: east/west traffic is higher than north/south. The baseline agent learns to keep
EW green to maximize throughput, which **hacks the reward** by starving NS (long waits/unfairness). Rare fast‑car events
under poor visibility also cause safety violations.

We mitigate this by:
1. **Hard‑case mining** – re‑training on scenarios where the baseline fails (high unfairness or collisions).
2. **Safety constraint** – time‑to‑collision (TTC) penalty discouraging risky switches.
3. **Fairness shaping** – penalize large wait‑time gaps between NS and EW.

## Files
- `traffic_env.py` – stochastic environment with procedural scenarios.
- `train.py` – PPO training for baseline/mitigated agents.
- `evaluate.py` – evaluation + hard‑case extraction.
- `data/hard_cases_seed.json` – seed hard cases (rare events) for mining.

## Setup
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Train Baseline (reward hacking)
```bash
python train.py --mode baseline --timesteps 200000 --model-out outputs/ppo_baseline.zip
```

## Evaluate Baseline + Extract Hard Cases
```bash
python evaluate.py --model outputs/ppo_baseline.zip --episodes 40 --hard-cases-out data/hard_cases_mined.json
```

Expect to see a **large fairness gap** (NS waits >> EW waits) because EW traffic is heavier and the reward
prioritizes throughput.

## Train Mitigated Agent
```bash
python train.py \
  --mode mitigated \
  --timesteps 250000 \
  --hard-cases data/hard_cases_mined.json \
  --model-out outputs/ppo_mitigated.zip
```

## Evaluate Mitigated Agent
```bash
python evaluate.py --model outputs/ppo_mitigated.zip --episodes 40
```

You should see:
- Reduced fairness gap (NS and EW waits closer).
- Fewer safety violations under rare, fast‑car scenarios.

## Failure Mode Summary
**Reward hacking (fairness failure):** The baseline agent discovers that keeping EW green maximizes throughput because
EW demand is higher. This makes NS drivers wait excessively, which is unsafe/unfair but not captured by the baseline reward.

**Mitigation:** Add a fairness penalty and TTC safety penalty, and oversample hard scenarios where the baseline fails. This
pushes the agent toward balanced service across all directions while reducing risky behavior in rare events.

## Notes
- The environment is intentionally simplified for clarity.
- `traffic_env.py` exposes parameters like `fairness_weight`, `safety_weight`, and `ttc_threshold` for experimentation.
