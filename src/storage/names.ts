/** Filename-safe labels; run IDs retain uniqueness when names normalize alike. */
export function exportLabel(owner: string, entityType: string, filter?: { kind: string; name: string }): string {
  const slug = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'unnamed';
  return [slug(owner), slug(entityType), filter ? `${slug(filter.kind)}-${slug(filter.name)}` : 'all'].join('__');
}
