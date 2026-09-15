import {createHash, createPrivateKey, createPublicKey, sign, verify, type JsonWebKey} from "node:crypto";
import {agentIdFromJwk, type AgentIdentity} from "../../identity/src/index.js";
import {assertLabsArtifact, assertLabsClaim, assertLabsFrontier, assertLabsResearchRecord, assertLabsResearchTask, assertLabsResult, assertLabsRuleset, assertLabsWorldBranch} from "./validation.js";

export const LABS_RULESET_PROTOCOL = "sai-labs-ruleset/2" as const;
export const LABS_RESULT_PROTOCOL = "sai-labs-result/1" as const;
export const LABS_CLAIM_PROTOCOL = "sai-labs-claim/1" as const;
export const LABS_FRONTIER_PROTOCOL = "sai-labs-frontier/1" as const;
export const LABS_ARTIFACT_PROTOCOL = "sai-labs-artifact/1" as const;
export const LEGACY_LABS_RESEARCH_TASK_PROTOCOL = "sai-labs-research-task/1" as const;
export const LEGACY_LABS_RESEARCH_RECORD_PROTOCOL = "sai-labs-research-record/1" as const;
export const LABS_RESEARCH_TASK_PROTOCOL = "sai-labs-research-task/2" as const;
export const LABS_RESEARCH_RECORD_PROTOCOL = "sai-labs-research-record/2" as const;
export const LABS_MAX_OBJECT_BYTES = 131_072;
export const LABS_MAX_SEQUENCE_LENGTH = 4_096;
export const LABS_RESEARCH_ADDRESS_BITS = 29;
export const LABS_RESEARCH_CHALLENGE_BITS = 128;
export const LABS_RESEARCH_VARIABLE_BITS = 16;
export const LABS_RESEARCH_CANDIDATES_PER_UNIT = 65_536 as const;
export const LABS_RESEARCH_ADDRESS_XOR = 31;
export const LABS_RESEARCH_MATERIALIZED_TIES = 128;
export const LEGACY_REFERENCE_FORK_ID = "fork:sai-public-world-1";
export const PREVIOUS_REFERENCE_FORK_ID = "fork:sai-emission-world-1";
export const STRATA_REFERENCE_FORK_ID = "fork:sai-strata-world-1";
export const REFERENCE_FORK_ID = "fork:sai-contribution-world-1";

export type LabsClaimType = "coverage" | "discovery" | "reproduction" | "relay";

export interface LabsSource {
  title: string;
  authors: string[];
  publication: string;
  url: string;
}

export interface LabsBaseline {
  length: number;
  sequence: string;
  energy: string;
  source: LabsSource;
}

export interface LabsRuleset {
  protocol: typeof LABS_RULESET_PROTOCOL;
  name: string;
  summary: string;
  objective: "minimize_aperiodic_autocorrelation_energy";
  sequence_alphabet: "binary_pm1";
  symmetry: "complement_reverse_alternating_group_8";
  energy_formula: "sum_k_1_to_L_minus_1(sum_i_1_to_L_minus_k(s_i*s_i_plus_k))^2";
  merit_factor_formula: "L^2/(2E)";
  max_object_bytes: number;
  max_sequence_length: number;
  baselines: LabsBaseline[];
}

export interface LabsResult {
  protocol: typeof LABS_RESULT_PROTOCOL;
  ruleset_id: string;
  length: number;
  sequence: string;
  energy: string;
}

export interface LabsClaimBody {
  protocol: typeof LABS_CLAIM_PROTOCOL;
  result_id: string;
  agent_id: string;
  claim_type: LabsClaimType;
  evidence_ids: string[];
}

export interface LabsSignedClaim {
  claim: LabsClaimBody;
  public_jwk: JsonWebKey;
  signature: string;
}

export interface LabsFrontierEntry {
  best_energy: string;
  result_ids: string[];
}

export interface LabsFrontier {
  protocol: typeof LABS_FRONTIER_PROTOCOL;
  ruleset_id: string;
  fork_id: string;
  lengths: Record<string, LabsFrontierEntry>;
}

export interface LabsWorldBranch {
  protocol: "sai-labs-world-branch/4";
  branch_id: string;
  economic_network_id: string;
  schedule_id: string;
  branch_ordinal: number;
  resource_id: string;
  resource_kind: string;
  resource_amount: number;
  reward_amount: 1;
  unit_index: number;
  x: number;
  y: number;
  stratum: number;
  ruleset_id: string;
  length: number;
  baseline_energy: string;
  candidates_per_unit: typeof LABS_RESEARCH_CANDIDATES_PER_UNIT;
}

export interface LabsResearchArtifact {
  protocol: typeof LABS_ARTIFACT_PROTOCOL;
  artifact_type: "method" | "code" | "dataset" | "report" | "citation";
  title: string;
  media_type: string;
  content_encoding: "utf-8";
  content: string;
  license: string;
}

export interface LegacyLabsResearchTask {
  protocol: typeof LEGACY_LABS_RESEARCH_TASK_PROTOCOL;
  ruleset_id: string;
  branch_id: string;
  length: number;
  objective: "exhaustive_binary_flip_neighborhood";
  base_sequence: string;
  variable_positions: number[];
  candidate_count: 256;
  enumeration: "ascending_8_bit_flip_mask";
  energy_formula: LabsRuleset["energy_formula"];
}

export interface LegacyLabsResearchRecord {
  protocol: typeof LEGACY_LABS_RESEARCH_RECORD_PROTOCOL;
  ruleset_id: string;
  task_id: string;
  branch_id: string;
  contribution_type: "search_coverage" | "frontier_improvement";
  result_id: string;
  baseline_energy: string;
  best_energy: string;
  energy_delta: string;
  tied_result_ids: string[];
  evaluated_candidates: 256;
  coverage_digest: string;
  artifact_ids: string[];
}

export interface LabsResearchTask {
  protocol: typeof LABS_RESEARCH_TASK_PROTOCOL;
  ruleset_id: string;
  branch_id: string;
  branch_ordinal: number;
  unit_index: number;
  economic_network_id: string;
  economic_parent_id: string;
  claimant_agent_id: string;
  length: number;
  objective: "exhaustive_parent_and_claimant_bound_symmetry_partition";
  base_sequence: string;
  address_encoding: "xor31_of_branch_ordinal_24bit_and_unit_index_5bit";
  address_bits: string;
  address_positions: number[];
  challenge_encoding: "sha256_128_of_network_parent_and_claimant";
  challenge_bits: string;
  challenge_positions: number[];
  variable_positions: number[];
  flip_semantics: "position_and_reverse_pair";
  candidate_count: typeof LABS_RESEARCH_CANDIDATES_PER_UNIT;
  enumeration: "ascending_16_bit_mask_with_gray_execution";
  coverage_partition_id: string;
  energy_formula: LabsRuleset["energy_formula"];
}

export interface LabsResearchRecord {
  protocol: typeof LABS_RESEARCH_RECORD_PROTOCOL;
  ruleset_id: string;
  task_id: string;
  branch_id: string;
  contribution_type: "search_coverage" | "frontier_improvement";
  result_id: string;
  baseline_energy: string;
  best_energy: string;
  energy_delta: string;
  tied_result_ids: string[];
  tied_result_count: number;
  tied_result_ids_complete: boolean;
  tied_result_digest: string;
  evaluated_candidates: typeof LABS_RESEARCH_CANDIDATES_PER_UNIT;
  new_canonical_candidates: typeof LABS_RESEARCH_CANDIDATES_PER_UNIT;
  coverage_partition_id: string;
  coverage_digest: string;
  reward_units: 1;
  artifact_ids: string[];
}

export type AnyLabsResearchTask = LegacyLabsResearchTask | LabsResearchTask;
export type AnyLabsResearchRecord = LegacyLabsResearchRecord | LabsResearchRecord;

export interface LabsResearchExecution {
  task: LabsResearchTask;
  task_id: string;
  artifact: LabsResearchArtifact;
  artifact_id: string;
  record: LabsResearchRecord;
  record_id: string;
  candidate_sequence: string;
  result: LabsResult;
  result_id: string;
}

function normalize(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError("LABS canonical JSON 只允许安全整数");
    return value;
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      if (record[key] !== undefined) output[key] = normalize(record[key]);
    }
    return output;
  }
  throw new TypeError(`LABS canonical JSON 不支持 ${typeof value}`);
}

export function labsCanonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function labsContentId(value: unknown): string {
  return `sha256:${createHash("sha256").update(labsCanonicalJson(value)).digest("hex")}`;
}

export function labsObjectBytes(value: unknown): number {
  return Buffer.byteLength(labsCanonicalJson(value), "utf8");
}

export const LEGACY_REFERENCE_SEARCH_METHOD_ARTIFACT: LabsResearchArtifact = {
  protocol: LABS_ARTIFACT_PROTOCOL,
  artifact_type: "method",
  title: "SAI LABS exhaustive eight-position flip-neighborhood search v1",
  media_type: "text/markdown",
  content_encoding: "utf-8",
  content: `# Exhaustive flip-neighborhood search v1

Input is a content-addressed LABS research task. The task fixes one binary base sequence and eight distinct zero-based positions.

1. Enumerate masks 0 through 255 in ascending order.
2. For each mask, copy the base sequence and complement position j when bit j of the mask is 1.
3. Recompute the complete aperiodic autocorrelation energy with exact integer arithmetic.
4. Canonicalize each candidate under the eight LABS energy symmetries and derive its SHA-256 result ID.
5. Preserve every result ID tied at the lowest energy. Select the lexicographically smallest result ID, then the smallest raw candidate, as the portable representative.
6. Hash the ordered mask, result ID, and energy rows as the coverage digest.

The resulting record proves which finite neighborhood was evaluated and can be reproduced without SAI, a reference node, wall-clock time, or hidden data. It does not prove the algorithm is globally optimal outside that neighborhood.`,
  license: "Apache-2.0",
};

export const LEGACY_REFERENCE_SEARCH_METHOD_ARTIFACT_ID = labsContentId(LEGACY_REFERENCE_SEARCH_METHOD_ARTIFACT);

export const REFERENCE_SEARCH_METHOD_ARTIFACT: LabsResearchArtifact = {
  protocol: LABS_ARTIFACT_PROTOCOL,
  artifact_type: "method",
  title: "SAI LABS parent-and-claimant-bound contribution search v3",
  media_type: "text/markdown",
  content_encoding: "utf-8",
  content: `# Parent-and-claimant-bound contribution search v3

Input is a content-addressed LABS world unit, the current economic parent digest, the claiming Agent ID, and the self-contained reference baseline for its sequence length.

1. Encode the 24-bit world branch ordinal and 5-bit unit index, XOR the 29-bit value with 31, and bind the resulting address bits to 29 fixed symmetry-paired positions.
2. Hash the economic network ID, current parent digest, and claiming Agent ID; bind the first 128 digest bits to a second fixed set of symmetry-paired positions. Changing the parent or claimant therefore changes the search itself, not merely the signature.
3. The address, challenge, and 16 variable positions are disjoint. Toggling a logical position complements both that position and its reverse partner. This preserves the fixed canonical guard for every reference length.
4. Enumerate all 65,536 masks of the 16 variable positions. Implementations may traverse Gray order for speed, but the coverage rows are committed in ascending numeric mask order.
5. Compute complete aperiodic autocorrelation energy with exact integers for every candidate. Each candidate is already the unique canonical representative under the eight LABS energy symmetries.
6. Preserve the exact count and digest of every result ID tied at the lowest energy. Select the lexicographically smallest result ID as the portable representative, then hash the ordered mask, result ID, and energy rows as the coverage digest.

The exact 29-bit unit address keeps different resource units disjoint. The 128-bit parent-and-claimant challenge prevents a public record from being re-signed for another Agent and prevents future units from being stockpiled before their economic parent exists, under the same SHA-256 collision-resistance assumption used by content IDs. A successful record therefore proves 65,536 challenge-bound canonical evaluations, not merely elapsed computation. Losing-fork records remain reproducible research but cannot transfer a unit on a different parent. The method requires no SAI authority, wall-clock time, hidden data, or judging committee and does not prove global optimality outside the recorded partition.`,
  license: "Apache-2.0",
};

export const REFERENCE_SEARCH_METHOD_ARTIFACT_ID = labsContentId(REFERENCE_SEARCH_METHOD_ARTIFACT);

export function verifyLabsArtifact(artifact: LabsResearchArtifact, expectedId?: string): string {
  assertLabsArtifact(artifact);
  if (artifact.protocol !== LABS_ARTIFACT_PROTOCOL || artifact.content_encoding !== "utf-8") throw new TypeError("LABS 研究制品协议无效");
  if (labsObjectBytes(artifact) > LABS_MAX_OBJECT_BYTES) throw new RangeError("LABS 研究制品超过对象大小上限");
  const artifactId = labsContentId(artifact);
  if (expectedId && artifactId !== expectedId) throw new TypeError("LABS artifact_id 不匹配");
  return artifactId;
}

function assertDecimal(value: string, label: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new TypeError(`${label} 必须是无前导零的非负十进制整数`);
  return BigInt(value);
}

export function labsEnergy(sequence: string): bigint {
  if (!/^[01]+$/.test(sequence)) throw new TypeError("LABS 序列必须只包含 0 和 1");
  if (sequence.length > LABS_MAX_SEQUENCE_LENGTH) throw new RangeError(`LABS 序列长度不能超过 ${LABS_MAX_SEQUENCE_LENGTH}`);
  let energy = 0n;
  for (let shift = 1; shift < sequence.length; shift += 1) {
    let correlation = 0n;
    for (let index = 0; index < sequence.length - shift; index += 1) {
      correlation += sequence[index] === sequence[index + shift] ? 1n : -1n;
    }
    energy += correlation * correlation;
  }
  return energy;
}

export function labsSymmetries(sequence: string): string[] {
  if (!/^[01]+$/.test(sequence)) throw new TypeError("LABS 序列必须只包含 0 和 1");
  const flip = (bit: string): string => bit === "0" ? "1" : "0";
  const variants: string[] = [];
  for (const reverse of [false, true]) {
    const base = reverse ? [...sequence].reverse().join("") : sequence;
    for (const alternate of [false, true]) {
      const alternated = [...base].map((bit, index) => alternate && index % 2 === 1 ? flip(bit) : bit).join("");
      variants.push(alternated);
      variants.push([...alternated].map(flip).join(""));
    }
  }
  return variants.sort();
}

export function canonicalLabsSequence(sequence: string): string {
  return labsSymmetries(sequence)[0] as string;
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

export function exactMeritFactor(length: number, energy: bigint, digits = 8): {numerator: string; denominator: string; decimal: string} {
  if (!Number.isSafeInteger(length) || length <= 0) throw new RangeError("LABS 长度必须是正安全整数");
  if (energy <= 0n) throw new RangeError("LABS Merit Factor 要求能量大于 0");
  const rawNumerator = BigInt(length) * BigInt(length);
  const rawDenominator = 2n * energy;
  const divisor = gcd(rawNumerator, rawDenominator);
  const numerator = rawNumerator / divisor;
  const denominator = rawDenominator / divisor;
  const scale = 10n ** BigInt(digits);
  const scaled = (numerator * scale + denominator / 2n) / denominator;
  const integer = scaled / scale;
  const fraction = (scaled % scale).toString().padStart(digits, "0");
  return {numerator: numerator.toString(), denominator: denominator.toString(), decimal: `${integer}.${fraction}`};
}

function assertRuleset(ruleset: LabsRuleset): void {
  assertLabsRuleset(ruleset);
  if (ruleset.protocol !== LABS_RULESET_PROTOCOL || ruleset.objective !== "minimize_aperiodic_autocorrelation_energy") throw new TypeError("不支持的 LABS 规则集");
  if (ruleset.max_object_bytes !== LABS_MAX_OBJECT_BYTES || ruleset.max_sequence_length > LABS_MAX_SEQUENCE_LENGTH) throw new RangeError("LABS 规则集对象上限无效");
  if (labsObjectBytes(ruleset) > ruleset.max_object_bytes) throw new RangeError("LABS 规则集超过对象大小上限");
  const lengths = new Set<number>();
  for (const baseline of ruleset.baselines) {
    if (!Number.isSafeInteger(baseline.length) || baseline.length < 2 || baseline.length > ruleset.max_sequence_length || baseline.sequence.length !== baseline.length) throw new RangeError("LABS 基线长度无效");
    if (lengths.has(baseline.length)) throw new TypeError("LABS 规则集不能重复长度");
    lengths.add(baseline.length);
    if (canonicalLabsSequence(baseline.sequence) !== baseline.sequence) throw new TypeError(`长度 ${baseline.length} 的基线不是规范序列`);
    const energy = assertDecimal(baseline.energy, "baseline.energy");
    if (labsEnergy(baseline.sequence) !== energy) throw new TypeError(`长度 ${baseline.length} 的基线能量不匹配`);
  }
  if (ruleset.baselines.length === 0) throw new TypeError("LABS 规则集至少需要一个基线");
}

const rulesetValidationCache = new WeakMap<object, {canonical: string; id: string}>();

export function rulesetId(ruleset: LabsRuleset): string {
  const canonical = labsCanonicalJson(ruleset);
  const cached = rulesetValidationCache.get(ruleset);
  if (cached?.canonical === canonical) return cached.id;
  assertRuleset(ruleset);
  const id = labsContentId(ruleset);
  rulesetValidationCache.set(ruleset, {canonical, id});
  return id;
}

export function createLabsResult(ruleset: LabsRuleset, sequence: string): {result: LabsResult; result_id: string} {
  assertRuleset(ruleset);
  if (!ruleset.baselines.some((item) => item.length === sequence.length)) throw new RangeError("序列长度不属于该 LABS 规则集");
  const canonical = canonicalLabsSequence(sequence);
  const result: LabsResult = {protocol: LABS_RESULT_PROTOCOL, ruleset_id: rulesetId(ruleset), length: canonical.length, sequence: canonical, energy: labsEnergy(canonical).toString()};
  if (labsObjectBytes(result) > ruleset.max_object_bytes) throw new RangeError("LABS 结果超过对象大小上限");
  return {result, result_id: labsContentId(result)};
}

export function verifyLabsResult(ruleset: LabsRuleset, result: LabsResult, expectedId?: string): string {
  assertLabsResult(result);
  const id = rulesetId(ruleset);
  if (result.protocol !== LABS_RESULT_PROTOCOL || result.ruleset_id !== id) throw new TypeError("LABS 结果的规则集不匹配");
  if (result.sequence.length !== result.length || !ruleset.baselines.some((item) => item.length === result.length)) throw new RangeError("LABS 结果长度不在规则集内");
  if (canonicalLabsSequence(result.sequence) !== result.sequence) throw new TypeError("LABS 结果序列未规范化");
  if (labsEnergy(result.sequence) !== assertDecimal(result.energy, "result.energy")) throw new TypeError("LABS 结果能量不匹配");
  if (labsObjectBytes(result) > ruleset.max_object_bytes) throw new RangeError("LABS 结果超过对象大小上限");
  const resultId = labsContentId(result);
  if (expectedId && expectedId !== resultId) throw new TypeError("LABS result_id 不匹配");
  return resultId;
}

function normalizedPublicJwk(jwk: JsonWebKey): JsonWebKey {
  if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || !jwk.x) throw new TypeError("LABS 声明只接受 Ed25519 公钥");
  return {crv: "Ed25519", kty: "OKP", x: jwk.x};
}

export function createClaimBody(resultId: string, identity: AgentIdentity, claimType: LabsClaimType, evidenceIds: string[] = []): LabsClaimBody {
  if (!/^sha256:[0-9a-f]{64}$/.test(resultId)) throw new TypeError("LABS result_id 格式无效");
  const uniqueEvidence = [...new Set(evidenceIds)].sort();
  if (uniqueEvidence.some((id) => !/^sha256:[0-9a-f]{64}$/.test(id))) throw new TypeError("LABS evidence_id 格式无效");
  return {protocol: LABS_CLAIM_PROTOCOL, result_id: resultId, agent_id: identity.agentId, claim_type: claimType, evidence_ids: uniqueEvidence};
}

export function signLabsClaim(body: LabsClaimBody, identity: AgentIdentity): {signed_claim: LabsSignedClaim; claim_id: string} {
  if (body.agent_id !== identity.agentId || agentIdFromJwk(identity.publicJwk) !== identity.agentId) throw new TypeError("LABS 声明身份不匹配");
  const signature = sign(null, Buffer.from(labsCanonicalJson(body)), createPrivateKey({key: identity.privateJwk, format: "jwk"})).toString("base64url");
  const signedClaim: LabsSignedClaim = {claim: body, public_jwk: normalizedPublicJwk(identity.publicJwk), signature};
  assertLabsClaim(signedClaim);
  return {signed_claim: signedClaim, claim_id: labsContentId(signedClaim)};
}

export function verifyLabsClaim(signedClaim: LabsSignedClaim, expectedId?: string): string {
  assertLabsClaim(signedClaim);
  const publicJwk = normalizedPublicJwk(signedClaim.public_jwk);
  if (signedClaim.claim.protocol !== LABS_CLAIM_PROTOCOL || signedClaim.claim.agent_id !== agentIdFromJwk(publicJwk)) throw new TypeError("LABS 声明身份不匹配");
  if (!["coverage", "discovery", "reproduction", "relay"].includes(signedClaim.claim.claim_type)) throw new TypeError("LABS 声明类型无效");
  if (!/^sha256:[0-9a-f]{64}$/.test(signedClaim.claim.result_id)) throw new TypeError("LABS 声明 result_id 无效");
  if (labsObjectBytes(signedClaim) > LABS_MAX_OBJECT_BYTES) throw new RangeError("LABS 声明超过对象大小上限");
  const valid = verify(null, Buffer.from(labsCanonicalJson(signedClaim.claim)), createPublicKey({key: publicJwk, format: "jwk"}), Buffer.from(signedClaim.signature, "base64url"));
  if (!valid) throw new TypeError("LABS 声明签名无效");
  const claimId = labsContentId(signedClaim);
  if (expectedId && expectedId !== claimId) throw new TypeError("LABS claim_id 不匹配");
  return claimId;
}

function normalizedEntry(entry: LabsFrontierEntry): LabsFrontierEntry {
  const energy = assertDecimal(entry.best_energy, "frontier.best_energy");
  const ids = [...new Set(entry.result_ids)].sort();
  if (ids.length === 0 || ids.some((id) => !/^sha256:[0-9a-f]{64}$/.test(id))) throw new TypeError("LABS 前沿结果集合无效");
  return {best_energy: energy.toString(), result_ids: ids};
}

export function createInitialFrontier(ruleset: LabsRuleset, forkId: string): LabsFrontier {
  if (!/^fork:[A-Za-z0-9._:-]{1,120}$/.test(forkId)) throw new TypeError("LABS fork_id 无效");
  const lengths: Record<string, LabsFrontierEntry> = {};
  for (const baseline of ruleset.baselines) {
    const reference = createLabsResult(ruleset, baseline.sequence);
    lengths[String(baseline.length)] = {best_energy: baseline.energy, result_ids: [reference.result_id]};
  }
  return {protocol: LABS_FRONTIER_PROTOCOL, ruleset_id: rulesetId(ruleset), fork_id: forkId, lengths};
}

export function mergeLabsFrontiers(left: LabsFrontier, right: LabsFrontier): LabsFrontier {
  assertLabsFrontier(left);
  assertLabsFrontier(right);
  if (left.protocol !== LABS_FRONTIER_PROTOCOL || right.protocol !== LABS_FRONTIER_PROTOCOL || left.ruleset_id !== right.ruleset_id || left.fork_id !== right.fork_id) throw new TypeError("只能合并同一规则集、同一分叉的 LABS 前沿");
  const lengths: Record<string, LabsFrontierEntry> = {};
  for (const length of [...new Set([...Object.keys(left.lengths), ...Object.keys(right.lengths)])].sort((a, b) => Number(a) - Number(b))) {
    const a = left.lengths[length];
    const b = right.lengths[length];
    if (!a) lengths[length] = normalizedEntry(b as LabsFrontierEntry);
    else if (!b) lengths[length] = normalizedEntry(a);
    else {
      const ae = assertDecimal(a.best_energy, "frontier.best_energy");
      const be = assertDecimal(b.best_energy, "frontier.best_energy");
      if (ae < be) lengths[length] = normalizedEntry(a);
      else if (be < ae) lengths[length] = normalizedEntry(b);
      else lengths[length] = normalizedEntry({best_energy: a.best_energy, result_ids: [...a.result_ids, ...b.result_ids]});
    }
  }
  return {protocol: LABS_FRONTIER_PROTOCOL, ruleset_id: left.ruleset_id, fork_id: left.fork_id, lengths};
}

export function addResultToFrontier(frontier: LabsFrontier, result: LabsResult, resultId = labsContentId(result)): LabsFrontier {
  if (frontier.ruleset_id !== result.ruleset_id) throw new TypeError("LABS 前沿与结果规则集不匹配");
  const key = String(result.length);
  const current = frontier.lengths[key];
  if (!current) throw new RangeError("LABS 结果长度不在前沿内");
  const candidate: LabsFrontier = {...frontier, lengths: {...frontier.lengths, [key]: {best_energy: result.energy, result_ids: [resultId]}}};
  return mergeLabsFrontiers(frontier, candidate);
}

export function createLabsWorldBranch(ruleset: LabsRuleset, scope: {economic_network_id: string; schedule_id: string; branch_ordinal: number; resource_id: string; resource_kind: string; resource_amount: number; unit_index: number; x: number; y: number; stratum: number; length: number}): LabsWorldBranch {
  const baseline = ruleset.baselines.find((item) => item.length === scope.length);
  if (!baseline) throw new RangeError("LABS 世界分支长度不在规则集内");
  if (!/^network:sha256:[0-9a-f]{64}$/.test(scope.economic_network_id) || !/^sha256:[0-9a-f]{64}$/.test(scope.schedule_id)) throw new TypeError("LABS 世界分支经济网络绑定无效");
  const integers = [scope.branch_ordinal, scope.resource_amount, scope.unit_index, scope.x, scope.y, scope.stratum];
  if (integers.some((value) => !Number.isSafeInteger(value) || value < 0) || scope.resource_amount < 1 || scope.unit_index >= scope.resource_amount || scope.stratum < 1 || scope.stratum > 32) throw new RangeError("LABS 世界分支资源参数无效");
  if (!/^resource:world:[0-9]{1,8}$/.test(scope.resource_id) || !/^[a-z][a-z0-9_-]{0,31}$/.test(scope.resource_kind)) throw new TypeError("LABS 世界分支资源身份无效");
  const body = {
    protocol: "sai-labs-world-branch/4" as const,
    economic_network_id: scope.economic_network_id,
    schedule_id: scope.schedule_id,
    branch_ordinal: scope.branch_ordinal,
    resource_id: scope.resource_id,
    resource_kind: scope.resource_kind,
    resource_amount: scope.resource_amount,
    reward_amount: 1 as const,
    unit_index: scope.unit_index,
    x: scope.x,
    y: scope.y,
    stratum: scope.stratum,
    ruleset_id: rulesetId(ruleset),
    length: scope.length,
    baseline_energy: baseline.energy,
    candidates_per_unit: LABS_RESEARCH_CANDIDATES_PER_UNIT,
  };
  const branch = {...body, branch_id: labsContentId(body)};
  assertLabsWorldBranch(branch);
  if (labsObjectBytes(branch) > LABS_MAX_OBJECT_BYTES) throw new RangeError("LABS 世界分支超过对象大小上限");
  return branch;
}

export function labsResearchAddressCode(branchOrdinal: number, unitIndex: number): number {
  if (!Number.isSafeInteger(branchOrdinal) || branchOrdinal < 0 || branchOrdinal >= 2 ** 24 || !Number.isSafeInteger(unitIndex) || unitIndex < 0 || unitIndex >= 32) throw new RangeError("LABS 研究分片地址参数无效");
  return Number((BigInt(branchOrdinal) * 32n + BigInt(unitIndex)) ^ BigInt(LABS_RESEARCH_ADDRESS_XOR));
}

function fixedResearchPositions(start: number, count: number): number[] {
  return Array.from({length: count}, (_, index) => start + index);
}

const RESEARCH_ADDRESS_POSITIONS = Object.freeze(fixedResearchPositions(32, LABS_RESEARCH_ADDRESS_BITS));
const RESEARCH_CHALLENGE_POSITIONS = Object.freeze(fixedResearchPositions(32 + LABS_RESEARCH_ADDRESS_BITS, LABS_RESEARCH_CHALLENGE_BITS));
const RESEARCH_VARIABLE_POSITIONS = Object.freeze(fixedResearchPositions(32 + LABS_RESEARCH_ADDRESS_BITS + LABS_RESEARCH_CHALLENGE_BITS, LABS_RESEARCH_VARIABLE_BITS));

export interface LabsSettlementChallenge {
  economic_parent_id: string;
  claimant_agent_id: string;
}

export function labsSettlementChallengeBits(economicNetworkId: string, challenge: LabsSettlementChallenge): string {
  if (!/^network:sha256:[0-9a-f]{64}$/.test(economicNetworkId) || !/^sha256:[0-9a-f]{64}$/.test(challenge.economic_parent_id) || !/^agent:ed25519-v1:[A-Za-z0-9_-]{43}$/.test(challenge.claimant_agent_id)) throw new TypeError("LABS 结算挑战绑定无效");
  const digest = labsContentId({protocol: "sai-labs-settlement-challenge/1", economic_network_id: economicNetworkId, economic_parent_id: challenge.economic_parent_id, claimant_agent_id: challenge.claimant_agent_id}).slice("sha256:".length);
  return [...digest].map((digit) => Number.parseInt(digit, 16).toString(2).padStart(4, "0")).join("").slice(0, LABS_RESEARCH_CHALLENGE_BITS);
}

function exactSafeEnergy(sequence: string): number {
  let energy = 0;
  for (let shift = 1; shift < sequence.length; shift += 1) {
    let correlation = 0;
    for (let index = 0; index < sequence.length - shift; index += 1) correlation += sequence[index] === sequence[index + shift] ? 1 : -1;
    energy += correlation * correlation;
  }
  if (!Number.isSafeInteger(energy)) throw new RangeError("LABS 搜索能量超过安全整数范围");
  return energy;
}

export function createLabsResearchTask(ruleset: LabsRuleset, branch: LabsWorldBranch, challenge: LabsSettlementChallenge): {task: LabsResearchTask; task_id: string} {
  assertLabsWorldBranch(branch);
  const expectedBranch = createLabsWorldBranch(ruleset, branch);
  if (labsCanonicalJson(expectedBranch) !== labsCanonicalJson(branch)) throw new TypeError("LABS 研究任务引用了错误世界分支");
  const baseline = ruleset.baselines.find((item) => item.length === branch.length);
  if (!baseline || RESEARCH_VARIABLE_POSITIONS.at(-1)! >= Math.floor(branch.length / 2)) throw new RangeError("LABS 世界分支没有足够的确定性搜索空间");
  const addressBits = labsResearchAddressCode(branch.branch_ordinal, branch.unit_index).toString(2).padStart(LABS_RESEARCH_ADDRESS_BITS, "0");
  const challengeBits = labsSettlementChallengeBits(branch.economic_network_id, challenge);
  const partitionBody = {
    protocol: "sai-labs-coverage-partition/2",
    ruleset_id: rulesetId(ruleset),
    branch_id: branch.branch_id,
    economic_network_id: branch.economic_network_id,
    economic_parent_id: challenge.economic_parent_id,
    claimant_agent_id: challenge.claimant_agent_id,
    length: branch.length,
    address_encoding: "xor31_of_branch_ordinal_24bit_and_unit_index_5bit",
    address_bits: addressBits,
    address_positions: [...RESEARCH_ADDRESS_POSITIONS],
    challenge_encoding: "sha256_128_of_network_parent_and_claimant",
    challenge_bits: challengeBits,
    challenge_positions: [...RESEARCH_CHALLENGE_POSITIONS],
    variable_positions: [...RESEARCH_VARIABLE_POSITIONS],
    flip_semantics: "position_and_reverse_pair",
  } as const;
  const task: LabsResearchTask = {
    protocol: LABS_RESEARCH_TASK_PROTOCOL,
    ruleset_id: rulesetId(ruleset),
    branch_id: branch.branch_id,
    branch_ordinal: branch.branch_ordinal,
    unit_index: branch.unit_index,
    economic_network_id: branch.economic_network_id,
    economic_parent_id: challenge.economic_parent_id,
    claimant_agent_id: challenge.claimant_agent_id,
    length: branch.length,
    objective: "exhaustive_parent_and_claimant_bound_symmetry_partition",
    base_sequence: baseline.sequence,
    address_encoding: partitionBody.address_encoding,
    address_bits: addressBits,
    address_positions: [...RESEARCH_ADDRESS_POSITIONS],
    challenge_encoding: partitionBody.challenge_encoding,
    challenge_bits: challengeBits,
    challenge_positions: [...RESEARCH_CHALLENGE_POSITIONS],
    variable_positions: [...RESEARCH_VARIABLE_POSITIONS],
    flip_semantics: partitionBody.flip_semantics,
    candidate_count: LABS_RESEARCH_CANDIDATES_PER_UNIT,
    enumeration: "ascending_16_bit_mask_with_gray_execution",
    coverage_partition_id: labsContentId(partitionBody),
    energy_formula: ruleset.energy_formula,
  };
  assertLabsResearchTask(task);
  return {task, task_id: labsContentId(task)};
}

function verifyLegacyLabsResearchTask(ruleset: LabsRuleset, task: LegacyLabsResearchTask, expectedId?: string): string {
  assertLabsResearchTask(task);
  if (task.protocol !== LEGACY_LABS_RESEARCH_TASK_PROTOCOL || task.ruleset_id !== rulesetId(ruleset) || task.base_sequence.length !== task.length) throw new TypeError("LABS 旧研究任务与规则集不匹配");
  const baseline = ruleset.baselines.find((item) => item.length === task.length);
  if (!baseline || canonicalLabsSequence(task.base_sequence) !== baseline.sequence || task.base_sequence !== baseline.sequence) throw new TypeError("LABS 旧研究任务基线无效");
  if (task.variable_positions.some((position) => position >= task.length)) throw new RangeError("LABS 研究任务位置超出序列范围");
  if (labsObjectBytes(task) > LABS_MAX_OBJECT_BYTES) throw new RangeError("LABS 研究任务超过对象大小上限");
  const taskId = labsContentId(task);
  if (expectedId && taskId !== expectedId) throw new TypeError("LABS task_id 不匹配");
  return taskId;
}

export function verifyLabsResearchTask(ruleset: LabsRuleset, task: AnyLabsResearchTask, expectedId?: string): string {
  if (task.protocol === LEGACY_LABS_RESEARCH_TASK_PROTOCOL) return verifyLegacyLabsResearchTask(ruleset, task, expectedId);
  assertLabsResearchTask(task);
  if (task.protocol !== LABS_RESEARCH_TASK_PROTOCOL || task.ruleset_id !== rulesetId(ruleset) || task.base_sequence.length !== task.length) throw new TypeError("LABS 研究任务与规则集不匹配");
  const baseline = ruleset.baselines.find((item) => item.length === task.length);
  if (!baseline || task.base_sequence !== baseline.sequence) throw new TypeError("LABS 研究任务基线无效");
  const expectedAddressBits = labsResearchAddressCode(task.branch_ordinal, task.unit_index).toString(2).padStart(LABS_RESEARCH_ADDRESS_BITS, "0");
  const expectedChallengeBits = labsSettlementChallengeBits(task.economic_network_id, {economic_parent_id: task.economic_parent_id, claimant_agent_id: task.claimant_agent_id});
  if (task.address_bits !== expectedAddressBits || task.challenge_bits !== expectedChallengeBits || labsCanonicalJson(task.address_positions) !== labsCanonicalJson([...RESEARCH_ADDRESS_POSITIONS]) || labsCanonicalJson(task.challenge_positions) !== labsCanonicalJson([...RESEARCH_CHALLENGE_POSITIONS]) || labsCanonicalJson(task.variable_positions) !== labsCanonicalJson([...RESEARCH_VARIABLE_POSITIONS])) throw new TypeError("LABS 研究任务分片挑战无效");
  const partitionBody = {protocol: "sai-labs-coverage-partition/2", ruleset_id: task.ruleset_id, branch_id: task.branch_id, economic_network_id: task.economic_network_id, economic_parent_id: task.economic_parent_id, claimant_agent_id: task.claimant_agent_id, length: task.length, address_encoding: task.address_encoding, address_bits: task.address_bits, address_positions: task.address_positions, challenge_encoding: task.challenge_encoding, challenge_bits: task.challenge_bits, challenge_positions: task.challenge_positions, variable_positions: task.variable_positions, flip_semantics: task.flip_semantics};
  if (task.coverage_partition_id !== labsContentId(partitionBody)) throw new TypeError("LABS 研究任务覆盖分片摘要无效");
  if (task.address_positions.some((position) => position >= Math.floor(task.length / 2)) || task.challenge_positions.some((position) => position >= Math.floor(task.length / 2)) || task.variable_positions.some((position) => position >= Math.floor(task.length / 2))) throw new RangeError("LABS 研究任务位置超出规范半序列");
  const taskId = labsContentId(task);
  if (labsObjectBytes(task) > LABS_MAX_OBJECT_BYTES) throw new RangeError("LABS 研究任务超过对象大小上限");
  if (expectedId && taskId !== expectedId) throw new TypeError("LABS task_id 不匹配");
  return taskId;
}

function togglePair(bits: string[], position: number): void {
  const mirror = bits.length - 1 - position;
  bits[position] = bits[position] === "0" ? "1" : "0";
  if (mirror !== position) bits[mirror] = bits[mirror] === "0" ? "1" : "0";
}

export function labsResearchCandidate(task: LabsResearchTask, mask: number): string {
  if (!Number.isSafeInteger(mask) || mask < 0 || mask >= task.candidate_count) throw new RangeError("LABS 研究候选 mask 超出范围");
  const bits = [...task.base_sequence];
  for (let index = 0; index < task.address_positions.length; index += 1) if (task.address_bits[index] === "1") togglePair(bits, task.address_positions[index]!);
  for (let index = 0; index < task.challenge_positions.length; index += 1) if (task.challenge_bits[index] === "1") togglePair(bits, task.challenge_positions[index]!);
  for (let index = 0; index < task.variable_positions.length; index += 1) if ((mask & (1 << index)) !== 0) togglePair(bits, task.variable_positions[index]!);
  return bits.join("");
}

function executeLegacyLabsResearchTask(ruleset: LabsRuleset, task: LegacyLabsResearchTask): {task: LegacyLabsResearchTask; task_id: string; artifact: LabsResearchArtifact; artifact_id: string; record: LegacyLabsResearchRecord; record_id: string; candidate_sequence: string; result: LabsResult; result_id: string} {
  const taskId = verifyLegacyLabsResearchTask(ruleset, task);
  const baseline = ruleset.baselines.find((item) => item.length === task.length)!;
  const evaluations: Array<{mask: number; result_id: string; energy: string}> = [];
  const bestCandidates: Array<{candidate: string; result: LabsResult; result_id: string}> = [];
  let bestEnergy = Number.MAX_SAFE_INTEGER;
  for (let mask = 0; mask < task.candidate_count; mask += 1) {
    const bits = [...task.base_sequence];
    for (let bit = 0; bit < task.variable_positions.length; bit += 1) if ((mask & (1 << bit)) !== 0) bits[task.variable_positions[bit]!] = bits[task.variable_positions[bit]!] === "0" ? "1" : "0";
    const candidate = bits.join("");
    const energy = exactSafeEnergy(candidate);
    const canonical = canonicalLabsSequence(candidate);
    const result: LabsResult = {protocol: LABS_RESULT_PROTOCOL, ruleset_id: task.ruleset_id, length: task.length, sequence: canonical, energy: String(energy)};
    const resultId = labsContentId(result);
    evaluations.push({mask, result_id: resultId, energy: String(energy)});
    if (energy < bestEnergy) { bestEnergy = energy; bestCandidates.splice(0, bestCandidates.length, {candidate, result, result_id: resultId}); }
    else if (energy === bestEnergy) bestCandidates.push({candidate, result, result_id: resultId});
  }
  const selected = [...bestCandidates].sort((left, right) => left.result_id === right.result_id ? left.candidate.localeCompare(right.candidate) : left.result_id.localeCompare(right.result_id))[0]!;
  const tiedResultIds = [...new Set(bestCandidates.map((item) => item.result_id))].sort();
  const baselineEnergy = BigInt(baseline.energy);
  const record: LegacyLabsResearchRecord = {protocol: LEGACY_LABS_RESEARCH_RECORD_PROTOCOL, ruleset_id: task.ruleset_id, task_id: taskId, branch_id: task.branch_id, contribution_type: BigInt(bestEnergy) < baselineEnergy ? "frontier_improvement" : "search_coverage", result_id: selected.result_id, baseline_energy: baseline.energy, best_energy: String(bestEnergy), energy_delta: (baselineEnergy - BigInt(bestEnergy)).toString(), tied_result_ids: tiedResultIds, evaluated_candidates: 256, coverage_digest: labsContentId({protocol: "sai-labs-search-coverage/1", task_id: taskId, evaluations}), artifact_ids: [LEGACY_REFERENCE_SEARCH_METHOD_ARTIFACT_ID]};
  return {task: structuredClone(task), task_id: taskId, artifact: structuredClone(LEGACY_REFERENCE_SEARCH_METHOD_ARTIFACT), artifact_id: LEGACY_REFERENCE_SEARCH_METHOD_ARTIFACT_ID, record, record_id: labsContentId(record), candidate_sequence: selected.candidate, result: selected.result, result_id: selected.result_id};
}

type ExactSearchState = {bits: string[]; values: Int8Array; correlations: Int32Array; energy: bigint};

function initialExactSearchState(sequence: string): ExactSearchState {
  const bits = [...sequence];
  const values = Int8Array.from(bits, (bit) => bit === "1" ? 1 : -1);
  const correlations = new Int32Array(sequence.length);
  let energy = 0n;
  for (let shift = 1; shift < sequence.length; shift += 1) {
    let correlation = 0;
    for (let index = 0; index < sequence.length - shift; index += 1) correlation += values[index]! * values[index + shift]!;
    correlations[shift] = correlation;
    energy += BigInt(correlation) * BigInt(correlation);
  }
  return {bits, values, correlations, energy};
}

function flipExactSearchPosition(state: ExactSearchState, position: number): void {
  for (let shift = 1; shift < state.values.length; shift += 1) {
    let delta = 0;
    if (position + shift < state.values.length) delta -= 2 * state.values[position]! * state.values[position + shift]!;
    if (position - shift >= 0) delta -= 2 * state.values[position - shift]! * state.values[position]!;
    if (delta !== 0) {
      const previous = state.correlations[shift]!;
      state.energy += BigInt(2 * previous * delta + delta * delta);
      state.correlations[shift] = previous + delta;
    }
  }
  state.values[position] = -state.values[position]!;
  state.bits[position] = state.bits[position] === "0" ? "1" : "0";
}

function flipExactSearchPair(state: ExactSearchState, position: number): void {
  flipExactSearchPosition(state, position);
  const mirror = state.bits.length - 1 - position;
  if (mirror !== position) flipExactSearchPosition(state, mirror);
}

export function executeLabsResearchTask(ruleset: LabsRuleset, task: LabsResearchTask): LabsResearchExecution {
  const taskId = verifyLabsResearchTask(ruleset, task);
  const baseline = ruleset.baselines.find((item) => item.length === task.length)!;
  const evaluations = Array<{mask: number; result_id: string; energy: string}>(task.candidate_count);
  const state = initialExactSearchState(labsResearchCandidate(task, 0));
  const bestResultIds = new Set<string>();
  let bestEnergy: bigint | undefined;
  let selectedCandidate = "";
  let selectedResultId = "";
  let previousGrayMask = 0;
  for (let step = 0; step < task.candidate_count; step += 1) {
    const mask = step ^ (step >>> 1);
    if (step > 0) {
      const changed = mask ^ previousGrayMask;
      const bit = 31 - Math.clz32(changed);
      flipExactSearchPair(state, task.variable_positions[bit]!);
    }
    previousGrayMask = mask;
    const candidate = state.bits.join("");
    const energy = state.energy;
    const result: LabsResult = {protocol: LABS_RESULT_PROTOCOL, ruleset_id: task.ruleset_id, length: task.length, sequence: candidate, energy: energy.toString()};
    const resultId = labsContentId(result);
    evaluations[mask] = {mask, result_id: resultId, energy: energy.toString()};
    if (bestEnergy === undefined || energy < bestEnergy) {
      bestEnergy = energy;
      bestResultIds.clear();
      bestResultIds.add(resultId);
      selectedCandidate = candidate;
      selectedResultId = resultId;
    } else if (energy === bestEnergy) {
      bestResultIds.add(resultId);
      if (resultId < selectedResultId) { selectedCandidate = candidate; selectedResultId = resultId; }
    }
  }
  if (canonicalLabsSequence(selectedCandidate) !== selectedCandidate) throw new TypeError("LABS 研究分片没有保持唯一规范序列");
  const tiedResultIds = [...bestResultIds].sort();
  const baselineEnergy = BigInt(baseline.energy);
  if (bestEnergy === undefined) throw new TypeError("LABS 研究任务没有候选");
  const best = bestEnergy;
  const coverageDigest = labsContentId({protocol: "sai-labs-search-coverage/1", task_id: taskId, evaluations});
  const tiedResultDigest = labsContentId({protocol: "sai-labs-tied-result-set/1", task_id: taskId, result_ids: tiedResultIds});
  const materializedTies = tiedResultIds.slice(0, LABS_RESEARCH_MATERIALIZED_TIES);
  const result: LabsResult = {protocol: LABS_RESULT_PROTOCOL, ruleset_id: task.ruleset_id, length: task.length, sequence: selectedCandidate, energy: bestEnergy.toString()};
  if (labsContentId(result) !== selectedResultId) throw new TypeError("LABS 研究最佳结果摘要不一致");
  const record: LabsResearchRecord = {
    protocol: LABS_RESEARCH_RECORD_PROTOCOL,
    ruleset_id: task.ruleset_id,
    task_id: taskId,
    branch_id: task.branch_id,
    contribution_type: best < baselineEnergy ? "frontier_improvement" : "search_coverage",
    result_id: selectedResultId,
    baseline_energy: baseline.energy,
    best_energy: bestEnergy.toString(),
    energy_delta: (baselineEnergy - best).toString(),
    tied_result_ids: materializedTies,
    tied_result_count: tiedResultIds.length,
    tied_result_ids_complete: tiedResultIds.length <= LABS_RESEARCH_MATERIALIZED_TIES,
    tied_result_digest: tiedResultDigest,
    evaluated_candidates: LABS_RESEARCH_CANDIDATES_PER_UNIT,
    new_canonical_candidates: LABS_RESEARCH_CANDIDATES_PER_UNIT,
    coverage_partition_id: task.coverage_partition_id,
    coverage_digest: coverageDigest,
    reward_units: 1,
    artifact_ids: [REFERENCE_SEARCH_METHOD_ARTIFACT_ID],
  };
  assertLabsResearchRecord(record);
  return {
    task: structuredClone(task),
    task_id: taskId,
    artifact: structuredClone(REFERENCE_SEARCH_METHOD_ARTIFACT),
    artifact_id: REFERENCE_SEARCH_METHOD_ARTIFACT_ID,
    record,
    record_id: labsContentId(record),
    candidate_sequence: selectedCandidate,
    result,
    result_id: selectedResultId,
  };
}

export function verifyLabsResearchRecord(ruleset: LabsRuleset, task: AnyLabsResearchTask, record: AnyLabsResearchRecord, expectedId?: string): string {
  assertLabsResearchRecord(record);
  const expected = task.protocol === LEGACY_LABS_RESEARCH_TASK_PROTOCOL
    ? executeLegacyLabsResearchTask(ruleset, task)
    : executeLabsResearchTask(ruleset, task);
  if ((record.protocol === LEGACY_LABS_RESEARCH_RECORD_PROTOCOL) !== (task.protocol === LEGACY_LABS_RESEARCH_TASK_PROTOCOL)) throw new TypeError("LABS 研究记录与任务版本不匹配");
  if (labsCanonicalJson(expected.record) !== labsCanonicalJson(record)) throw new TypeError("LABS 研究记录与确定性搜索结果不匹配");
  const recordId = labsContentId(record);
  if (expectedId && recordId !== expectedId) throw new TypeError("LABS record_id 不匹配");
  return recordId;
}

const researchExecutionCache = new Map<string, LabsResearchExecution>();

export function executeLabsWorldResearch(ruleset: LabsRuleset, branch: LabsWorldBranch, challenge: LabsSettlementChallenge): LabsResearchExecution {
  assertLabsWorldBranch(branch);
  const expectedBranch = createLabsWorldBranch(ruleset, branch);
  if (labsCanonicalJson(expectedBranch) !== labsCanonicalJson(branch)) throw new TypeError("LABS 世界研究引用了错误分支");
  const key = `${rulesetId(ruleset)}:${branch.branch_id}:${challenge.economic_parent_id}:${challenge.claimant_agent_id}`;
  const cached = researchExecutionCache.get(key);
  if (cached) return structuredClone(cached);
  const {task} = createLabsResearchTask(ruleset, branch, challenge);
  const execution = executeLabsResearchTask(ruleset, task);
  researchExecutionCache.set(key, structuredClone(execution));
  if (researchExecutionCache.size > 32) researchExecutionCache.delete(researchExecutionCache.keys().next().value as string);
  return execution;
}

export function verifyLabsWorldSubmission(ruleset: LabsRuleset, branch: LabsWorldBranch, submission: {candidate_sequence: string; result: LabsResult; result_id: string; signed_claim: LabsSignedClaim; claim_id: string; research_task?: LabsResearchTask; task_id?: string; method_artifact?: LabsResearchArtifact; artifact_id?: string; research_record?: LabsResearchRecord; record_id?: string}, agentId: string, economicParentId: string): void {
  assertLabsWorldBranch(branch);
  const expected = createLabsWorldBranch(ruleset, branch);
  if (labsCanonicalJson(expected) !== labsCanonicalJson(branch)) throw new TypeError("LABS 世界分支与当前资源状态不匹配");
  const research = executeLabsWorldResearch(ruleset, branch, {economic_parent_id: economicParentId, claimant_agent_id: agentId});
  if (submission.candidate_sequence !== research.candidate_sequence) throw new TypeError("LABS 世界结算没有提交该分支完整搜索的确定性最佳候选");
  const created = createLabsResult(ruleset, submission.candidate_sequence);
  if (created.result_id !== submission.result_id || labsCanonicalJson(created.result) !== labsCanonicalJson(submission.result)) throw new TypeError("LABS 世界结算结果与候选序列不匹配");
  if (created.result_id !== research.result_id || labsCanonicalJson(created.result) !== labsCanonicalJson(research.result)) throw new TypeError("LABS 世界结算结果与研究记录不匹配");
  verifyLabsResult(ruleset, submission.result, submission.result_id);
  verifyLabsClaim(submission.signed_claim, submission.claim_id);
  const expectedClaimType: LabsClaimType = research.record.contribution_type === "frontier_improvement" ? "discovery" : "coverage";
  const requiredEvidence = [branch.branch_id, research.task_id, research.artifact_id, research.record_id];
  if (submission.signed_claim.claim.agent_id !== agentId || submission.signed_claim.claim.result_id !== submission.result_id || submission.signed_claim.claim.claim_type !== expectedClaimType || requiredEvidence.some((id) => !submission.signed_claim.claim.evidence_ids.includes(id))) throw new TypeError("LABS 世界结算声明没有绑定完整研究证据");
  if (submission.research_task && labsCanonicalJson(submission.research_task) !== labsCanonicalJson(research.task)) throw new TypeError("LABS 世界结算研究任务不匹配");
  if (submission.task_id && submission.task_id !== research.task_id) throw new TypeError("LABS 世界结算 task_id 不匹配");
  if (submission.method_artifact && labsCanonicalJson(submission.method_artifact) !== labsCanonicalJson(research.artifact)) throw new TypeError("LABS 世界结算方法制品不匹配");
  if (submission.artifact_id && submission.artifact_id !== research.artifact_id) throw new TypeError("LABS 世界结算 artifact_id 不匹配");
  if (submission.research_record && labsCanonicalJson(submission.research_record) !== labsCanonicalJson(research.record)) throw new TypeError("LABS 世界结算研究记录不匹配");
  if (submission.record_id && submission.record_id !== research.record_id) throw new TypeError("LABS 世界结算 record_id 不匹配");
}

function bitsFromHex(hex: string, length: number): string {
  const bits = [...hex].map((digit) => Number.parseInt(digit, 16).toString(2).padStart(4, "0")).join("");
  return bits.slice(-length);
}

const REFERENCE_SOURCE: LabsSource = {
  title: "Prioritizing Search Space Regions in the Low Autocorrelation Binary Sequences Problem",
  authors: ["Blaž Pšeničnik", "Borko Bošković", "Jan Popić", "Janez Brest"],
  publication: "arXiv:2607.09688 (2026)",
  url: "https://arxiv.org/abs/2607.09688",
};

function referenceBaseline(length: number, hex: string, energy: string): LabsBaseline {
  const sequence = canonicalLabsSequence(bitsFromHex(hex, length));
  return {length, sequence, energy, source: REFERENCE_SOURCE};
}

export const REFERENCE_RULESET: LabsRuleset = {
  protocol: LABS_RULESET_PROTOCOL,
  name: "SAI LABS Open Records 2026-08",
  summary: "Self-contained public LABS records for lengths 451, 518, and 573; lower exact energy advances an independently mergeable knowledge frontier.",
  objective: "minimize_aperiodic_autocorrelation_energy",
  sequence_alphabet: "binary_pm1",
  symmetry: "complement_reverse_alternating_group_8",
  energy_formula: "sum_k_1_to_L_minus_1(sum_i_1_to_L_minus_k(s_i*s_i_plus_k))^2",
  merit_factor_formula: "L^2/(2E)",
  max_object_bytes: LABS_MAX_OBJECT_BYTES,
  max_sequence_length: LABS_MAX_SEQUENCE_LENGTH,
  baselines: [
    referenceBaseline(451, "7ffffff8003ff03c3831ce6730c1fe0f187c3e133393e85ce798b1c9b9c93d9a6c85eb1b3316b4a592d6a94d3266c935b4b52ab555aaaaaaa", "12625"),
    referenceBaseline(518, "3ffffffe0003ff800fe03f81ec6363839878c6e4b4e5b25998f259934b0330f237234b30b0f399e34999e31e4f0e46c9699292726c5a952a54aa9552aaa5555555", "18463"),
    referenceBaseline(573, "1fffffffc0003ffc01fc07e1c99a136c3c330e64e485e72d9878c7e1276338c5a1e739273639365a1ec932763a56c9699c365e8e4e64b32d2c73a198da56ad5aad552aaad5555555", "22558"),
  ],
};

export const REFERENCE_RULESET_ID = rulesetId(REFERENCE_RULESET);

export * from "./methods.js";
export const REFERENCE_RESULTS = Object.fromEntries(REFERENCE_RULESET.baselines.map((baseline) => {
  const record = createLabsResult(REFERENCE_RULESET, baseline.sequence);
  return [String(baseline.length), record];
})) as Record<string, {result: LabsResult; result_id: string}>;
export const REFERENCE_FRONTIER = createInitialFrontier(REFERENCE_RULESET, REFERENCE_FORK_ID);
