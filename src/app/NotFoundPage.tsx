import React from 'react';
import { Link } from 'react-router-dom';
import { Compass, ShoppingCart } from 'lucide-react';
import { Button } from '../components/ui/Button';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-center">
      <div className="max-w-md w-full bg-slate-800 rounded-2xl border border-slate-700 p-8 shadow-2xl">
        <div className="w-16 h-16 bg-slate-700/60 text-slate-300 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Compass className="w-8 h-8 text-emerald-400" />
        </div>
        <h1 className="text-4xl font-extrabold text-white tracking-tight font-mono">404</h1>
        <h2 className="mt-2 text-lg font-bold text-slate-200">Page Not Found</h2>
        <p className="mt-2 text-sm text-slate-400 leading-relaxed">
          The POS route you requested does not exist or has been moved.
        </p>
        <div className="mt-6 flex justify-center">
          <Link to="/pos">
            <Button variant="primary" leftIcon={<ShoppingCart className="w-4 h-4" />}>
              Return to POS Terminal
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFoundPage;

