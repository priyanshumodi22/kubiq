import { useEffect, useState } from 'react';
import * as yamlParser from 'js-yaml';
import { apiClient } from '../services/api';

export function useResourceYaml(resourceType: string | undefined, resourceName: string | undefined, namespace: string, enabled: boolean) {
    const [yaml, setYaml] = useState('');
    const [loadingYaml, setLoadingYaml] = useState(false);

    useEffect(() => {
        if (!resourceType || !enabled) return;
        if (!resourceName) {
            setYaml('Error: Could not determine resource name');
            setLoadingYaml(false);
            return;
        }
        let active = true;
        setLoadingYaml(true);
        const resourceNamespace = ['nodes', 'persistentvolumes', 'storageclasses'].includes(resourceType) ? '-' : namespace;
        apiClient.getKubernetesResourceYaml(resourceNamespace, resourceType, resourceName)
            .then(data => { if (active) setYaml(yamlParser.dump(data, { indent: 2, noRefs: true })); })
            .catch(error => { if (active) setYaml(`Error loading YAML: ${error.message}`); })
            .finally(() => { if (active) setLoadingYaml(false); });
        return () => { active = false; };
    }, [resourceType, resourceName, namespace, enabled]);

    return { yaml, loadingYaml };
}
