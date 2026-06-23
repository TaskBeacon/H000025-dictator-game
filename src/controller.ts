import { PythonRandom } from "psyflow-web";

export interface AllocationProfile {
  label: string;
  self_ratio: number;
}

export interface PlannedDictatorCondition {
  condition: string;
  condition_label: string;
  stake: number;
  condition_id: string;
  trial_index: number;
}

export interface DictatorOutcomeRecord {
  condition: string;
  block_idx: number;
  trial_index: number;
  stake: number;
  choice: "generous" | "equal" | "selfish";
  choice_label: string;
  timed_out: boolean;
  self_ratio: number;
  self_amount: number;
  other_amount: number;
  self_total: number;
  other_total: number;
}

function normalizeRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, value));
}

function pythonRound(value: number): number {
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (fraction < 0.5) {
    return floor;
  }
  if (fraction > 0.5) {
    return floor + 1;
  }
  return floor % 2 === 0 ? floor : floor + 1;
}

export class Controller {
  readonly seed: number;
  readonly enable_logging: boolean;
  private readonly rng: PythonRandom;
  private readonly allocations: Record<string, AllocationProfile>;
  private readonly stakes: Record<string, number>;
  private history: DictatorOutcomeRecord[] = [];
  self_total = 0;
  other_total = 0;

  constructor(args: {
    allocation_profiles: Record<string, Partial<AllocationProfile>>;
    stake_levels: Record<string, number>;
    seed?: number;
    enable_logging?: boolean;
  }) {
    this.seed = Number(args.seed ?? 25025);
    this.enable_logging = args.enable_logging !== false;
    this.rng = new PythonRandom(this.seed);
    this.allocations = this.buildAllocations(args.allocation_profiles);
    this.stakes = this.buildStakes(args.stake_levels);
  }

  static from_dict(config: Record<string, unknown>): Controller {
    const allocationProfiles = config.allocation_profiles;
    const stakeLevels = config.stake_levels;
    if (!allocationProfiles || typeof allocationProfiles !== "object" || Array.isArray(allocationProfiles)) {
      throw new Error("controller.allocation_profiles must be a non-empty mapping");
    }
    if (!stakeLevels || typeof stakeLevels !== "object" || Array.isArray(stakeLevels)) {
      throw new Error("controller.stake_levels must be a non-empty mapping");
    }
    return new Controller({
      allocation_profiles: allocationProfiles as Record<string, Partial<AllocationProfile>>,
      stake_levels: stakeLevels as Record<string, number>,
      seed: Number(config.seed ?? 25025),
      enable_logging: Boolean(config.enable_logging ?? true)
    });
  }

  private buildAllocations(raw: Record<string, Partial<AllocationProfile>>): Record<string, AllocationProfile> {
    const profiles: Record<string, AllocationProfile> = {};
    for (const [key, value] of Object.entries(raw ?? {})) {
      profiles[String(key)] = {
        label: String(value.label ?? key),
        self_ratio: normalizeRatio(Number(value.self_ratio ?? 0.5))
      };
    }
    if (Object.keys(profiles).length === 0) {
      throw new Error("controller.allocation_profiles must be a non-empty mapping");
    }
    return profiles;
  }

  private buildStakes(raw: Record<string, number>): Record<string, number> {
    const stakes: Record<string, number> = {};
    for (const [key, value] of Object.entries(raw ?? {})) {
      stakes[String(key)] = Math.max(1, Math.trunc(Number(value)));
    }
    if (Object.keys(stakes).length === 0) {
      throw new Error("controller.stake_levels must be a non-empty mapping");
    }
    return stakes;
  }

  get_stake(condition: string): number {
    const key = String(condition);
    const value = this.stakes[key];
    if (!Number.isFinite(value)) {
      throw new Error(`Unknown condition: ${key}`);
    }
    return Number(value);
  }

  get_allocation(choice: string): AllocationProfile {
    const key = String(choice);
    const profile = this.allocations[key];
    if (!profile) {
      throw new Error(`Unknown allocation choice: ${key}`);
    }
    return profile;
  }

  prepare_block(args: { block_idx: number; n_trials: number; conditions: string[] }): string[] {
    const nTrials = Math.max(0, Math.trunc(args.n_trials));
    if (nTrials <= 0) {
      return [];
    }
    const validConditions = (Array.isArray(args.conditions) ? args.conditions : [])
      .map(String)
      .filter((condition) => this.stakes[condition] != null);
    if (validConditions.length === 0) {
      throw new Error("No valid dictator-game conditions available");
    }

    const scheduled: string[] = [];
    for (let index = 0; index < nTrials; index += 1) {
      scheduled.push(validConditions[index % validConditions.length]);
    }
    this.rng.shuffle(scheduled);

    const planned: PlannedDictatorCondition[] = [];
    scheduled.forEach((condition, index) => {
      const trialIndex = index + 1;
      const stake = this.get_stake(condition);
      const conditionLabel = condition.replaceAll("_", " ");
      const conditionId = `${condition}_s${stake}_t${String(trialIndex).padStart(3, "0")}`;
      planned.push({
        condition,
        condition_label: conditionLabel,
        stake,
        condition_id: conditionId,
        trial_index: trialIndex
      });
    });
    return planned.map((item) => JSON.stringify(item));
  }

  register_decision(args: {
    condition: string;
    block_idx: number;
    trial_index: number;
    stake: number;
    choice: "generous" | "equal" | "selfish";
    timed_out: boolean;
  }): DictatorOutcomeRecord {
    const profile = this.get_allocation(args.choice);
    const stake = Math.max(1, Math.trunc(Number(args.stake)));
    const selfAmount = Math.max(0, Math.min(stake, pythonRound(stake * profile.self_ratio)));
    const otherAmount = stake - selfAmount;

    this.self_total += selfAmount;
    this.other_total += otherAmount;

    const record: DictatorOutcomeRecord = {
      condition: String(args.condition),
      block_idx: Number(args.block_idx),
      trial_index: Number(args.trial_index),
      stake,
      choice: args.choice,
      choice_label: profile.label,
      timed_out: Boolean(args.timed_out),
      self_ratio: profile.self_ratio,
      self_amount: selfAmount,
      other_amount: otherAmount,
      self_total: this.self_total,
      other_total: this.other_total
    };
    this.history.push(record);
    return record;
  }

  get histories(): Record<string, DictatorOutcomeRecord[]> {
    const grouped: Record<string, DictatorOutcomeRecord[]> = {};
    for (const item of this.history) {
      if (!grouped[item.condition]) {
        grouped[item.condition] = [];
      }
      grouped[item.condition].push(item);
    }
    return grouped;
  }
}
