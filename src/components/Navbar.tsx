import React from 'react'
import { Link } from 'react-router-dom'
import { Calendar, Users, UserCheck, FileText, Home, UserPlus, Clock, FileQuestion, ClipboardList } from 'lucide-react'

const Navbar: React.FC = () => {
  return (
    <nav className="bg-white shadow-md">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center">
            <Calendar className="h-8 w-8 text-blue-600 mr-2" />
            <span className="text-xl font-semibold">Interview Planner</span>
          </Link>
          <div className="flex space-x-4">
            <NavLink to="/" icon={<Home />} text="Dashboard" />
            <NavLink to="/candidates" icon={<Users />} text="Candidates" />
            <NavLink to="/interviews" icon={<Calendar />} text="Interviews" />
            <NavLink to="/adviser-report" icon={<ClipboardList />} text="Reports" />
            <NavLink to="/panel-dates" icon={<Clock />} text="Panels" />
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