import React from 'react';
import { AlertTriangle, KeyRound, ShieldAlert } from 'lucide-react';

interface EnvErrorPageProps {
  missingVars: string[];
}

export const EnvErrorPage: React.FC<EnvErrorPageProps> = ({ missingVars }) => {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="max-w-xl w-full bg-white rounded-xl shadow-lg border border-red-200 overflow-hidden">
        {/* Header */}
        <div className="bg-red-50 p-6 border-b border-red-200 flex items-start space-x-4">
          <div className="p-3 bg-red-100 text-red-700 rounded-lg">
            <AlertTriangle className="w-8 h-8" aria-label="Error Warning" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-red-900">
              Supabase Configuration Missing
            </h1>
            <p className="text-sm text-red-700 mt-1">
              Wewala POS cannot connect to the database because essential environment variables are not configured.
            </p>
          </div>
        </div>

        {/* Missing Variables List */}
        <div className="p-6 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Missing Environment Variable{missingVars.length > 1 ? 's' : ''}:
            </h2>
            <ul className="mt-2 space-y-2">
              {missingVars.map((varName) => (
                <li
                  key={varName}
                  className="flex items-center space-x-2 text-sm bg-red-50 text-red-800 px-3 py-2 rounded-md font-mono border border-red-200"
                >
                  <KeyRound className="w-4 h-4 text-red-600 flex-shrink-0" aria-label="Key" />
                  <span className="font-semibold">{varName}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Action Steps */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 text-sm text-gray-700 space-y-2">
            <h3 className="font-semibold text-gray-900">How to resolve:</h3>
            <ol className="list-decimal list-inside space-y-1 text-gray-600 font-mono text-xs">
              <li>Create or edit your <code className="bg-gray-200 px-1 py-0.5 rounded">.env.local</code> file in the project root.</li>
              <li>Fill in your credentials from the Supabase project dashboard:</li>
            </ol>
            <pre className="bg-gray-900 text-gray-100 p-3 rounded text-xs font-mono overflow-x-auto">
{`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...`}
            </pre>
          </div>

          {/* Security Notice */}
          <div className="flex items-start space-x-2 text-xs text-amber-800 bg-amber-50 p-3 rounded border border-amber-200">
            <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" aria-label="Security warning" />
            <p>
              <strong>Security Rule:</strong> Only use the <code>anon</code> public key in the frontend. Never commit or expose your <code>admin backend</code> secret key.
            </p>
          </div>

          {/* Action button */}
          <div className="pt-2">
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-gray-900 hover:bg-gray-800 text-white font-medium py-2.5 px-4 rounded-lg transition-colors focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 min-h-[44px]"
            >
              Reload Application
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

