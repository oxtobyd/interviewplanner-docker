import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Calendar, Users, Home, Clock, ClipboardList, LogOut } from 'lucide-react'
import { auth } from '../firebase'
import { signOut } from 'firebase/auth'
import PlannerIcon from '../assets/planner-icon.svg'

const Navbar: React.FC = () => {
  const navigate = useNavigate()

  const handleLogout = async () => {
    try {
      await signOut(auth)
      navigate('/login')
    } catch (error) {
      console.error('Failed to log out', error)
    }
  }

  return (
    <nav className="bg-white shadow-md">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center">
            <img src={PlannerIcon} alt="Planner Icon" className="h-8 w-8 mr-2" />
            <span className="text-xl font-semibold text-[#0D7A5F]">Candidates Panel Planner</span>
          </Link>
          <div className="flex space-x-4">
            <NavLink to="/" icon={<Home />} text="Dashboard" />
            <NavLink to="/candidates" icon={<Users />} text="Candidates" />
            <NavLink to="/interviews" icon={<Calendar />} text="Interviews" />
            <NavLink to="/adviser-report" icon={<ClipboardList />} text="Reports" />
            <NavLink to="/panel-dates" icon={<Clock />} text="Panels" />
            <button onClick={handleLogout} className="flex items-center text-gray-600 hover:text-blue-600">
              <LogOut className="h-5 w-5 mr-1" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}

// ... rest of the file remains the same
//<NavLink to="/advisers" icon={<UserCheck />} text="Advisers" />
//<NavLink to="/templates" icon={<FileText />} text="Templates" />
//<NavLink to="/ndas" icon={<UserPlus />} text="NDAs" />
//<NavLink to="/question-categories" icon={<FileQuestion />} text="Categories" />

const NavLink: React.FC<{ to: string; icon: React.ReactNode; text: string }> = ({ to, icon, text }) => (
  <Link to={to} className="flex items-center text-gray-600 hover:text-blue-600">
    {icon}
    <span className="ml-1">{text}</span>
  </Link>
)

export default Navbar
