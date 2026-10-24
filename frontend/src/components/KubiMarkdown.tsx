import { createContext, useContext } from 'react';
import type { ComponentProps } from 'react';
import ReactMarkdown from 'react-markdown';

const ReferenceNavigation = createContext<(href?: string) => void>(() => undefined);

function ReferenceLink({ href, children }: Readonly<ComponentProps<'a'>>) {
  const navigate = useContext(ReferenceNavigation);
  return <button type="button" onClick={() => navigate(href)} className="kubi-inline-link">{children}</button>;
}

function OmittedImage({ alt }: Readonly<ComponentProps<'img'>>) {
  return <span>{alt || 'Image omitted'}</span>;
}

const components = { a: ReferenceLink, img: OmittedImage };

export function KubiMarkdown({ content, onNavigate }: Readonly<{ content: string; onNavigate: (href?: string) => void }>) {
  return <ReferenceNavigation.Provider value={onNavigate}><ReactMarkdown components={components}>{content}</ReactMarkdown></ReferenceNavigation.Provider>;
}
