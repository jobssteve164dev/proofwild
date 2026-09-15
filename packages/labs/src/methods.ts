import {createPrivateKey, createPublicKey, sign, verify, type JsonWebKey} from "node:crypto";
import {Ajv2020, type ValidateFunction} from "ajv/dist/2020.js";
import proposalSchema from "../../../spec/labs/7.0.0/method-proposal.schema.json" with {type: "json"};
import critiqueSchema from "../../../spec/labs/7.0.0/method-critique.schema.json" with {type: "json"};
import evaluationSchema from "../../../spec/labs/7.0.0/method-evaluation.schema.json" with {type: "json"};
import modelSchema from "../../../spec/labs/7.0.0/research-policy-model.schema.json" with {type: "json"};
import {agentIdFromJwk, type AgentIdentity} from "../../identity/src/index.js";
import {
  LABS_RESEARCH_CANDIDATES_PER_UNIT,
  createLabsResult,
  labsCanonicalJson,
  labsContentId,
  labsEnergy,
  labsObjectBytes,
  labsResearchCandidate,
  verifyLabsResearchTask,
  verifyLabsResult,
  type LabsResearchTask,
  type LabsResult,
  type LabsRuleset,
} from "./index.js";

export const LABS_METHOD_PROPOSAL_PROTOCOL = "proofwild-labs-method-proposal/1" as const;
export const LABS_METHOD_CRITIQUE_PROTOCOL = "proofwild-labs-method-critique/1" as const;
export const LABS_METHOD_EVALUATION_PROTOCOL = "proofwild-labs-method-evaluation/1" as const;
export const LABS_RESEARCH_POLICY_MODEL_PROTOCOL = "proofwild-research-policy-model/1" as const;
export const LABS_METHOD_DATASET_PROTOCOL = "proofwild-labs-method-dataset/1" as const;
export const LABS_METHOD_MIN_BUDGET = 64;
export const LABS_METHOD_MAX_BUDGET = 4_096;

export type LabsMethodTraversal = "identity" | "gray" | "bit_reverse";

export interface LabsMethodRuntimeDisclosure {
  model: string;
  scaffold: string;
  configuration_digest: string;
  human_contribution: "none" | "prompt_only" | "assisted" | "unknown";
}

export interface LabsMethodProposalBody {
  protocol: typeof LABS_METHOD_PROPOSAL_PROTOCOL;
  agent_id: string;
  task_id: string;
  parent_proposal_ids: string[];
  question: string;
  hypothesis: string;
  method_summary: string;
  prediction: {metric: "best_energy"; expected_max_energy: string};
  program: {traversal: LabsMethodTraversal; start_mask: number; stride: number};
  budget: number;
  uncertainty_ppm: number;
  runtime: LabsMethodRuntimeDisclosure;
  source_model_id?: string;
}

export type LabsMethodProposalInput = Omit<LabsMethodProposalBody, "protocol" | "agent_id">;

export interface SignedLabsMethodProposal {
  proposal: LabsMethodProposalBody;
  public_jwk: JsonWebKey;
  signature: string;
}

export interface LabsMethodCritiqueBody {
  protocol: typeof LABS_METHOD_CRITIQUE_PROTOCOL;
  agent_id: string;
  proposal_id: string;
  concern: string;
  suggested_test: string;
  recommendation: "replicate" | "revise" | "reject";
  evidence_ids: string[];
}

export type LabsMethodCritiqueInput = Omit<LabsMethodCritiqueBody, "protocol" | "agent_id">;

export interface SignedLabsMethodCritique {
  critique: LabsMethodCritiqueBody;
  public_jwk: JsonWebKey;
  signature: string;
}

export interface LabsMethodEvaluation {
  protocol: typeof LABS_METHOD_EVALUATION_PROTOCOL;
  proposal_id: string;
  task_id: string;
  evaluated_candidates: number;
  mask_digest: string;
  best_mask: number;
  result: LabsResult;
  result_id: string;
  baseline_energy: string;
  best_energy: string;
  energy_delta: string;
  prediction_met: boolean;
}

export interface LabsResearchPolicyModel {
  protocol: typeof LABS_RESEARCH_POLICY_MODEL_PROTOCOL;
  generation: number;
  parent_model_id: string | null;
  training_evaluation_ids: string[];
  strategy_scores: Array<{traversal: LabsMethodTraversal; mean_utility_ppm: number; evaluation_count: number}>;
  preferred_traversal: LabsMethodTraversal;
  training_digest: string;
}

export interface LabsIsolatedMethodComparison {
  protocol: "proofwild-labs-isolated-method-comparison/1";
  authority: false;
  training_task_ids: string[];
  held_out_task_id: string;
  same_budget: number;
  model_ids: {m1: string; m2: string};
  energies: {baseline: string; m1: string; m2: string};
  improved: {m1_over_baseline: boolean; m2_over_baseline: boolean; m2_over_m1: boolean};
}

const ajv = new Ajv2020({strict: true});
const validateProposal = ajv.compile(proposalSchema) as ValidateFunction<SignedLabsMethodProposal>;
const validateCritique = ajv.compile(critiqueSchema) as ValidateFunction<SignedLabsMethodCritique>;
const validateEvaluation = ajv.compile(evaluationSchema) as ValidateFunction<LabsMethodEvaluation>;
const validateModel = ajv.compile(modelSchema) as ValidateFunction<LabsResearchPolicyModel>;

function schemaError(label: string, validator: ValidateFunction): TypeError {
  return new TypeError(`${label} schema 无效: ${ajv.errorsText(validator.errors)}`);
}

function normalizedPublicJwk(jwk: JsonWebKey): JsonWebKey {
  if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || !jwk.x) throw new TypeError("研究贡献只接受 Ed25519 公钥");
  return {crv: "Ed25519", kty: "OKP", x: jwk.x};
}

function assertMethodProgram(proposal: LabsMethodProposalBody): void {
  if (!Number.isSafeInteger(proposal.budget) || proposal.budget < LABS_METHOD_MIN_BUDGET || proposal.budget > LABS_METHOD_MAX_BUDGET) throw new RangeError(`方法评价预算必须是 ${LABS_METHOD_MIN_BUDGET}–${LABS_METHOD_MAX_BUDGET} 的整数`);
  if (!Number.isSafeInteger(proposal.program.stride) || proposal.program.stride % 2 === 0) throw new RangeError("方法遍历 stride 必须是奇数，确保覆盖完整周期");
  if (proposal.parent_proposal_ids.includes(labsContentId(proposal))) throw new TypeError("方法提案不能把自身作为父提案");
}

function signed<T extends object>(body: T, identity: AgentIdentity): {public_jwk: JsonWebKey; signature: string} {
  if (agentIdFromJwk(identity.publicJwk) !== identity.agentId) throw new TypeError("研究贡献身份不匹配");
  return {
    public_jwk: normalizedPublicJwk(identity.publicJwk),
    signature: sign(null, Buffer.from(labsCanonicalJson(body)), createPrivateKey({key: identity.privateJwk, format: "jwk"})).toString("base64url"),
  };
}

function verifySigned(body: object, publicJwk: JsonWebKey, signature: string, agentId: string): void {
  if (agentIdFromJwk(publicJwk) !== agentId) throw new TypeError("研究贡献公钥与 Agent 身份不匹配");
  const valid = verify(null, Buffer.from(labsCanonicalJson(body)), createPublicKey({key: publicJwk, format: "jwk"}), Buffer.from(signature, "base64url"));
  if (!valid) throw new TypeError("研究贡献签名无效");
}

export function createLabsMethodProposal(input: LabsMethodProposalInput, identity: AgentIdentity): {signed_proposal: SignedLabsMethodProposal; proposal_id: string} {
  const proposal: LabsMethodProposalBody = {protocol: LABS_METHOD_PROPOSAL_PROTOCOL, agent_id: identity.agentId, ...structuredClone(input)};
  assertMethodProgram(proposal);
  const signedProposal: SignedLabsMethodProposal = {proposal, ...signed(proposal, identity)};
  const proposalId = verifyLabsMethodProposal(signedProposal);
  return {signed_proposal: signedProposal, proposal_id: proposalId};
}

export function verifyLabsMethodProposal(value: SignedLabsMethodProposal, expectedId?: string): string {
  if (!validateProposal(value)) throw schemaError("LABS 方法提案", validateProposal);
  assertMethodProgram(value.proposal);
  verifySigned(value.proposal, value.public_jwk, value.signature, value.proposal.agent_id);
  const id = labsContentId(value);
  if (expectedId && id !== expectedId) throw new TypeError("LABS 方法 proposal_id 不匹配");
  return id;
}

export function createLabsMethodCritique(input: LabsMethodCritiqueInput, identity: AgentIdentity): {signed_critique: SignedLabsMethodCritique; critique_id: string} {
  const critique: LabsMethodCritiqueBody = {...structuredClone(input), protocol: LABS_METHOD_CRITIQUE_PROTOCOL, agent_id: identity.agentId, evidence_ids: [...new Set(input.evidence_ids)].sort()};
  const signedCritique: SignedLabsMethodCritique = {critique, ...signed(critique, identity)};
  const critiqueId = verifyLabsMethodCritique(signedCritique);
  return {signed_critique: signedCritique, critique_id: critiqueId};
}

export function verifyLabsMethodCritique(value: SignedLabsMethodCritique, expectedId?: string): string {
  if (!validateCritique(value)) throw schemaError("LABS 方法批评", validateCritique);
  verifySigned(value.critique, value.public_jwk, value.signature, value.critique.agent_id);
  const id = labsContentId(value);
  if (expectedId && id !== expectedId) throw new TypeError("LABS 方法 critique_id 不匹配");
  return id;
}

function reverse16(value: number): number {
  let output = 0;
  for (let bit = 0; bit < 16; bit += 1) output = (output << 1) | ((value >>> bit) & 1);
  return output >>> 0;
}

export function labsMethodMasks(proposal: LabsMethodProposalBody): number[] {
  assertMethodProgram(proposal);
  const masks: number[] = [];
  const seen = new Set<number>();
  for (let index = 0; index < proposal.budget; index += 1) {
    const base = (proposal.program.start_mask + index * proposal.program.stride) % LABS_RESEARCH_CANDIDATES_PER_UNIT;
    const mask = proposal.program.traversal === "identity" ? base : proposal.program.traversal === "gray" ? base ^ (base >>> 1) : reverse16(base);
    if (seen.has(mask)) throw new TypeError("方法程序在评价预算内产生重复 mask");
    seen.add(mask);
    masks.push(mask);
  }
  return masks;
}

export function evaluateLabsMethodProposal(ruleset: LabsRuleset, task: LabsResearchTask, signedProposal: SignedLabsMethodProposal): {evaluation: LabsMethodEvaluation; evaluation_id: string} {
  const taskId = verifyLabsResearchTask(ruleset, task);
  const proposalId = verifyLabsMethodProposal(signedProposal);
  if (signedProposal.proposal.task_id !== taskId) throw new TypeError("LABS 方法提案引用了错误任务");
  const baseline = ruleset.baselines.find((item) => item.length === task.length);
  if (!baseline) throw new TypeError("LABS 方法任务缺少对应基线");
  const masks = labsMethodMasks(signedProposal.proposal);
  let bestMask = masks[0]!;
  let bestSequence = labsResearchCandidate(task, bestMask);
  let bestEnergy = labsEnergy(bestSequence);
  for (const mask of masks.slice(1)) {
    const sequence = labsResearchCandidate(task, mask);
    const energy = labsEnergy(sequence);
    if (energy < bestEnergy || (energy === bestEnergy && mask < bestMask)) { bestMask = mask; bestSequence = sequence; bestEnergy = energy; }
  }
  const result = createLabsResult(ruleset, bestSequence);
  const evaluation: LabsMethodEvaluation = {
    protocol: LABS_METHOD_EVALUATION_PROTOCOL,
    proposal_id: proposalId,
    task_id: taskId,
    evaluated_candidates: masks.length,
    mask_digest: labsContentId({protocol: "proofwild-labs-method-mask-set/1", task_id: taskId, proposal_id: proposalId, masks}),
    best_mask: bestMask,
    result: result.result,
    result_id: result.result_id,
    baseline_energy: baseline.energy,
    best_energy: bestEnergy.toString(),
    energy_delta: (BigInt(baseline.energy) - bestEnergy).toString(),
    prediction_met: bestEnergy <= BigInt(signedProposal.proposal.prediction.expected_max_energy),
  };
  if (!validateEvaluation(evaluation)) throw schemaError("LABS 方法评价", validateEvaluation);
  return {evaluation, evaluation_id: labsContentId(evaluation)};
}

export function verifyLabsMethodEvaluation(ruleset: LabsRuleset, task: LabsResearchTask, proposal: SignedLabsMethodProposal, evaluation: LabsMethodEvaluation, expectedId?: string): string {
  if (!validateEvaluation(evaluation)) throw schemaError("LABS 方法评价", validateEvaluation);
  verifyLabsResult(ruleset, evaluation.result, evaluation.result_id);
  const expected = evaluateLabsMethodProposal(ruleset, task, proposal);
  if (labsCanonicalJson(expected.evaluation) !== labsCanonicalJson(evaluation)) throw new TypeError("LABS 方法评价与确定性重算不匹配");
  if (expectedId && expected.evaluation_id !== expectedId) throw new TypeError("LABS 方法 evaluation_id 不匹配");
  return expected.evaluation_id;
}

const TRAVERSALS: LabsMethodTraversal[] = ["identity", "gray", "bit_reverse"];

export function trainLabsResearchPolicyModel(proposals: SignedLabsMethodProposal[], evaluations: LabsMethodEvaluation[], parent?: LabsResearchPolicyModel): {model: LabsResearchPolicyModel; model_id: string} {
  if (evaluations.length < 2) throw new RangeError("研究策略模型至少需要两份方法评价");
  const proposalsById = new Map(proposals.map((proposal) => [verifyLabsMethodProposal(proposal), proposal]));
  const evaluationsWithIds = evaluations.map((evaluation) => {
    if (!validateEvaluation(evaluation)) throw schemaError("LABS 方法评价", validateEvaluation);
    if (!proposalsById.has(evaluation.proposal_id)) throw new TypeError("研究策略模型评价引用了缺失提案");
    return {evaluation, id: labsContentId(evaluation)};
  });
  const byTask = new Map<string, typeof evaluationsWithIds>();
  for (const item of evaluationsWithIds) byTask.set(item.evaluation.task_id, [...(byTask.get(item.evaluation.task_id) ?? []), item]);
  const utilities = new Map<string, number>();
  for (const group of byTask.values()) {
    for (const item of group) {
      if (group.length === 1) { utilities.set(item.id, 500_000); continue; }
      const own = BigInt(item.evaluation.best_energy);
      let total = 0;
      for (const other of group) {
        if (other.id === item.id) continue;
        const compared = BigInt(other.evaluation.best_energy);
        total += own < compared ? 1_000_000 : own === compared ? 500_000 : 0;
      }
      utilities.set(item.id, Math.floor(total / (group.length - 1)));
    }
  }
  const strategyScores = TRAVERSALS.map((traversal) => {
    const matching = evaluationsWithIds.filter((item) => proposalsById.get(item.evaluation.proposal_id)!.proposal.program.traversal === traversal);
    const total = matching.reduce((sum, item) => sum + utilities.get(item.id)!, 0);
    return {traversal, mean_utility_ppm: matching.length ? Math.floor(total / matching.length) : 0, evaluation_count: matching.length};
  });
  const preferred = [...strategyScores].sort((left, right) => right.mean_utility_ppm - left.mean_utility_ppm || TRAVERSALS.indexOf(left.traversal) - TRAVERSALS.indexOf(right.traversal))[0]!.traversal;
  const trainingEvaluationIds = [...new Set(evaluationsWithIds.map((item) => item.id))].sort();
  const parentId = parent ? labsContentId(parent) : null;
  if (parent) {
    if (!validateModel(parent)) throw schemaError("父研究策略模型", validateModel);
    if (parent.training_evaluation_ids.some((id) => !trainingEvaluationIds.includes(id))) throw new TypeError("后继研究策略模型必须保留父模型全部训练评价");
    if (trainingEvaluationIds.every((id) => parent.training_evaluation_ids.includes(id))) throw new TypeError("后继研究策略模型必须包含新的评价证据");
  }
  const model: LabsResearchPolicyModel = {
    protocol: LABS_RESEARCH_POLICY_MODEL_PROTOCOL,
    generation: (parent?.generation ?? 0) + 1,
    parent_model_id: parentId,
    training_evaluation_ids: trainingEvaluationIds,
    strategy_scores: strategyScores,
    preferred_traversal: preferred,
    training_digest: labsContentId({protocol: "proofwild-research-training-set/1", parent_model_id: parentId, evaluation_ids: trainingEvaluationIds}),
  };
  if (!validateModel(model)) throw schemaError("研究策略模型", validateModel);
  return {model, model_id: labsContentId(model)};
}

export function verifyLabsResearchPolicyModel(proposals: SignedLabsMethodProposal[], evaluations: LabsMethodEvaluation[], model: LabsResearchPolicyModel, expectedId?: string, parent?: LabsResearchPolicyModel): string {
  if (!validateModel(model)) throw schemaError("研究策略模型", validateModel);
  const expected = trainLabsResearchPolicyModel(proposals, evaluations, parent);
  if (labsCanonicalJson(expected.model) !== labsCanonicalJson(model)) throw new TypeError("研究策略模型与确定性训练结果不匹配");
  if (expectedId && expected.model_id !== expectedId) throw new TypeError("研究策略 model_id 不匹配");
  return expected.model_id;
}

function labsMethodProgramFromModel(model: LabsResearchPolicyModel, modelId: string, taskId: string): LabsMethodProposalBody["program"] {
  if (!validateModel(model) || labsContentId(model) !== modelId) throw new TypeError("生成提案的研究策略模型无效");
  const seed = labsContentId({protocol: "proofwild-research-policy-sample/1", model_id: modelId, task_id: taskId, generation: model.generation}).slice("sha256:".length);
  const startMask = Number.parseInt(seed.slice(0, 4), 16);
  const stride = Number.parseInt(seed.slice(4, 8), 16) | 1;
  return {traversal: model.preferred_traversal, start_mask: startMask, stride};
}

export function verifyLabsModelGeneratedProposal(model: LabsResearchPolicyModel, modelId: string, proposal: SignedLabsMethodProposal): void {
  verifyLabsMethodProposal(proposal);
  if (proposal.proposal.source_model_id !== modelId || labsCanonicalJson(proposal.proposal.program) !== labsCanonicalJson(labsMethodProgramFromModel(model, modelId, proposal.proposal.task_id))) throw new TypeError("模型生成提案的来源或生成参数不匹配");
}

export function proposeLabsMethodFromModel(model: LabsResearchPolicyModel, modelId: string, taskId: string, identity: AgentIdentity, input: Omit<LabsMethodProposalInput, "task_id" | "program" | "source_model_id">): {signed_proposal: SignedLabsMethodProposal; proposal_id: string} {
  return createLabsMethodProposal({...structuredClone(input), task_id: taskId, source_model_id: modelId, program: labsMethodProgramFromModel(model, modelId, taskId)}, identity);
}

export function compareLabsResearchPolicies(
  ruleset: LabsRuleset,
  heldOutTask: LabsResearchTask,
  training: {tasks: LabsResearchTask[]; proposals: SignedLabsMethodProposal[]; evaluations: LabsMethodEvaluation[]},
  baseline: SignedLabsMethodProposal,
  m1: {model: LabsResearchPolicyModel; model_id: string; proposal: SignedLabsMethodProposal},
  m2: {model: LabsResearchPolicyModel; model_id: string; proposal: SignedLabsMethodProposal},
): LabsIsolatedMethodComparison {
  const heldOutTaskId = verifyLabsResearchTask(ruleset, heldOutTask);
  const tasksById = new Map(training.tasks.map((task) => [verifyLabsResearchTask(ruleset, task), task]));
  const proposalsById = new Map(training.proposals.map((proposal) => [verifyLabsMethodProposal(proposal), proposal]));
  for (const evaluation of training.evaluations) {
    const task = tasksById.get(evaluation.task_id);
    const proposal = proposalsById.get(evaluation.proposal_id);
    if (!task || !proposal) throw new TypeError("隔离比较的训练评价缺少任务或提案");
    verifyLabsMethodEvaluation(ruleset, task, proposal, evaluation);
  }
  const trainingIds = new Set(training.evaluations.map((evaluation) => labsContentId(evaluation)));
  if (training.evaluations.some((evaluation) => evaluation.task_id === heldOutTaskId)) throw new TypeError("隔离比较任务不能出现在模型训练评价中");
  if (m1.model.training_evaluation_ids.some((id) => !trainingIds.has(id)) || m2.model.training_evaluation_ids.some((id) => !trainingIds.has(id))) throw new TypeError("隔离比较缺少模型引用的训练评价");
  const evaluationsById = new Map(training.evaluations.map((evaluation) => [labsContentId(evaluation), evaluation]));
  const m1Evaluations = m1.model.training_evaluation_ids.map((id) => evaluationsById.get(id)!);
  const m2Evaluations = m2.model.training_evaluation_ids.map((id) => evaluationsById.get(id)!);
  verifyLabsResearchPolicyModel(training.proposals, m1Evaluations, m1.model, m1.model_id);
  verifyLabsResearchPolicyModel(training.proposals, m2Evaluations, m2.model, m2.model_id, m1.model);
  verifyLabsModelGeneratedProposal(m1.model, m1.model_id, m1.proposal);
  verifyLabsModelGeneratedProposal(m2.model, m2.model_id, m2.proposal);
  verifyLabsMethodProposal(baseline);
  const proposals = [baseline, m1.proposal, m2.proposal];
  if (proposals.some((proposal) => proposal.proposal.task_id !== heldOutTaskId)) throw new TypeError("隔离比较提案必须属于同一保留任务");
  const budgets = new Set(proposals.map((proposal) => proposal.proposal.budget));
  if (budgets.size !== 1) throw new TypeError("隔离比较必须使用相同评价预算");
  const [baselineEvaluation, m1Evaluation, m2Evaluation] = proposals.map((proposal) => evaluateLabsMethodProposal(ruleset, heldOutTask, proposal).evaluation);
  const baselineEnergy = BigInt(baselineEvaluation!.best_energy);
  const m1Energy = BigInt(m1Evaluation!.best_energy);
  const m2Energy = BigInt(m2Evaluation!.best_energy);
  return {
    protocol: "proofwild-labs-isolated-method-comparison/1",
    authority: false,
    training_task_ids: [...new Set(training.evaluations.map((evaluation) => evaluation.task_id))].sort(),
    held_out_task_id: heldOutTaskId,
    same_budget: baseline.proposal.budget,
    model_ids: {m1: m1.model_id, m2: m2.model_id},
    energies: {baseline: baselineEnergy.toString(), m1: m1Energy.toString(), m2: m2Energy.toString()},
    improved: {m1_over_baseline: m1Energy < baselineEnergy, m2_over_baseline: m2Energy < baselineEnergy, m2_over_m1: m2Energy < m1Energy},
  };
}

export function assertLabsMethodEvaluation(value: unknown): asserts value is LabsMethodEvaluation {
  if (!validateEvaluation(value)) throw schemaError("LABS 方法评价", validateEvaluation);
}

export function assertLabsResearchPolicyModel(value: unknown): asserts value is LabsResearchPolicyModel {
  if (!validateModel(value)) throw schemaError("研究策略模型", validateModel);
}

export function labsMethodObjectBytes(value: unknown): number {
  return labsObjectBytes(value);
}
