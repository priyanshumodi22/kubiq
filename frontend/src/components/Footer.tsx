export default function Footer() {
  return (
    <footer className="fixed bottom-0 left-0 right-0 border-t border-gray-700 bg-bg-surface/90 backdrop-blur-sm z-40">
      <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs sm:text-sm text-text-dim">
          <p>© 2025 Kubiq. Cloud-Native Service Health Monitoring Dashboard.</p>
          <p>Built with ❤️ for Microservices Observability</p>
        </div>
      </div>
    </footer>
  );
}
