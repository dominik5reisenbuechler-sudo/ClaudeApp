import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { Text } from './Text';
import { useTheme } from '@/theme/ThemeProvider';

export interface ChartSeries {
  /** Points in x order. `x` is a numeric position, `y` the value. */
  points: readonly { x: number; y: number }[];
  color?: string;
  /** Dashed lines read as derived or smoothed, solid as measured. */
  dashed?: boolean;
  label?: string;
}

interface LineChartProps {
  series: readonly ChartSeries[];
  height?: number;
  /** Axis labels for the first and last x positions. */
  xLabels?: { start: string; end: string };
  /** Formats the y-axis bounds. */
  formatY?: (value: number) => string;
  /** Draws a horizontal reference band, e.g. a target range. */
  band?: { min: number; max: number; color?: string };
  accessibilityLabel?: string;
}

const PADDING = { top: 12, right: 8, bottom: 20, left: 40 };

/**
 * A small line chart built directly on `react-native-svg`.
 *
 * Hand-rolled rather than pulled from a charting library: the app needs two
 * chart shapes, both of which must follow the design tokens exactly and render
 * identically in light and dark. A general-purpose library brings a theming
 * layer to fight with, for features this app does not use.
 *
 * Width is measured from layout rather than assumed, so the chart fills its
 * container on any screen.
 */
export function LineChart({
  series,
  height = 180,
  xLabels,
  formatY = (value) => `${Math.round(value)}`,
  band,
  accessibilityLabel,
}: LineChartProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);

  const allPoints = series.flatMap((entry) => entry.points);

  if (allPoints.length === 0) {
    return (
      <View style={{ height, justifyContent: 'center', alignItems: 'center' }}>
        <Text variant="caption" tone="tertiary">
          Not enough data to chart yet
        </Text>
      </View>
    );
  }

  const xs = allPoints.map((point) => point.x);
  const ys = allPoints.map((point) => point.y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  // Include the band in the vertical range, so a target the user is far from
  // stays visible rather than being cropped off the top of the chart.
  const minY = Math.min(...ys, band?.min ?? Infinity);
  const maxY = Math.max(...ys, band?.max ?? -Infinity);

  // A flat series would otherwise divide by zero and collapse to one line.
  const ySpan = maxY - minY || Math.max(1, Math.abs(maxY) * 0.1);
  const xSpan = maxX - minX || 1;

  const plotWidth = Math.max(0, width - PADDING.left - PADDING.right);
  const plotHeight = height - PADDING.top - PADDING.bottom;

  const toX = (x: number) => PADDING.left + ((x - minX) / xSpan) * plotWidth;
  const toY = (y: number) => PADDING.top + (1 - (y - minY) / ySpan) * plotHeight;

  return (
    <View
      accessible
      accessibilityRole="image"
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ height }}
    >
      {width > 0 ? (
        <Svg width={width} height={height}>
          {band ? (
            <Path
              d={`M ${PADDING.left} ${toY(band.max)} H ${PADDING.left + plotWidth} V ${toY(band.min)} H ${PADDING.left} Z`}
              fill={band.color ?? theme.colors.accentMuted}
              opacity={0.5}
            />
          ) : null}

          {/* Baseline and top gridline only — more lines add noise, not information. */}
          <Line
            x1={PADDING.left}
            y1={toY(minY)}
            x2={PADDING.left + plotWidth}
            y2={toY(minY)}
            stroke={theme.colors.border}
            strokeWidth={1}
          />
          <Line
            x1={PADDING.left}
            y1={toY(maxY)}
            x2={PADDING.left + plotWidth}
            y2={toY(maxY)}
            stroke={theme.colors.border}
            strokeWidth={1}
            strokeDasharray="3 4"
          />

          <SvgText
            x={0}
            y={toY(maxY) + 4}
            fontSize={10}
            fill={theme.colors.textTertiary}
          >
            {formatY(maxY)}
          </SvgText>
          <SvgText
            x={0}
            y={toY(minY) + 4}
            fontSize={10}
            fill={theme.colors.textTertiary}
          >
            {formatY(minY)}
          </SvgText>

          {series.map((entry, index) => {
            if (entry.points.length === 0) return null;
            const color = entry.color ?? theme.colors.accent;

            const path = entry.points
              .map((point, pointIndex) => {
                const command = pointIndex === 0 ? 'M' : 'L';
                return `${command} ${toX(point.x)} ${toY(point.y)}`;
              })
              .join(' ');

            return (
              <Path
                key={entry.label ?? index}
                d={path}
                stroke={color}
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                {...(entry.dashed ? { strokeDasharray: '4 4' } : {})}
              />
            );
          })}

          {/* Mark the latest point of the first series — the number that matters most. */}
          {series[0]?.points.length ? (
            <Circle
              cx={toX(series[0].points[series[0].points.length - 1]?.x ?? 0)}
              cy={toY(series[0].points[series[0].points.length - 1]?.y ?? 0)}
              r={4}
              fill={series[0].color ?? theme.colors.accent}
            />
          ) : null}

          {xLabels ? (
            <>
              <SvgText x={PADDING.left} y={height - 4} fontSize={10} fill={theme.colors.textTertiary}>
                {xLabels.start}
              </SvgText>
              <SvgText
                x={PADDING.left + plotWidth}
                y={height - 4}
                fontSize={10}
                fill={theme.colors.textTertiary}
                textAnchor="end"
              >
                {xLabels.end}
              </SvgText>
            </>
          ) : null}
        </Svg>
      ) : null}
    </View>
  );
}

interface BarChartProps {
  bars: readonly { label: string; value: number }[];
  height?: number;
  color?: string;
  /** Drawn as a dashed reference line, e.g. the weekly session target. */
  target?: number;
  accessibilityLabel?: string;
}

/** Simple vertical bars — weekly session counts, weekly volume. */
export function BarChart({
  bars,
  height = 140,
  color,
  target,
  accessibilityLabel,
}: BarChartProps) {
  const theme = useTheme();

  if (bars.length === 0) {
    return (
      <View style={{ height, justifyContent: 'center', alignItems: 'center' }}>
        <Text variant="caption" tone="tertiary">
          Nothing to show yet
        </Text>
      </View>
    );
  }

  const max = Math.max(...bars.map((bar) => bar.value), target ?? 0, 1);
  const barColor = color ?? theme.colors.accent;

  return (
    <View
      accessible
      accessibilityRole="image"
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
      style={{ gap: theme.spacing.sm }}
    >
      <View
        style={{
          height,
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: theme.spacing.xs,
          position: 'relative',
        }}
      >
        {target !== undefined ? (
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: (target / max) * height,
              height: 1,
              backgroundColor: theme.colors.borderStrong,
            }}
          />
        ) : null}

        {bars.map((bar, index) => (
          <View key={`${bar.label}-${index}`} style={{ flex: 1, alignItems: 'center' }}>
            <View
              style={{
                width: '100%',
                height: Math.max(2, (bar.value / max) * height),
                backgroundColor: bar.value === 0 ? theme.colors.track : barColor,
                borderRadius: theme.radii.sm,
              }}
            />
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
        {bars.map((bar, index) => (
          <View key={`${bar.label}-label-${index}`} style={{ flex: 1, alignItems: 'center' }}>
            <Text variant="caption" tone="tertiary">
              {bar.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
