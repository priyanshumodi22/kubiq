import { LogSourceDialog, logSourcePrimary, logSourceSecondary } from './LogSourceDialog';

export function LogSourceTypeDialog({ kubernetes, onVM, onKubernetes, onClose }: Readonly<{ kubernetes: boolean; onVM: () => void; onKubernetes: () => void; onClose: () => void }>) {
  return <LogSourceDialog title="Configure Log Sources" description="Choose the type of source to stream." onClose={onClose} actions={<>
    {kubernetes && <button type="button" onClick={onKubernetes} className={logSourceSecondary}>Kubernetes logs</button>}
    <button type="button" onClick={onVM} className={logSourcePrimary}>VM service logs</button>
  </>} />;
}
