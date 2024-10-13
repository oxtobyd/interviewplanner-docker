import React, { useState, useEffect } from 'react'
import { Users, UserCheck, Calendar, FileText, UserPlus, Clock, Filter, AlertTriangle, UserX, FileQuestion, ClipboardList } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { collection, query, where, getDocs, getCountFromServer } from 'firebase/firestore'
import { db } from '../firebase'

interface PanelDate {
  id: string
  date: string
}

const Dashboard: React.FC = () => {
  const [adviserCount, setAdviserCount] = useState<number>(0)
  const [candidateCount, setCandidateCount] = useState<number>(0)
  const [interviewCount, setInterviewCount] = useState<number>(0)
  const [ndaCount, setNDACount] = useState<number>(0)
  const [panelDateCount, setPanelDateCount] = useState<number>(0)
  const [panelDates, setPanelDates] = useState<PanelDate[]>([])
  const [selectedPanelDateId, setSelectedPanelDateId] = useState<string>('')
  const navigate = useNavigate()

  const [templateCount, setTemplateCount] = useState<number>(0)
  const [incompletepaperworkCount, setIncompletepaperworkCount] = useState<number>(0)
  const [noInterviewCount, setNoInterviewCount] = useState<number>(0)

  const [questionCategoryCount, setQuestionCategoryCount] = useState<number>(0)
  const [reportCount, setReportCount] = useState<number>(0)

  const [missingReportsCount, setMissingReportsCount] = useState<number>(0);

  useEffect(() => {
    const fetchPanelDates = async () => {
      const panelDatesSnapshot = await getDocs(collection(db, 'panelDates'))
      const panelDatesData = panelDatesSnapshot.docs.map(doc => ({ id: doc.id, date: doc.data().date } as PanelDate))
      setPanelDates(panelDatesData.sort((a, b) => a.date.localeCompare(b.date)))
    }

    fetchPanelDates()
  }, [])

  useEffect(() => {
    const fetchCounts = async () => {
      const advisersCollection = collection(db, 'advisers')
      const ndasCollection = collection(db, 'ndas')
      const panelDatesCollection = collection(db, 'panelDates')
      const templatesCollection = collection(db, 'templates')

      let candidatesQuery = collection(db, 'candidates')
      let interviewsQuery = collection(db, 'interviews')

      if (selectedPanelDateId) {
        candidatesQuery = query(candidatesQuery, where('panelDateId', '==', selectedPanelDateId))
        interviewsQuery = query(interviewsQuery, where('panelDateId', '==', selectedPanelDateId))
      }

      const [adviserSnapshot, candidateSnapshot, interviewSnapshot, ndaSnapshot, panelDateSnapshot, templateSnapshot] = await Promise.all([
        getCountFromServer(advisersCollection),
        getCountFromServer(candidatesQuery),
        getCountFromServer(interviewsQuery),
        getCountFromServer(ndasCollection),
        getCountFromServer(panelDatesCollection),
        getCountFromServer(templatesCollection)
      ])

      setAdviserCount(adviserSnapshot.data().count)
      setCandidateCount(candidateSnapshot.data().count)
      setInterviewCount(interviewSnapshot.data().count)
      setNDACount(ndaSnapshot.data().count)
      setPanelDateCount(panelDateSnapshot.data().count)
      setTemplateCount(templateSnapshot.data().count)

      // Fetch candidates with incomplete paperwork
      let incompletePaperworkQuery = query(
        collection(db, 'candidates'),
        where('paperworkReceived', 'in', ['No', 'Partial'])
      )
      if (selectedPanelDateId) {
        incompletePaperworkQuery = query(incompletePaperworkQuery, where('panelDateId', '==', selectedPanelDateId))
      }
      const incompletePaperworkSnapshot = await getCountFromServer(incompletePaperworkQuery)
      setIncompletepaperworkCount(incompletePaperworkSnapshot.data().count)

      // Fetch candidates without interviews
      const allCandidatesSnapshot = await getDocs(candidatesQuery)
      const allCandidateIds = allCandidatesSnapshot.docs.map(doc => doc.id)

      const interviewsSnapshot = await getDocs(interviewsQuery)
      const candidatesWithInterviews = new Set(interviewsSnapshot.docs.map(doc => doc.data().candidateId))

      const candidatesWithoutInterviews = allCandidateIds.filter(id => !candidatesWithInterviews.has(id))
      setNoInterviewCount(candidatesWithoutInterviews.length)

      const questionCategoriesCollection = collection(db, 'questionCategories')
      const questionCategorySnapshot = await getCountFromServer(questionCategoriesCollection)
      setQuestionCategoryCount(questionCategorySnapshot.data().count)

      const reportsCollection = collection(db, 'reports')
      let reportsQuery = reportsCollection
      if (selectedPanelDateId) {
        reportsQuery = query(reportsQuery, where('panelDateId', '==', selectedPanelDateId))
      }
      const reportSnapshot = await getCountFromServer(reportsQuery)
      setReportCount(reportSnapshot.data().count)

      // Fetch interviews and reports
      const interviewsSnapshot2 = await getDocs(interviewsQuery);
      const reportsSnapshot2 = await getDocs(reportsQuery);

      console.log(`Total interviews: ${interviewsSnapshot2.docs.length}`);
      console.log(`Total reports: ${reportsSnapshot2.docs.length}`);

      // Calculate missing reports
      let expectedReports = 0;
      let actualReports = reportsSnapshot2.docs.length;

      interviewsSnapshot2.forEach(doc => {
        const interview = doc.data();
        const adviserCount = 
          (interview.adviserIds && interview.adviserIds.length) ||
          (interview.adviserNames && interview.adviserNames.length) ||
          (interview.advisers && interview.advisers.length) ||
          0;
        console.log(`Interview ${doc.id}: ${adviserCount} advisers`);
        expectedReports += adviserCount;
      });

      console.log(`Expected reports: ${expectedReports}`);
      console.log(`Actual reports: ${actualReports}`);

      const missingReports = Math.max(0, expectedReports - actualReports);
      console.log(`Missing reports: ${missingReports}`);

      setMissingReportsCount(missingReports);

    }

    fetchCounts()
  }, [selectedPanelDateId])

  const handlePanelDateChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = event.target.value
    setSelectedPanelDateId(selectedId)
    // Update URL with selected panel date
    if (selectedId) {
      navigate(`?panelDateId=${selectedId}`)
    } else {
      navigate('/')
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
      <div className="flex items-center space-x-4 mb-6">
        <h2 className="text-2xl font-semibold flex items-center">
          <Calendar className="h-6 w-6 mr-2 text-gray-500" />
          Filter by Panel Date:
        </h2>
        <div className="relative flex-grow max-w-xs">
          <select
            id="panelDateFilter"
            value={selectedPanelDateId}
            onChange={handlePanelDateChange}
            className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md shadow-sm"
          >
            <option value="">All Panel Dates</option>
            {panelDates.map((panelDate) => (
              <option key={panelDate.id} value={panelDate.id}>
                {new Date(panelDate.date).toLocaleDateString()}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
            <Filter className="h-4 w-4" />
          </div>
        </div>
      </div>
      
      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Candidates and Interviews</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
          <DashboardCard
            title="Candidates"
            count={candidateCount}
            icon={<Users className="h-8 w-8 text-blue-500" />}
            link={`/candidates${selectedPanelDateId ? `?panelDateId=${selectedPanelDateId}` : ''}`}
          />
          <DashboardCard
            title="Interviews"
            count={interviewCount}
            icon={<Calendar className="h-8 w-8 text-green-500" />}
            link={`/interviews${selectedPanelDateId ? `?panelDateId=${selectedPanelDateId}` : ''}`}
          />
          <DashboardCard
            title="Adviser Reports"
            count={reportCount}
            icon={<ClipboardList className="h-8 w-8 text-teal-500" />}
            link={`/adviser-report${selectedPanelDateId ? `?panelDateId=${selectedPanelDateId}` : ''}`}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <DashboardCard
            title="Incomplete Paperwork"
            count={incompletepaperworkCount}
            icon={<AlertTriangle className="h-8 w-8 text-amber-500" />}
            link={`/candidates${selectedPanelDateId ? `?panelDateId=${selectedPanelDateId}&paperwork=incomplete` : '?paperwork=incomplete'}`}
          />
          <DashboardCard
            title="Candidates With No Interviews"
            count={noInterviewCount}
            icon={<UserX className="h-8 w-8 text-red-500" />}
            link={`/candidates${selectedPanelDateId ? `?panelDateId=${selectedPanelDateId}&interviews=none` : '?interviews=none'}`}
          />
          <DashboardCard
            title="Missing Adviser Reports"
            count={missingReportsCount}
            icon={<FileQuestion className="h-8 w-8 text-orange-500" />}
            link={`/interviews${selectedPanelDateId ? `?panelDateId=${selectedPanelDateId}&missingReports=true` : '?missingReports=true'}`}
          />
        </div>
      </div>
      
      <div>
        <h2 className="text-2xl font-semibold mb-4">Other Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <DashboardCard
            title="Advisers"
            count={adviserCount}
            icon={<UserCheck className="h-8 w-8 text-green-500" />}
            link="/advisers"
          />
          <DashboardCard
            title="Templates"
            count={templateCount}
            icon={<FileText className="h-8 w-8 text-yellow-500" />}
            link="/templates"
          />
          <DashboardCard
            title="NDAs"
            count={ndaCount}
            icon={<UserPlus className="h-8 w-8 text-purple-500" />}
            link="/ndas"
          />
          <DashboardCard
            title="Panel Dates"
            count={panelDateCount}
            icon={<Clock className="h-8 w-8 text-indigo-500" />}
            link="/panel-dates"
          />
          <DashboardCard
            title="Question Categories"
            count={questionCategoryCount}
            icon={<FileQuestion className="h-8 w-8 text-purple-500" />}
            link="/question-categories"
          />
        </div>
      </div>
    </div>
  )
}

// ... rest of the file remains the same

const DashboardCard: React.FC<{ title: string; count: number; icon: React.ReactNode; link: string }> = ({
  title,
  count,
  icon,
  link,
}) => (
  <Link to={link} className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow">
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      {icon}
    </div>
    <p className="text-3xl font-bold">{count}</p>
  </Link>
)

export default Dashboard