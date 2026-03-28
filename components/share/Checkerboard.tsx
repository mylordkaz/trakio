import { View } from 'react-native';
import { useMemo } from 'react';

type CheckerboardProps = {
  width: number;
  height: number;
  squareSize?: number;
  color1?: string;
  color2?: string;
};

export default function Checkerboard({
  width,
  height,
  squareSize = 16,
  color1 = '#444444',
  color2 = '#333333',
}: CheckerboardProps) {
  const grid = useMemo(() => {
    const cols = Math.ceil(width / squareSize);
    const rows = Math.ceil(height / squareSize);
    const rowElements: React.ReactElement[] = [];

    for (let r = 0; r < rows; r++) {
      const cells: React.ReactElement[] = [];
      for (let c = 0; c < cols; c++) {
        cells.push(
          <View
            key={c}
            style={{
              width: squareSize,
              height: squareSize,
              backgroundColor: (r + c) % 2 === 0 ? color1 : color2,
            }}
          />
        );
      }
      rowElements.push(
        <View key={r} style={{ flexDirection: 'row' }}>
          {cells}
        </View>
      );
    }

    return rowElements;
  }, [width, height, squareSize, color1, color2]);

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width, height, overflow: 'hidden' }}>
      {grid}
    </View>
  );
}
