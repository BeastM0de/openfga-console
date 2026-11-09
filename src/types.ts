import type {
  AuthorizationModel,
  Store,
  Tuple,
  TupleKey,
  TypeDefinition,
} from "@openfga/sdk";

export type DashboardView = "overview" | "models" | "tuples" | "playground";
export type AuthMode = "none" | "apiToken" | "clientCredentials";

export interface ConnectionSettings {
  apiUrl: string;
  storeId: string;
  storeName: string;
  modelId: string;
  authMode: AuthMode;
  apiToken: string;
  apiTokenIssuer: string;
  apiAudience: string;
  clientId: string;
  clientSecret: string;
}

export type OpenFgaModel = Pick<AuthorizationModel, "id" | "schema_version" | "type_definitions" | "conditions">;
export type OpenFgaTypeDefinition = TypeDefinition;
export type RelationshipTuple = Tuple;
export type RelationshipTupleKey = TupleKey;
export type OpenFgaStore = Store;

export interface CheckEvent {
  id: string;
  allowed: boolean;
  user: string;
  relation: string;
  object: string;
  durationMs: number;
  createdAt: number;
}

export interface TupleReadResult {
  tuples: RelationshipTuple[];
  truncated: boolean;
}

export interface PermissionResult {
  allowed: boolean;
  latency: number;
  checkedAt: number;
}
