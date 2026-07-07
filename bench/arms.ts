import {
  createAlphaBetaEstimator,
  createKalmanEstimator,
  type AlphaBetaConfig,
  type KalmanConfig,
  type PositionEstimator,
} from '@/telemetry/kalman';

export type ArmId = 'naive' | 'alphabeta' | 'kalman';

export type Arm = {
  id: ArmId;
  label: string;
  createEstimator: () => PositionEstimator | null;
};

export function makeArms(
  kalmanConfig: Partial<KalmanConfig> = {},
  alphaBetaConfig: Partial<AlphaBetaConfig> = {}
): Arm[] {
  return [
    { id: 'naive', label: 'A naive (ships today)', createEstimator: () => null },
    {
      id: 'alphabeta',
      label: 'B alpha-beta (fixed gains)',
      createEstimator: () => createAlphaBetaEstimator(alphaBetaConfig),
    },
    {
      id: 'kalman',
      label: 'C kalman (adaptive)',
      createEstimator: () => createKalmanEstimator(kalmanConfig),
    },
  ];
}
