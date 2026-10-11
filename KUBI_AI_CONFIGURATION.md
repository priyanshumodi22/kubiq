# Kubi AI configuration

Kubi is configured once per kubiq installation by a user with the `kubiq-admin` role. Regular kubiq Pro users never enter, see, or retrieve a provider API key.

## Administrator flow

1. Generate a base64-encoded, 32-byte encryption key and set it as `KUBI_AI_CONFIG_ENCRYPTION_KEY` in the `kubiq-runtime` Kubernetes Secret.
2. Sign in as `kubiq-admin` and open **Profile > Kubi AI**.
3. Select Gemini, OpenAI, or Anthropic; enter the exact provider model ID; paste the provider API key; save.
4. Use **Test provider** to verify the selected provider has usable quota or credits.

The API key is encrypted with AES-256-GCM before it is stored. The configuration API is write-only for keys and never returns a key to the browser.

## Bootstrap configuration

Self-hosted deployments can set `AI_PROVIDER`, `AI_MODEL`, and `AI_API_KEY` as an explicit bootstrap fallback. All three are required; kubiq does not silently choose a provider or model. Once an administrator saves Kubi AI settings, the encrypted installation configuration takes precedence.

## Capacity

Provider quotas and billing are owned by the selected provider. A provider test that reports quota or credits means the administrator must wait for the limit to reset or add provider billing/credits; changing a model does not guarantee free capacity.
