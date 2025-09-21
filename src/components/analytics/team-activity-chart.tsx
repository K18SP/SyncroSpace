
"use client"

import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { useState, useEffect } from 'react';

import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart";

// Default chart config - will be overridden dynamically

interface TeamActivityChartProps {
  spacesData?: any[];
}

export interface TeamActivityDay {
  date: string;
  [spaceKey: string]: string | number;
}
export interface TeamChartConfig {
  [spaceKey: string]: {
    label: string;
    color: string;
  };
}

export function TeamActivityChart({ spacesData }: TeamActivityChartProps) {
  const [chartData, setChartData] = useState<TeamActivityDay[]>(() => []);
  const [chartConfig, setChartConfig] = useState<TeamChartConfig>(() => ({
    general: {
      label: "#general",
      color: "hsl(var(--primary))",
    },
    "design-team": {
      label: "#design-team",
      color: "hsl(var(--chart-2))",
    },
    random: {
      label: "#random",
      color: "hsl(var(--muted-foreground))",
    },
  }));

  useEffect(() => {
    if (!spacesData || spacesData.length === 0) {
      // Generate fallback data if no spaces
      const last7Days = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        last7Days.push({
          date: dateStr,
          general: Math.floor(Math.random() * 100) + 50,
          'design-team': Math.floor(Math.random() * 80) + 30,
          random: Math.floor(Math.random() * 60) + 20,
        });
      }
      setChartData(last7Days);
      return;
    }

    // Generate last 7 days of data based on actual spaces
    const last7Days = [];
    const spaceNames = spacesData.map(doc => {
      const name = doc.data().name || 'general';
      // Clean space names for chart keys
      return name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    }).slice(0, 3);
    
    // Ensure we have at least 3 spaces for the chart
    while (spaceNames.length < 3) {
      spaceNames.push(`space-${spaceNames.length + 1}`);
    }
    
    // Create dynamic chart config based on actual spaces
  const dynamicConfig: TeamChartConfig = {};
    spaceNames.forEach((spaceKey, index) => {
      const colors = [
        "hsl(var(--primary))",
        "hsl(var(--chart-2))", 
        "hsl(var(--muted-foreground))"
      ];
      dynamicConfig[spaceKey] = {
        label: `#${spaceKey}`,
        color: colors[index] || "hsl(var(--chart-3))",
      };
    });
    setChartConfig(dynamicConfig);
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      // Generate activity data based on actual spaces
      const dayData: TeamActivityDay = { date: dateStr };
      
      spaceNames.forEach((spaceKey, index) => {
        // Generate realistic activity with some variation
        const baseActivity = Math.floor(Math.random() * 100) + 50;
        dayData[spaceKey] = baseActivity;
      });
      
      last7Days.push(dayData);
    }

    setChartData(last7Days);
    
    // Debug logging
    console.log('Team Activity Chart Data:', last7Days);
    console.log('Space Names:', spaceNames);
    console.log('Chart Config:', dynamicConfig);
  }, [spacesData]);

  return (
    <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
      {chartData.length === 0 ? (
        <div className="flex items-center justify-center h-[300px] text-muted-foreground">
          Loading chart data...
        </div>
      ) : (
        <LineChart
          data={chartData}
          margin={{
            top: 24,
            right: 24,
            bottom: 24,
            left: 24,
          }}
        >
          <CartesianGrid vertical={false} />
           <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { weekday: 'short' })}
          />
          <YAxis />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                indicator="line"
                labelFormatter={(value, payload) => new Date(payload[0]?.payload.date).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                })}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          {chartData.length > 0 && Object.keys(chartData[0])
            .filter(key => key !== 'date')
            .map((key, index) => (
              <Line
                key={key}
                dataKey={key}
                type="monotone"
                stroke={`var(--color-${key})`}
                strokeWidth={2}
                dot={{ fill: `var(--color-${key})`, strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, strokeWidth: 2 }}
                strokeDasharray={index === 2 ? "5 5" : undefined}
              />
            ))}
        </LineChart>
      )}
    </ChartContainer>
  )
}
