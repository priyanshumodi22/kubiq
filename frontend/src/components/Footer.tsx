import { ExternalLink, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import licenseText from '../../../LICENSE?raw';

const LICENSE_SOURCE_URL = 'https://github.com/priyanshumodi22/kubiq/blob/main/LICENSE';
const [LICENSE_TITLE = 'Elastic License 2.0', ...LICENSE_BODY] = licenseText.split(/\r?\n/);

export default function Footer() {
  const [isLicenseOpen, setIsLicenseOpen] = useState(false);

  const closeLicense = () => setIsLicenseOpen(false);

  useEffect(() => {
    if (!isLicenseOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeLicense();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLicenseOpen]);

  return (
    <>
      <footer className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-700 bg-bg-surface/90 backdrop-blur-sm">
        <div className="container mx-auto px-3 py-3 sm:px-4 sm:py-4 lg:px-6">
          <div className="flex flex-col items-center justify-between gap-2 text-center text-xs text-text-dim sm:flex-row sm:text-left sm:text-sm">
            <div className="flex flex-col items-center gap-1 sm:items-start">
              <p>© {new Date().getFullYear()} Priyanshu Modi. kubiq is source-available under ELv2.</p>
              <nav aria-label="Legal" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 sm:justify-start">
                <a className="transition-colors hover:text-primary" href="https://kubiq.priyanshumodi.in/privacy">Privacy</a>
                <a className="transition-colors hover:text-primary" href="https://kubiq.priyanshumodi.in/terms">Terms</a>
                <a className="transition-colors hover:text-primary" href="https://kubiq.priyanshumodi.in/trademarks">Trademark Notice</a>
                <button type="button" onClick={() => setIsLicenseOpen(true)} className="transition-colors hover:text-primary">License</button>
              </nav>
            </div>
            <p>Built with ❤️ for Reliability Engineers. Downtime is Not an Option.</p>
          </div>
        </div>
      </footer>

      {isLicenseOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={closeLicense}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="license-dialog-title"
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0a] shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-white/10 bg-white/5 px-6 py-4">
              <h2 id="license-dialog-title" className="text-lg font-bold text-white">{LICENSE_TITLE.trim()}</h2>
              <button type="button" onClick={closeLicense} aria-label="Close license" className="rounded-lg p-1 text-text-dim transition-colors hover:bg-white/10 hover:text-white">
                <X className="size-5" />
              </button>
            </header>

            <div className="custom-scrollbar overflow-y-auto px-6 py-5">
              <div className="space-y-4 text-sm leading-7 text-text-dim [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mt-7 [&_h2]:border-b [&_h2]:border-white/10 [&_h2]:pb-3 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:leading-tight [&_h2]:text-white [&_p]:mt-4">
                <ReactMarkdown>{LICENSE_BODY.join('\n').trimStart()}</ReactMarkdown>
              </div>
            </div>

            <footer className="flex justify-end border-t border-white/10 bg-white/5 px-6 py-4">
              <a href={LICENSE_SOURCE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary transition-colors hover:text-blue-300">
                View original on GitHub <ExternalLink className="size-3" />
              </a>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
