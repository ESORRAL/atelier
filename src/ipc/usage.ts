import { invoke } from "@tauri-apps/api/core";

export type ModelUsage = { costUsd: number; inputTokens: number; outputTokens: number };
export type UsageDay = { day: string; costUsd: number; byModel: Record<string, ModelUsage> };
export type UsageSummary = { days: UsageDay[]; totalCostUsd: number; byModel: Record<string, ModelUsage> };

export const usageSummary = (days: number) => invoke<UsageSummary>("usage_summary", { days });
