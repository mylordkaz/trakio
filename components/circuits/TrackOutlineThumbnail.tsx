import { useMemo } from 'react';
import Svg, { Polyline } from 'react-native-svg';
import type { Coordinate } from '@/db/types';
import { buildOutlinePoints } from '@/utils/trackOutline';

type Props = {
  path: Coordinate[];
  size: number;
  color: string;
};

export default function TrackOutlineThumbnail({ path, size, color }: Props) {
  const points = useMemo(
    () => buildOutlinePoints(path, size, 4),
    [path, size],
  );

  if (!points) {
    return null;
  }

  return (
    <Svg width={size} height={size}>
      <Polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}
