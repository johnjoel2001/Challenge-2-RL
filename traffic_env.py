""" 
Traffic intersection environment for RL agents to control signal timing.
Supports fairness penalties, safety constraints, and curriculum learning via scenario pools.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Dict, List, Optional

import gymnasium as gym
import numpy as np


@dataclass
class TrafficScenario:
    """Parameters defining a traffic scenario (arrival rates, visibility, fast cars)"""
    ns_rate: float
    ew_rate: float
    visibility: float
    fast_car_prob: float


class TrafficIntersectionEnv(gym.Env):
    """
    Gym environment for a 4-way traffic intersection with 2 signal phases (EW and NS).
    
    The agent controls signal switching to maximize throughput while balancing fairness
    between directions and avoiding safety violations from poor timing decisions.
    """
    metadata = {"render_modes": []}

    def __init__(
        self,
        max_steps: int = 200,
        ns_rate_range: tuple[float, float] = (0.05, 0.15),
        ew_rate_range: tuple[float, float] = (0.25, 0.45),
        visibility_range: tuple[float, float] = (0.4, 1.0),
        fast_car_prob_range: tuple[float, float] = (0.02, 0.15),
        max_queue: int = 30,
        max_flow: int = 3,
        min_green_steps: int = 6,
        throughput_reward: float = 1.0,
        queue_penalty: float = 0.01,
        switch_penalty: float = 0.05,
        fairness_weight: float = 0.0,
        safety_weight: float = 2.0,
        ttc_threshold: float = 1.2,
        scenario_pool: Optional[List[Dict[str, float]]] = None,
        scenario_pool_prob: float = 0.0,
        seed: Optional[int] = None,
    ) -> None:
        super().__init__()
        self.max_steps = max_steps
        self.ns_rate_range = ns_rate_range
        self.ew_rate_range = ew_rate_range
        self.visibility_range = visibility_range
        self.fast_car_prob_range = fast_car_prob_range
        self.max_queue = max_queue
        self.max_flow = max_flow
        self.min_green_steps = min_green_steps
        self.throughput_reward = throughput_reward
        self.queue_penalty = queue_penalty
        self.switch_penalty = switch_penalty
        self.fairness_weight = fairness_weight
        self.safety_weight = safety_weight
        self.ttc_threshold = ttc_threshold
        self.scenario_pool = scenario_pool or []
        self.scenario_pool_prob = scenario_pool_prob
        self.rng = np.random.default_rng(seed)

        # Action: 0 = EW green, 1 = NS green
        self.action_space = gym.spaces.Discrete(2)
        self.observation_space = gym.spaces.Box(
            low=0.0,
            high=1.0,
            shape=(9,),
            dtype=np.float32,
        )

        self._reset_state()

    def _reset_state(self) -> None:
        self.step_count = 0
        self.queue_n = 0
        self.queue_s = 0
        self.queue_e = 0
        self.queue_w = 0
        self.cum_wait_n = 0.0
        self.cum_wait_s = 0.0
        self.cum_wait_e = 0.0
        self.cum_wait_w = 0.0
        self.phase = 0
        self.time_since_switch = 0
        self.collisions = 0
        self.last_scenario: Optional[TrafficScenario] = None

    def set_scenario_pool(self, scenarios: List[Dict[str, float]], prob: float) -> None:
        """Update the hard case scenario pool for curriculum learning"""
        self.scenario_pool = scenarios
        self.scenario_pool_prob = prob

    def _sample_scenario(self) -> TrafficScenario:
        """Sample a scenario either from the hard case pool or uniformly from ranges"""
        if self.scenario_pool and self.rng.random() < self.scenario_pool_prob:
            scenario = self.rng.choice(self.scenario_pool)
            return TrafficScenario(**scenario)
        return TrafficScenario(
            ns_rate=self.rng.uniform(*self.ns_rate_range),
            ew_rate=self.rng.uniform(*self.ew_rate_range),
            visibility=self.rng.uniform(*self.visibility_range),
            fast_car_prob=self.rng.uniform(*self.fast_car_prob_range),
        )

    def reset(self, *, seed: Optional[int] = None, options: Optional[dict] = None):
        """Reset environment to initial state with a new traffic scenario"""
        super().reset(seed=seed)
        if seed is not None:
            self.rng = np.random.default_rng(seed)
        self._reset_state()
        self.last_scenario = self._sample_scenario()
        obs = self._get_obs()
        info = {"scenario": asdict(self.last_scenario)}
        return obs, info

    def step(self, action: int):
        """Execute one timestep: signal control, traffic dynamics, and reward calculation"""
        assert self.last_scenario is not None
        self.step_count += 1

        action = int(action)
        switched = action != self.phase
        # Penalize switching too quickly (< min_green_steps)
        unsafe_switch = 1 if switched and self.time_since_switch < self.min_green_steps else 0

        if switched:
            self.phase = action
            self.time_since_switch = 0
        else:
            self.time_since_switch += 1

        self._spawn_traffic()
        throughput = self._serve_traffic()

        self._update_waits()

        # Check for fast approaching cars that reduce reaction time
        fast_car_ns = self.rng.random() < self.last_scenario.fast_car_prob
        fast_car_ew = self.rng.random() < self.last_scenario.fast_car_prob
        # Time-to-collision (TTC) depends on visibility and car speed
        ttc_ns = self.last_scenario.visibility * 3.5 if fast_car_ns else None
        ttc_ew = self.last_scenario.visibility * 3.5 if fast_car_ew else None

        risk_ns = 1 if ttc_ns is not None and ttc_ns < self.ttc_threshold and self.phase == 0 else 0
        risk_ew = 1 if ttc_ew is not None and ttc_ew < self.ttc_threshold and self.phase == 1 else 0
        safety_violation = max(unsafe_switch, risk_ns, risk_ew)
        collision = bool(safety_violation)
        if collision:
            self.collisions += 1

        # Calculate fairness metrics
        avg_wait_ns = (self.cum_wait_n + self.cum_wait_s) / max(1, self.step_count)
        avg_wait_ew = (self.cum_wait_e + self.cum_wait_w) / max(1, self.step_count)
        fairness_gap = abs(avg_wait_ns - avg_wait_ew)

        reward = (
            self.throughput_reward * throughput
            - self.queue_penalty * (self.queue_n + self.queue_s + self.queue_e + self.queue_w)
            - self.switch_penalty * switched
            - self.fairness_weight * fairness_gap
            - self.safety_weight * safety_violation
        )

        terminated = collision
        truncated = self.step_count >= self.max_steps

        obs = self._get_obs()
        info = {
            "throughput": throughput,
            "avg_wait_ns": avg_wait_ns,
            "avg_wait_ew": avg_wait_ew,
            "fairness_gap": fairness_gap,
            "fairness_ratio": (avg_wait_ns + 1.0) / (avg_wait_ew + 1.0),
            "collision": collision,
            "unsafe_switch": unsafe_switch,
            "risk_ns": risk_ns,
            "risk_ew": risk_ew,
            "scenario": asdict(self.last_scenario),
        }
        return obs, reward, terminated, truncated, info

    def _spawn_traffic(self) -> None:
        """Spawn new cars in each direction based on arrival rates"""
        assert self.last_scenario is not None
        if self.rng.random() < self.last_scenario.ns_rate:
            self.queue_n = min(self.max_queue, self.queue_n + 1)
        if self.rng.random() < self.last_scenario.ns_rate:
            self.queue_s = min(self.max_queue, self.queue_s + 1)
        if self.rng.random() < self.last_scenario.ew_rate:
            self.queue_e = min(self.max_queue, self.queue_e + 1)
        if self.rng.random() < self.last_scenario.ew_rate:
            self.queue_w = min(self.max_queue, self.queue_w + 1)

    def _serve_traffic(self) -> int:
        """Move cars through intersection based on current green phase and visibility"""
        assert self.last_scenario is not None
        # Poor visibility reduces throughput
        flow = max(1, int(round(self.max_flow * self.last_scenario.visibility)))
        served = 0
        if self.phase == 0:
            served += min(self.queue_e, flow)
            self.queue_e = max(0, self.queue_e - flow)
            served += min(self.queue_w, flow)
            self.queue_w = max(0, self.queue_w - flow)
        else:
            served += min(self.queue_n, flow)
            self.queue_n = max(0, self.queue_n - flow)
            served += min(self.queue_s, flow)
            self.queue_s = max(0, self.queue_s - flow)
        return served

    def _update_waits(self) -> None:
        self.cum_wait_n += self.queue_n
        self.cum_wait_s += self.queue_s
        self.cum_wait_e += self.queue_e
        self.cum_wait_w += self.queue_w

    def _get_obs(self) -> np.ndarray:
        """Build observation vector with queue lengths, phase state, and scenario params"""
        assert self.last_scenario is not None
        obs = np.array(
            [
                self.queue_n / self.max_queue,
                self.queue_s / self.max_queue,
                self.queue_e / self.max_queue,
                self.queue_w / self.max_queue,
                float(self.phase),
                min(self.time_since_switch / max(1, self.min_green_steps), 1.0),
                self.last_scenario.visibility,
                self.last_scenario.fast_car_prob,
                1.0 if self.last_scenario.ew_rate > self.last_scenario.ns_rate else 0.0,
            ],
            dtype=np.float32,
        )
        return obs
