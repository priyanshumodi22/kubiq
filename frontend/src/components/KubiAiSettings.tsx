import { useEffect, useState, useCallback } from 'react';
import { apiErrorMessage } from '../utils/apiErrorMessage';
import { CheckCircle2, KeyRound, Loader2, Save, ShieldCheck } from 'lucide-react';
import { apiClient } from '../services/api';
import { useToast } from '../contexts/ToastContext';
import { AiStatusOrb } from './AiStatusOrb';
import { CustomSelect } from './CustomSelect';
import { KubiAvatar } from './KubiAvatar';

type Provider = 'gemini' | 'openai' | 'anthropic';
const suggestedModels: Record<Provider, string> = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-latest',
};

export function KubiAiSettings() {
  const { success, error } = useToast();
  const [provider, setProvider] = useState<Provider>('gemini');
  const [model, setModel] = useState(suggestedModels.gemini);
  const [apiKey, setApiKey] = useState('');
  const [configured, setConfigured] = useState(false);
  const [managed, setManaged] = useState(false);
  const [encryptionReady, setEncryptionReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    try {
      const config = await apiClient.getKubiAiConfiguration();
      if (config.provider) setProvider(config.provider);
      if (config.model) setModel(config.model);
      setConfigured(config.configured);
      setManaged(config.managedInKubiq);
      setEncryptionReady(config.encryptionReady);
    } catch {
      error('Could not load kubi AI settings.');
    } finally {
      setLoading(false);
    }
  }, [error]);

  useEffect(() => { void load(); }, [load]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const config = await apiClient.saveKubiAiConfiguration({
        provider,
        model,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      });
      setConfigured(config.configured);
      setManaged(config.managedInKubiq);
      setApiKey('');
      success('kubi AI configuration saved. The API key is encrypted and will not be shown again.');
    } catch (err) {
      error(apiErrorMessage(err, 'Could not save kubi AI settings.'));
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const result = await apiClient.testKubiAiConfiguration();
      if (result.ok) success('Provider test succeeded.');
      else error('Provider test failed.');
    } catch (err) {
      error(apiErrorMessage(err, 'Provider test failed.'));
    } finally {
      setTesting(false);
    }
  };

  if (loading)
    return (
      <div className="py-16 text-text-dim flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading kubi AI settings…
      </div>
    );
  return (
    <div className="animate-scale-up grid max-w-3xl gap-6">
      <div className="flex items-start gap-4">
        <KubiAvatar state="idle" size={48} />
        <div>
          <h2 className="text-2xl font-bold">kubi AI</h2>
          <p className="mt-1 text-sm text-text-dim">
            One secure provider configuration for every kubiq Pro user.
          </p>
        </div>
      </div>
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/4 p-5 text-sm leading-6 text-text-dim flex gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
        <span>
          Provider keys are write-only and encrypted at rest. Regular users cannot view or change
          this configuration.
        </span>
      </div>
      {!encryptionReady && (
        <div className="rounded-2xl border border-amber-400/25 bg-amber-400/6 p-5 text-sm leading-6 text-amber-100">
          Secure configuration is not initialized yet. Your deployment administrator must set the
          kubi encryption key in the runtime Secret.
        </div>
      )}
      <form
        onSubmit={save}
        className="grid gap-6 rounded-3xl border border-white/10 bg-black/15 p-6 shadow-inner shadow-black/10"
      >
        <label className="block text-sm font-medium text-text-dim">
          Provider
          <CustomSelect
            label="Provider"
            value={provider}
            onChange={(value) => {
              setProvider(value);
              setModel(suggestedModels[value]);
            }}
            options={[
              { value: 'gemini', label: 'Google Gemini' },
              { value: 'openai', label: 'OpenAI' },
              { value: 'anthropic', label: 'Anthropic' },
            ]}
          />
        </label>
        <label className="block text-sm font-medium text-text-dim">
          Model identifier{' '}
          <input
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder={suggestedModels[provider]}
            className="mt-2 w-full rounded-xl border border-white/10 bg-bg-surface px-3 py-3 text-text"
            required
            maxLength={128}
          />
        </label>
        <label className="block text-sm font-medium text-text-dim">
          {configured ? 'Replace API key (optional)' : 'API key'}
          <div className="relative mt-2">
            <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={
                configured ? 'Leave empty to keep the current key' : 'Paste the provider key'
              }
              className="w-full rounded-xl border border-white/10 bg-bg-surface py-3 pl-10 pr-3 text-text"
              autoComplete="off"
              required={!configured}
            />
          </div>
        </label>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={test}
            disabled={!configured || testing}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm disabled:opacity-50"
          >
            <AiStatusOrb activity={testing ? 'working' : 'diagnosing'} size={18} />
            {testing ? 'Testing…' : 'Test provider'}
          </button>
          <button
            type="submit"
            disabled={saving || !encryptionReady}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save kubi AI
          </button>
        </div>
      </form>
      {configured && (
        <p className="flex items-center gap-2 text-xs text-emerald-300">
          <CheckCircle2 className="h-4 w-4" />{' '}
          {managed ? 'Managed securely in kubiq.' : 'Using deployment bootstrap configuration.'}
        </p>
      )}
    </div>
  );
}
