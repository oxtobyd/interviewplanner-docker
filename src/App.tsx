import React from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Dashboard from './pages/Dashboard'
import Candidates from './pages/Candidates'
import Advisers from './pages/Advisers'
import Interviews from './pages/Interviews'
import Templates from './pages/Templates'
import NationalDiscernmentAdvisers from './pages/NationalDiscernmentAdvisers'
import PanelDates from './pages/PanelDates'
import QuestionCategories from './pages/QuestionCategories'
import AdviserReport from './pages/AdviserReport' // Add this line
import PanelDateReport from './pages/PanelDateReport';

function App() {
  return (
    <Router>
      <Navbar />
      <div className="min-h-screen bg-gray-100">
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
            <Route path="/adviser-report" element={<AdviserReport />} /> // Add this line
            <Route path="/panel-date-report/:panelDateId" element={<PanelDateReport />} />
          </Routes>
        </div>
      </div>
    </Router>
  )
}

export default App