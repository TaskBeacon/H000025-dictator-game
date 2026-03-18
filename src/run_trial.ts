import {
  set_trial_context,
  type StimBank,
  type TaskSettings,
  type TrialBuilder,
  type TrialSnapshot
} from "psyflow-web";

import type { Controller, DictatorOutcomeRecord } from "./controller";
import { parse_dictator_condition } from "./utils";

type AllocationChoice = "generous" | "equal" | "selfish";

function resolveChoiceState(
  response: unknown,
  generousKey: string,
  equalKey: string,
  selfishKey: string
): {
  choice: AllocationChoice;
  timed_out: boolean;
} {
  if (response === generousKey) {
    return { choice: "generous", timed_out: false };
  }
  if (response === selfishKey) {
    return { choice: "selfish", timed_out: false };
  }
  if (response === equalKey) {
    return { choice: "equal", timed_out: false };
  }
  return { choice: "equal", timed_out: true };
}

function resolveOutcomePayload(
  snapshot: TrialSnapshot,
  controller: Controller,
  condition: string,
  blockIdx: number,
  trialIndex: number,
  stake: number,
  generousKey: string,
  equalKey: string,
  selfishKey: string
): DictatorOutcomeRecord {
  const choiceState = resolveChoiceState(snapshot.units.decision?.response, generousKey, equalKey, selfishKey);
  return controller.register_decision({
    condition,
    block_idx: blockIdx,
    trial_index: trialIndex,
    stake,
    choice: choiceState.choice,
    timed_out: choiceState.timed_out
  });
}

export function run_trial(
  trial: TrialBuilder,
  condition: string,
  context: {
    settings: TaskSettings;
    stimBank: StimBank;
    controller: Controller;
    block_id: string;
    block_idx: number;
  }
): TrialBuilder {
  const { settings, stimBank, controller, block_id, block_idx } = context;
  const parsed = parse_dictator_condition(condition);
  const keyList = (Array.isArray(settings.key_list) ? settings.key_list : ["f", "space", "j"]).map(String);
  const generousKey = keyList[0] ?? "f";
  const equalKey = keyList[1] ?? "space";
  const selfishKey = keyList[2] ?? "j";
  const triggerMap = (settings.triggers ?? {}) as Record<string, unknown>;

  const stakePromptDuration = Number(settings.stake_prompt_duration ?? 0.6);
  const preDecisionFixationDuration = Number(settings.pre_decision_fixation_duration ?? 0.5);
  const decisionDuration = Number(settings.decision_duration ?? 2.2);
  const choiceFeedbackDuration = Number(settings.choice_feedback_duration ?? 0.5);
  const outcomeFeedbackDuration = Number(settings.outcome_feedback_duration ?? 1.0);
  const itiDuration = Number(settings.iti_duration ?? 0.8);

  const stakePrompt = trial.unit("stake_prompt").addStim(
    stimBank.get_and_format("stake_prompt_text", {
      condition_label: parsed.condition_label,
      stake: parsed.stake
    })
  );
  set_trial_context(stakePrompt, {
    trial_id: trial.trial_id,
    phase: "stake_prompt",
    deadline_s: stakePromptDuration,
    valid_keys: [],
    block_id,
    condition_id: parsed.condition_id,
    task_factors: {
      stage: "stake_prompt",
      condition: parsed.condition,
      stake: parsed.stake,
      block_idx
    },
    stim_id: "stake_prompt_text"
  });
  stakePrompt.show({ duration: stakePromptDuration }).to_dict();

  const preDecisionFixation = trial.unit("pre_decision_fixation").addStim(stimBank.get("fixation"));
  set_trial_context(preDecisionFixation, {
    trial_id: trial.trial_id,
    phase: "pre_decision_fixation",
    deadline_s: preDecisionFixationDuration,
    valid_keys: [],
    block_id,
    condition_id: parsed.condition_id,
    task_factors: {
      stage: "pre_decision_fixation",
      condition: parsed.condition,
      stake: parsed.stake,
      block_idx
    },
    stim_id: "fixation"
  });
  preDecisionFixation.show({ duration: preDecisionFixationDuration }).to_dict();

  const decision = trial.unit("decision").addStim(
    stimBank.get_and_format("decision_panel", {
      stake: parsed.stake
    })
  );
  set_trial_context(decision, {
    trial_id: trial.trial_id,
    phase: "decision",
    deadline_s: decisionDuration,
    valid_keys: [generousKey, equalKey, selfishKey],
    block_id,
    condition_id: parsed.condition_id,
    task_factors: {
      stage: "decision",
      condition: parsed.condition,
      stake: parsed.stake,
      generous_key: generousKey,
      equal_key: equalKey,
      selfish_key: selfishKey,
      block_idx
    },
    stim_id: "decision_panel"
  });
  decision
    .captureResponse({
      keys: [generousKey, equalKey, selfishKey],
      correct_keys: [generousKey, equalKey, selfishKey],
      duration: decisionDuration,
      response_trigger: Number(triggerMap.decision_response ?? 50),
      timeout_trigger: Number(triggerMap.decision_timeout ?? 51)
    })
    .set_state({
      choice_state: (snapshot: TrialSnapshot) =>
        resolveChoiceState(snapshot.units.decision?.response, generousKey, equalKey, selfishKey),
      outcome_payload: (snapshot: TrialSnapshot) =>
        resolveOutcomePayload(
          snapshot,
          controller,
          parsed.condition,
          block_idx,
          parsed.trial_index,
          parsed.stake,
          generousKey,
          equalKey,
          selfishKey
        )
    })
    .to_dict();

  const choiceFeedback = trial.unit("choice_feedback").addStim((snapshot: TrialSnapshot) => {
    const choiceState = snapshot.units.decision?.choice_state as { choice: AllocationChoice; timed_out: boolean } | undefined;
    if (choiceState?.timed_out) {
      return stimBank.get("decision_timeout");
    }
    if (choiceState?.choice === "generous") {
      return stimBank.get("decision_generous");
    }
    if (choiceState?.choice === "selfish") {
      return stimBank.get("decision_selfish");
    }
    return stimBank.get("decision_equal");
  });
  set_trial_context(choiceFeedback, {
    trial_id: trial.trial_id,
    phase: "choice_feedback",
    deadline_s: choiceFeedbackDuration,
    valid_keys: [],
    block_id,
    condition_id: parsed.condition_id,
    task_factors: {
      stage: "choice_feedback",
      condition: parsed.condition,
      stake: parsed.stake,
      block_idx
    },
    stim_id: "choice_feedback"
  });
  choiceFeedback.show({ duration: choiceFeedbackDuration }).to_dict();

  const outcomeFeedback = trial.unit("outcome_feedback").addStim((snapshot: TrialSnapshot) => {
    const payload = snapshot.units.decision?.outcome_payload as DictatorOutcomeRecord | undefined;
    return stimBank.get_and_format("outcome_feedback", {
      stake: payload?.stake ?? parsed.stake,
      choice_label: payload?.choice_label ?? parsed.condition_label,
      self_amount: payload?.self_amount ?? 0,
      other_amount: payload?.other_amount ?? 0,
      self_total: payload?.self_total ?? controller.self_total,
      other_total: payload?.other_total ?? controller.other_total
    });
  });
  set_trial_context(outcomeFeedback, {
    trial_id: trial.trial_id,
    phase: "outcome_feedback",
    deadline_s: outcomeFeedbackDuration,
    valid_keys: [],
    block_id,
    condition_id: parsed.condition_id,
    task_factors: {
      stage: "outcome_feedback",
      condition: parsed.condition,
      stake: parsed.stake,
      block_idx
    },
    stim_id: "outcome_feedback"
  });
  outcomeFeedback.show({ duration: outcomeFeedbackDuration }).to_dict();

  const iti = trial.unit("iti").addStim(stimBank.get("fixation"));
  set_trial_context(iti, {
    trial_id: trial.trial_id,
    phase: "inter_trial_interval",
    deadline_s: itiDuration,
    valid_keys: [],
    block_id,
    condition_id: parsed.condition_id,
    task_factors: {
      stage: "inter_trial_interval",
      block_idx
    },
    stim_id: "fixation"
  });
  iti.show({ duration: itiDuration }).to_dict();

  trial.finalize((snapshot, _runtime, helpers) => {
    const choiceState = snapshot.units.decision?.choice_state as
      | { choice: AllocationChoice; timed_out: boolean }
      | undefined;
    const outcome = snapshot.units.decision?.outcome_payload as DictatorOutcomeRecord | undefined;
    helpers.setTrialState("planned_trial_index", parsed.trial_index);
    helpers.setTrialState("condition", parsed.condition);
    helpers.setTrialState("condition_id", parsed.condition_id);
    helpers.setTrialState("condition_label", parsed.condition_label);
    helpers.setTrialState("stake", outcome?.stake ?? parsed.stake);
    helpers.setTrialState("choice", choiceState?.choice ?? "equal");
    helpers.setTrialState("choice_label", outcome?.choice_label ?? "Equal");
    helpers.setTrialState("timed_out", choiceState?.timed_out ?? true);
    helpers.setTrialState("choice_rt", snapshot.units.decision?.rt ?? null);
    helpers.setTrialState("self_ratio", outcome?.self_ratio ?? 0.5);
    helpers.setTrialState("self_amount", outcome?.self_amount ?? 0);
    helpers.setTrialState("other_amount", outcome?.other_amount ?? 0);
    helpers.setTrialState("self_total", outcome?.self_total ?? controller.self_total);
    helpers.setTrialState("other_total", outcome?.other_total ?? controller.other_total);
    helpers.setTrialState("feedback_delta", outcome?.self_amount ?? 0);
  });

  return trial;
}
