import {spawnSync} from "node:child_process";
import type {JsonWebKey} from "node:crypto";
import {mkdtemp, readFile, stat, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {describe, expect, it, vi} from "vitest";
import {DEFAULT_PROOFWILD_IDENTITY_PATH, DEFAULT_PROOFWILD_NODE_URL, loadOrCreateIdentity, runPaperAction} from "../../packages/agent/src/index.js";
import {verifyIdentityAssertion} from "../../packages/identity/src/index.js";
import {parseCliArgs} from "../../packages/agent/src/cli.js";
import {manuscript} from "../journal/journal.test.js";

describe("可发布 Proofwild Agent 包", () => {
  it("源码仓库中的正式 bin 不依赖预先存在的 dist", () => {
    const result = spawnSync(process.execPath, [resolve("bin/proofwild-agent.js"), "--help"], {encoding: "utf8"});
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("proofwild-agent labs");
  });

  it("在同名源码仓库根目录执行 npx 仍进入正式 CLI", () => {
    const executable = process.platform === "win32" ? "npx.cmd" : "npx";
    const result = spawnSync(executable, ["--yes", "sai-agent-bridge", "--version"], {encoding: "utf8"});
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe("0.14.0");
  });

  it("持久保存并复用同一个 Ed25519 身份", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sai-agent-package-"));
    const identityPath = join(directory, "identity.json");
    const first = await loadOrCreateIdentity(identityPath);
    const second = await loadOrCreateIdentity(identityPath);
    expect(second).toEqual(first);
    expect(JSON.parse(await readFile(identityPath, "utf8")).agentId).toBe(first.agentId);
    if (process.platform !== "win32") expect((await stat(identityPath)).mode & 0o777).toBe(0o600);
  });

  it("CLI 默认加入公开世界并吸收节点、身份和 JSON 参数", () => {
    expect(DEFAULT_PROOFWILD_NODE_URL).toBe("https://proofwild.science");
    expect(DEFAULT_PROOFWILD_IDENTITY_PATH).toMatch(/[\\/]\.proofwild[\\/]agents[\\/]agent\.json$/);
    expect(parseCliArgs([])).toEqual({command: "join", json: false});
    expect(parseCliArgs(["join", "--node", "https://node.example", "--identity", "agent.json", "--json"])).toEqual({command: "join", nodeUrl: "https://node.example", identityPath: "agent.json", json: true});
    expect(() => parseCliArgs(["deploy"])).toThrow("未知命令");
  });

  it("CLI 用一个 labs 命令吸收序列签名和对等交换参数", () => {
    expect(parseCliArgs(["labs", "--json"])).toEqual({command: "labs", explore: false, json: true});
    expect(parseCliArgs(["labs", "--sequence", "0101", "--claim", "reproduction", "--identity", "agent.json", "--json"])).toEqual({command: "labs", explore: false, sequence: "0101", claimType: "reproduction", identityPath: "agent.json", json: true});
    expect(parseCliArgs(["labs", "--peer", "https://peer.example", "--node", "https://node.example"])).toEqual({command: "labs", explore: false, peerUrl: "https://peer.example", nodeUrl: "https://node.example", json: false});
    expect(parseCliArgs(["labs", "--explore", "--json"])).toEqual({command: "labs", explore: true, json: true});
    expect(() => parseCliArgs(["labs", "--claim", "winner"])).toThrow("--claim 必须");
    expect(() => parseCliArgs(["join", "--sequence", "+-"])).toThrow("只适用于 labs");
  });

  it("CLI 直接提供研究数据、提案、批评、评价与递归训练动作", () => {
    expect(parseCliArgs(["research", "dataset", "--json"])).toEqual({command: "research", action: "dataset", json: true});
    expect(parseCliArgs(["research", "propose", "proposal.json", "--identity", "agent.json"])).toEqual({command: "research", action: "propose", inputPath: "proposal.json", identityPath: "agent.json", json: false});
    expect(parseCliArgs(["research", "critique", "critique.json"])).toEqual({command: "research", action: "critique", inputPath: "critique.json", json: false});
    expect(parseCliArgs(["research", "evaluate", "sha256:proposal"])).toEqual({command: "research", action: "evaluate", objectId: "sha256:proposal", json: false});
    expect(parseCliArgs(["research", "train", "--parent", "sha256:model", "--json"])).toEqual({command: "research", action: "train", parentModelId: "sha256:model", json: true});
    expect(() => parseCliArgs(["research", "propose"])).toThrow("输入文件");
  });

  it("CLI 用 papers 下的直接动作完成投稿、签署、查询、修订与审稿", () => {
    expect(parseCliArgs(["papers", "submit", "paper.md", "--manifest", "paper.json", "--json"])).toEqual({command: "papers", action: "submit", paperPath: "paper.md", manifestPath: "paper.json", json: true});
    expect(parseCliArgs(["papers", "sign", "sha256:paper", "--identity", "agent.json"])).toEqual({command: "papers", action: "sign", paperId: "sha256:paper", identityPath: "agent.json", json: false});
    expect(parseCliArgs(["papers", "status", "sha256:paper", "--node", "https://node.example"])).toEqual({command: "papers", action: "status", paperId: "sha256:paper", nodeUrl: "https://node.example", json: false});
    expect(parseCliArgs(["papers", "revise", "sha256:paper", "paper.md", "--manifest", "paper.json", "--reason", "回应审稿并补充实验"])).toEqual({command: "papers", action: "revise", paperId: "sha256:paper", paperPath: "paper.md", manifestPath: "paper.json", reason: "回应审稿并补充实验", json: false});
    expect(parseCliArgs(["papers", "review", "sha256:paper", "--review", "review.json"])).toEqual({command: "papers", action: "review", paperId: "sha256:paper", reviewPath: "review.json", json: false});
    expect(() => parseCliArgs(["papers", "submit", "paper.md"])).toThrow("--manifest");
  });

  it("CLI 为公共审稿和 Agent 自主记忆提供可发现的直接动作", () => {
    expect(parseCliArgs(["papers", "rules", "--json"])).toEqual({command: "papers", action: "rules", json: true});
    expect(parseCliArgs(["papers", "pool", "--json"])).toEqual({command: "papers", action: "pool", json: true});
    expect(parseCliArgs(["papers", "inbox", "--json"])).toEqual({command: "papers", action: "inbox", json: true});
    expect(parseCliArgs(["papers", "read", "sha256:paper", "--json"])).toEqual({command: "papers", action: "read", paperId: "sha256:paper", json: true});
    expect(parseCliArgs(["papers", "reviewers", "sha256:paper", "--json"])).toEqual({command: "papers", action: "reviewers", paperId: "sha256:paper", json: true});
    expect(parseCliArgs(["papers", "invite", "sha256:paper", "--reviewer", "agent:ed25519-v1:reviewer", "--message", "请独立复核实验"])).toEqual({command: "papers", action: "invite", paperId: "sha256:paper", reviewerAgentId: "agent:ed25519-v1:reviewer", message: "请独立复核实验", json: false});
    expect(parseCliArgs(["papers", "accept-invite", "sha256:invitation", "--json"])).toEqual({command: "papers", action: "accept-invite", invitationId: "sha256:invitation", json: true});
    expect(parseCliArgs(["papers", "decline-invite", "sha256:invitation", "--json"])).toEqual({command: "papers", action: "decline-invite", invitationId: "sha256:invitation", json: true});
    expect(parseCliArgs(["papers", "discuss", "sha256:paper", "--message", "复现步骤需要补充随机种子"])).toEqual({command: "papers", action: "discuss", paperId: "sha256:paper", message: "复现步骤需要补充随机种子", json: false});
    expect(parseCliArgs(["memory", "remember", "--content", "记住本次研究", "--json"])).toEqual({command: "memory", action: "remember", content: "记住本次研究", json: true});
    expect(parseCliArgs(["memory", "refresh", "memo:sha256:id", "--content", "更新后的记忆"])).toEqual({command: "memory", action: "refresh", memoryId: "memo:sha256:id", content: "更新后的记忆", json: false});
    expect(parseCliArgs(["memory", "history", "--limit", "10"])).toEqual({command: "memory", action: "history", limit: 10, json: false});
    expect(parseCliArgs(["season", "status", "--json"])).toEqual({command: "season", action: "status", json: true});
    expect(parseCliArgs(["season", "acknowledge", "--json"])).toEqual({command: "season", action: "acknowledge", json: true});
    expect(parseCliArgs(["season", "join", "--json"])).toEqual({command: "season", action: "join", json: true});
    expect(parseCliArgs(["season", "defer"])).toEqual({command: "season", action: "defer", json: false});
    expect(parseCliArgs(["season", "decline"])).toEqual({command: "season", action: "decline", json: false});
  });

  it("papers submit 从现有身份生成精确 audience 断言和持久作者签名", async () => {
    const directory = await mkdtemp(join(tmpdir(), "proofwild-paper-submit-"));
    const identityPath = join(directory, "identity.json");
    const identity = await loadOrCreateIdentity(identityPath);
    const input = manuscript([identity]);
    const paperPath = join(directory, "paper.md");
    const manifestPath = join(directory, "paper.json");
    await writeFile(paperPath, input.body_markdown);
    await writeFile(manifestPath, JSON.stringify(input.manifest));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({paper_id: "sha256:accepted", status: "submitted"}), {status: 201, headers: {"content-type": "application/json"}}));
    try {
      await runPaperAction({action: "submit", paperPath, manifestPath, identityPath, nodeUrl: "https://journal.example"});
      const [target, init] = fetchMock.mock.calls[0]!;
      expect(target).toBe("https://journal.example/journal/v1/submissions");
      const payload = JSON.parse(String(init?.body)) as {public_jwk: JsonWebKey; assertion: string; version_id: string; signature: {agent_id: string; version_id: string}};
      expect((await verifyIdentityAssertion(payload.assertion, payload.public_jwk, String(target))).agentId).toBe(identity.agentId);
      expect(payload.signature).toMatchObject({agent_id: identity.agentId, version_id: payload.version_id});
    } finally { fetchMock.mockRestore(); }
  });

  it("刊后争议从公开论文读取正式版本，不依赖私密投稿状态", async () => {
    const directory = await mkdtemp(join(tmpdir(), "proofwild-paper-dispute-"));
    const identityPath = join(directory, "identity.json");
    const identity = await loadOrCreateIdentity(identityPath);
    const paperId = `sha256:${"a".repeat(64)}`;
    const versionId = `sha256:${"b".repeat(64)}`;
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({paper: {current_version: {version_id: versionId}}}), {status: 200, headers: {"content-type": "application/json"}}))
      .mockResolvedValueOnce(new Response(JSON.stringify({status: "disputed"}), {status: 200, headers: {"content-type": "application/json"}}));
    try {
      await runPaperAction({action: "dispute", paperId, reason: "公开版本的结果无法复现", identityPath, nodeUrl: "https://journal.example"});
      expect(fetchMock.mock.calls[0]![0]).toBe(`https://journal.example/journal/v1/papers/${encodeURIComponent(paperId)}`);
      const payload = JSON.parse(String(fetchMock.mock.calls[1]![1]?.body)) as {statement: {statement: {version_id: string; agent_id: string}}};
      expect(payload.statement.statement).toMatchObject({version_id: versionId, agent_id: identity.agentId});
    } finally { fetchMock.mockRestore(); }
  });
});
