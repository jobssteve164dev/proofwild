import {describe, expect, it} from "vitest";
import {mkdtemp, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {startLocalNode} from "../../apps/local-node/src/server.js";
import {runResearchAction} from "../../packages/agent/src/index.js";
import {createIdentity, type AgentIdentity} from "../../packages/identity/src/index.js";
import {WORLD_SUPPLY_SCHEDULE_ID, worldResourceBranch} from "../../packages/kernel/src/index.js";
import * as labs from "../../packages/labs/src/index.js";
import {handleLabsRequest} from "../../packages/labs/src/http.js";
import {LabsRepository, MemoryLabsPersistence} from "../../packages/labs/src/store.js";

type Traversal = "identity" | "gray" | "bit_reverse";
type ProposalInput = {
  task_id: string;
  parent_proposal_ids: string[];
  question: string;
  hypothesis: string;
  method_summary: string;
  prediction: {metric: "best_energy"; expected_max_energy: string};
  program: {traversal: Traversal; start_mask: number; stride: number};
  budget: number;
  uncertainty_ppm: number;
  runtime: {model: string; scaffold: string; configuration_digest: string; human_contribution: "none" | "prompt_only" | "assisted" | "unknown"};
  source_model_id?: string;
};

type MethodApi = {
  createLabsMethodProposal?: (input: ProposalInput, identity: AgentIdentity) => {signed_proposal: any; proposal_id: string};
  verifyLabsMethodProposal?: (proposal: any, expectedId?: string) => string;
  evaluateLabsMethodProposal?: (ruleset: any, task: any, proposal: any) => {evaluation: any; evaluation_id: string};
  createLabsMethodCritique?: (input: any, identity: AgentIdentity) => {signed_critique: any; critique_id: string};
  verifyLabsMethodCritique?: (critique: any, expectedId?: string) => string;
  trainLabsResearchPolicyModel?: (proposals: any[], evaluations: any[], parent?: any) => {model: any; model_id: string};
  verifyLabsResearchPolicyModel?: (proposals: any[], evaluations: any[], model: any, expectedId?: string, parent?: any) => string;
  verifyLabsModelGeneratedProposal?: (model: any, modelId: string, proposal: any) => void;
  compareLabsResearchPolicies?: (ruleset: any, task: any, training: {tasks: any[]; proposals: any[]; evaluations: any[]}, baseline: any, m1: {model: any; model_id: string; proposal: any}, m2: {model: any; model_id: string; proposal: any}) => any;
  proposeLabsMethodFromModel?: (model: any, modelId: string, taskId: string, identity: AgentIdentity, input: Omit<ProposalInput, "task_id" | "program" | "source_model_id">) => {signed_proposal: any; proposal_id: string};
};

const api = labs as unknown as MethodApi;
const digest = (digit: string) => `sha256:${digit.repeat(64)}`;

async function taskFixture(branchOrdinal = 0) {
  const identity = await createIdentity();
  const branch = worldResourceBranch(branchOrdinal).labs_branch;
  const {task, task_id} = labs.createLabsResearchTask(labs.REFERENCE_RULESET, branch, {economic_parent_id: WORLD_SUPPLY_SCHEDULE_ID, claimant_agent_id: identity.agentId});
  return {identity, task, task_id};
}

function input(taskId: string, traversal: Traversal, startMask: number, stride: number, overrides: Partial<ProposalInput> = {}): ProposalInput {
  return {
    task_id: taskId,
    parent_proposal_ids: [],
    question: "在固定评价预算内，哪种候选遍历方式能找到更低能量？",
    hypothesis: `${traversal} 遍历会在当前任务中更早覆盖低能量候选。`,
    method_summary: `从 ${startMask} 开始，以奇数步长 ${stride} 执行 ${traversal} 变换。`,
    prediction: {metric: "best_energy", expected_max_energy: "999999"},
    program: {traversal, start_mask: startMask, stride},
    budget: 64,
    uncertainty_ppm: 500_000,
    runtime: {model: "test-researcher-1", scaffold: "proofwild-test", configuration_digest: digest("1"), human_contribution: "none"},
    ...overrides,
  };
}

describe("LABS Agent 研究训练闭环", () => {
  it("让 Agent 签署可检验的方法提案并得到可独立重算的有限预算评价", async () => {
    expect(api.createLabsMethodProposal).toBeTypeOf("function");
    expect(api.verifyLabsMethodProposal).toBeTypeOf("function");
    expect(api.evaluateLabsMethodProposal).toBeTypeOf("function");
    const {identity, task, task_id} = await taskFixture();
    const created = api.createLabsMethodProposal!(input(task_id, "identity", 7, 3), identity);
    expect(api.verifyLabsMethodProposal!(created.signed_proposal, created.proposal_id)).toBe(created.proposal_id);

    const first = api.evaluateLabsMethodProposal!(labs.REFERENCE_RULESET, task, created.signed_proposal);
    const second = api.evaluateLabsMethodProposal!(labs.REFERENCE_RULESET, task, created.signed_proposal);
    expect(second).toEqual(first);
    expect(first.evaluation).toMatchObject({proposal_id: created.proposal_id, task_id, evaluated_candidates: 64, baseline_energy: "22558"});

    const expected = Array.from({length: 64}, (_, index) => (7 + index * 3) % 65_536)
      .map((mask) => ({mask, energy: labs.labsEnergy(labs.labsResearchCandidate(task, mask))}))
      .sort((left, right) => left.energy < right.energy ? -1 : left.energy > right.energy ? 1 : left.mask - right.mask)[0]!;
    expect(first.evaluation.best_mask).toBe(expected.mask);
    expect(first.evaluation.best_energy).toBe(expected.energy.toString());
  });

  it("拒绝伪造签名和越界、重复或不可完整遍历的方法程序", async () => {
    expect(api.createLabsMethodProposal).toBeTypeOf("function");
    expect(api.verifyLabsMethodProposal).toBeTypeOf("function");
    const {identity, task_id} = await taskFixture();
    expect(() => api.createLabsMethodProposal!(input(task_id, "identity", 0, 2), identity)).toThrow("奇数");
    expect(() => api.createLabsMethodProposal!(input(task_id, "identity", 0, 1, {budget: 63}), identity)).toThrow("预算");
    const created = api.createLabsMethodProposal!(input(task_id, "gray", 0, 1), identity);
    const forged = structuredClone(created.signed_proposal);
    forged.proposal.hypothesis = "篡改后的假设不会得到原签名授权。";
    expect(() => api.verifyLabsMethodProposal!(forged)).toThrow("签名");
  });

  it("保存不同 Agent 的提案、批评、修订和客观偏好，而不只保留胜者", async () => {
    expect(api.createLabsMethodCritique).toBeTypeOf("function");
    expect(api.verifyLabsMethodCritique).toBeTypeOf("function");
    const {identity: firstAgent, task, task_id} = await taskFixture();
    const secondAgent = await createIdentity();
    const critic = await createIdentity();
    const first = api.createLabsMethodProposal!(input(task_id, "identity", 7, 3), firstAgent);
    const second = api.createLabsMethodProposal!(input(task_id, "bit_reverse", 41, 65_535), secondAgent);
    const firstEvaluation = api.evaluateLabsMethodProposal!(labs.REFERENCE_RULESET, task, first.signed_proposal);
    const secondEvaluation = api.evaluateLabsMethodProposal!(labs.REFERENCE_RULESET, task, second.signed_proposal);
    const critique = api.createLabsMethodCritique!({proposal_id: first.proposal_id, concern: "方法只覆盖一个局部顺序，可能错过分散的低能量候选。", suggested_test: "与位反转遍历在相同预算和同一任务上比较。", recommendation: "revise", evidence_ids: [firstEvaluation.evaluation_id]}, critic);
    expect(api.verifyLabsMethodCritique!(critique.signed_critique, critique.critique_id)).toBe(critique.critique_id);
    const revision = api.createLabsMethodProposal!(input(task_id, "gray", 13, 5, {parent_proposal_ids: [first.proposal_id]}), firstAgent);
    const revisionEvaluation = api.evaluateLabsMethodProposal!(labs.REFERENCE_RULESET, task, revision.signed_proposal);

    const repository = await LabsRepository.open(new MemoryLabsPersistence());
    await repository.ingest("task", task, task_id);
    await repository.ingest("method_proposal" as any, first.signed_proposal, first.proposal_id);
    await repository.ingest("method_proposal" as any, second.signed_proposal, second.proposal_id);
    await repository.ingest("method_evaluation" as any, firstEvaluation.evaluation, firstEvaluation.evaluation_id);
    await repository.ingest("method_evaluation" as any, secondEvaluation.evaluation, secondEvaluation.evaluation_id);
    await repository.ingest("method_critique" as any, critique.signed_critique, critique.critique_id);
    await repository.ingest("method_proposal" as any, revision.signed_proposal, revision.proposal_id);
    await repository.ingest("method_evaluation" as any, revisionEvaluation.evaluation, revisionEvaluation.evaluation_id);
    const dataset = await (repository as any).methodDataset();
    expect(dataset).toMatchObject({protocol: "proofwild-labs-method-dataset/1", authority: false});
    expect(dataset.proposals).toHaveLength(3);
    expect(dataset.evaluations).toHaveLength(3);
    expect(dataset.critiques).toHaveLength(1);
    expect(dataset.preference_pairs.length).toBeGreaterThan(0);
    expect(dataset.proposals.some((item: any) => item.value.proposal.parent_proposal_ids.includes(first.proposal_id))).toBe(true);

    const otherTask = await taskFixture(1);
    await repository.ingest("task", otherTask.task, otherTask.task_id);
    const crossTaskRevision = api.createLabsMethodProposal!(input(otherTask.task_id, "gray", 3, 5, {parent_proposal_ids: [first.proposal_id]}), firstAgent);
    await expect(repository.ingest("method_proposal" as any, crossTaskRevision.signed_proposal, crossTaskRevision.proposal_id)).rejects.toThrow("同一任务");

    const firstPage = await (repository as any).methodDataset(null, 2);
    expect(firstPage.next_cursor).toMatch(/^\d:sha256:/);
    const secondPage = await (repository as any).methodDataset(firstPage.next_cursor, 2);
    const firstIds = [...firstPage.tasks, ...firstPage.proposals, ...firstPage.critiques, ...firstPage.evaluations, ...firstPage.models].map((item: any) => item.id);
    const secondIds = [...secondPage.tasks, ...secondPage.proposals, ...secondPage.critiques, ...secondPage.evaluations, ...secondPage.models].map((item: any) => item.id);
    expect(firstIds).not.toEqual(expect.arrayContaining(secondIds));
  });

  it("训练 M1、由 M1 生成新提案并训练出引用 M1 的 M2", async () => {
    expect(api.trainLabsResearchPolicyModel).toBeTypeOf("function");
    expect(api.proposeLabsMethodFromModel).toBeTypeOf("function");
    const {identity, task, task_id} = await taskFixture();
    const agents = await Promise.all([createIdentity(), createIdentity(), createIdentity()]);
    const proposals = [
      api.createLabsMethodProposal!(input(task_id, "identity", 7, 3), agents[0]!),
      api.createLabsMethodProposal!(input(task_id, "gray", 17, 5), agents[1]!),
      api.createLabsMethodProposal!(input(task_id, "bit_reverse", 41, 65_535), agents[2]!),
    ];
    const evaluations = proposals.map((proposal) => api.evaluateLabsMethodProposal!(labs.REFERENCE_RULESET, task, proposal.signed_proposal));
    const m1 = api.trainLabsResearchPolicyModel!(proposals.map((item) => item.signed_proposal), evaluations.map((item) => item.evaluation));
    expect(m1.model).toMatchObject({protocol: "proofwild-research-policy-model/1", generation: 1, parent_model_id: null});
    expect(api.verifyLabsResearchPolicyModel!(proposals.map((item) => item.signed_proposal), evaluations.map((item) => item.evaluation), m1.model, m1.model_id)).toBe(m1.model_id);

    const generated = api.proposeLabsMethodFromModel!(m1.model, m1.model_id, task_id, identity, {
      parent_proposal_ids: [proposals[0]!.proposal_id],
      question: "训练后的研究策略能否在相同预算下提出新的遍历方法？",
      hypothesis: "采用模型学到的优先 traversal，并用模型与任务摘要派生参数，可以形成可复验的新提案。",
      method_summary: "由第一代研究策略模型确定遍历方式并派生参数。",
      prediction: {metric: "best_energy", expected_max_energy: "999999"},
      budget: 64,
      uncertainty_ppm: 400_000,
      runtime: {model: "reference-policy-m1", scaffold: "proofwild-research-loop", configuration_digest: m1.model_id, human_contribution: "none"},
    });
    expect(generated.signed_proposal.proposal.source_model_id).toBe(m1.model_id);
    expect(() => api.verifyLabsModelGeneratedProposal!(m1.model, m1.model_id, generated.signed_proposal)).not.toThrow();
    const falselyAttributed = api.createLabsMethodProposal!(input(task_id, "identity", 1, 1, {source_model_id: m1.model_id}), identity);
    expect(() => api.verifyLabsModelGeneratedProposal!(m1.model, m1.model_id, falselyAttributed.signed_proposal)).toThrow("生成参数");
    const generatedEvaluation = api.evaluateLabsMethodProposal!(labs.REFERENCE_RULESET, task, generated.signed_proposal);
    const allProposals = [...proposals.map((item) => item.signed_proposal), generated.signed_proposal];
    const allEvaluations = [...evaluations.map((item) => item.evaluation), generatedEvaluation.evaluation];
    const m2 = api.trainLabsResearchPolicyModel!(allProposals, allEvaluations, m1.model);
    expect(m2.model).toMatchObject({generation: 2, parent_model_id: m1.model_id});
    expect(m2.model.training_evaluation_ids).toContain(generatedEvaluation.evaluation_id);
    expect(() => api.trainLabsResearchPolicyModel!([proposals[0]!.signed_proposal, generated.signed_proposal], [evaluations[0]!.evaluation, generatedEvaluation.evaluation], m1.model)).toThrow("父模型全部");
  });

  it("按任务隔离比较基础方法、M1 和 M2，不把闭环运行冒充性能提升", async () => {
    const training = await taskFixture(0);
    const next = await taskFixture(1);
    const heldOut = await taskFixture(2);
    const agents = await Promise.all([createIdentity(), createIdentity(), createIdentity()]);
    const trainingProposals = [
      api.createLabsMethodProposal!(input(training.task_id, "identity", 7, 3), agents[0]!),
      api.createLabsMethodProposal!(input(training.task_id, "gray", 17, 5), agents[1]!),
      api.createLabsMethodProposal!(input(training.task_id, "bit_reverse", 41, 65_535), agents[2]!),
    ];
    const trainingEvaluations = trainingProposals.map((item) => api.evaluateLabsMethodProposal!(labs.REFERENCE_RULESET, training.task, item.signed_proposal));
    const m1 = api.trainLabsResearchPolicyModel!(trainingProposals.map((item) => item.signed_proposal), trainingEvaluations.map((item) => item.evaluation));
    const generatedForNext = api.proposeLabsMethodFromModel!(m1.model, m1.model_id, next.task_id, agents[0]!, {...input(next.task_id, "identity", 0, 1), parent_proposal_ids: []});
    const nextEvaluation = api.evaluateLabsMethodProposal!(labs.REFERENCE_RULESET, next.task, generatedForNext.signed_proposal);
    const m2 = api.trainLabsResearchPolicyModel!([...trainingProposals.map((item) => item.signed_proposal), generatedForNext.signed_proposal], [...trainingEvaluations.map((item) => item.evaluation), nextEvaluation.evaluation], m1.model);
    const baseline = api.createLabsMethodProposal!(input(heldOut.task_id, "identity", 0, 1), agents[0]!);
    const fromM1 = api.proposeLabsMethodFromModel!(m1.model, m1.model_id, heldOut.task_id, agents[1]!, {...input(heldOut.task_id, "identity", 0, 1), parent_proposal_ids: []});
    const fromM2 = api.proposeLabsMethodFromModel!(m2.model, m2.model_id, heldOut.task_id, agents[2]!, {...input(heldOut.task_id, "identity", 0, 1), parent_proposal_ids: []});
    const report = api.compareLabsResearchPolicies!(labs.REFERENCE_RULESET, heldOut.task, {tasks: [training.task, next.task], proposals: [...trainingProposals.map((item) => item.signed_proposal), generatedForNext.signed_proposal], evaluations: [...trainingEvaluations.map((item) => item.evaluation), nextEvaluation.evaluation]}, baseline.signed_proposal, {model: m1.model, model_id: m1.model_id, proposal: fromM1.signed_proposal}, {model: m2.model, model_id: m2.model_id, proposal: fromM2.signed_proposal});
    expect(report.protocol).toBe("proofwild-labs-isolated-method-comparison/1");
    expect(report.held_out_task_id).not.toBe(training.task_id);
    expect(report.training_task_ids).not.toContain(report.held_out_task_id);
    expect(Object.values(report.energies as Record<string, string>).every((energy) => /^\d+$/.test(energy))).toBe(true);
  });

  it("通过正式 HTTP 入口提交对象并读取完整训练数据", async () => {
    const {identity, task, task_id} = await taskFixture();
    const repository = await LabsRepository.open(new MemoryLabsPersistence());
    await repository.ingest("task", task, task_id);
    const proposal = api.createLabsMethodProposal!(input(task_id, "identity", 7, 3), identity);
    const evaluation = api.evaluateLabsMethodProposal!(labs.REFERENCE_RULESET, task, proposal.signed_proposal);
    const post = async (path: string, id: string, value: unknown) => {
      const response = await handleLabsRequest(new Request(`https://example.test${path}`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({id, value})}), repository);
      expect(response?.status, await response?.text()).toBe(201);
    };
    await post("/labs/v1/methods/proposals", proposal.proposal_id, proposal.signed_proposal);
    await post("/labs/v1/methods/evaluations", evaluation.evaluation_id, evaluation.evaluation);
    const secondIdentity = await createIdentity();
    const secondProposal = api.createLabsMethodProposal!(input(task_id, "bit_reverse", 41, 65_535), secondIdentity);
    const secondEvaluation = api.evaluateLabsMethodProposal!(labs.REFERENCE_RULESET, task, secondProposal.signed_proposal);
    const critique = api.createLabsMethodCritique!({proposal_id: proposal.proposal_id, concern: "需要与分散访问候选空间的方法进行同预算对照。", suggested_test: "在相同任务与预算下运行位反转遍历。", recommendation: "replicate", evidence_ids: [evaluation.evaluation_id]}, secondIdentity);
    await post("/labs/v1/methods/proposals", secondProposal.proposal_id, secondProposal.signed_proposal);
    await post("/labs/v1/methods/evaluations", secondEvaluation.evaluation_id, secondEvaluation.evaluation);
    await post("/labs/v1/methods/critiques", critique.critique_id, critique.signed_critique);
    const model = api.trainLabsResearchPolicyModel!([proposal.signed_proposal, secondProposal.signed_proposal], [evaluation.evaluation, secondEvaluation.evaluation]);
    await post("/labs/v1/methods/models", model.model_id, model.model);
    const discovery = await handleLabsRequest(new Request("https://example.test/labs/v1/methods"), repository);
    expect(await discovery?.json()).toMatchObject({protocol: "proofwild-labs-method-discovery/1", authority: false});
    const dataset = await handleLabsRequest(new Request("https://example.test/labs/v1/methods/dataset"), repository);
    const datasetBody = await dataset?.json() as any;
    expect(datasetBody).toMatchObject({protocol: "proofwild-labs-method-dataset/1"});
    expect(datasetBody.proposals).toEqual(expect.arrayContaining([{id: proposal.proposal_id, value: proposal.signed_proposal}, {id: secondProposal.proposal_id, value: secondProposal.signed_proposal}]));
    expect(datasetBody.evaluations).toEqual(expect.arrayContaining([{id: evaluation.evaluation_id, value: evaluation.evaluation}, {id: secondEvaluation.evaluation_id, value: secondEvaluation.evaluation}]));
    expect(datasetBody.critiques).toEqual([{id: critique.critique_id, value: critique.signed_critique}]);
    expect(datasetBody.models).toEqual([{id: model.model_id, value: model.model}]);
    const object = await handleLabsRequest(new Request(`https://example.test/labs/v1/methods/objects/${proposal.proposal_id}`), repository);
    expect(object?.headers.get("cache-control")).toContain("immutable");
    expect(await object?.json()).toMatchObject({id: proposal.proposal_id, kind: "method_proposal"});
  });

  it("让发布 Agent 包通过真实本地 HTTP 节点完成提案和评价", async () => {
    const directory = await mkdtemp(join(tmpdir(), "proofwild-method-http-"));
    const node = await startLocalNode({dataDirectory: directory, regionId: "method-http"});
    try {
      const {task, task_id} = await taskFixture();
      const taskResponse = await fetch(`${node.url}/labs/v1/objects`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({kind: "task", id: task_id, value: task})});
      expect(taskResponse.status).toBe(201);
      const inputPath = join(directory, "proposal-input.json");
      const identityPath = join(directory, "researcher.json");
      await writeFile(inputPath, JSON.stringify(input(task_id, "gray", 19, 7)));
      const proposed = await runResearchAction({action: "propose", inputPath, identityPath, nodeUrl: node.url}) as {id: string};
      const evaluated = await runResearchAction({action: "evaluate", objectId: proposed.id, nodeUrl: node.url}) as {id: string};
      const dataset = await runResearchAction({action: "dataset", nodeUrl: node.url}) as {proposals: Array<{id: string}>; evaluations: Array<{id: string}>};
      expect(dataset.proposals.map(({id}) => id)).toContain(proposed.id);
      expect(dataset.evaluations.map(({id}) => id)).toContain(evaluated.id);
    } finally {
      await node.close();
    }
  });
});
