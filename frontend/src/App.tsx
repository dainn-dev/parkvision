import React, { useState } from 'react';
import { PlatformProvider, usePlatform } from './context/PlatformContext';
import { PlatformSidebar } from './components/layout/PlatformSidebar';
import { PlatformHeader } from './components/layout/PlatformHeader';
import { ToastContainer } from './components/layout/ToastContainer';
import { CreateTenantModal } from './pages/tenants/CreateTenantModal';
import { MfaFlowModal } from './components/modals/MfaFlowModal';

// Public & Marketing Pages
import { PublicNavbar, PublicViewType } from './components/layout/PublicNavbar';
import { PublicFooter } from './components/layout/PublicFooter';
import { LandingPage } from './pages/public/LandingPage';
import { PrivacyPolicyPage } from './pages/public/PrivacyPolicyPage';
import { TermsOfServicePage } from './pages/public/TermsOfServicePage';
import { SlaPolicyPage } from './pages/public/SlaPolicyPage';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';

// Platform Governance Pages
import { DashboardPage } from './pages/DashboardPage';
import { TenantsListPage } from './pages/tenants/TenantsListPage';
import { TenantDetailPage } from './pages/tenants/TenantDetailPage';
import { PlatformSettingsPage } from './pages/platform/PlatformSettingsPage';
import { FeatureFlagsPage } from './pages/platform/FeatureFlagsPage';
import { PlatformAdminsPage } from './pages/platform/PlatformAdminsPage';
import { MonitoringPage } from './pages/monitoring/MonitoringPage';
import { SecurityPage } from './pages/security/SecurityPage';
import { AuditLogsPage } from './pages/audit/AuditLogsPage';

// Tenant Portal & Site Management Pages
import { TenantDashboardPage } from './pages/tenant/TenantDashboardPage';
import { TenantLocationPage } from './pages/tenant/TenantLocationPage';
import { TenantSitesPage } from './pages/tenant/TenantSitesPage';
import { TenantEventsPage } from './pages/tenant/TenantEventsPage';
import { TenantVehiclesPage } from './pages/tenant/TenantVehiclesPage';
import { TenantRulesPage } from './pages/tenant/TenantRulesPage';
import { TenantUsersPage } from './pages/tenant/TenantUsersPage';
import { TenantSettingsPage } from './pages/tenant/TenantSettingsPage';
import { BarrierMapVisualization } from './components/monitoring/BarrierMapVisualization';
import { ArrowLeft, LayoutDashboard } from 'lucide-react';
import { ErrorBoundary } from './components/common/ErrorBoundary';

const PlatformAppContent: React.FC = () => {
  const {
    authStatus,
    isAuthenticated,
    appWorkspace,
    primaryTab,
    platformSubTab,
    tenantNavTab,
    selectedTenantId,
    setSelectedTenantId,
    tenantLocation,
    isMfaModalOpen,
    closeMfaModal,
    mfaModalMode,
    mfaTargetAdminName
  } = usePlatform();

  // Public site view state: 'landing' | 'terms' | 'privacy' | 'sla' | 'login' | 'register'
  const [publicView, setPublicView] = useState<PublicViewType>('landing');
  const [selectedPricingPlan, setSelectedPricingPlan] = useState<string>('business');

  // Allow authenticated users to preview the public landing page if desired
  const [isPreviewingLandingAsAuth, setIsPreviewingLandingAsAuth] = useState(false);

  const [isCreateTenantModalOpen, setIsCreateTenantModalOpen] = useState(false);

  // Helper to render public pages
  const renderPublicContent = (isAuthPreview: boolean = false) => {
    return (
      <div className="min-h-screen bg-[#0d0e12] text-[#c9d1d9] flex flex-col justify-between selection:bg-[#58a6ff] selection:text-slate-950">
        {/* Floating Top Banner when Authenticated Admin is previewing Landing */}
        {isAuthPreview && (
          <div className="bg-[#161b22] border-b border-[#30363d] px-4 py-2 flex items-center justify-between text-xs z-50 sticky top-0">
            <span className="text-[#8b949e] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#3fb950] animate-ping" />
              <span>Chế độ Xem trước Landing Page (Dành cho Tenant & Khách Hàng)</span>
            </span>
            <button
              onClick={() => setIsPreviewingLandingAsAuth(false)}
              className="px-3 py-1 rounded-lg bg-[#58a6ff] hover:bg-[#388bfd] text-slate-950 font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Quay lại Bảng Quản Trị</span>
            </button>
          </div>
        )}

        {/* Public Navigation Bar (only on non-login/register standalone pages) */}
        {publicView !== 'login' && publicView !== 'register' && (
          <PublicNavbar
            currentView={publicView}
            onNavigate={setPublicView}
            onLogin={() => setPublicView('login')}
            onRegister={() => setPublicView('register')}
          />
        )}

        {/* Main Content by Public Route */}
        <main className="flex-1">
          {publicView === 'landing' && (
            <LandingPage
              onNavigate={setPublicView}
              onSelectPlan={(plan) => setSelectedPricingPlan(plan)}
            />
          )}

          {publicView === 'privacy' && (
            <PrivacyPolicyPage onNavigate={setPublicView} />
          )}

          {publicView === 'terms' && (
            <TermsOfServicePage onNavigate={setPublicView} />
          )}

          {publicView === 'sla' && (
            <SlaPolicyPage onNavigate={setPublicView} />
          )}

          {publicView === 'login' && (
            <LoginPage onNavigate={setPublicView} />
          )}

          {publicView === 'register' && (
            <RegisterPage
              initialPlan={selectedPricingPlan}
              onNavigate={setPublicView}
              onRegistrationSuccess={() => {
                setIsPreviewingLandingAsAuth(false);
              }}
            />
          )}
        </main>

        {/* Public Footer (only on content pages) */}
        {publicView !== 'login' && publicView !== 'register' && (
          <PublicFooter onNavigate={setPublicView} />
        )}

        <ToastContainer />
      </div>
    );
  };

  if (authStatus === 'loading') {
    return (
      <div className="min-h-screen bg-[#0d0e12] text-[#c9d1d9] flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-[#8b949e]">
          <span className="h-2.5 w-2.5 rounded-full bg-[#58a6ff] animate-pulse" />
          Đang khôi phục phiên làm việc...
        </div>
      </div>
    );
  }

  // 1. UN-AUTHENTICATED STATE: Render Public Pages (Landing, Policies, Login, Register)
  if (!isAuthenticated) {
    return renderPublicContent(false);
  }

  // 2. AUTHENTICATED ADMIN PREVIEWING PUBLIC LANDING PAGE
  if (isPreviewingLandingAsAuth) {
    return renderPublicContent(true);
  }

  // 3. AUTHENTICATED STATE: Render Platform Admin & Tenant Portal Workspaces
  return (
    <div className="flex h-screen w-screen bg-[#0d0e12] text-[#c9d1d9] font-sans overflow-hidden antialiased selection:bg-[#58a6ff] selection:text-slate-950">
      {/* Shared Navigation Sidebar */}
      <PlatformSidebar />

      {/* Main Content Workspace Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header Bar */}
        <PlatformHeader
          onOpenQuickActionModal={() => setIsCreateTenantModalOpen(true)}
          onViewLandingPage={() => {
            setPublicView('landing');
            setIsPreviewingLandingAsAuth(true);
          }}
        />

        {/* Scrollable Page Viewport */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
          <ErrorBoundary>
            {/* ========================================================================= */}
          {/* TENANT WORKSPACE VIEWS */}
          {/* ========================================================================= */}
          {appWorkspace === 'tenant' ? (
            <>
              {tenantNavTab === 'dashboard' && <TenantDashboardPage />}
              {(tenantNavTab === 'location' || tenantNavTab === 'sites') && <TenantLocationPage />}
              {tenantNavTab === 'gates' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#161b22] p-6 rounded-2xl border border-[#30363d]">
                    <div>
                      <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                        Bản Đồ Giám Sát Barrier & Vị Trí Trạm
                      </h2>
                      <p className="text-xs text-[#8b949e] mt-1">
                        Trực quan hóa trạng thái cần barrier theo thời gian thực trên bản đồ vector D3.js và bảng điều khiển telemetry.
                      </p>
                    </div>
                  </div>
                  <BarrierMapVisualization tenantFilterId={selectedTenantId || tenantLocation?.tenantId || 't-001'} />
                </div>
              )}
              {(tenantNavTab === 'access_events' || tenantNavTab === 'access-events') && <TenantEventsPage />}
              {tenantNavTab === 'vehicles' && <TenantVehiclesPage />}
              {(tenantNavTab === 'access_rules' || tenantNavTab === 'access-rules') && <TenantRulesPage />}
              {(tenantNavTab === 'team' || tenantNavTab === 'users') && <TenantUsersPage />}
              {tenantNavTab === 'settings' && <TenantSettingsPage />}
            </>
          ) : (
            /* ========================================================================= */
            /* PLATFORM GOVERNANCE VIEWS */
            /* ========================================================================= */
            <>
              {primaryTab === 'dashboard' && (
                <DashboardPage onOpenCreateTenantModal={() => setIsCreateTenantModalOpen(true)} />
              )}

              {primaryTab === 'tenants' && (
                selectedTenantId ? (
                  <TenantDetailPage
                    tenantId={selectedTenantId}
                    onBack={() => setSelectedTenantId(null)}
                  />
                ) : (
                  <TenantsListPage onOpenCreateModal={() => setIsCreateTenantModalOpen(true)} />
                )
              )}

              {primaryTab === 'platform' && (
                <>
                  {platformSubTab === 'settings' && <PlatformSettingsPage />}
                  {platformSubTab === 'feature-flags' && <FeatureFlagsPage />}
                  {platformSubTab === 'admins' && <PlatformAdminsPage />}
                </>
              )}

              {primaryTab === 'monitoring' && <MonitoringPage />}

              {primaryTab === 'security' && <SecurityPage />}

              {primaryTab === 'audit' && <AuditLogsPage />}
            </>
          )}
          </ErrorBoundary>
        </main>
      </div>

      {/* Global Modals & Toast Container */}
      <CreateTenantModal
        isOpen={isCreateTenantModalOpen}
        onClose={() => setIsCreateTenantModalOpen(false)}
      />

      <MfaFlowModal
        isOpen={isMfaModalOpen}
        onClose={closeMfaModal}
        mode={mfaModalMode}
        targetAdminName={mfaTargetAdminName}
      />

      <ToastContainer />
    </div>
  );
};

export default function App() {
  return (
    <PlatformProvider>
      <PlatformAppContent />
    </PlatformProvider>
  );
}
