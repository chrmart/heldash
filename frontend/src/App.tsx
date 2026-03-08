import { useEffect, useState } from 'react'
import { useStore } from './store/useStore'
import { useDashboardStore } from './store/useDashboardStore'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { Dashboard } from './pages/Dashboard'
import { ServicesPage } from './pages/ServicesPage'
import { SettingsPage } from './pages/Settings'
import { MediaPage } from './pages/MediaPage'
import { WidgetsPage } from './pages/WidgetsPage'
import { DockerPage } from './pages/DockerPage'
import { HaPage } from './pages/HaPage'
import { SetupPage } from './pages/SetupPage'
import { ServiceModal } from './components/ServiceModal'
import { LoginModal } from './components/LoginModal'
import type { Service } from './types'
import { calcAutoTheme } from './utils'

export default function App() {
  const { loadAll, checkAllServices, checkAuth, settings, authReady, needsSetup, isAdmin, isAuthenticated, authUser, userGroups, myBackground, loadMyBackground } = useStore()
  const { loadDashboard } = useDashboardStore()
  const [page, setPage] = useState('dashboard')
  const [showModal, setShowModal] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [editService, setEditService] = useState<Service | null>(null)
  const [checking, setChecking] = useState(false)
  const [showAddInstance, setShowAddInstance] = useState(false)
  const [showAddWidget, setShowAddWidget] = useState(false)

  useEffect(() => {
    checkAuth().then(() => Promise.all([loadAll(), loadDashboard(), loadMyBackground()]))
  }, [])

  // Apply theme from settings
  useEffect(() => {
    if (settings) {
      document.documentElement.setAttribute('data-theme', settings.theme_mode)
      document.documentElement.setAttribute('data-accent', settings.theme_accent)
    }
  }, [settings])

  // Reload background after login/logout, apply as CSS variable
  useEffect(() => {
    loadMyBackground()
  }, [authUser?.sub])

  useEffect(() => {
    if (myBackground) {
      document.documentElement.style.setProperty('--user-bg-url', `url(${myBackground})`)
    } else {
      document.documentElement.style.removeProperty('--user-bg-url')
    }
  }, [myBackground])

  // Kick non-admins off settings page (e.g. after logout while on settings)
  useEffect(() => {
    if (authReady && !isAdmin && page === 'settings') {
      setPage('dashboard')
    }
  }, [isAdmin, authReady])

  // Kick users without docker access off docker page
  useEffect(() => {
    if (!authReady || page !== 'docker') return
    const groupData = userGroups.find(g => g.id === authUser?.groupId)
    const canSeeDocker = isAdmin || (groupData?.docker_access ?? false)
    if (!canSeeDocker) setPage('dashboard')
  }, [isAdmin, authReady, authUser, userGroups, page])

  // Auto-check services every 60s
  useEffect(() => {
    const interval = setInterval(() => {
      checkAllServices()
    }, 60_000)
    return () => clearInterval(interval)
  }, [])

  // Auto theme: re-apply every 60s so switches happen on time
  useEffect(() => {
    if (!settings?.auto_theme_enabled) return
    const interval = setInterval(() => {
      const mode = calcAutoTheme(settings.auto_theme_light_start ?? '08:00', settings.auto_theme_dark_start ?? '20:00')
      document.documentElement.setAttribute('data-theme', mode)
    }, 60_000)
    return () => clearInterval(interval)
  }, [settings?.auto_theme_enabled, settings?.auto_theme_light_start, settings?.auto_theme_dark_start])

  const handleCheckAll = async () => {
    setChecking(true)
    await checkAllServices()
    setChecking(false)
  }

  const handleEditService = (service: Service) => {
    setEditService(service)
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditService(null)
  }

  // Loading state while auth is being checked
  if (!authReady) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
      </div>
    )
  }

  // First-time setup
  if (needsSetup) {
    return <SetupPage />
  }

  return (
    <>
      {/* User-assigned background image */}
      {myBackground && (
        <div className="bg-user-image" style={{ backgroundImage: `url(${myBackground})` }} />
      )}

      {/* Ambient background orbs */}
      <div className="bg-orbs">
        <div className="bg-orb bg-orb-1" />
        <div className="bg-orb bg-orb-2" />
        <div className="bg-orb bg-orb-3" />
      </div>

      <div className="app-layout">
        {isAuthenticated && (
          <Sidebar page={page} onNavigate={(p) => { setPage(p); if (p !== 'widgets') setShowAddWidget(false); if (p !== 'media') setShowAddInstance(false) }} />
        )}

        <div className="main-area">
          <Topbar
            page={page}
            onAddService={() => setShowModal(true)}
            onAddInstance={() => setShowAddInstance(true)}
            onAddWidget={() => setShowAddWidget(true)}
            onCheckAll={handleCheckAll}
            checking={checking}
            onLogin={() => setShowLogin(true)}
          />
          <div className="content-area">
            <div className="content-inner">
              {page === 'dashboard' && <Dashboard onEdit={handleEditService} />}
              {page === 'settings' && <SettingsPage />}
              {page === 'services' && <ServicesPage onEdit={handleEditService} />}
              {page === 'media' && (
                <MediaPage
                  showAddForm={showAddInstance}
                  onFormClose={() => setShowAddInstance(false)}
                />
              )}
              {page === 'widgets' && (
                <WidgetsPage
                  showAddForm={showAddWidget}
                  onFormClose={() => setShowAddWidget(false)}
                />
              )}
              {page === 'docker' && <DockerPage />}
              {page === 'home_assistant' && <HaPage />}
              {page === 'about' && (
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <div className="glass" style={{ padding: 32, borderRadius: 'var(--radius-xl)', maxWidth: 400, width: '100%', textAlign: 'center' }}>
                    <img src="/logo.png" alt="HELDASH" style={{ width: '100%', maxWidth: 320, marginBottom: 20 }} />
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      Personal homelab dashboard.<br />
                      Built with ♥ and Fastify + React.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <ServiceModal
          service={editService}
          onClose={handleCloseModal}
        />
      )}

      {showLogin && (
        <LoginModal onClose={() => setShowLogin(false)} />
      )}
    </>
  )
}
