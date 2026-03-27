export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-2">404</h1>
        <p className="text-muted-foreground">Page not found.</p>
        <a href="/" className="text-primary mt-4 inline-block hover:underline">Back to home</a>
      </div>
    </div>
  )
}
