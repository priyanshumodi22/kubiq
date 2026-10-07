export default function Footer() {
  return (
    <footer className="fixed bottom-0 left-0 right-0 border-t border-gray-700 bg-bg-surface/90 backdrop-blur-sm z-40">
      <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
        <div className="flex flex-col items-center justify-between gap-2 text-center text-xs sm:flex-row sm:text-left sm:text-sm text-text-dim">
          <div className="flex flex-col items-center gap-1 sm:items-start">
            <p>© {new Date().getFullYear()} Priyanshu Modi. kubiq is source-available under ELv2.</p>
            <nav aria-label="Legal" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 sm:justify-start">
              <a className="transition-colors hover:text-primary" href="https://kubiq.priyanshumodi.in/privacy">Privacy</a>
              <a className="transition-colors hover:text-primary" href="https://kubiq.priyanshumodi.in/terms">Terms</a>
              <a className="transition-colors hover:text-primary" href="https://kubiq.priyanshumodi.in/trademarks">Trademark Notice</a>
              <a className="transition-colors hover:text-primary" href="https://github.com/priyanshumodi22/kubiq/blob/main/LICENSE" target="_blank" rel="noreferrer">License</a>
            </nav>
          </div>
          <p>Built with ❤️ for Reliability Engineers. Downtime is Not an Option.</p>
        </div>
      </div>
    </footer>
  );
}
