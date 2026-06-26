'use client';

import { useState } from 'react';
import { login } from './actions';

/**
 * Login page — Client Component so we can display inline validation errors
 * without a full page reload. Calls the login() Server Action on submit.
 *
 * No public sign-up link — users are provisioned manually by administrators.
 */
export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    try {
      const result = await login(new FormData(event.currentTarget));
      if (result?.error) setError(result.error);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4 bg-cream">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-lg overflow-hidden">
        {/* Vibrant brand header */}
        <div className="bg-brand px-8 py-6 text-center">
          <h1 className="text-3xl font-bold text-white tracking-tight">
            🛒 Stockio
          </h1>
          <p className="mt-1 text-sm text-white/80">Tu gestión de stock, en tus manos</p>
        </div>

        {/* Form body */}
        <div className="px-8 py-6 space-y-5">
          <p className="text-sm text-center text-gray-500">Inicia sesión en tu cuenta</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Correo electrónico
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700"
              >
                Contraseña
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-danger"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="btn-primary w-full"
            >
              {isPending ? 'Iniciando sesión…' : 'Iniciar sesión'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
