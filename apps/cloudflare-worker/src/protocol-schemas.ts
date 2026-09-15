import claimSchema from "../../../spec/labs/1.0.0/claim.schema.json" with {type: "json"};
import frontierSchema from "../../../spec/labs/1.0.0/frontier.schema.json" with {type: "json"};
import resultSchema from "../../../spec/labs/1.0.0/result.schema.json" with {type: "json"};
import rulesetSchema from "../../../spec/labs/2.0.0/ruleset.schema.json" with {type: "json"};
import previousWorldBranchSchema from "../../../spec/labs/4.0.0/world-branch.schema.json" with {type: "json"};
import artifactSchema from "../../../spec/labs/5.0.0/artifact.schema.json" with {type: "json"};
import previousResearchTaskSchema from "../../../spec/labs/5.0.0/research-task.schema.json" with {type: "json"};
import previousResearchRecordSchema from "../../../spec/labs/5.0.0/research-record.schema.json" with {type: "json"};
import worldBranchSchema from "../../../spec/labs/6.0.0/world-branch.schema.json" with {type: "json"};
import researchTaskSchema from "../../../spec/labs/6.0.0/research-task.schema.json" with {type: "json"};
import researchRecordSchema from "../../../spec/labs/6.0.0/research-record.schema.json" with {type: "json"};
import methodProposalSchema from "../../../spec/labs/7.0.0/method-proposal.schema.json" with {type: "json"};
import methodCritiqueSchema from "../../../spec/labs/7.0.0/method-critique.schema.json" with {type: "json"};
import methodEvaluationSchema from "../../../spec/labs/7.0.0/method-evaluation.schema.json" with {type: "json"};
import researchPolicyModelSchema from "../../../spec/labs/7.0.0/research-policy-model.schema.json" with {type: "json"};
import previousSupplyBlockSchema from "../../../spec/sai/0.4.0/world-supply-block.schema.json" with {type: "json"};
import previousSupplyScheduleSchema from "../../../spec/sai/0.4.0/world-supply-schedule.schema.json" with {type: "json"};
import previousSupplyStateSchema from "../../../spec/sai/0.4.0/world-supply-state.schema.json" with {type: "json"};
import supplyBlockSchema from "../../../spec/sai/0.5.0/world-supply-block.schema.json" with {type: "json"};
import supplyScheduleSchema from "../../../spec/sai/0.5.0/world-supply-schedule.schema.json" with {type: "json"};
import supplyStateSchema from "../../../spec/sai/0.5.0/world-supply-state.schema.json" with {type: "json"};
import journalManifestSchema from "../../../spec/journal/1.0.0/manifest.schema.json" with {type: "json"};
import journalVersionSchema from "../../../spec/journal/1.0.0/version.schema.json" with {type: "json"};
import journalAuthorSignatureSchema from "../../../spec/journal/1.0.0/author-signature.schema.json" with {type: "json"};
import journalSignedReviewSchema from "../../../spec/journal/1.0.0/signed-review.schema.json" with {type: "json"};
import journalSignedDecisionSchema from "../../../spec/journal/1.0.0/signed-decision.schema.json" with {type: "json"};
import journalSignedStatementSchema from "../../../spec/journal/1.0.0/signed-statement.schema.json" with {type: "json"};
import seasonManifestSchema from "../../../spec/season/1.0.0/manifest.schema.json" with {type: "json"};

const PROTOCOL_SCHEMAS: Record<string, unknown> = {
  "/spec/season/1.0.0/manifest.schema.json": seasonManifestSchema,
  "/spec/journal/1.0.0/manifest.schema.json": journalManifestSchema,
  "/spec/journal/1.0.0/version.schema.json": journalVersionSchema,
  "/spec/journal/1.0.0/author-signature.schema.json": journalAuthorSignatureSchema,
  "/spec/journal/1.0.0/signed-review.schema.json": journalSignedReviewSchema,
  "/spec/journal/1.0.0/signed-decision.schema.json": journalSignedDecisionSchema,
  "/spec/journal/1.0.0/signed-statement.schema.json": journalSignedStatementSchema,
  "/spec/labs/1.0.0/result.schema.json": resultSchema,
  "/spec/labs/1.0.0/claim.schema.json": claimSchema,
  "/spec/labs/1.0.0/frontier.schema.json": frontierSchema,
  "/spec/labs/2.0.0/ruleset.schema.json": rulesetSchema,
  "/spec/labs/4.0.0/world-branch.schema.json": previousWorldBranchSchema,
  "/spec/labs/5.0.0/artifact.schema.json": artifactSchema,
  "/spec/labs/5.0.0/research-task.schema.json": previousResearchTaskSchema,
  "/spec/labs/5.0.0/research-record.schema.json": previousResearchRecordSchema,
  "/spec/labs/6.0.0/world-branch.schema.json": worldBranchSchema,
  "/spec/labs/6.0.0/research-task.schema.json": researchTaskSchema,
  "/spec/labs/6.0.0/research-record.schema.json": researchRecordSchema,
  "/spec/labs/7.0.0/method-proposal.schema.json": methodProposalSchema,
  "/spec/labs/7.0.0/method-critique.schema.json": methodCritiqueSchema,
  "/spec/labs/7.0.0/method-evaluation.schema.json": methodEvaluationSchema,
  "/spec/labs/7.0.0/research-policy-model.schema.json": researchPolicyModelSchema,
  "/spec/sai/0.4.0/world-supply-schedule.schema.json": previousSupplyScheduleSchema,
  "/spec/sai/0.4.0/world-supply-block.schema.json": previousSupplyBlockSchema,
  "/spec/sai/0.4.0/world-supply-state.schema.json": previousSupplyStateSchema,
  "/spec/sai/0.5.0/world-supply-schedule.schema.json": supplyScheduleSchema,
  "/spec/sai/0.5.0/world-supply-block.schema.json": supplyBlockSchema,
  "/spec/sai/0.5.0/world-supply-state.schema.json": supplyStateSchema,
};

export const PROTOCOL_SCHEMA_PATHS = Object.freeze(Object.keys(PROTOCOL_SCHEMAS));

export function protocolSchemaResponse(pathname: string, method = "GET"): Response | undefined {
  const schema = PROTOCOL_SCHEMAS[pathname];
  if (!schema) return undefined;
  if (method !== "GET" && method !== "HEAD") return new Response(JSON.stringify({error: "method_not_allowed"}), {status: 405, headers: {allow: "GET, HEAD", "content-type": "application/json; charset=utf-8"}});
  return new Response(method === "HEAD" ? null : JSON.stringify(schema), {headers: {
    "content-type": "application/schema+json; charset=utf-8",
    "cache-control": "public, max-age=31536000, immutable",
    "access-control-allow-origin": "*",
    "x-content-type-options": "nosniff",
  }});
}
