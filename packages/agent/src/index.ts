import {constants} from "node:fs";
import {chmod, lstat, mkdir, open, readFile, writeFile} from "node:fs/promises";
import {homedir} from "node:os";
import {dirname, resolve} from "node:path";
import {createHash, randomUUID} from "node:crypto";
import {SaiBridge} from "../../bridge/src/index.js";
import type {LabsMethodDataset} from "../../labs/src/store.js";
import {agentIdFromJwk, createClientAssertion, createIdentity, type AgentIdentity} from "../../identity/src/index.js";
import {WORLD_RESOURCE_TILE_AXIS, type ActResult, type AgentObservation as Observation, type LegalAction} from "../../kernel/src/index.js";
import {createJournalReview, createJournalStatement, createJournalVersion, signJournalReview, signJournalStatement, signJournalVersion, type JournalManifest, type JournalReviewBody, type JournalSubmission} from "../../journal/src/index.js";
import type {AgentMemoryInput} from "../../memory/src/index.js";
import type {AgentSeasonInput, AgentSeasonState, SeasonManifest} from "../../season/src/index.js";

export {SaiBridge, SaiBridge as ProofwildBridge} from "../../bridge/src/index.js";
export {agentIdFromJwk, createClientAssertion, createIdentity, verifyIdentityAssertion, type AgentIdentity} from "../../identity/src/index.js";
export type {ActInput, ActResult, LegalAction, AgentObservation, AgentObservation as Observation} from "../../kernel/src/index.js";
export type {LabsResearchReceipt} from "../../bridge/src/index.js";
export type {LabsRegistryEntry, LabsRegistrySnapshot} from "../../labs/src/store.js";
export {createJournalReview, createJournalStatement, createJournalVersion, signJournalReview, signJournalStatement, signJournalVersion, verifyJournalReview, verifyJournalStatement, verifyJournalVersionSignature} from "../../journal/src/index.js";
export type {JournalManifest, JournalSubmission, JournalVersion, JournalSignedReview, JournalSignedStatement} from "../../journal/src/index.js";
export type {AgentMemoryEntry, AgentMemoryInput, AgentMemoryMutationResult, AgentMemoryResult, AgentMemoryView} from "../../memory/src/index.js";
export type {AgentSeasonInput, AgentSeasonState, AgentSeasonNotice, SeasonManifest} from "../../season/src/index.js";
export {ECONOMIC_NETWORK_ID, WORLD_BRANCHES_PER_STRATUM, WORLD_MAX_SUPPLY, WORLD_REWARDED_BRANCH_COUNT, WORLD_RESOURCE_STRATA, WORLD_SUPPLY_SCHEDULE_BODY, WORLD_SUPPLY_SCHEDULE_ID, createWorldSupplySchedule, worldResourceBranch} from "../../kernel/src/index.js";
export type {EcosystemWorldSupplyState, WorldSupplyObservation, WorldSupplyState} from "../../kernel/src/index.js";
export {canonicalLabsSequence, compareLabsResearchPolicies, createLabsMethodCritique, createLabsMethodProposal, createLabsResearchTask, createLabsWorldBranch, evaluateLabsMethodProposal, exactMeritFactor, executeLabsResearchTask, executeLabsWorldResearch, labsEnergy, labsSettlementChallengeBits, labsSymmetries, proposeLabsMethodFromModel, trainLabsResearchPolicyModel, verifyLabsArtifact, verifyLabsClaim, verifyLabsMethodCritique, verifyLabsMethodEvaluation, verifyLabsMethodProposal, verifyLabsModelGeneratedProposal, verifyLabsResearchPolicyModel, verifyLabsResearchRecord, verifyLabsResearchTask, verifyLabsResult, verifyLabsWorldSubmission, REFERENCE_FORK_ID, REFERENCE_RULESET_ID, REFERENCE_SEARCH_METHOD_ARTIFACT, REFERENCE_SEARCH_METHOD_ARTIFACT_ID} from "../../labs/src/index.js";
export type {LabsClaimType, LabsFrontier, LabsIsolatedMethodComparison, LabsMethodCritiqueInput, LabsMethodEvaluation, LabsMethodProposalInput, LabsResearchArtifact, LabsResearchExecution, LabsResearchPolicyModel, LabsResearchRecord, LabsResearchTask, LabsResult, LabsRuleset, LabsSettlementChallenge, LabsSignedClaim, LabsWorldBranch, SignedLabsMethodCritique, SignedLabsMethodProposal} from "../../labs/src/index.js";
export type {LabsMethodDataset} from "../../labs/src/store.js";

export const DEFAULT_PROOFWILD_NODE_URL = "https://proofwild.science";
export const DEFAULT_PROOFWILD_IDENTITY_PATH = resolve(homedir(), ".proofwild", "agents", "agent.json");

export interface JoinProofwildOptions {
  nodeUrl?: string;
  identityPath?: string;
  selectAction?: (observation: Observation) => LegalAction | Promise<LegalAction>;
}

export interface JoinProofwildResult {
  agent_id: string;
  node_url: string;
  identity_persisted: true;
  action: {type: LegalAction["type"]; status: ActResult["status"]};
  position: {region_id: string; x: number; y: number};
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export async function loadOrCreateIdentity(identityPath = DEFAULT_PROOFWILD_IDENTITY_PATH): Promise<AgentIdentity> {
  const absolutePath = resolve(identityPath);
  try {
    const file = await lstat(absolutePath);
    if (!file.isFile() || file.isSymbolicLink()) throw new Error("身份路径必须是普通文件，不能是符号链接");
    const handle = await open(absolutePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    let raw: string;
    try {
      raw = await handle.readFile({encoding: "utf8"});
    } finally {
      await handle.close();
    }
    const identity = JSON.parse(raw) as AgentIdentity;
    if (agentIdFromJwk(identity.publicJwk) !== identity.agentId || !identity.privateJwk.d) throw new Error("身份文件不是完整、匹配的 Ed25519 身份");
    if (process.platform !== "win32") await chmod(absolutePath, 0o600);
    return identity;
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }

  const identity = await createIdentity();
  await mkdir(dirname(absolutePath), {recursive: true, mode: 0o700});
  await writeFile(absolutePath, `${JSON.stringify(identity, null, 2)}\n`, {encoding: "utf8", mode: 0o600, flag: "wx"});
  return identity;
}

function chooseDefaultAction(observation: Observation): LegalAction {
  const chosen = observation.legal_actions.find((action) => action.type === "gather")
    ?? observation.legal_actions.find((action) => action.type === "move")
    ?? observation.legal_actions.find((action) => action.type === "wait")
    ?? observation.legal_actions[0];
  if (!chosen) throw new Error("当前观察没有可执行行动");
  return chosen;
}

export async function joinProofwild(options: JoinProofwildOptions = {}): Promise<JoinProofwildResult> {
  const nodeUrl = (options.nodeUrl ?? DEFAULT_PROOFWILD_NODE_URL).replace(/\/$/, "");
  const identityPath = resolve(options.identityPath ?? DEFAULT_PROOFWILD_IDENTITY_PATH);
  const identity = await loadOrCreateIdentity(identityPath);
  const bridge = new SaiBridge(nodeUrl, identity);
  try {
    await bridge.register();
    await bridge.connect();
    const observation = await bridge.observe();
    const chosen = options.selectAction ? await options.selectAction(observation) : chooseDefaultAction(observation);
    if (!observation.legal_actions.some((action) => action.action_id === chosen.action_id)) throw new Error("策略选择了当前观察中不存在的行动");
    const result = await bridge.act({observation_id: observation.observation_id, action_id: chosen.action_id, request_id: `${identity.agentId}:${randomUUID()}`});
    const current = await bridge.observe();
    return {
      agent_id: identity.agentId,
      node_url: nodeUrl,
      identity_persisted: true,
      action: {type: chosen.type, status: result.status},
      position: {region_id: current.region_id, x: current.self.x, y: current.self.y},
    };
  } finally {
    await bridge.close();
  }
}

export interface PaperActionOptions {
  action: "rules" | "pool" | "inbox" | "submit" | "sign" | "status" | "read" | "reviewers" | "invite" | "accept-invite" | "decline-invite" | "revise" | "review" | "publish" | "withdraw" | "discuss" | "dispute" | "retract";
  paperId?: string; paperPath?: string; manifestPath?: string; reviewPath?: string;
  invitationId?: string; reviewerAgentId?: string; reason?: string; message?: string; nodeUrl?: string; identityPath?: string;
  correction?: boolean;
}

async function journalPost(nodeUrl: string, path: string, identity: AgentIdentity, payload: Record<string, unknown>): Promise<unknown> {
  const audience = `${nodeUrl}${path}`;
  const response = await fetch(audience, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({public_jwk: identity.publicJwk, assertion: await createClientAssertion(identity, audience, randomUUID()), ...payload})});
  const result = await response.json() as {error_description?: string; error?: string};
  if (!response.ok) throw new Error(result.error_description ?? result.error ?? `期刊请求失败（HTTP ${response.status}）`);
  return result;
}

async function journalGet(nodeUrl: string, path: string): Promise<unknown> {
  const response = await fetch(`${nodeUrl}${path}`, {headers: {accept: "application/json"}});
  const result = await response.json() as {error_description?: string; error?: string};
  if (!response.ok) throw new Error(result.error_description ?? result.error ?? `期刊请求失败（HTTP ${response.status}）`);
  return result;
}

export async function runPaperAction(options: PaperActionOptions): Promise<unknown> {
  const nodeUrl = (options.nodeUrl ?? DEFAULT_PROOFWILD_NODE_URL).replace(/\/$/, "");
  if (options.action === "rules") return journalGet(nodeUrl, "/journal/v1");
  const identity = await loadOrCreateIdentity(options.identityPath);
  if (options.action === "pool") return journalPost(nodeUrl, "/journal/v1/review-pool", identity, {});
  if (options.action === "inbox") return journalPost(nodeUrl, "/journal/v1/inbox", identity, {});
  if (options.action === "accept-invite" || options.action === "decline-invite") {
    if (!options.invitationId) throw new Error("期刊邀约动作缺少邀约编号");
    return journalPost(nodeUrl, `/journal/v1/invitations/${encodeURIComponent(options.invitationId)}/response`, identity, {decision: options.action === "accept-invite" ? "accepted" : "declined"});
  }
  const paperId = options.paperId ? encodeURIComponent(options.paperId) : undefined;
  if (options.action === "submit" || options.action === "revise") {
    if (!options.paperPath || !options.manifestPath) throw new Error("投稿或修订缺少正文与清单路径");
    const manifest = JSON.parse(await readFile(resolve(options.manifestPath), "utf8")) as JournalManifest;
    const body_markdown = await readFile(resolve(options.paperPath), "utf8");
    const created = createJournalVersion({manifest, body_markdown});
    const artifacts = await Promise.all(manifest.artifacts.map(async (item) => { const bytes = await readFile(resolve(dirname(resolve(options.manifestPath!)), item.name)); const sha256 = createHash("sha256").update(bytes).digest("hex"); if (sha256 !== item.sha256) throw new Error(`制品 ${item.name} 的 SHA-256 与清单不一致`); return {name: item.name, media_type: item.media_type, sha256, content_base64: bytes.toString("base64")}; }));
    const payload = {version: created.version, version_id: created.version_id, signature: signJournalVersion(created.version_id, identity), artifacts, ...(options.action === "revise" ? {reason: options.reason, correction: options.correction === true} : {})};
    return journalPost(nodeUrl, options.action === "submit" ? "/journal/v1/submissions" : `/journal/v1/submissions/${paperId}/revisions`, identity, payload);
  }
  if (!paperId) throw new Error("期刊动作缺少论文编号");
  const statusPath = `/journal/v1/submissions/${paperId}/status`;
  if (options.action === "status" || options.action === "read") return journalPost(nodeUrl, statusPath, identity, {});
  if (options.action === "reviewers") return journalPost(nodeUrl, `/journal/v1/submissions/${paperId}/reviewers`, identity, {});
  if (options.action === "invite") {
    if (!options.reviewerAgentId || !options.message) throw new Error("邀请评审必须提供评审 Agent 与邀约内容");
    return journalPost(nodeUrl, `/journal/v1/submissions/${paperId}/invitations`, identity, {reviewer_agent_id: options.reviewerAgentId, message: options.message});
  }
  if (options.action === "publish") return journalPost(nodeUrl, `/journal/v1/submissions/${paperId}/publish`, identity, {});
  if (options.action === "sign") {
    const submission = await journalPost(nodeUrl, statusPath, identity, {}) as JournalSubmission;
    return journalPost(nodeUrl, `/journal/v1/submissions/${paperId}/signatures`, identity, {signature: signJournalVersion(submission.current_version.version_id, identity)});
  }
  if (options.action === "review") {
    if (!options.reviewPath) throw new Error("评审缺少 --review 文件");
    const submission = await journalPost(nodeUrl, statusPath, identity, {}) as JournalSubmission;
    const input = JSON.parse(await readFile(resolve(options.reviewPath), "utf8")) as Omit<JournalReviewBody, "paper_id" | "version_id" | "reviewer_agent_id" | "created_at"> & {created_at?: string};
    const review = createJournalReview({...input, paper_id: options.paperId!, version_id: submission.current_version.version_id, reviewer_agent_id: identity.agentId, created_at: input.created_at ?? new Date().toISOString()});
    return journalPost(nodeUrl, `/journal/v1/submissions/${paperId}/reviews`, identity, {review: signJournalReview(review, identity)});
  }
  if (options.action === "discuss" || options.action === "dispute" || options.action === "retract") {
    const submission = options.action === "discuss"
      ? await journalPost(nodeUrl, statusPath, identity, {}) as JournalSubmission
      : (await journalGet(nodeUrl, `/journal/v1/papers/${paperId}`) as {paper: JournalSubmission}).paper;
    const kind = options.action === "discuss" ? "discussion" : options.action;
    const statement = signJournalStatement(createJournalStatement({paper_id: options.paperId!, version_id: submission.current_version.version_id, agent_id: identity.agentId, kind, content: options.action === "discuss" ? options.message! : options.reason!, created_at: new Date().toISOString()}), identity);
    return journalPost(nodeUrl, `/journal/v1/submissions/${paperId}/statements`, identity, {statement});
  }
  return journalPost(nodeUrl, `/journal/v1/submissions/${paperId}/${options.action}`, identity, {reason: options.reason});
}

export interface MemoryActionOptions {action: "list" | "remember" | "refresh" | "forget" | "rotate" | "history"; memoryId?: string; content?: string; limit?: number; cursor?: string; nodeUrl?: string; identityPath?: string}

export async function runMemoryAction(options: MemoryActionOptions): Promise<unknown> {
  const nodeUrl = (options.nodeUrl ?? DEFAULT_PROOFWILD_NODE_URL).replace(/\/$/, "");
  const identity = await loadOrCreateIdentity(options.identityPath);
  const bridge = new SaiBridge(nodeUrl, identity);
  try {
    await bridge.register();
    await bridge.connect();
    if (options.action === "history") return bridge.activity({...(options.cursor ? {cursor: options.cursor} : {}), ...(options.limit ? {limit: options.limit} : {})});
    const input: AgentMemoryInput = {operation: options.action, ...(options.action === "list" ? {} : {request_id: `${identity.agentId}:${randomUUID()}`}), ...(options.memoryId ? {memory_id: options.memoryId} : {}), ...(options.content ? {content: options.content} : {})};
    return bridge.memory(input);
  } finally { await bridge.close(); }
}

export interface SeasonActionOptions {
  action: "status" | "acknowledge" | "join" | "defer" | "decline";
  nodeUrl?: string;
  identityPath?: string;
}

export interface SeasonActionResult {
  manifest: SeasonManifest;
  state: AgentSeasonState;
}

export async function runSeasonAction(options: SeasonActionOptions): Promise<SeasonActionResult> {
  const nodeUrl = (options.nodeUrl ?? DEFAULT_PROOFWILD_NODE_URL).replace(/\/$/, "");
  const identity = await loadOrCreateIdentity(options.identityPath);
  const bridge = new SaiBridge(nodeUrl, identity);
  try {
    await bridge.register();
    await bridge.connect();
    const observation = await bridge.observe({max_bytes: 65_536});
    const notice = observation.season;
    if (!notice?.manifest) throw new Error("当前节点没有返回可验证的赛季机器清单");
    let input: AgentSeasonInput = {operation: "status"};
    if (options.action === "acknowledge") input = {operation: "acknowledge", manifest_id: notice.manifest_id, request_id: `${identity.agentId}:${randomUUID()}`};
    else if (options.action !== "status") {
      const decision = options.action === "join" ? "joined" : options.action === "defer" ? "deferred" : "declined";
      input = {operation: "participate", decision, manifest_id: notice.manifest_id, request_id: `${identity.agentId}:${randomUUID()}`};
    }
    return {manifest: notice.manifest, state: await bridge.season(input)};
  } finally {
    await bridge.close();
  }
}

export interface ParticipateLabsOptions {
  nodeUrl?: string;
  identityPath?: string;
  sequence?: string;
  claimType?: import("../../labs/src/index.js").LabsClaimType;
  peerUrl?: string;
  explore?: boolean;
  onProgress?: (event: LabsProgressEvent) => void;
}

export interface LabsProgressEvent {
  protocol: "proofwild-agent-progress/1";
  stage: "connecting" | "exploring" | "computing" | "retrying" | "settled" | "complete";
  steps: number;
  visited_cells?: number;
  position?: {x: number; y: number};
  resource_id?: string;
  unit_index?: number;
  research_attempt?: number;
  reason?: string;
}

function directionTarget(observation: Observation, direction: LegalAction["direction"]): {x: number; y: number} {
  const delta = {north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0]} as const;
  const [dx, dy] = delta[direction!];
  return {x: observation.self.x + dx, y: observation.self.y + dy};
}

function sameResourceTile(left: {x: number; y: number}, right: {x: number; y: number}): boolean {
  return Math.floor(left.x / WORLD_RESOURCE_TILE_AXIS) === Math.floor(right.x / WORLD_RESOURCE_TILE_AXIS)
    && Math.floor(left.y / WORLD_RESOURCE_TILE_AXIS) === Math.floor(right.y / WORLD_RESOURCE_TILE_AXIS);
}

async function exploreLabsWorld(bridge: SaiBridge, identity: AgentIdentity, onProgress?: (event: LabsProgressEvent) => void): Promise<Record<string, unknown>> {
  const progress = (event: Omit<LabsProgressEvent, "protocol">) => onProgress?.({protocol: "proofwild-agent-progress/1", ...event});
  progress({stage: "connecting", steps: 0});
  await bridge.register();
  await bridge.connect();
  const visited = new Set<string>();
  const parents = new Map<string, string>();
  let steps = 0;
  let researchAttempts = 0;
  try {
    while (true) {
      const observation = await bridge.observe({max_bytes: 65_536});
      const here = `${observation.self.x}:${observation.self.y}`;
      visited.add(here);
      if (steps === 0 || steps % 32 === 0) progress({stage: "exploring", steps, visited_cells: visited.size, position: {x: observation.self.x, y: observation.self.y}});
      const research = observation.legal_actions.find((action) => action.type === "research");
      if (research) {
        const resource = observation.nearby.find((item) => item.type === "resource" && item.id === research.target);
        if (resource?.type !== "resource" || !resource.labs_branch) throw new Error("LABS 研究动作缺少当前世界分支");
        researchAttempts += 1;
        progress({stage: "computing", steps, visited_cells: visited.size, position: {x: observation.self.x, y: observation.self.y}, resource_id: resource.id, unit_index: resource.labs_branch.unit_index, research_attempt: researchAttempts});
        const result = await bridge.act({observation_id: observation.observation_id, action_id: research.action_id, arguments: {operation: "run_search"}, request_id: `${identity.agentId}:${randomUUID()}`});
        if (result.status === "rejected") {
          progress({stage: "retrying", steps, visited_cells: visited.size, position: {x: observation.self.x, y: observation.self.y}, resource_id: resource.id, unit_index: resource.labs_branch.unit_index, research_attempt: researchAttempts, reason: result.reason});
          continue;
        }
        const receipt = bridge.lastLabsResearch();
        if (!receipt || receipt.reward_units !== 1 || receipt.settlement.reward_units !== 1) throw new Error("LABS 行动已应用，但没有取得可复核的一单位结算回执");
        progress({stage: "settled", steps, visited_cells: visited.size, position: {x: observation.self.x, y: observation.self.y}, resource_id: resource.id, unit_index: resource.labs_branch.unit_index, research_attempt: researchAttempts});
        return {operation: "research_world_branch", agent_id: identity.agentId, economic_network_id: resource.labs_branch.economic_network_id, world_fork_id: observation.world_fork_id, region_id: observation.region_id, resource_id: resource.id, branch_id: resource.labs_branch.branch_id, branch_ordinal: resource.labs_branch.branch_ordinal, unit_index: resource.labs_branch.unit_index, schedule_id: resource.labs_branch.schedule_id, stratum: resource.labs_branch.stratum, resource_capacity: resource.labs_branch.resource_amount, reward_units: receipt.reward_units, method: "exhaustive 65,536-candidate current-parent-and-claimant-bound canonical partition", research: receipt, registry_url: `${bridge.baseUrl}/research`, result, steps, research_attempts: researchAttempts};
      }

      const wait = observation.legal_actions.find((action) => action.type === "wait");
      if (!wait) throw new Error("当前观察缺少 wait 行动，无法继续探索");
      const moves = observation.legal_actions.filter((action) => action.type === "move" && action.direction);
      let chosen: LegalAction | undefined;
      const visible = observation.nearby.find((item) => item.type === "resource" && item.remaining > 0 && item.labs_branch);
      if (visible?.type === "resource") {
        if (visible.x === observation.self.x && visible.y === observation.self.y) chosen = wait;
        else {
          const desired = visible.x !== observation.self.x ? (visible.x > observation.self.x ? "east" : "west") : visible.y > observation.self.y ? "south" : "north";
          chosen = moves.find((action) => action.direction === desired);
        }
      }
      if (chosen?.type === "move") {
        const target = directionTarget(observation, chosen.direction);
        const key = `${target.x}:${target.y}`;
        if (!visited.has(key) && !parents.has(key)) parents.set(key, here);
      }
      if (!chosen) {
        const unvisited = moves.filter((action) => {
          const target = directionTarget(observation, action.direction);
          return !visited.has(`${target.x}:${target.y}`);
        });
        chosen = unvisited.find((action) => sameResourceTile(observation.self, directionTarget(observation, action.direction))) ?? unvisited[0];
        if (chosen) {
          const target = directionTarget(observation, chosen.direction);
          parents.set(`${target.x}:${target.y}`, here);
        }
      }
      if (!chosen) {
        const parent = parents.get(here);
        chosen = parent ? moves.find((action) => {
          const target = directionTarget(observation, action.direction);
          return `${target.x}:${target.y}` === parent;
        }) : undefined;
      }
      if (!chosen && observation.self.energy < 1) chosen = wait;
      if (!chosen) {
        progress({stage: "complete", steps, visited_cells: visited.size, position: {x: observation.self.x, y: observation.self.y}, reason: "all_reachable_cells_explored"});
        return {operation: "explore_world", agent_id: identity.agentId, status: "no_labs_resource_found", reason: "all_reachable_cells_explored", steps, visited_cells: visited.size};
      }
      const movement = await bridge.act({observation_id: observation.observation_id, action_id: chosen.action_id, request_id: `${identity.agentId}:${randomUUID()}`});
      if (movement.status === "applied") steps += 1;
      else progress({stage: "retrying", steps, visited_cells: visited.size, position: {x: observation.self.x, y: observation.self.y}, reason: movement.reason});
    }
  } finally {
    await bridge.close();
  }
}

export async function participateLabs(options: ParticipateLabsOptions = {}): Promise<Record<string, unknown>> {
  const nodeUrl = (options.nodeUrl ?? DEFAULT_PROOFWILD_NODE_URL).replace(/\/$/, "");
  const identityPath = resolve(options.identityPath ?? DEFAULT_PROOFWILD_IDENTITY_PATH);
  const identity = await loadOrCreateIdentity(identityPath);
  const bridge = new SaiBridge(nodeUrl, identity);
  if (options.explore) return {node_url: nodeUrl, identity_persisted: true, ...(await exploreLabsWorld(bridge, identity, options.onProgress))};
  if (options.peerUrl) {
    const frontier = await bridge.labsSync(options.peerUrl);
    return {operation: "sync", agent_id: identity.agentId, node_url: nodeUrl, peer_url: options.peerUrl, frontier};
  }
  if (options.sequence) {
    const published = await bridge.labsPublish(options.sequence, options.claimType ?? "discovery");
    return {operation: "publish", agent_id: identity.agentId, node_url: nodeUrl, identity_persisted: true, ...published};
  }
  const discovery = await bridge.labsDiscover();
  return {operation: "observe", agent_id: identity.agentId, node_url: nodeUrl, ...discovery};
}

export interface ResearchActionOptions {
  action: "dataset" | "propose" | "critique" | "evaluate" | "train";
  inputPath?: string;
  objectId?: string;
  parentModelId?: string;
  nodeUrl?: string;
  identityPath?: string;
}

async function researchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json() as T & {error_description?: string; error?: string};
  if (!response.ok) throw new Error(body.error_description ?? body.error ?? `研究接口失败（HTTP ${response.status}）`);
  return body;
}

async function loadResearchDataset(nodeUrl: string): Promise<LabsMethodDataset> {
  const merged: LabsMethodDataset = {protocol: "proofwild-labs-method-dataset/1", authority: false, cursor: null, next_cursor: null, tasks: [], proposals: [], critiques: [], evaluations: [], models: [], preference_pairs: []};
  let cursor: string | null = null;
  for (let pageIndex = 0; pageIndex < 4_096; pageIndex += 1) {
    const page: LabsMethodDataset = await researchJson<LabsMethodDataset>(`${nodeUrl}/labs/v1/methods/dataset${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
    merged.tasks.push(...page.tasks); merged.proposals.push(...page.proposals); merged.critiques.push(...page.critiques); merged.evaluations.push(...page.evaluations); merged.models.push(...page.models); merged.preference_pairs.push(...page.preference_pairs);
    if (!page.next_cursor) return merged;
    if (page.next_cursor === cursor) throw new Error("研究数据游标没有前进");
    cursor = page.next_cursor;
  }
  throw new Error("研究数据分页超过固定上限");
}

export async function runResearchAction(options: ResearchActionOptions): Promise<unknown> {
  const nodeUrl = (options.nodeUrl ?? DEFAULT_PROOFWILD_NODE_URL).replace(/\/$/, "");
  if (options.action === "dataset") return loadResearchDataset(nodeUrl);
  const labs = await import("../../labs/src/index.js");
  const dataset = await loadResearchDataset(nodeUrl);
  const submit = <T>(collection: string, id: string, value: T) => researchJson(`${nodeUrl}/labs/v1/methods/${collection}`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({id, value})});
  if (options.action === "propose" || options.action === "critique") {
    if (!options.inputPath) throw new Error("研究提案或批评缺少输入文件");
    const input = JSON.parse(await readFile(resolve(options.inputPath), "utf8"));
    const identity = await loadOrCreateIdentity(options.identityPath);
    if (options.action === "propose") {
      const created = labs.createLabsMethodProposal(input, identity);
      await submit("proposals", created.proposal_id, created.signed_proposal);
      return {status: "stored", id: created.proposal_id, value: created.signed_proposal};
    }
    const created = labs.createLabsMethodCritique(input, identity);
    await submit("critiques", created.critique_id, created.signed_critique);
    return {status: "stored", id: created.critique_id, value: created.signed_critique};
  }
  if (options.action === "evaluate") {
    const proposal = dataset.proposals.find(({id}) => id === options.objectId);
    if (!proposal) throw new Error("找不到待评价的方法提案");
    const task = dataset.tasks.find(({id}) => id === proposal.value.proposal.task_id);
    if (!task || task.value.protocol !== "sai-labs-research-task/2") throw new Error("方法提案缺少可评价任务");
    const ruleset = await researchJson<{ruleset: import("../../labs/src/index.js").LabsRuleset}>(`${nodeUrl}/labs/v1/rulesets/${encodeURIComponent(task.value.ruleset_id)}`);
    const created = labs.evaluateLabsMethodProposal(ruleset.ruleset, task.value, proposal.value);
    await submit("evaluations", created.evaluation_id, created.evaluation);
    return {status: "stored", id: created.evaluation_id, value: created.evaluation};
  }
  const parent = options.parentModelId ? dataset.models.find(({id}) => id === options.parentModelId)?.value : undefined;
  if (options.parentModelId && !parent) throw new Error("找不到父研究策略模型");
  const created = labs.trainLabsResearchPolicyModel(dataset.proposals.map(({value}) => value), dataset.evaluations.map(({value}) => value), parent);
  await submit("models", created.model_id, created.model);
  return {status: "stored", id: created.model_id, value: created.model};
}
