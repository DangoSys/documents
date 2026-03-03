import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { Layout } from "./components/Layout";
import { AdminLayout } from "./components/AdminLayout";
import { DocList } from "./pages/DocList";
import { DocView } from "./pages/DocView";
import { DocEdit } from "./pages/DocEdit";
import { AuthCallback } from "./pages/AuthCallback";
import { ManageAdmins } from "./pages/admin/ManageAdmins";

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
  if (!user?.is_admin) return <Navigate to="/docs/en" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/docs/en" replace />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/docs/:locale" element={<Layout />}>
            <Route index element={<DocList />} />
            <Route path="new" element={<DocEdit />} />
            <Route path="*" element={<DocView />} />
          </Route>
          <Route path="/edit/:locale" element={<Layout />}>
            <Route path="*" element={<DocEdit />} />
          </Route>
          <Route
            path="/admin"
            element={
              <AdminGuard>
                <AdminLayout />
              </AdminGuard>
            }
          >
            <Route index element={<ManageAdmins />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
