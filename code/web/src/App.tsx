import { lazy, type ComponentType, type ReactNode } from 'react';
import { isTraveller } from '@travelsteps/shared';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ConfirmProvider } from './components/ConfirmDialog';
import { Layout } from './components/Layout';
import { nl } from './i18n/nl';
import { ChangeCredentialsPage } from './pages/ChangeCredentialsPage';
import { ForcedPasswordPage } from './pages/ChangePasswordPage';
import { LoginPage } from './pages/LoginPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { PostDetailPage } from './pages/PostDetailPage';
import { TimelinePage } from './pages/TimelinePage';
import { TravelDetailPage } from './pages/TravelDetailPage';
import { TravelsPage } from './pages/TravelsPage';

/** Code-splits a page with a named export; the PWA precaches all chunks for offline use. */
function page<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(() => load().then((m) => ({ default: m[name] })));
}

const AdminUsersPage = page(() => import('./pages/AdminUsersPage'), 'AdminUsersPage');
const AdminSettingsPage = page(() => import('./pages/AdminSettingsPage'), 'AdminSettingsPage');
const AdminSettingsSectionPage = page(() => import('./pages/AdminSettingsPage'), 'AdminSettingsSectionPage');
const LibraryPage = page(() => import('./pages/LibraryPage'), 'LibraryPage');
const MapPage = page(() => import('./pages/MapPage'), 'MapPage');
const PostEditorPage = page(() => import('./pages/PostEditorPage'), 'PostEditorPage');
const ProfilePage = page(() => import('./pages/ProfilePage'), 'ProfilePage');
const ProfileSectionPage = page(() => import('./pages/ProfilePage'), 'ProfileSectionPage');
const TravelEditorPage = page(() => import('./pages/TravelEditorPage'), 'TravelEditorPage');

function AdminOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user?.role === 'admin' ? children : <Navigate to="/" replace />;
}

/** Only travellers (and admins) can write posts and create travels. */
function TravellerOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user && isTraveller(user.role) ? children : <Navigate to="/" replace />;
}

function Gate() {
  const { user, loading } = useAuth();

  if (loading) return <div className="splash">{nl.loading}</div>;
  if (!user) return <LoginPage />;
  if (user.mustChangeCredentials) return <ChangeCredentialsPage />;
  if (user.mustChangePassword) return <ForcedPasswordPage />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<TimelinePage />} />
        <Route path="post/:id" element={<PostDetailPage />} />
        <Route
          path="posts/nieuw"
          element={
            <TravellerOnly>
              <PostEditorPage />
            </TravellerOnly>
          }
        />
        <Route
          path="posts/:id/bewerken"
          element={
            <TravellerOnly>
              <PostEditorPage />
            </TravellerOnly>
          }
        />
        <Route path="kaart" element={<MapPage />} />
        <Route path="fotos" element={<LibraryPage />} />
        <Route path="reizen" element={<TravelsPage />} />
        <Route
          path="reizen/nieuw"
          element={
            <TravellerOnly>
              <TravelEditorPage />
            </TravellerOnly>
          }
        />
        <Route path="reizen/:id" element={<TravelDetailPage />} />
        <Route
          path="reizen/:id/bewerken"
          element={
            <TravellerOnly>
              <TravelEditorPage />
            </TravellerOnly>
          }
        />
        <Route path="meldingen" element={<NotificationsPage />} />
        <Route path="profiel" element={<ProfilePage />} />
        <Route path="profiel/:section" element={<ProfileSectionPage />} />
        <Route
          path="beheer/instellingen"
          element={
            <AdminOnly>
              <AdminSettingsPage />
            </AdminOnly>
          }
        />
        <Route
          path="beheer/instellingen/:section"
          element={
            <AdminOnly>
              <AdminSettingsSectionPage />
            </AdminOnly>
          }
        />
        <Route
          path="beheer/gebruikers"
          element={
            <AdminOnly>
              <AdminUsersPage />
            </AdminOnly>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <AuthProvider>
      <ConfirmProvider>
        <BrowserRouter>
          <Gate />
        </BrowserRouter>
      </ConfirmProvider>
    </AuthProvider>
  );
}
