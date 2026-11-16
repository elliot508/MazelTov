import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { AuthScreen } from '@/components/AuthScreen';
import { CategoryBar } from '@/components/CategoryBar';
import { HomeDashboard } from '@/components/HomeDashboard';
import { PlacesPage } from '@/components/PlacesPage';
import { ChatChannel } from '@/components/ChatChannel';
import { HockerChat } from '@/components/HockerChat';
import { SimchaForm } from '@/components/SimchaForm';
import { ProfilePage } from '@/components/ProfilePage';
import { AdPurchaseModal } from '@/components/AdPurchaseModal';
import { AdRequestsAdmin } from '@/components/AdRequestsAdmin';
import { InvitationStudio } from '@/components/InvitationStudio';
import { InvitationPublicPage } from '@/components/InvitationPublicPage';
import type { SimchaType } from '@/lib/constants';

type View =
  | { kind: 'home' }
  | { kind: 'places'; simchaType: SimchaType }
  | { kind: 'chat'; simchaType: SimchaType; city: string }
  | { kind: 'profile' }
  | { kind: 'hockerChat' }
  | { kind: 'adRequests' }
  | { kind: 'invitations' };

function AppInner() {
  const { user, isGuest, loading } = useAuth();
  const [view, setView] = useState<View>({ kind: 'home' });
  const [showForm, setShowForm] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showAdPurchase, setShowAdPurchase] = useState(false);

  // Process referral on sign-in
  const { refreshProfile } = useAuth();
  useEffect(() => {
    if (user) {
      supabase.rpc('process_referral', { p_referred_id: user.id }).then(() => {
        refreshProfile();
      });
    }
  }, [user, refreshProfile]);

  const invitationId = new URLSearchParams(window.location.search).get('invite');
  if (invitationId) {
    return <InvitationPublicPage invitationId={invitationId} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-[#007AFF] animate-spin" />
      </div>
    );
  }

  if (!user && !isGuest) {
    return <AuthScreen />;
  }

  if (showAuth) {
    return <AuthScreen guestOnBack={() => setShowAuth(false)} />;
  }

  const activeCat: SimchaType | null =
    view.kind === 'places' ? view.simchaType :
    view.kind === 'chat' ? view.simchaType :
    null;

  const requestSignIn = () => setShowAuth(true);

  return (
    <div className="min-h-screen bg-white">
      {view.kind !== 'chat' && view.kind !== 'profile' && view.kind !== 'hockerChat' && view.kind !== 'adRequests' && view.kind !== 'invitations' && (
        <CategoryBar
          active={activeCat}
          onHome={() => setView({ kind: 'home' })}
          onSelect={(cat) => setView({ kind: 'places', simchaType: cat })}
        />
      )}

      {view.kind === 'home' && (
        <HomeDashboard
          onOpenChat={(simchaType, city) => setView({ kind: 'chat', simchaType, city })}
          onOpenProfile={() => (isGuest ? setShowAuth(true) : setView({ kind: 'profile' }))}
          onOpenAdPurchase={() => (isGuest ? setShowAuth(true) : setShowAdPurchase(true))}
          onOpenInvitations={() => (isGuest ? setShowAuth(true) : setView({ kind: 'invitations' }))}
        />
      )}

      {view.kind === 'invitations' && (
        <InvitationStudio onBack={() => setView({ kind: 'home' })} />
      )}

      {view.kind === 'places' && (
        <PlacesPage
          simchaType={view.simchaType}
          onOpenChat={(simchaType, city) => setView({ kind: 'chat', simchaType, city })}
        />
      )}

      {view.kind === 'chat' && (
        <ChatChannel
          simchaType={view.simchaType}
          city={view.city}
          onBack={() => {
            if (view.kind === 'chat') {
              setView({ kind: 'places', simchaType: view.simchaType });
            }
          }}
          onAddSimcha={() => (isGuest ? setShowAuth(true) : setShowForm(true))}
          onRequestSignIn={requestSignIn}
        />
      )}

      {view.kind === 'profile' && (
        <ProfilePage
          onBack={() => setView({ kind: 'home' })}
          onOpenHockerChat={() => setView({ kind: 'hockerChat' })}
          onOpenAdRequests={() => setView({ kind: 'adRequests' })}
        />
      )}

      {view.kind === 'hockerChat' && (
        <HockerChat onBack={() => setView({ kind: 'profile' })} />
      )}

      {view.kind === 'adRequests' && (
        <AdRequestsAdmin onBack={() => setView({ kind: 'profile' })} />
      )}

      {showForm && view.kind === 'chat' && (
        <SimchaForm
          defaultSimchaType={view.simchaType}
          defaultCity={view.city}
          onClose={() => setShowForm(false)}
          onSubmitted={() => setShowForm(false)}
        />
      )}

      {showAdPurchase && (
        <AdPurchaseModal
          onClose={() => setShowAdPurchase(false)}
          onSubmitted={() => setShowAdPurchase(false)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
