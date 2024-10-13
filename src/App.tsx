import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Navbar from './components/Navbar'
import Dashboard from './pages/Dashboard'
import Candidates from './pages/Candidates'
import Advisers from './pages/Advisers'
import Interviews from './pages/Interviews'
import Templates from './pages/Templates'
import NationalDiscernmentAdvisers from './pages/NationalDiscernmentAdvisers'
import PanelDates from './pages/PanelDates'
import QuestionCategories from './pages/QuestionCategories'
import AdviserReport from './pages/AdviserReport'
import PanelDateReport from './pages/PanelDateReport'
import Login from './pages/Login'

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth()

  if (loading) {
    return <div>Loading...</div>
  }

  if (!user) {
    return <Navigate to="/login" />
  }

  return <>{children}</>
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-gray-100">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <Navbar />
                  <div className="container mx-auto px-4 py-8">
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/candidates" element={<Candidates />} />
                      <Route path="/advisers" element={<Advisers />} />
                      <Route path="/interviews" element={<Interviews />} />
                      <Route path="/templates" element={<Templates />} />
                      <Route path="/ndas" element={<NationalDiscernmentAdvisers />} />
                      <Route path="/panel-dates" element={<PanelDates />} />
                      <Route path="/question-categories" element={<QuestionCategories />} />
                      <Route path="/adviser-report" element={<AdviserReport />} />
                      <Route path="/panel-date-report/:panelDateId" element={<PanelDateReport />} />
                    </Routes>
                  </div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  )
}

export default App
