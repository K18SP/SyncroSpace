
"use client"

import { Pie, PieChart } from "recharts"
import { useState, useEffect } from 'react';

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent
} from "@/components/ui/chart"
import { CardDescription } from "../ui/card"

const chartConfig = {
  usage: {
    label: "Usage",
  },
  space: {
    label: "Virtual Space",
    color: "hsl(var(--chart-1))",
  },
  board: {
    label: "Kanban Board",
    color: "hsl(var(--chart-2))",
  },
  chat: {
    label: "Chat",
    color: "hsl(var(--chart-3))",
  },
  ai: {
    label: "AI Suggestions",
    color: "hsl(var(--chart-4))",
  },
  account: {
    label: "Account Settings",
    color: "hsl(var(--chart-5))",
  },
}

interface FeatureUsageChartProps {
  spacesData?: any[];
  usersData?: any[];
}

export interface FeatureData {
  feature: string;
  usage: number;
  fill: string;
}

export function FeatureUsageChart({ spacesData, usersData }: FeatureUsageChartProps) {
  const [chartData, setChartData] = useState<FeatureData[]>(() => []);

  useEffect(() => {
    if (!spacesData || !usersData) return;

    // Calculate feature usage based on Firebase data
    const spacesCount = spacesData.length;
    const usersCount = usersData.length;
    const activeSpaces = spacesData.filter(doc => doc.data().activeMeeting).length;
    
    // Calculate messages across all spaces
    const totalMessages = spacesData.reduce((total, spaceDoc) => {
      const spaceData = spaceDoc.data();
      return total + (spaceData.messageCount || 0);
    }, 0);

    // Generate feature usage data based on actual Firebase data
    const featureData = [
      { 
        feature: "Virtual Space", 
        usage: Math.max(spacesCount * 10, 50), // Base usage on number of spaces
        fill: "var(--color-space)" 
      },
      { 
        feature: "Kanban Board", 
        usage: Math.max(activeSpaces * 15, 30), // Base usage on active spaces
        fill: "var(--color-board)" 
      },
      { 
        feature: "Chat", 
        usage: Math.max(totalMessages, 20), // Base usage on message count
        fill: "var(--color-chat)" 
      },
      { 
        feature: "AI Suggestions", 
        usage: Math.max(usersCount * 5, 15), // Base usage on user count
        fill: "var(--color-ai)" 
      },
      { 
        feature: "Account Settings", 
        usage: Math.max(usersCount * 3, 10), // Base usage on user count
        fill: "var(--color-account)" 
      },
    ];

    setChartData(featureData);
  }, [spacesData, usersData]);

  return (
    <ChartContainer
      config={chartConfig}
      className="mx-auto aspect-square max-h-[300px]"
    >
      <PieChart>
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent hideLabel />}
        />
        <Pie
          data={chartData}
          dataKey="usage"
          nameKey="feature"
          innerRadius={60}
          strokeWidth={5}
        >
        </Pie>
        <ChartLegend
            content={<ChartLegendContent nameKey="feature" />}
            className="-translate-y-2 flex-wrap gap-2 [&>*]:basis-1/4 [&>*]:justify-center"
        />
      </PieChart>
    </ChartContainer>
  )
}
