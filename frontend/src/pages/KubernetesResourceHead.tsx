type Column = { label: string; align: 'left' | 'center' | 'right'; sortKey?: string };
const left = (...labels: string[]): Column[] => labels.map(label => ({ label, align: 'left' }));
const columns: Record<string, Column[]> = {
  pods: [
    ...left('Ready', 'Status'),
    { label: 'CPU', align: 'center' }, { label: 'RAM', align: 'center' },
    { label: 'Restarts', align: 'center', sortKey: 'restarts' }, { label: 'Age', align: 'center', sortKey: 'age' },
  ],
  deployments: [{ label: 'Desired', align: 'center' }, { label: 'Ready', align: 'center' }, ...left('Status')],
  services: left('Type', 'Ports'), endpoints: left('Endpoints'), ingresses: left('Class', 'Hosts'),
  persistentvolumes: left('Capacity', 'Status', 'Claim'), persistentvolumeclaims: left('Status', 'Volume', 'Capacity'),
  storageclasses: left('Provisioner', 'Binding Mode'), configmaps: left('Keys'), secrets: left('Type', 'Keys'),
  nodes: left('Status', 'Roles', 'Version'), events: [],
};
type Sort = { key: string; asc: boolean } | null;
const alignment = { left: 'text-left', center: 'text-center', right: 'text-right' };

function Heading({ column, sort, onSort }: Readonly<{ column: Column; sort: Sort; onSort: (key: string) => void }>) {
  if (!column.sortKey) return <th className={`${alignment[column.align]} px-4 py-3 font-medium`}>{column.label}</th>;
  const key = column.sortKey;
  return <th className={`${alignment[column.align]} px-4 py-3 font-medium cursor-pointer hover:text-white`}>
    <button type="button" onClick={() => onSort(key)} className={`w-full ${alignment[column.align]} focus-visible:outline focus-visible:outline-primary`}>
      {column.label}{' '}{sort?.key === key && (sort.asc ? '↑' : '↓')}
    </button>
  </th>;
}

export function KubernetesResourceHead({ resource, sort, onSort }: Readonly<{ resource: string; sort: Sort; onSort: (key: string) => void }>) {
  const resourceColumns = columns[resource] || [];
  const showAge = Object.hasOwn(columns, resource) && resource !== 'pods' && resource !== 'deployments';
  return <tr className="text-xs text-gray-400 border-b border-gray-800">
    <Heading column={{ label: 'Name', align: 'left', sortKey: 'name' }} sort={sort} onSort={onSort} />
    {resourceColumns.map(column => <Heading key={column.label} column={column} sort={sort} onSort={onSort} />)}
    {showAge && <th className="text-right px-4 py-3 font-medium">Age</th>}
    <th className="w-10" />
  </tr>;
}
