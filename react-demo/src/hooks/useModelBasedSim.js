import { useState, useCallback } from 'react';
import { apiClient } from '../api/client';

/*
 * Hook that connects to the backend API to run trained RL models.
 * Handles initialization, stepping through episodes, and state management.
 */
export const useModelBasedSim = (agentType) => {
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
    isInitialized: false,
    error: null,
  });

  const reset = useCallback(async () => {
    try {
      const response = await apiClient.initEpisode(agentType, 42);
      setState({
        phase: response.info.phase || 0,
        t: 0,
        reward: 0,
        served: 0,
        nsWaitTotal: 0,
        greenEW: 0,
        greenNS: 0,
        wNS: response.info.avg_wait_ns || 0,
        wEW: response.info.avg_wait_ew || 0,
        gap: response.info.fairness_gap || 0,
        greenPctEW: '0',
        greenPctNS: '0',
        isInitialized: true,
        error: null,
      });
    } catch (error) {
      console.error('Reset failed:', error);
      setState((prev) => ({ ...prev, error: error.message, isInitialized: false }));
    }
  }, [agentType]);

  const step = useCallback(async () => {
    try {
      const response = await apiClient.stepEnvironment(agentType);

      setState((prev) => {
        const newState = { ...prev };
        newState.t = prev.t + 1;

        const { info, reward: stepReward } = response;

        // Track which phase is active and update green time counts
        newState.phase = info.phase;
        if (newState.phase === 0) {
          newState.greenEW = prev.greenEW + 1;
        } else {
          newState.greenNS = prev.greenNS + 1;
        }

        // Get fairness and wait metrics from backend
        newState.wNS = info.avg_wait_ns || 0;
        newState.wEW = info.avg_wait_ew || 0;
        newState.gap = info.fairness_gap || 0;
        newState.reward = prev.reward + stepReward;

        // Track actual cars served from backend throughput
        newState.served = prev.served + (info.throughput || 0);

        // Calculate green percentages
        newState.greenPctEW = ((newState.greenEW / Math.max(1, newState.t)) * 100).toFixed(0);
        newState.greenPctNS = ((newState.greenNS / Math.max(1, newState.t)) * 100).toFixed(0);

        return newState;
      });
    } catch (error) {
      console.error('Step failed:', error);
      setState((prev) => ({ ...prev, error: error.message }));
    }
  }, [agentType]);

  return { state, step, reset };
};
