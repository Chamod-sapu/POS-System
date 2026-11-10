import React from 'react';
import { Navigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { UserRole } from '../types';

interface RoleGateProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
  redirectTo?: string;
}

export const RoleGate: React.FC<RoleGateProps> = ({
  allowedRoles,
  children,
  fallback,
  redirectTo,
}) => {
  const { role, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  const isAllowed = role !== null && allowedRoles.includes(role);

  if (!isAllowed) {
    if (redirectTo) {
      return <Navigate to={redirectTo} replace />;
    }

    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-xl max-w-xl mx-auto my-8 text-slate-900 shadow-sm">
        <div className="flex items-start space-x-3">
          <div className="p-2 bg-red-100 rounded-lg text-red-600 flex-shrink-0">
            <ShieldAlert className="w-6 h-6" aria-label="Access Restricted" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-red-900">Not Authorised</h3>
            <p className="text-sm text-red-700 mt-1">
              You do not have the required permissions to access this feature. This section is restricted to{' '}
              <span className="font-semibold uppercase tracking-wide">
                {allowedRoles.join(' or ')}
              </span>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

