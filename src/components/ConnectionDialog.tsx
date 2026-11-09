import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, CircleHelp, KeyRound, LoaderCircle, LockKeyhole, Server } from "lucide-react";
import { toast } from "sonner";
import { createOpenFgaClient, DEFAULT_API_URL } from "../fga";
import { useConnection } from "../ConnectionContext";
import type { AuthMode, ConnectionSettings } from "../types";
import { Modal } from "./Modal";

interface ConnectionDialogProps {
  open: boolean;
  onClose: () => void;
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Could not reach the OpenFGA API. Check the URL, credentials, and server CORS settings.";
}

export function ConnectionDialog({ open, onClose }: ConnectionDialogProps) {
  const { settings, updateSettings } = useConnection();
  const queryClient = useQueryClient();
  const [apiUrl, setApiUrl] = useState(settings.apiUrl || DEFAULT_API_URL);
  const [authMode, setAuthMode] = useState<AuthMode>(settings.authMode);
  const [apiToken, setApiToken] = useState(settings.apiToken);
  const [apiTokenIssuer, setApiTokenIssuer] = useState(settings.apiTokenIssuer);
  const [apiAudience, setApiAudience] = useState(settings.apiAudience);
  const [clientId, setClientId] = useState(settings.clientId);
  const [clientSecret, setClientSecret] = useState(settings.clientSecret);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setApiUrl(settings.apiUrl || DEFAULT_API_URL);
    setAuthMode(settings.authMode);
    setApiToken(settings.apiToken);
    setApiTokenIssuer(settings.apiTokenIssuer);
    setApiAudience(settings.apiAudience);
    setClientId(settings.clientId);
    setClientSecret(settings.clientSecret);
  }, [open, settings.apiUrl, settings.authMode, settings.apiToken, settings.apiTokenIssuer, settings.apiAudience, settings.clientId, settings.clientSecret]);

  function makeDraft(): ConnectionSettings {
    const sameServer = apiUrl.trim().replace(/\/$/, "") === settings.apiUrl.trim().replace(/\/$/, "");
    return {
      ...settings,
      apiUrl: apiUrl.trim().replace(/\/$/, ""),
      storeId: sameServer ? settings.storeId : "",
      storeName: sameServer ? settings.storeName : "",
      modelId: sameServer ? settings.modelId : "",
      authMode,
      apiToken,
      apiTokenIssuer,
      apiAudience,
      clientId,
      clientSecret,
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsTesting(true);
    try {
      const draft = makeDraft();
      const client = createOpenFgaClient(draft);
      await client.listStores({ pageSize: 1 });
      updateSettings(draft);
      await queryClient.invalidateQueries({ queryKey: ["stores"] });
      toast.success("OpenFGA connection verified", { description: draft.apiUrl });
      onClose();
    } catch (error) {
      toast.error("Connection failed", { description: errorText(error) });
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <Modal
      description="Connect this console to an OpenFGA API. Store and model IDs are selected separately."
      onClose={onClose}
      open={open}
      size="wide"
      title="Connection settings"
    >
      <form className="modal-form" onSubmit={handleSubmit}>
        <label className="field-label" htmlFor="api-url">OpenFGA API URL</label>
        <div className="input-with-icon">
          <Server aria-hidden size={17} />
          <input
            autoComplete="url"
            id="api-url"
            onChange={(event) => setApiUrl(event.target.value)}
            placeholder="http://localhost:8080"
            required
            type="url"
            value={apiUrl}
          />
        </div>
        <p className="field-hint">Use the HTTP API origin (not the gRPC port). Browser connections require CORS to allow this console origin.</p>

        <div className="field-label-row">
          <label className="field-label" htmlFor="auth-mode">API authentication</label>
          <span className="field-caption">Optional for local OpenFGA</span>
        </div>
        <select id="auth-mode" onChange={(event) => setAuthMode(event.target.value as AuthMode)} value={authMode}>
          <option value="none">No credentials</option>
          <option value="apiToken">Preshared API token</option>
          <option value="clientCredentials">OAuth2 client credentials</option>
        </select>

        {authMode === "apiToken" && (
          <div className="field-stack">
            <label className="field-label" htmlFor="api-token">Bearer token</label>
            <div className="input-with-icon">
              <KeyRound aria-hidden size={17} />
              <input
                autoComplete="off"
                id="api-token"
                onChange={(event) => setApiToken(event.target.value)}
                placeholder="OpenFGA preshared key"
                type="password"
                value={apiToken}
              />
            </div>
          </div>
        )}

        {authMode === "clientCredentials" && (
          <div className="credentials-grid">
            <div className="field-stack full-span">
              <label className="field-label" htmlFor="token-issuer">Token endpoint / issuer</label>
              <input id="token-issuer" onChange={(event) => setApiTokenIssuer(event.target.value)} placeholder="https://identity.example.com/oauth/token" required value={apiTokenIssuer} />
            </div>
            <div className="field-stack">
              <label className="field-label" htmlFor="token-audience">API audience</label>
              <input id="token-audience" onChange={(event) => setApiAudience(event.target.value)} placeholder="openfga" value={apiAudience} />
            </div>
            <div className="field-stack">
              <label className="field-label" htmlFor="client-id">Client ID</label>
              <input id="client-id" onChange={(event) => setClientId(event.target.value)} required value={clientId} />
            </div>
            <div className="field-stack full-span">
              <label className="field-label" htmlFor="client-secret">Client secret</label>
              <input autoComplete="new-password" id="client-secret" onChange={(event) => setClientSecret(event.target.value)} required type="password" value={clientSecret} />
            </div>
          </div>
        )}

        {authMode !== "none" && (
          <div className="security-note">
            <AlertTriangle aria-hidden size={17} />
            <span>Credentials stay in memory and are cleared on refresh. A browser SPA cannot protect confidential client secrets from users or injected scripts; use a trusted backend proxy for production.</span>
          </div>
        )}

        <div className="security-note muted-note">
          <LockKeyhole aria-hidden size={16} />
          <span>Only the API URL, store ID, and model ID are persisted in this browser. Tokens and secrets are never written to localStorage.</span>
          <CircleHelp aria-hidden className="note-help" size={15} />
        </div>

        <div className="modal-actions">
          <button className="button button-secondary" onClick={onClose} type="button">Cancel</button>
          <button className="button button-primary" disabled={isTesting} type="submit">
            {isTesting ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}
            {isTesting ? "Testing connection…" : "Test & connect"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
