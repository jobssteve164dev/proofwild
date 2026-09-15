import {mkdir, readFile, rename, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {
  LABS_MAX_OBJECT_BYTES,
  REFERENCE_FORK_ID,
  REFERENCE_RESULTS,
  REFERENCE_SEARCH_METHOD_ARTIFACT,
  REFERENCE_SEARCH_METHOD_ARTIFACT_ID,
  REFERENCE_RULESET,
  REFERENCE_RULESET_ID,
  addResultToFrontier,
  createInitialFrontier,
  labsCanonicalJson,
  labsContentId,
  labsObjectBytes,
  mergeLabsFrontiers,
  rulesetId,
  exactMeritFactor,
  verifyLabsArtifact,
  verifyLabsClaim,
  verifyLabsResearchRecord,
  verifyLabsResearchTask,
  verifyLabsResult,
  type LabsFrontier,
  type LabsResearchArtifact,
  type AnyLabsResearchRecord,
  type AnyLabsResearchTask,
  type LabsResult,
  type LabsRuleset,
  type LabsSignedClaim,
} from "./index.js";
import {assertLabsArtifact, assertLabsClaim, assertLabsFrontier, assertLabsResearchRecord, assertLabsResearchTask, assertLabsResult, assertLabsRuleset} from "./validation.js";
import {
  verifyLabsMethodCritique,
  verifyLabsMethodEvaluation,
  verifyLabsMethodProposal,
  verifyLabsModelGeneratedProposal,
  verifyLabsResearchPolicyModel,
  type LabsMethodEvaluation,
  type LabsResearchPolicyModel,
  type SignedLabsMethodCritique,
  type SignedLabsMethodProposal,
} from "./methods.js";

export type LabsExchangeObjectKind = "ruleset" | "result" | "artifact" | "task" | "record" | "claim";
export type LabsExchangeObjectValue = LabsRuleset | LabsResult | LabsResearchArtifact | AnyLabsResearchTask | AnyLabsResearchRecord | LabsSignedClaim;
export type LabsObjectKind = LabsExchangeObjectKind | "method_proposal" | "method_critique" | "method_evaluation" | "research_model";
export type LabsObjectValue = LabsRuleset | LabsResult | LabsResearchArtifact | AnyLabsResearchTask | AnyLabsResearchRecord | LabsSignedClaim | SignedLabsMethodProposal | SignedLabsMethodCritique | LabsMethodEvaluation | LabsResearchPolicyModel;
export interface LabsStoredObject {kind: LabsObjectKind; value: LabsObjectValue}
export interface LabsExchangeBundle {protocol: "sai-labs-exchange/2"; ruleset_id: string; fork_id: string; frontier: LabsFrontier; cursor: string | null; next_cursor: string | null; objects: Array<{id: string; kind: LabsExchangeObjectKind; value: LabsExchangeObjectValue}>}

export interface LabsMethodDataset {
  protocol: "proofwild-labs-method-dataset/1";
  authority: false;
  cursor: string | null;
  next_cursor: string | null;
  tasks: Array<{id: string; value: AnyLabsResearchTask}>;
  proposals: Array<{id: string; value: SignedLabsMethodProposal}>;
  critiques: Array<{id: string; value: SignedLabsMethodCritique}>;
  evaluations: Array<{id: string; value: LabsMethodEvaluation}>;
  models: Array<{id: string; value: LabsResearchPolicyModel}>;
  preference_pairs: Array<{task_id: string; preferred_proposal_id: string; rejected_proposal_id: string; preferred_evaluation_id: string; rejected_evaluation_id: string}>;
}

export interface LabsRegistryEntry {
  result_id: string;
  result: LabsResult;
  status: "reference_baseline" | "search_coverage" | "frontier_improvement" | "sequence_only";
  merit_factor: ReturnType<typeof exactMeritFactor>;
  baseline_energy: string;
  energy_delta: string;
  source?: LabsRuleset["baselines"][number]["source"];
  claims: Array<{claim_id: string; signed_claim: LabsSignedClaim}>;
  research: Array<{record_id: string; record: AnyLabsResearchRecord; task: AnyLabsResearchTask; artifacts: Array<{artifact_id: string; artifact: LabsResearchArtifact}>}>;
  coverage_contributors: number;
  discovery_claims: number;
  reproduction_claimants: number;
  relay_claims: number;
}

export interface LabsRegistrySnapshot {
  protocol: "sai-labs-registry/1";
  ruleset_id: string;
  role: "derived-local-index";
  authority: false;
  entries: LabsRegistryEntry[];
  totals: {results: number; research_records: number; frontier_improvements: number; search_coverage_records: number; coverage_contributors: number; reproduction_claimants: number; contribution_grade_research_units: number; verified_new_canonical_candidates: string};
}

export interface LabsPersistence {
  getObject(id: string): Promise<LabsStoredObject | undefined>;
  putObject(id: string, object: LabsStoredObject): Promise<void>;
  listObjects(): Promise<Array<{id: string; object: LabsStoredObject}>>;
  getFrontier(rulesetId: string, forkId: string): Promise<LabsFrontier | undefined>;
  putFrontier(frontier: LabsFrontier): Promise<void>;
}

export class MemoryLabsPersistence implements LabsPersistence {
  private readonly objects = new Map<string, LabsStoredObject>();
  private readonly frontiers = new Map<string, LabsFrontier>();
  async getObject(id: string): Promise<LabsStoredObject | undefined> { const value = this.objects.get(id); return value ? structuredClone(value) : undefined; }
  async putObject(id: string, object: LabsStoredObject): Promise<void> { this.objects.set(id, structuredClone(object)); }
  async listObjects(): Promise<Array<{id: string; object: LabsStoredObject}>> { return [...this.objects.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, object]) => ({id, object: structuredClone(object)})); }
  async getFrontier(rulesetId: string, forkId: string): Promise<LabsFrontier | undefined> { const value = this.frontiers.get(`${rulesetId}\u0000${forkId}`); return value ? structuredClone(value) : undefined; }
  async putFrontier(frontier: LabsFrontier): Promise<void> { this.frontiers.set(`${frontier.ruleset_id}\u0000${frontier.fork_id}`, structuredClone(frontier)); }
}

interface FileLabsState {objects: Record<string, LabsStoredObject>; frontiers: Record<string, LabsFrontier>}

export class FileLabsPersistence implements LabsPersistence {
  private state: FileLabsState = {objects: {}, frontiers: {}};
  private queue: Promise<void> = Promise.resolve();
  private constructor(private readonly directory: string) {}

  static async open(directory: string): Promise<FileLabsPersistence> {
    const persistence = new FileLabsPersistence(directory);
    await mkdir(directory, {recursive: true});
    try { persistence.state = JSON.parse(await readFile(join(directory, "labs-store.json"), "utf8")) as FileLabsState; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    return persistence;
  }

  async getObject(id: string): Promise<LabsStoredObject | undefined> { const value = this.state.objects[id]; return value ? structuredClone(value) : undefined; }
  async putObject(id: string, object: LabsStoredObject): Promise<void> { await this.update(() => { this.state.objects[id] = structuredClone(object); }); }
  async listObjects(): Promise<Array<{id: string; object: LabsStoredObject}>> { return Object.entries(this.state.objects).sort(([a], [b]) => a.localeCompare(b)).map(([id, object]) => ({id, object: structuredClone(object)})); }
  async getFrontier(rulesetId: string, forkId: string): Promise<LabsFrontier | undefined> { const value = this.state.frontiers[`${rulesetId}\u0000${forkId}`]; return value ? structuredClone(value) : undefined; }
  async putFrontier(frontier: LabsFrontier): Promise<void> { await this.update(() => { this.state.frontiers[`${frontier.ruleset_id}\u0000${frontier.fork_id}`] = structuredClone(frontier); }); }

  private async update(change: () => void): Promise<void> {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      change();
      const temporary = join(this.directory, "labs-store.json.next");
      await writeFile(temporary, `${JSON.stringify(this.state, null, 2)}\n`, {encoding: "utf8", mode: 0o600});
      await rename(temporary, join(this.directory, "labs-store.json"));
    } finally { release(); }
  }
}

export class LabsRepository {
  private ingestionQueue: Promise<void> = Promise.resolve();
  private methodDatasetIndex: {available: Array<{id: string; object: LabsStoredObject; key: string}>; preferencePairsByRejected: Map<string, LabsMethodDataset["preference_pairs"][number]>} | undefined;
  private constructor(readonly persistence: LabsPersistence) {}

  static async open(persistence: LabsPersistence): Promise<LabsRepository> {
    const repository = new LabsRepository(persistence);
    await repository.ingest("ruleset", REFERENCE_RULESET, REFERENCE_RULESET_ID);
    for (const record of Object.values(REFERENCE_RESULTS)) await repository.ingest("result", record.result, record.result_id, REFERENCE_FORK_ID);
    await repository.ingest("artifact", REFERENCE_SEARCH_METHOD_ARTIFACT, REFERENCE_SEARCH_METHOD_ARTIFACT_ID);
    return repository;
  }

  async ingest(kind: LabsObjectKind, value: LabsObjectValue, expectedId?: string, forkId = REFERENCE_FORK_ID): Promise<string> {
    const previous = this.ingestionQueue;
    let release!: () => void;
    this.ingestionQueue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await this.ingestUnlocked(kind, value, expectedId, forkId);
    } finally {
      release();
    }
  }

  private async ingestUnlocked(kind: LabsObjectKind, value: LabsObjectValue, expectedId?: string, forkId = REFERENCE_FORK_ID): Promise<string> {
    if (labsObjectBytes({kind, value}) > LABS_MAX_OBJECT_BYTES) throw new RangeError("LABS 对象超过固定大小上限");
    let id: string;
    if (kind === "ruleset") id = rulesetId(value as LabsRuleset);
    else if (kind === "result") {
      const result = value as LabsResult;
      const storedRuleset = await this.persistence.getObject(result.ruleset_id);
      if (!storedRuleset || storedRuleset.kind !== "ruleset") throw new TypeError("LABS 结果引用了未知规则集");
      id = verifyLabsResult(storedRuleset.value as LabsRuleset, result);
      const baseline = (storedRuleset.value as LabsRuleset).baselines.find((item) => item.length === result.length);
      if (!baseline) throw new RangeError("LABS 结果长度不在规则集内");
      if (BigInt(result.energy) > BigInt(baseline.energy)) {
        const records = await this.persistence.listObjects();
        const covered = records.some(({object}) => object.kind === "record" && (object.value as AnyLabsResearchRecord).result_id === id);
        if (!covered) throw new RangeError("高于公开基线的 LABS 结果必须由完整可复现研究记录引用");
      }
    } else if (kind === "artifact") id = verifyLabsArtifact(value as LabsResearchArtifact);
    else if (kind === "task") {
      const task = value as AnyLabsResearchTask;
      const storedRuleset = await this.persistence.getObject(task.ruleset_id);
      if (!storedRuleset || storedRuleset.kind !== "ruleset") throw new TypeError("LABS 研究任务引用了未知规则集");
      id = verifyLabsResearchTask(storedRuleset.value as LabsRuleset, task);
    } else if (kind === "record") {
      const record = value as AnyLabsResearchRecord;
      const storedRuleset = await this.persistence.getObject(record.ruleset_id);
      const storedTask = await this.persistence.getObject(record.task_id);
      if (!storedRuleset || storedRuleset.kind !== "ruleset" || !storedTask || storedTask.kind !== "task") throw new TypeError("LABS 研究记录引用了缺失的规则集或任务");
      for (const artifactId of record.artifact_ids) {
        const artifact = await this.persistence.getObject(artifactId);
        if (!artifact || artifact.kind !== "artifact") throw new TypeError("LABS 研究记录引用了缺失的方法制品");
      }
      id = verifyLabsResearchRecord(storedRuleset.value as LabsRuleset, storedTask.value as AnyLabsResearchTask, record);
    } else if (kind === "claim") {
      const claim = value as LabsSignedClaim;
      const result = await this.persistence.getObject(claim.claim.result_id);
      if (!result || result.kind !== "result") throw new TypeError("LABS 声明引用了未知结果");
      id = verifyLabsClaim(claim);
    } else if (kind === "method_proposal") {
      const proposal = value as SignedLabsMethodProposal;
      const task = await this.persistence.getObject(proposal.proposal.task_id);
      if (!task || task.kind !== "task") throw new TypeError("LABS 方法提案引用了未知任务");
      for (const parentId of proposal.proposal.parent_proposal_ids) {
        const parent = await this.persistence.getObject(parentId);
        if (!parent || parent.kind !== "method_proposal") throw new TypeError("LABS 方法提案引用了未知父提案");
        if ((parent.value as SignedLabsMethodProposal).proposal.task_id !== proposal.proposal.task_id) throw new TypeError("LABS 方法修订与父提案必须属于同一任务");
      }
      if (proposal.proposal.source_model_id) {
        const model = await this.persistence.getObject(proposal.proposal.source_model_id);
        if (!model || model.kind !== "research_model") throw new TypeError("LABS 方法提案引用了未知研究策略模型");
        verifyLabsModelGeneratedProposal(model.value as LabsResearchPolicyModel, proposal.proposal.source_model_id, proposal);
      }
      id = verifyLabsMethodProposal(proposal);
    } else if (kind === "method_critique") {
      const critique = value as SignedLabsMethodCritique;
      const proposal = await this.persistence.getObject(critique.critique.proposal_id);
      if (!proposal || proposal.kind !== "method_proposal") throw new TypeError("LABS 方法批评引用了未知提案");
      for (const evidenceId of critique.critique.evidence_ids) {
        if (!await this.persistence.getObject(evidenceId)) throw new TypeError("LABS 方法批评引用了未知证据");
      }
      id = verifyLabsMethodCritique(critique);
    } else if (kind === "method_evaluation") {
      const evaluation = value as LabsMethodEvaluation;
      const proposal = await this.persistence.getObject(evaluation.proposal_id);
      const task = await this.persistence.getObject(evaluation.task_id);
      if (!proposal || proposal.kind !== "method_proposal" || !task || task.kind !== "task") throw new TypeError("LABS 方法评价引用了未知提案或任务");
      const methodTask = task.value as AnyLabsResearchTask;
      if (methodTask.protocol !== "sai-labs-research-task/2") throw new TypeError("LABS 方法评价只接受具备确定性候选空间的研究任务");
      const ruleset = await this.persistence.getObject(methodTask.ruleset_id);
      if (!ruleset || ruleset.kind !== "ruleset") throw new TypeError("LABS 方法评价引用了未知规则集");
      id = verifyLabsMethodEvaluation(ruleset.value as LabsRuleset, methodTask, proposal.value as SignedLabsMethodProposal, evaluation);
    } else {
      const model = value as LabsResearchPolicyModel;
      const all = await this.persistence.listObjects();
      const proposals = all.filter(({object}) => object.kind === "method_proposal").map(({object}) => object.value as SignedLabsMethodProposal);
      const evaluationsById = new Map(all.filter(({object}) => object.kind === "method_evaluation").map(({id: objectId, object}) => [objectId, object.value as LabsMethodEvaluation]));
      const evaluations = model.training_evaluation_ids.map((evaluationId) => {
        const evaluation = evaluationsById.get(evaluationId);
        if (!evaluation) throw new TypeError("研究策略模型引用了未知评价");
        return evaluation;
      });
      let parent: LabsResearchPolicyModel | undefined;
      if (model.parent_model_id) {
        const storedParent = await this.persistence.getObject(model.parent_model_id);
        if (!storedParent || storedParent.kind !== "research_model") throw new TypeError("研究策略模型引用了未知父模型");
        parent = storedParent.value as LabsResearchPolicyModel;
      }
      id = verifyLabsResearchPolicyModel(proposals, evaluations, model, undefined, parent);
    }
    if (expectedId && id !== expectedId) throw new TypeError("LABS 内容摘要与对象不匹配");
    const known = await this.persistence.getObject(id);
    if (!known) {
      await this.persistence.putObject(id, {kind, value: structuredClone(value)});
      this.methodDatasetIndex = undefined;
    }
    else if (labsCanonicalJson(known) !== labsCanonicalJson({kind, value})) throw new TypeError("LABS 内容摘要碰撞");

    if (kind === "ruleset") {
      const current = await this.persistence.getFrontier(id, forkId);
      if (!current) await this.persistence.putFrontier(createInitialFrontier(value as LabsRuleset, forkId));
    } else if (kind === "result") {
      const result = value as LabsResult;
      const rulesetObject = await this.persistence.getObject(result.ruleset_id) as LabsStoredObject;
      const ruleset = rulesetObject.value as LabsRuleset;
      const baseline = ruleset.baselines.find((item) => item.length === result.length);
      if (!baseline) throw new RangeError("LABS 结果长度不在规则集内");
      if (BigInt(result.energy) <= BigInt(baseline.energy)) {
        const current = await this.frontier(result.ruleset_id, forkId);
        await this.persistence.putFrontier(addResultToFrontier(current, result, id));
      }
    }
    return id;
  }

  async object(id: string): Promise<LabsStoredObject | undefined> { return this.persistence.getObject(id); }

  async ruleset(id: string): Promise<LabsRuleset> {
    const object = await this.persistence.getObject(id);
    if (!object || object.kind !== "ruleset") throw new Error("LABS 规则集不存在");
    return object.value as LabsRuleset;
  }

  async frontier(rulesetIdValue = REFERENCE_RULESET_ID, forkId = REFERENCE_FORK_ID): Promise<LabsFrontier> {
    const existing = await this.persistence.getFrontier(rulesetIdValue, forkId);
    if (existing) return existing;
    const ruleset = await this.ruleset(rulesetIdValue);
    const initial = createInitialFrontier(ruleset, forkId);
    await this.persistence.putFrontier(initial);
    return initial;
  }

  async registry(rulesetIdValue = REFERENCE_RULESET_ID): Promise<LabsRegistrySnapshot> {
    const ruleset = await this.ruleset(rulesetIdValue);
    const all = await this.persistence.listObjects();
    const results = all.filter(({object}) => object.kind === "result" && (object.value as LabsResult).ruleset_id === rulesetIdValue);
    const records = all.filter(({object}) => object.kind === "record" && (object.value as AnyLabsResearchRecord).ruleset_id === rulesetIdValue);
    const tasks = new Map(all.filter(({object}) => object.kind === "task").map(({id, object}) => [id, object.value as AnyLabsResearchTask]));
    const artifacts = new Map(all.filter(({object}) => object.kind === "artifact").map(({id, object}) => [id, object.value as LabsResearchArtifact]));
    const claims = all.filter(({object}) => object.kind === "claim");
    const entries: LabsRegistryEntry[] = [];
    for (const {id: resultId, object} of results) {
      const result = object.value as LabsResult;
      const baseline = ruleset.baselines.find((item) => item.length === result.length)!;
      const resultRecords = records.filter(({object: candidate}) => (candidate.value as AnyLabsResearchRecord).result_id === resultId).map(({id, object: candidate}) => {
        const record = candidate.value as AnyLabsResearchRecord;
        const task = tasks.get(record.task_id);
        if (!task) throw new Error("LABS 注册表研究记录缺少任务");
        const recordArtifacts = record.artifact_ids.map((artifactId) => {
          const artifact = artifacts.get(artifactId);
          if (!artifact) throw new Error("LABS 注册表研究记录缺少制品");
          return {artifact_id: artifactId, artifact};
        });
        return {record_id: id, record, task, artifacts: recordArtifacts};
      }).sort((left, right) => left.record_id < right.record_id ? -1 : left.record_id > right.record_id ? 1 : 0);
      const resultClaims = claims.filter(({object: candidate}) => (candidate.value as LabsSignedClaim).claim.result_id === resultId).map(({id, object: candidate}) => ({claim_id: id, signed_claim: candidate.value as LabsSignedClaim})).sort((left, right) => left.claim_id < right.claim_id ? -1 : left.claim_id > right.claim_id ? 1 : 0);
      const reproductionAgents = new Set(resultClaims.filter(({signed_claim}) => signed_claim.claim.claim_type === "reproduction").map(({signed_claim}) => signed_claim.claim.agent_id));
      const coverageAgents = new Set(resultClaims.filter(({signed_claim}) => signed_claim.claim.claim_type === "coverage").map(({signed_claim}) => signed_claim.claim.agent_id));
      const reference = REFERENCE_RESULTS[String(result.length)]?.result_id === resultId;
      const status: LabsRegistryEntry["status"] = resultRecords.some(({record}) => record.contribution_type === "frontier_improvement") ? "frontier_improvement" : resultRecords.length ? "search_coverage" : reference ? "reference_baseline" : "sequence_only";
      entries.push({
        result_id: resultId,
        result,
        status,
        merit_factor: exactMeritFactor(result.length, BigInt(result.energy)),
        baseline_energy: baseline.energy,
        energy_delta: (BigInt(baseline.energy) - BigInt(result.energy)).toString(),
        ...(reference ? {source: baseline.source} : {}),
        claims: resultClaims,
        research: resultRecords,
        coverage_contributors: coverageAgents.size,
        discovery_claims: resultClaims.filter(({signed_claim}) => signed_claim.claim.claim_type === "discovery").length,
        reproduction_claimants: reproductionAgents.size,
        relay_claims: resultClaims.filter(({signed_claim}) => signed_claim.claim.claim_type === "relay").length,
      });
    }
    entries.sort((left, right) => {
      if (left.result.length !== right.result.length) return left.result.length - right.result.length;
      const leftEnergy = BigInt(left.result.energy);
      const rightEnergy = BigInt(right.result.energy);
      if (leftEnergy !== rightEnergy) return leftEnergy < rightEnergy ? -1 : 1;
      return left.result_id < right.result_id ? -1 : left.result_id > right.result_id ? 1 : 0;
    });
    const researchRecords = entries.flatMap((entry) => entry.research.map(({record}) => record));
    const contributionRecords = researchRecords.filter((record) => record.protocol === "sai-labs-research-record/2");
    return {
      protocol: "sai-labs-registry/1",
      ruleset_id: rulesetIdValue,
      role: "derived-local-index",
      authority: false,
      entries,
      totals: {
        results: entries.length,
        research_records: researchRecords.length,
        frontier_improvements: researchRecords.filter((record) => record.contribution_type === "frontier_improvement").length,
        search_coverage_records: researchRecords.filter((record) => record.contribution_type === "search_coverage").length,
        coverage_contributors: entries.reduce((sum, entry) => sum + entry.coverage_contributors, 0),
        reproduction_claimants: entries.reduce((sum, entry) => sum + entry.reproduction_claimants, 0),
        contribution_grade_research_units: contributionRecords.length,
        verified_new_canonical_candidates: contributionRecords.reduce((sum, record) => sum + BigInt(record.new_canonical_candidates), 0n).toString(),
      },
    };
  }

  async registryEntry(resultId: string, rulesetIdValue = REFERENCE_RULESET_ID): Promise<LabsRegistryEntry | undefined> {
    return (await this.registry(rulesetIdValue)).entries.find((entry) => entry.result_id === resultId);
  }

  async methodDataset(cursor: string | null = null, limit = 32): Promise<LabsMethodDataset> {
    if (cursor !== null && !/^[0-4]:sha256:[0-9a-f]{64}$/.test(cursor)) throw new TypeError("LABS 方法数据游标无效");
    if (!Number.isInteger(limit) || limit < 1 || limit > 64) throw new RangeError("LABS 方法数据页大小必须是 1–64 的整数");
    if (!this.methodDatasetIndex) {
      const all = await this.persistence.listObjects();
      const order: Partial<Record<LabsObjectKind, number>> = {task: 0, method_proposal: 1, method_critique: 2, method_evaluation: 3, research_model: 4};
      const available = all.filter(({object}) => object.kind !== "task" || (object.value as AnyLabsResearchTask).protocol === "sai-labs-research-task/2").filter(({object}) => order[object.kind] !== undefined).map(({id, object}) => ({id, object, key: `${order[object.kind]}:${id}`})).sort((left, right) => left.key.localeCompare(right.key));
      const evaluationsByTask = new Map<string, Array<{id: string; value: LabsMethodEvaluation}>>();
      for (const {id, object} of all) {
        if (object.kind !== "method_evaluation") continue;
        const evaluation = object.value as LabsMethodEvaluation;
        const group = evaluationsByTask.get(evaluation.task_id) ?? [];
        group.push({id, value: evaluation});
        evaluationsByTask.set(evaluation.task_id, group);
      }
      const preferencePairsByRejected = new Map<string, LabsMethodDataset["preference_pairs"][number]>();
      for (const [taskId, evaluations] of evaluationsByTask) {
        evaluations.sort((left, right) => {
          const difference = BigInt(left.value.best_energy) - BigInt(right.value.best_energy);
          return difference < 0n ? -1 : difference > 0n ? 1 : left.id.localeCompare(right.id);
        });
        for (let index = 1; index < evaluations.length; index += 1) {
          const preferred = evaluations[index - 1]!;
          const rejected = evaluations[index]!;
          if (preferred.value.best_energy !== rejected.value.best_energy) preferencePairsByRejected.set(rejected.id, {task_id: taskId, preferred_proposal_id: preferred.value.proposal_id, rejected_proposal_id: rejected.value.proposal_id, preferred_evaluation_id: preferred.id, rejected_evaluation_id: rejected.id});
        }
      }
      this.methodDatasetIndex = {available, preferencePairsByRejected};
    }
    const {available, preferencePairsByRejected} = this.methodDatasetIndex;
    let start = 0;
    if (cursor !== null) {
      let low = 0;
      let high = available.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (available[middle]!.key <= cursor) low = middle + 1;
        else high = middle;
      }
      start = low;
    }
    const end = Math.min(start + limit, available.length);
    const page = available.slice(start, end);
    const last = page.at(-1)?.key ?? cursor;
    const nextCursor = last && end < available.length ? last : null;
    const proposals = page.filter(({object}) => object.kind === "method_proposal").map(({id, object}) => ({id, value: object.value as SignedLabsMethodProposal}));
    const critiques = page.filter(({object}) => object.kind === "method_critique").map(({id, object}) => ({id, value: object.value as SignedLabsMethodCritique}));
    const evaluations = page.filter(({object}) => object.kind === "method_evaluation").map(({id, object}) => ({id, value: object.value as LabsMethodEvaluation}));
    const models = page.filter(({object}) => object.kind === "research_model").map(({id, object}) => ({id, value: object.value as LabsResearchPolicyModel}));
    const tasks = page.filter(({object}) => object.kind === "task").map(({id, object}) => ({id, value: object.value as AnyLabsResearchTask}));
    const preferencePairs = page.flatMap(({id}) => {
      const pair = preferencePairsByRejected.get(id);
      return pair ? [pair] : [];
    });
    preferencePairs.sort((left, right) => `${left.task_id}:${left.preferred_evaluation_id}:${left.rejected_evaluation_id}`.localeCompare(`${right.task_id}:${right.preferred_evaluation_id}:${right.rejected_evaluation_id}`));
    return {protocol: "proofwild-labs-method-dataset/1", authority: false, cursor, next_cursor: nextCursor, tasks, proposals, critiques, evaluations, models, preference_pairs: preferencePairs};
  }

  async bundle(rulesetIdValue = REFERENCE_RULESET_ID, forkId = REFERENCE_FORK_ID, cursor: string | null = null): Promise<LabsExchangeBundle> {
    const frontier = await this.frontier(rulesetIdValue, forkId);
    const all = await this.persistence.listObjects();
    const resultIds = new Set(all.filter(({object}) => object.kind === "result" && (object.value as LabsResult).ruleset_id === rulesetIdValue).map(({id}) => id));
    const recordArtifacts = new Set(all.filter(({object}) => object.kind === "record" && (object.value as AnyLabsResearchRecord).ruleset_id === rulesetIdValue).flatMap(({object}) => (object.value as AnyLabsResearchRecord).artifact_ids));
    const relevant = all.filter(({id, object}) => id === rulesetIdValue
      || (object.kind === "result" && resultIds.has(id))
      || (object.kind === "task" && (object.value as AnyLabsResearchTask).ruleset_id === rulesetIdValue)
      || (object.kind === "record" && (object.value as AnyLabsResearchRecord).ruleset_id === rulesetIdValue)
      || (object.kind === "artifact" && recordArtifacts.has(id))
      || (object.kind === "claim" && resultIds.has((object.value as LabsSignedClaim).claim.result_id)));
    const order: Record<LabsExchangeObjectKind, number> = {ruleset: 0, artifact: 1, task: 2, record: 3, result: 4, claim: 5};
    const sorted = relevant.map(({id, object}) => ({id, kind: object.kind as LabsExchangeObjectKind, value: object.value as LabsExchangeObjectValue, key: `${order[object.kind as LabsExchangeObjectKind]}:${id}`})).sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0);
    if (cursor && !/^[0-5]:sha256:[0-9a-f]{64}$/.test(cursor)) throw new TypeError("LABS 交换游标无效");
    const remaining = sorted.filter((item) => !cursor || item.key > cursor);
    const objects: LabsExchangeBundle["objects"] = [];
    for (const candidate of remaining.slice(0, 64)) {
      const next = [...objects, {id: candidate.id, kind: candidate.kind, value: candidate.value}];
      const trial: LabsExchangeBundle = {protocol: "sai-labs-exchange/2", ruleset_id: rulesetIdValue, fork_id: forkId, frontier, cursor, next_cursor: candidate.key, objects: next};
      if (labsObjectBytes(trial) > LABS_MAX_OBJECT_BYTES) break;
      objects.push({id: candidate.id, kind: candidate.kind, value: candidate.value});
    }
    if (remaining.length && objects.length === 0) throw new RangeError("LABS 单个交换对象无法装入固定交换上限");
    const last = objects.length ? `${order[objects.at(-1)!.kind]}:${objects.at(-1)!.id}` : cursor;
    const hasMore = last ? sorted.some((item) => item.key > last) : false;
    return {protocol: "sai-labs-exchange/2", ruleset_id: rulesetIdValue, fork_id: forkId, frontier, cursor, next_cursor: hasMore ? last : null, objects};
  }

  async importBundle(bundle: LabsExchangeBundle): Promise<void> {
    if (bundle.protocol !== "sai-labs-exchange/2" || bundle.objects.length > 64 || labsObjectBytes(bundle) > LABS_MAX_OBJECT_BYTES) throw new RangeError("LABS 交换包无效或过大");
    if (Object.keys(bundle).sort().join(",") !== "cursor,fork_id,frontier,next_cursor,objects,protocol,ruleset_id" || !/^sha256:[0-9a-f]{64}$/.test(bundle.ruleset_id) || !/^fork:[A-Za-z0-9._:-]{1,120}$/.test(bundle.fork_id)) throw new TypeError("LABS 交换包结构无效");
    if ((bundle.cursor !== null && !/^[0-5]:sha256:[0-9a-f]{64}$/.test(bundle.cursor)) || (bundle.next_cursor !== null && !/^[0-5]:sha256:[0-9a-f]{64}$/.test(bundle.next_cursor))) throw new TypeError("LABS 交换包游标无效");
    assertLabsFrontier(bundle.frontier);
    if (bundle.frontier.ruleset_id !== bundle.ruleset_id || bundle.frontier.fork_id !== bundle.fork_id) throw new TypeError("LABS 交换包与前沿边界不一致");
    for (const object of bundle.objects) {
      if (Object.keys(object).sort().join(",") !== "id,kind,value" || !/^sha256:[0-9a-f]{64}$/.test(object.id)) throw new TypeError("LABS 交换对象结构无效");
      if (object.kind === "ruleset") assertLabsRuleset(object.value);
      else if (object.kind === "result") assertLabsResult(object.value);
      else if (object.kind === "artifact") assertLabsArtifact(object.value);
      else if (object.kind === "task") assertLabsResearchTask(object.value);
      else if (object.kind === "record") assertLabsResearchRecord(object.value);
      else if (object.kind === "claim") assertLabsClaim(object.value);
      else throw new TypeError("LABS 交换对象类型无效");
      if (labsContentId(object.value) !== object.id) throw new TypeError("LABS 交换对象摘要不匹配");
    }
    const order: Record<LabsExchangeObjectKind, number> = {ruleset: 0, artifact: 1, task: 2, record: 3, result: 4, claim: 5};
    const ordered = [...bundle.objects].sort((a, b) => order[a.kind] - order[b.kind]);
    for (const object of ordered) await this.ingest(object.kind, object.value, object.id, bundle.fork_id);
    if (bundle.next_cursor !== null) return;
    const ruleset = await this.ruleset(bundle.ruleset_id);
    const expectedLengths = new Set(ruleset.baselines.map((item) => String(item.length)));
    if (Object.keys(bundle.frontier.lengths).some((length) => !expectedLengths.has(length)) || [...expectedLengths].some((length) => !bundle.frontier.lengths[length])) throw new TypeError("LABS 交换前沿长度与规则集不一致");
    for (const [length, entry] of Object.entries(bundle.frontier.lengths)) {
      for (const id of entry.result_ids) {
        const object = await this.persistence.getObject(id);
        if (!object || object.kind !== "result") throw new TypeError("LABS 交换前沿引用了缺失结果");
        const result = object.value as LabsResult;
        if (String(result.length) !== length || result.energy !== entry.best_energy || result.ruleset_id !== bundle.ruleset_id) throw new TypeError("LABS 交换前沿与结果正文不一致");
      }
    }
    const local = await this.frontier(bundle.ruleset_id, bundle.fork_id);
    const merged = mergeLabsFrontiers(local, bundle.frontier);
    await this.persistence.putFrontier(merged);
  }
}

export async function syncLabsFromPeer(repository: LabsRepository, peerBaseUrl: string, rulesetIdValue = REFERENCE_RULESET_ID, forkId = REFERENCE_FORK_ID): Promise<LabsFrontier> {
  const path = `/labs/v1/exchange/${encodeURIComponent(rulesetIdValue)}/${encodeURIComponent(forkId)}`;
  let cursor: string | null = null;
  for (let page = 0; page < 4_096; page += 1) {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const response = await fetch(`${peerBaseUrl.replace(/\/$/, "")}${path}${query}`, {headers: {accept: "application/json"}});
    if (!response.ok) throw new Error(`LABS 对等节点返回 HTTP ${response.status}`);
    const raw = await response.text();
    if (Buffer.byteLength(raw, "utf8") > LABS_MAX_OBJECT_BYTES) throw new RangeError("LABS 对等交换响应超过对象上限");
    const bundle = JSON.parse(raw) as LabsExchangeBundle;
    await repository.importBundle(bundle);
    if (!bundle.next_cursor) return repository.frontier(rulesetIdValue, forkId);
    if (bundle.next_cursor === cursor) throw new Error("LABS 对等交换游标没有前进");
    cursor = bundle.next_cursor;
  }
  throw new Error("LABS 对等交换分页超过固定上限");
}
