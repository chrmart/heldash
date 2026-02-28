import { useEffect, useState } from 'react'
import { useStore } from './store/useStore'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { Dashboard } from './pages/Dashboard'
import { ServicesPage } from './pages/ServicesPage'
import { SettingsPage } from './pages/Settings'
import { SetupPage } from './pages/SetupPage'
import { ServiceModal } from './components/ServiceModal'
import { LoginModal } from './components/LoginModal'
import type { Service } from './types'

export default function App() {
  const { loadAll, checkAllServices, checkAuth, settings, authReady, needsSetup, isAdmin } = useStore()
  const [page, setPage] = useState('dashboard')
  const [showModal, setShowModal] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [editService, setEditService] = useState<Service | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    checkAuth().then(() => loadAll())
  }, [])

  // Apply theme from settings
  useEffect(() => {
    if (settings) {
      document.documentElement.setAttribute('data-theme', settings.theme_mode)
      document.documentElement.setAttribute('data-accent', settings.theme_accent)
    }
  }, [settings])

  // Kick non-admins off settings page (e.g. after logout while on settings)
  useEffect(() => {
    if (authReady && !isAdmin && page === 'settings') {
      setPage('dashboard')
    }
  }, [isAdmin, authReady])

  // Auto-check services every 60s
  useEffect(() => {
    const interval = setInterval(() => {
      checkAllServices()
    }, 60_000)
    return () => clearInterval(interval)
  }, [])

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
      {/* Ambient background orbs */}
      <div className="bg-orbs">
        <div className="bg-orb bg-orb-1" />
        <div className="bg-orb bg-orb-2" />
        <div className="bg-orb bg-orb-3" />
      </div>

      <div className="app-layout">
        <Sidebar page={page} onNavigate={setPage} />

        <div className="main-area">
          <Topbar
            onAddService={() => setShowModal(true)}
            onCheckAll={handleCheckAll}
            checking={checking}
            onLogin={() => setShowLogin(true)}
          />
          <div className="content-area">
            <div className="content-inner">
              {page === 'dashboard' && <Dashboard onEdit={handleEditService} />}
              {page === 'settings' && <SettingsPage />}
              {page === 'services' && <ServicesPage onEdit={handleEditService} />}
              {page === 'about' && (
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <div className="glass" style={{ padding: 32, borderRadius: 'var(--radius-xl)', maxWidth: 400, width: '100%', textAlign: 'center' }}>
                    <h3 style={{ marginBottom: 12 }}>HELDASH</h3>
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
