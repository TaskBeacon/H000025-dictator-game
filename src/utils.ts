import type { ReducedTrialRow } from "psyflow-web";

import type { PlannedDictatorCondition } from "./controller";

export function parse_dictator_condition(condition: string): PlannedDictatorCondition {
  const parsed = JSON.parse(String(condition)) as Partial<PlannedDictatorCondition>;
  return {
    condition: String(parsed.condition ?? "medium_stake"),
    condition_label: String(parsed.condition_label ?? parsed.condition ?? "medium stake"),
    stake: Math.max(1, Number(parsed.stake ?? 20)),
    condition_id: String(parsed.condition_id ?? "unknown"),
    trial_index: Math.max(1, Number(parsed.trial_index ?? 1))
  };
}

export function summarizeBlock(rows: ReducedTrialRow[], blockId: string): {
  generous_rate: number;
  equal_rate: number;
  selfish_rate: number;
  block_self_total: number;
  block_other_total: number;
  self_total: number;
  other_total: number;
} {
  const blockRows = rows.filter((row) => String(row.block_id ?? "") === blockId);
  const n = Math.max(1, blockRows.length);
  const generousN = blockRows.filter((row) => String(row.choice ?? "") === "generous").length;
  const equalN = blockRows.filter((row) => String(row.choice ?? "") === "equal").length;
  const selfishN = blockRows.filter((row) => String(row.choice ?? "") === "selfish").length;
  const blockSelfTotal = blockRows.reduce((sum, row) => sum + Number(row.self_amount ?? 0), 0);
  const blockOtherTotal = blockRows.reduce((sum, row) => sum + Number(row.other_amount ?? 0), 0);
  const selfTotal = rows.length > 0 ? Number(rows[rows.length - 1].self_total ?? 0) : 0;
  const otherTotal = rows.length > 0 ? Number(rows[rows.length - 1].other_total ?? 0) : 0;
  return {
    generous_rate: generousN / n,
    equal_rate: equalN / n,
    selfish_rate: selfishN / n,
    block_self_total: blockSelfTotal,
    block_other_total: blockOtherTotal,
    self_total: selfTotal,
    other_total: otherTotal
  };
}

export function summarizeOverall(rows: ReducedTrialRow[]): {
  self_total: number;
  other_total: number;
} {
  return {
    self_total: rows.length > 0 ? Number(rows[rows.length - 1].self_total ?? 0) : 0,
    other_total: rows.length > 0 ? Number(rows[rows.length - 1].other_total ?? 0) : 0
  };
}
