import {
  CredentialsMethod,
  OpenFgaClient,
  type Tuple,
  type TupleKey,
  type UserConfigurationParams,
} from "@openfga/sdk";
import axios from "axios";
import type { ConnectionSettings, TupleReadResult } from "./types";

export const DEFAULT_API_URL = "http://localhost:8080";
export const TUPLE_PAGE_SIZE = 100;
export const MAX_TUPLES_TO_LOAD = 10_000;

export const DEFAULT_MODEL_DSL = `model
  schema 1.1

type user

type workspace
  relations
    define owner: [user]
    define member: [user]
    define can_view: member or owner
    define can_edit: owner

type document
  relations
    define parent: [workspace]
    define owner: [user]
    define writer: [user] or owner
    define reader: [user] or writer or can_view from parent
    define can_view: reader
    define can_edit: writer or can_edit from parent
`;

export function createOpenFgaClient(settings: ConnectionSettings): OpenFgaClient {
  const credentials: UserConfigurationParams["credentials"] =
    settings.authMode === "apiToken" && settings.apiToken.trim()
      ? {
          method: CredentialsMethod.ApiToken,
          config: { token: settings.apiToken.trim() },
        }
      : settings.authMode === "clientCredentials" && settings.clientId.trim() && settings.clientSecret
        ? {
            method: CredentialsMethod.ClientCredentials,
            config: {
              apiTokenIssuer: settings.apiTokenIssuer.trim(),
              apiAudience: settings.apiAudience.trim(),
              clientId: settings.clientId.trim(),
              clientSecret: settings.clientSecret,
            },
          }
        : undefined;

  return new OpenFgaClient(
    {
      apiUrl: settings.apiUrl.trim().replace(/\/$/, ""),
      storeId: settings.storeId || undefined,
      authorizationModelId: settings.modelId || undefined,
      credentials,
      retryParams: { maxRetry: 2, minWaitInMs: 200 },
    },
    axios.create({ timeout: 10_000 }),
  );
}

export async function readAllTuples(
  client: OpenFgaClient,
  maxTuples = MAX_TUPLES_TO_LOAD,
): Promise<TupleReadResult> {
  const tuples: Tuple[] = [];
  let continuationToken: string | undefined;

  do {
    const page = await client.read(
      {},
      {
        pageSize: Math.min(TUPLE_PAGE_SIZE, maxTuples - tuples.length),
        continuationToken,
      },
    );
    tuples.push(...page.tuples);
    continuationToken = page.continuation_token || undefined;
  } while (continuationToken && tuples.length < maxTuples);

  return { tuples, truncated: Boolean(continuationToken) };
}

export function getModelTypes(model?: { type_definitions?: Array<{ type: string }> }): string[] {
  return model?.type_definitions?.map(({ type }) => type) ?? [];
}

export function getRelationsForType(model: { type_definitions?: Array<{ type: string; relations?: Record<string, unknown> }> } | undefined, type: string): string[] {
  const definition = model?.type_definitions?.find((item) => item.type === type);
  return Object.keys(definition?.relations ?? {});
}

export function tupleKeyFromTuple(tuple: Tuple): TupleKey {
  return tuple.key;
}

export function relationCountByName(tuples: Tuple[]): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const tuple of tuples) {
    counts.set(tuple.key.relation, (counts.get(tuple.key.relation) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}
