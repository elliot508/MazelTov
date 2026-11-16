import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('The app root element is missing.');
}

const root = createRoot(rootElement);
const missingSupabaseConfig = [
  !import.meta.env.VITE_SUPABASE_URL && 'VITE_SUPABASE_URL',
  !import.meta.env.VITE_SUPABASE_ANON_KEY && 'VITE_SUPABASE_ANON_KEY',
].filter(Boolean);

if (missingSupabaseConfig.length > 0) {
  root.render(
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 text-center">
      <div className="max-w-md rounded-3xl bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">App setup is incomplete</h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          Add the required Supabase environment variables to your local <code>.env</code> file or your hosting
          provider's environment settings, then rebuild the app.
        </p>
        <p className="mt-3 break-words text-xs text-gray-500" role="alert">
          Missing: {missingSupabaseConfig.join(', ')}
        </p>
      </div>
    </main>
  );
} else {
  void import('./App.tsx')
    .then(({ default: App }) => {
      root.render(
        <StrictMode>
          <App />
        </StrictMode>
      );
    })
    .catch((error: unknown) => {
      console.error('Failed to start Mazel Tov.', error);
      root.render(
        <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 text-center">
          <div className="max-w-md rounded-3xl bg-white p-8 shadow-sm" role="alert">
            <h1 className="text-xl font-bold text-gray-900">Mazel Tov couldn’t start</h1>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              Please refresh the page. If the problem continues, contact the app administrator.
            </p>
          </div>
        </main>
      );
    });
}
