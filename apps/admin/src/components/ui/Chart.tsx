import * as React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Legend,
} from 'recharts';

/**
 * Thin recharts wrapper with consistent theming. Use this instead of importing
 * recharts directly so we can change the chart vendor centrally.
 */

export const ChartContainer = ({
  height = 240,
  children,
  className = '',
}: {
  height?: number;
  children: React.ReactElement;
  className?: string;
}): React.ReactElement => (
  <div className={`w-full ${className}`} style={{ height }}>
    <ResponsiveContainer width="100%" height="100%">
      {children}
    </ResponsiveContainer>
  </div>
);

export {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  RTooltip as ChartTooltip,
  Legend as ChartLegend,
};

export const CHART_COLORS = {
  primary: '#003D9B',
  secondary: '#0052CC',
  accent: '#FE8A00',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
};
