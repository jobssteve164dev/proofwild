import {LABS_MAX_OBJECT_BYTES, REFERENCE_FORK_ID, REFERENCE_RULESET_ID} from "./index.js";
import {LabsRepository, type LabsExchangeBundle, type LabsObjectKind, type LabsObjectValue} from "./store.js";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "cache-control": "no-store",
};

function json(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), {status, headers: {"content-type": "application/json; charset=utf-8", ...CORS, ...headers}});
}

async function boundedJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > LABS_MAX_OBJECT_BYTES) throw new RangeError("LABS 请求超过固定大小上限");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > LABS_MAX_OBJECT_BYTES) throw new RangeError("LABS 请求超过固定大小上限");
  return JSON.parse(raw) as unknown;
}

function components(pathname: string): string[] {
  return pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function registryCsv(entries: Awaited<ReturnType<LabsRepository["registry"]>>["entries"]): string {
  const header = ["result_id", "status", "length", "energy", "merit_factor", "baseline_energy", "energy_delta", "research_records", "contribution_grade_records", "verified_new_canonical_candidates", "coverage_contributors", "discovery_claims", "reproduction_claimants", "relay_claims"];
  const rows = entries.map((entry) => {
    const contributionRecords = entry.research.map(({record}) => record).filter((record) => record.protocol === "sai-labs-research-record/2");
    const candidates = contributionRecords.reduce((sum, record) => sum + BigInt(record.new_canonical_candidates), 0n).toString();
    return [entry.result_id, entry.status, entry.result.length, entry.result.energy, entry.merit_factor.decimal, entry.baseline_energy, entry.energy_delta, entry.research.length, contributionRecords.length, candidates, entry.coverage_contributors, entry.discovery_claims, entry.reproduction_claimants, entry.relay_claims];
  });
  return `${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function resultCitation(entry: NonNullable<Awaited<ReturnType<LabsRepository["registryEntry"]>>>): string {
  const key = `sai_labs_${entry.result_id.slice("sha256:".length, "sha256:".length + 12)}`;
  const authors = entry.source?.authors.join(" and ") ?? "{Proofwild LABS autonomous contributors}";
  const title = `LABS sequence of length ${entry.result.length} with exact energy ${entry.result.energy}`;
  return `@misc{${key},\n  title = {${title}},\n  author = {${authors}},\n  year = {2026},\n  howpublished = {\\url{https://proofwild.science/research/${entry.result_id}}},\n  note = {Content-addressed result ${entry.result_id}; exact merit factor ${entry.merit_factor.numerator}/${entry.merit_factor.denominator}}\n}\n`;
}

export async function handleLabsRequest(request: Request, repository: LabsRepository, testVectors?: unknown): Promise<Response | undefined> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/labs/v1")) return undefined;
  try {
    if (request.method === "OPTIONS") return new Response(null, {status: 204, headers: CORS});
    const parts = components(url.pathname);
    if (parts.length === 2 && request.method === "GET") {
      const frontier = await repository.frontier();
      return json({
        protocol: "sai-labs-discovery/1",
        role: "cache-index-forwarder",
        authority: false,
        reference_ruleset_id: REFERENCE_RULESET_ID,
        world_fork_id: REFERENCE_FORK_ID,
        ruleset_url: `/labs/v1/rulesets/${REFERENCE_RULESET_ID}`,
        frontier_url: `/labs/v1/frontiers/${REFERENCE_RULESET_ID}/${REFERENCE_FORK_ID}`,
        exchange_url: `/labs/v1/exchange/${REFERENCE_RULESET_ID}/${REFERENCE_FORK_ID}`,
        registry_url: "/labs/v1/registry",
        registry_csv_url: "/labs/v1/registry.csv",
        methods_url: "/labs/v1/methods",
        test_vectors_url: "/labs/v1/test-vectors",
        human_registry_url: "/research",
        frontier,
      });
    }
    if (parts[2] === "methods" && parts.length === 3 && request.method === "GET") return json({
      protocol: "proofwild-labs-method-discovery/1",
      authority: false,
      proposal_url: "/labs/v1/methods/proposals",
      critique_url: "/labs/v1/methods/critiques",
      evaluation_url: "/labs/v1/methods/evaluations",
      model_url: "/labs/v1/methods/models",
      dataset_url: "/labs/v1/methods/dataset",
      task_source: "/labs/v1/methods/dataset#tasks",
      object_url_template: "/labs/v1/methods/objects/{id}",
      schema_urls: [
        "/spec/labs/7.0.0/method-proposal.schema.json",
        "/spec/labs/7.0.0/method-critique.schema.json",
        "/spec/labs/7.0.0/method-evaluation.schema.json",
        "/spec/labs/7.0.0/research-policy-model.schema.json",
      ],
    });
    if (parts[2] === "methods" && parts[3] === "dataset" && parts.length === 4 && request.method === "GET") {
      const limit = url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : undefined;
      return json(await repository.methodDataset(url.searchParams.get("cursor"), limit ?? 32));
    }
    if (parts[2] === "methods" && parts[3] === "objects" && parts[4] && parts.length === 5 && request.method === "GET") {
      const object = await repository.object(parts[4]);
      if (!object || !["method_proposal", "method_critique", "method_evaluation", "research_model"].includes(object.kind)) return json({error: "not_found"}, 404);
      return json({id: parts[4], ...object}, 200, {etag: `"${parts[4]}"`, "cache-control": "public, max-age=31536000, immutable"});
    }
    if (parts[2] === "methods" && parts[3] && parts.length === 4 && request.method === "POST") {
      const kindByPath: Record<string, LabsObjectKind | undefined> = {proposals: "method_proposal", critiques: "method_critique", evaluations: "method_evaluation", models: "research_model"};
      const kind = kindByPath[parts[3]];
      const body = await boundedJson(request) as {id?: string; value?: LabsObjectValue};
      if (!kind || !body.value || Object.keys(body).some((key) => key !== "id" && key !== "value")) return json({error: "invalid_request"}, 400);
      const id = await repository.ingest(kind, body.value, body.id);
      return json({status: "stored", id}, 201, {location: `/labs/v1/methods/objects/${id}`});
    }
    if (parts[2] === "test-vectors" && parts.length === 3 && request.method === "GET") return testVectors ? json(testVectors, 200, {"cache-control": "public, max-age=31536000, immutable"}) : json({error: "not_found"}, 404);
    if (parts[2] === "rulesets" && parts[3] && parts.length === 4 && request.method === "GET") return json({ruleset_id: parts[3], ruleset: await repository.ruleset(parts[3])}, 200, {etag: `"${parts[3]}"`, "cache-control": "public, max-age=31536000, immutable"});
    if (parts[2] === "objects" && parts[3] && parts.length === 4 && request.method === "GET") {
      const object = await repository.object(parts[3]);
      return object ? json({id: parts[3], ...object}, 200, {etag: `"${parts[3]}"`, "cache-control": "public, max-age=31536000, immutable"}) : json({error: "not_found"}, 404);
    }
    if (parts[2] === "objects" && parts.length === 3 && request.method === "POST") {
      const body = await boundedJson(request) as {id?: string; kind?: LabsObjectKind; value?: LabsObjectValue; fork_id?: string};
      if (!body.kind || !body.value || !["ruleset", "result", "artifact", "task", "record", "claim"].includes(body.kind)) return json({error: "invalid_request"}, 400);
      const id = await repository.ingest(body.kind, body.value, body.id, body.fork_id ?? REFERENCE_FORK_ID);
      return json({status: "stored", id}, 201);
    }
    if (parts[2] === "registry" && parts.length === 3 && request.method === "GET") return json(await repository.registry());
    if (parts[2] === "registry.csv" && parts.length === 3 && request.method === "GET") return new Response(registryCsv((await repository.registry()).entries), {headers: {...CORS, "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="sai-labs-research-registry.csv"'}});
    if (parts[2] === "results" && parts[3] && parts.length >= 4 && request.method === "GET") {
      const entry = await repository.registryEntry(parts[3]);
      if (!entry) return json({error: "not_found"}, 404);
      if (parts.length === 4) return json({protocol: "sai-labs-result-detail/1", authority: false, entry});
      if (parts.length === 5 && parts[4] === "bundle") return json({protocol: "sai-labs-reproducibility-bundle/1", authority: false, result_id: entry.result_id, entry}, 200, {"content-disposition": `attachment; filename="sai-labs-${entry.result_id.slice(7, 19)}.json"`});
      if (parts.length === 5 && parts[4] === "citation.bib") return new Response(resultCitation(entry), {headers: {...CORS, "content-type": "application/x-bibtex; charset=utf-8", "content-disposition": `attachment; filename="sai-labs-${entry.result_id.slice(7, 19)}.bib"`}});
      if (parts.length === 5 && parts[4] === "sequence.txt") return new Response(`${entry.result.sequence}\n`, {headers: {...CORS, "content-type": "text/plain; charset=utf-8", "content-disposition": `attachment; filename="sai-labs-L${entry.result.length}-E${entry.result.energy}.txt"`}});
      return json({error: "not_found"}, 404);
    }
    if (parts[2] === "frontiers" && parts[3] && parts[4] && parts.length === 5 && request.method === "GET") return json({frontier: await repository.frontier(parts[3], parts[4])});
    if (parts[2] === "exchange" && parts[3] && parts[4] && parts.length === 5 && request.method === "GET") return json(await repository.bundle(parts[3], parts[4], url.searchParams.get("cursor")));
    if (parts[2] === "exchange" && parts.length === 3 && request.method === "POST") {
      const bundle = await boundedJson(request) as LabsExchangeBundle;
      await repository.importBundle(bundle);
      return json({status: "merged", frontier: await repository.frontier(bundle.ruleset_id, bundle.fork_id)});
    }
    return json({error: "not_found"}, 404);
  } catch (error) {
    return json({error: "invalid_labs_object", error_description: error instanceof Error ? error.message : "LABS request failed"}, error instanceof RangeError ? 413 : 400);
  }
}
