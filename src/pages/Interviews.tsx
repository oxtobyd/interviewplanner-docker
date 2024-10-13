import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useForm, SubmitHandler, Controller } from 'react-hook-form'
import { Plus, Edit, Trash2, Mail, User, FileText } from 'lucide-react'
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, where, getDocs, getDoc } from 'firebase/firestore'
import { db } from '../firebase' // Ensure this path is correct for your project structure
import { useLocation, useNavigate } from 'react-router-dom'

interface Candidate {
  id: string
  surname: string
  forename: string
  questionCategory: string
}

interface Adviser {
  id: string
  name: string
  email: string // Add this line
}

interface SelectedAdviser {
  id: string
  isLead: boolean
}

interface PanelDate {
  id: string
  date: string
}

interface Interview {
  id: string
  candidateId: string
  candidateName: string
  adviserNames: string[]
  category: string
  panelDateId: string // Changed from date to panelDateId
  leadAdviserName: string | null
  emailSent: boolean;
}

interface InterviewFormData {
  candidateId: string
  category: string
  panelDateId: string // Changed from date to panelDateId
}

interface Template {
  id: string
  name: string
  content: string
  type: 'adviser_email' | 'candidate_letter'
  category: string
}

interface Report {
  id?: string;
  adviserId: string;
  candidateId: string;
  panelDateId: string;
  questionCategory: string;
  attributes: {
    [key: string]: {
      id: string;
      name: string;
      value: string;
    }
  };
  responseToQuestion: string;
  timestamp: string;
}

const interviewCategories = [
  "Answer the Question",
  "Selection Criteria",
  "Formation Criteria",
  "Selection Qualities",
  "Formation Qualities"
]

const MAX_ADVISERS = 2

const Interviews: React.FC = () => {
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [availableCandidates, setAvailableCandidates] = useState<Candidate[]>([])
  const [advisers, setAdvisers] = useState<Adviser[]>([])
  const [panelDates, setPanelDates] = useState<PanelDate[]>([]) // New state for Panel Dates
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedAdvisers, setSelectedAdvisers] = useState<SelectedAdviser[]>([])
  const { register, handleSubmit, reset, control, setValue, watch } = useForm<InterviewFormData>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [allCandidates, setAllCandidates] = useState<Candidate[]>([])
  const selectedCandidateId = watch('candidateId')
  const location = useLocation()
  const [selectedCandidateCategory, setSelectedCandidateCategory] = useState<string | null>(null);
  const [filteredCandidateId, setFilteredCandidateId] = useState<string | null>(null);
  const navigate = useNavigate();
  const [questionCategories, setQuestionCategories] = useState<{ id: string; category: string; generalCategory: string }[]>([]);
  const [submitSuccess, setSubmitSuccess] = useState<boolean>(false);
  const [interviewToDelete, setInterviewToDelete] = useState<string | null>(null);
  const [reports, setReports] = useState<Report[]>([])
  const [filteredInterviews, setFilteredInterviews] = useState<Interview[]>([])
  const [selectedPanelDate, setSelectedPanelDate] = useState<string>(() => {
    const searchParams = new URLSearchParams(location.search);
    return searchParams.get('panelDateId') || '';
  });
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showMissingReportsOnly, setShowMissingReportsOnly] = useState(false);

  const resetForm = () => {
    reset({
      candidateId: '',
      category: '',
      panelDateId: '',
    });
    setSelectedAdvisers([]);
    setSelectedCandidateCategory(null);
    setEditingId(null);

    // Preserve URL parameters
    const searchParams = new URLSearchParams(location.search);
    const newInterviewCandidateId = searchParams.get('newInterview');
    const filteredCandidateId = searchParams.get('candidateId');

    if (newInterviewCandidateId) {
      setValue('candidateId', newInterviewCandidateId);
      setFilteredCandidateId(newInterviewCandidateId);
      const selectedCandidate = allCandidates.find(c => c.id === newInterviewCandidateId);
      if (selectedCandidate) {
        setSelectedCandidateCategory(selectedCandidate.questionCategory);
        setValue('panelDateId', selectedCandidate.panelDateId);
        
        const questionCategoryData = questionCategories.find(qc => qc.category === selectedCandidate.questionCategory);
        if (questionCategoryData) {
          setValue('category', questionCategoryData.generalCategory);
        }
      }
    } else if (filteredCandidateId) {
      setFilteredCandidateId(filteredCandidateId);
      const selectedCandidate = allCandidates.find(c => c.id === filteredCandidateId);
      if (selectedCandidate) {
        setValue('panelDateId', selectedCandidate.panelDateId);
        
        const questionCategoryData = questionCategories.find(qc => qc.category === selectedCandidate.questionCategory);
        if (questionCategoryData) {
          setValue('category', questionCategoryData.generalCategory);
        }
      }
    }
  };

  useEffect(() => {
    console.log('Effect triggered: URL params changed');
    const searchParams = new URLSearchParams(location.search);
    const panelDateId = searchParams.get('panelDateId');
    const candidateId = searchParams.get('candidateId');

    setSelectedPanelDate(panelDateId || '');
    setFilteredCandidateId(candidateId);

    // Update URL if needed
    const newSearchParams = new URLSearchParams();
    if (panelDateId) newSearchParams.set('panelDateId', panelDateId);
    if (candidateId) newSearchParams.set('candidateId', candidateId);
    navigate(`/interviews?${newSearchParams.toString()}`, { replace: true });
  }, [location.search, navigate]);

  const getReportCount = useCallback((candidateId: string, panelDateId: string, adviserNames: string[]) => {
    return reports.filter(report => 
      report.candidateId === candidateId && 
      report.panelDateId === panelDateId &&
      adviserNames.includes(advisers.find(a => a.id === report.adviserId)?.name || '')
    ).length;
  }, [reports, advisers]);

  useEffect(() => {
    console.log('Effect triggered: Fetching interviews');
    const fetchInterviews = () => {
      let interviewsQuery = collection(db, 'interviews');
      
      if (selectedPanelDate) {
        interviewsQuery = query(interviewsQuery, where('panelDateId', '==', selectedPanelDate));
      }

      const unsubscribe = onSnapshot(interviewsQuery, (querySnapshot) => {
        console.log(`Firestore read: Interviews (${querySnapshot.docs.length} documents)`);
        const fetchedInterviews = querySnapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data(),
          emailSent: doc.data().emailSent || false
        } as Interview));
        setInterviews(fetchedInterviews);
      });

      return unsubscribe;
    };

    const unsubscribe = fetchInterviews();
    return () => unsubscribe();
  }, [selectedPanelDate]);

  useEffect(() => {
    const filteredInterviews = interviews.filter(interview => {
      const meetsDateFilter = !selectedPanelDate || interview.panelDateId === selectedPanelDate;
      const meetsCandidateFilter = !filteredCandidateId || interview.candidateId === filteredCandidateId;
      return meetsDateFilter && meetsCandidateFilter;
    });

    setFilteredInterviews(filteredInterviews);
  }, [interviews, selectedPanelDate, filteredCandidateId]);

  useEffect(() => {
    console.log('Effect triggered: Fetching candidates');
    const fetchCandidates = async () => {
      const searchParams = new URLSearchParams(location.search);
      const panelDateId = searchParams.get('panelDateId');

      let candidatesQuery = collection(db, 'candidates');
      if (panelDateId) {
        candidatesQuery = query(candidatesQuery, where('panelDateId', '==', panelDateId));
      }
      
      const unsubscribe = onSnapshot(candidatesQuery, (snapshot) => {
        console.log(`Firestore read: Candidates (${snapshot.docs.length} documents)`);
        const candidateData = snapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data(),
          name: `${doc.data().forename} ${doc.data().surname}`,
          questionCategory: doc.data().questionCategory
        } as Candidate));
        setAllCandidates(candidateData);
      });

      return () => unsubscribe();
    };

    fetchCandidates();
  }, [location.search]);

  useEffect(() => {
    console.log('Effect triggered: Fetching advisers');
    const fetchAdvisers = async () => {
      const advisersRef = collection(db, 'advisers')
      
      const unsubscribe = onSnapshot(query(advisersRef), (snapshot) => {
        console.log(`Firestore read: Advisers (${snapshot.docs.length} documents)`);
        const adviserData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Adviser))
        // Sort advisers alphabetically by name
        const sortedAdviserData = adviserData.sort((a, b) => a.name.localeCompare(b.name));
        setAdvisers(sortedAdviserData)
      })

      return () => unsubscribe()
    }

    fetchAdvisers()
  }, [])

  useEffect(() => {
    console.log('Effect triggered: Fetching panel dates');
    const fetchPanelDates = async () => {
      const panelDatesRef = collection(db, 'panelDates')
      
      const unsubscribe = onSnapshot(query(panelDatesRef), (snapshot) => {
        console.log(`Firestore read: Panel Dates (${snapshot.docs.length} documents)`);
        const panelDateData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PanelDate))
        setPanelDates(panelDateData.sort((a, b) => a.date.localeCompare(b.date)))
      })

      return () => unsubscribe()
    }

    fetchPanelDates()
  }, [])

  useEffect(() => {
    const candidateInterviewCounts = interviews.reduce((counts, interview) => {
      counts[interview.candidateId] = (counts[interview.candidateId] || 0) + 1
      return counts
    }, {} as Record<string, number>)

    const availableCandidates = allCandidates.filter(candidate => 
      (candidateInterviewCounts[candidate.id] || 0) < 2 || candidate.id === selectedCandidateId
    )

    setAvailableCandidates(availableCandidates)
  }, [interviews, allCandidates, selectedCandidateId])

  useEffect(() => {
    console.log('Effect triggered: Fetching question categories');
    const fetchQuestionCategories = async () => {
      const questionCategoriesRef = collection(db, 'questionCategories');
      const unsubscribe = onSnapshot(questionCategoriesRef, (snapshot) => {
        console.log(`Firestore read: Question Categories (${snapshot.docs.length} documents)`);
        const questionCategoryData = snapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data() 
        } as { id: string; category: string; generalCategory: string }));
        setQuestionCategories(questionCategoryData);
      });

      return () => unsubscribe();
    };

    fetchQuestionCategories();
  }, []);

  useEffect(() => {
    console.log('Effect triggered: Fetching reports');
    const fetchReports = async () => {
      const reportsRef = collection(db, 'reports');
      const unsubscribe = onSnapshot(reportsRef, (snapshot) => {
        console.log(`Firestore read: Reports (${snapshot.docs.length} documents)`);
        const reportData = snapshot.docs.map(doc => ({
          id: doc.id,
          candidateId: doc.data().candidateId,
          panelDateId: doc.data().panelDateId,
          adviserId: doc.data().adviserId  // Make sure this field is included
        }));
        setReports(reportData);
      });

      return () => unsubscribe();
    };

    fetchReports();
  }, []);

  const handleAdviserSelection = (adviserId: string) => {
    setSelectedAdvisers(prev => {
      const isSelected = prev.some(a => a.id === adviserId)
      if (isSelected) {
        // If the adviser is already selected, remove them
        return prev.filter(a => a.id !== adviserId)
      } else if (prev.length < MAX_ADVISERS) {
        // If the adviser is not selected and we haven't reached the maximum, add them
        return [...prev, { id: adviserId, isLead: prev.length === 0 }] // First selected adviser becomes lead by default
      } else {
        // If we've reached the maximum, don't change the selection
        return prev
      }
    })
  }

  const toggleLeadAdviser = (adviserId: string) => {
    setSelectedAdvisers(prev => 
      prev.map(a => ({ ...a, isLead: a.id === adviserId }))
    )
  }

  const onSubmit: SubmitHandler<InterviewFormData> = async (data) => {
    console.log('Submitting interview form', data);
    try {
      setLoading(true);
      setError(null);
      setSubmitSuccess(false);

      const selectedCandidate = availableCandidates.find(c => c.id === data.candidateId)
      const selectedAdviserObjects = advisers.filter(a => selectedAdvisers.some(sa => sa.id === a.id))
      const leadAdviser = selectedAdviserObjects.find(a => selectedAdvisers.find(sa => sa.id === a.id)?.isLead)
      const selectedPanelDate = panelDates.find(pd => pd.id === data.panelDateId)

      if (!selectedCandidate || selectedAdviserObjects.length === 0 || !selectedPanelDate) {
        throw new Error('Selected candidate, advisers, or panel date not found')
      }

      // Check if this is a second interview for the candidate
      const existingInterviews = interviews.filter(i => i.candidateId === data.candidateId)
      if (existingInterviews.length >= 2 && !editingId) {
        throw new Error('This candidate already has two interviews scheduled')
      }

      const interviewData = {
        ...data,
        candidateName: `${selectedCandidate.forename} ${selectedCandidate.surname}`,
        adviserNames: selectedAdviserObjects.map(a => a.name),
        leadAdviserName: leadAdviser ? leadAdviser.name : null,
        emailSent: false // Add this line
      }

      if (editingId) {
        await updateDoc(doc(db, 'interviews', editingId), interviewData);
      } else {
        await addDoc(collection(db, 'interviews'), interviewData);
      }

      setSubmitSuccess(true);
      resetForm(); // Reset the form after successful submission
      // The interviews state will be automatically updated by the onSnapshot listener
    } catch (err) {
      setError('An error occurred while saving the interview');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const editInterview = (interview: Interview) => {
    console.log('Editing interview', interview);
    setEditingId(interview.id);
    setValue('candidateId', interview.candidateId);
    setValue('category', interview.category);
    setValue('panelDateId', interview.panelDateId);
    const advisersToSet = advisers
      .filter(a => interview.adviserNames.includes(a.name))
      .map(a => ({ 
        id: a.id, 
        isLead: a.name === interview.leadAdviserName 
      }))
      .slice(0, MAX_ADVISERS);
    setSelectedAdvisers(advisersToSet);

    // Find the candidate and set their Question Category
    const selectedCandidate = allCandidates.find(c => c.id === interview.candidateId);
    if (selectedCandidate) {
      setSelectedCandidateCategory(selectedCandidate.questionCategory);
      
      // Find the general category for the selected question category
      const questionCategoryData = questionCategories.find(qc => qc.category === selectedCandidate.questionCategory);
      if (questionCategoryData) {
        setValue('category', questionCategoryData.generalCategory);
      }
    }

    // Scroll to the form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const deleteInterview = (id: string) => {
    setInterviewToDelete(id);
  };

  const confirmDelete = async () => {
    if (interviewToDelete) {
      try {
        setLoading(true);
        setError(null);
        await deleteDoc(doc(db, 'interviews', interviewToDelete));
        setInterviewToDelete(null);
        resetForm(); // Reset the form after successful deletion
        // The interviews state will be automatically updated by the onSnapshot listener
      } catch (err) {
        setError('An error occurred while deleting the interview');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
  };

  const generateEmail = async (interview: Interview) => {
    console.log('Generating email for interview', interview);
    try {
      // Fetch the candidate data
      const candidateRef = doc(db, 'candidates', interview.candidateId)
      const candidateSnap = await getDoc(candidateRef)
      
      if (!candidateSnap.exists()) {
        throw new Error('Candidate not found')
      }

      const candidateData = candidateSnap.data() as Candidate
      const questionCategory = candidateData.questionCategory

      // Determine the number of advisers
      const adviserCount = interview.adviserNames.length
      const adviserPattern = adviserCount > 1 ? 'x2 Adviser' : 'x1 Adviser'

      // Fetch the matching template
      const templatesRef = collection(db, 'templates')
      const q = query(
        templatesRef, 
        where('type', '==', 'adviser_email'),
        where('category', '==', questionCategory)
      )
      const querySnapshot = await getDocs(q)
      
      if (querySnapshot.empty) {
        throw new Error('No matching template found')
      }

      // Find the correct template based on adviser count
      let template: Template | null = null
      querySnapshot.forEach((doc) => {
        const templateData = doc.data() as Template
        const templateName = templateData.name.toLowerCase()
        if (templateName.includes(adviserPattern.toLowerCase())) {
          template = templateData
        }
      })

      if (!template) {
        throw new Error(`No template found for ${questionCategory} with ${adviserPattern}`)
      }

      // Helper function to safely replace all occurrences of a placeholder
      const replaceAllPlaceholders = (content: string, placeholder: string, value: string) => {
        const regex = new RegExp(`{{${placeholder}}}`, 'g')
        return content.replace(regex, value || '[Not available]')
      }

      // Helper function to get first name
      const getFirstName = (fullName: string) => fullName.split(' ')[0];

      // Get the lead adviser's first name
      const leadAdviserFirstName = getFirstName(interview.leadAdviserName);

      // Replace placeholders in the template
      let emailContent = template.content;
      emailContent = replaceAllPlaceholders(emailContent, 'candidateName', `${getFirstName(candidateData.forename)} ${candidateData.surname}`);
      emailContent = replaceAllPlaceholders(emailContent, 'adviserNames', interview.adviserNames.map(getFirstName).join(', '));
      emailContent = replaceAllPlaceholders(emailContent, 'category', interview.category);
      emailContent = replaceAllPlaceholders(emailContent, 'panelDate', new Date(panelDates.find(pd => pd.id === interview.panelDateId)!.date).toLocaleDateString());
      emailContent = replaceAllPlaceholders(emailContent, 'leadAdviserName', leadAdviserFirstName);

      // Replace candidate-specific placeholders
      emailContent = replaceAllPlaceholders(emailContent, 'surname', candidateData.surname);
      emailContent = replaceAllPlaceholders(emailContent, 'forename', getFirstName(candidateData.forename));
      emailContent = replaceAllPlaceholders(emailContent, 'email', candidateData.email);
      emailContent = replaceAllPlaceholders(emailContent, 'questionCategory', candidateData.questionCategory);
      emailContent = replaceAllPlaceholders(emailContent, 'paperworkReceived', candidateData.paperworkReceived);
      emailContent = replaceAllPlaceholders(emailContent, 'diocese', candidateData.diocese);
      emailContent = replaceAllPlaceholders(emailContent, 'sponsoringBishop', candidateData.sponsoringBishop);
      emailContent = replaceAllPlaceholders(emailContent, 'ddoName', candidateData.ddoName);
      emailContent = replaceAllPlaceholders(emailContent, 'ddoEmail', candidateData.ddoEmail);

      // Fetch adviser email addresses
      const adviserEmails = await Promise.all(
        interview.adviserNames.map(async (name) => {
          const adviserQuery = query(collection(db, 'advisers'), where('name', '==', name));
          const adviserSnapshot = await getDocs(adviserQuery);
          if (!adviserSnapshot.empty) {
            return adviserSnapshot.docs[0].data().email;
          }
          return null;
        })
      );

      // Filter out any null values (in case an adviser email wasn't found)
      const validAdviserEmails = adviserEmails.filter(email => email !== null);

      // Create mailto link
      const mailtoLink = `mailto:${validAdviserEmails.join(',')}?subject=${encodeURIComponent("Candidates Panel - Interviewing")}&body=${encodeURIComponent(emailContent)}`;

      // Open the default email client
      window.location.href = mailtoLink;

      // Update the interview record to mark email as sent
      const interviewRef = doc(db, 'interviews', interview.id);
      await updateDoc(interviewRef, { emailSent: true });

      console.log('Email draft opened in default email client and interview record updated');
    } catch (error) {
      console.error('Error generating email:', error);
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      alert('Error generating email. Please check the console for more details.');
    }
  };

  const handleCandidateChange = (candidateId: string) => {
    setValue('candidateId', candidateId);
    const selectedCandidate = allCandidates.find(c => c.id === candidateId);
    if (selectedCandidate) {
      setSelectedCandidateCategory(selectedCandidate.questionCategory);
      setValue('panelDateId', selectedCandidate.panelDateId);
      
      // Find the general category for the selected question category
      const questionCategoryData = questionCategories.find(qc => qc.category === selectedCandidate.questionCategory);
      if (questionCategoryData) {
        setValue('category', questionCategoryData.generalCategory);
      } else {
        setValue('category', '');
      }
    } else {
      setSelectedCandidateCategory(null);
      setValue('panelDateId', '');
      setValue('category', '');
    }
  };

  // Add a cancel edit function if you don't already have one
  const cancelEdit = () => {
    resetForm(); // Use the resetForm function here as well
  }

  const navigateToCandidateForm = (candidateId: string) => {
    navigate(`/candidates?edit=${candidateId}`);
  };

  const navigateToReportForm = (interview: Interview) => {
    const candidate = allCandidates.find(c => c.id === interview.candidateId);
    const queryParams = new URLSearchParams({
      panelDateId: interview.panelDateId,
      candidateId: interview.candidateId,
      candidateName: interview.candidateName,
      questionCategory: candidate ? candidate.questionCategory : '',
      assignedAdvisers: JSON.stringify(interview.adviserNames), // Add this line
    }).toString();
    navigate(`/adviser-report?${queryParams}`);
  };

  const handlePanelDateChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newPanelDateId = event.target.value;
    setSelectedPanelDate(newPanelDateId);
    
    const searchParams = new URLSearchParams(location.search);
    if (newPanelDateId) {
      searchParams.set('panelDateId', newPanelDateId);
    } else {
      searchParams.delete('panelDateId');
    }
    
    // Preserve the candidateId parameter if it exists
    if (filteredCandidateId) {
      searchParams.set('candidateId', filteredCandidateId);
    }
    
    navigate(`/interviews?${searchParams.toString()}`, { replace: true });
  };

  const getInterviewsWithMissingReports = () => {
    return interviews.filter(interview => {
      const reportCount = getReportCount(interview.candidateId, interview.panelDateId);
      return reportCount < (interview.adviserNames?.length ?? 0);
    });
  };

  const sortedInterviews = useMemo(() => {
    return [...filteredInterviews].sort((a, b) => {
      if (sortOrder === 'asc') {
        return a.candidateName.localeCompare(b.candidateName);
      } else {
        return b.candidateName.localeCompare(a.candidateName);
      }
    });
  }, [filteredInterviews, sortOrder]);

  const toggleSort = () => {
    setSortOrder(prevOrder => prevOrder === 'asc' ? 'desc' : 'asc');
  };

  const getAdviserReportStatus = useCallback((candidateId: string, panelDateId: string, adviserName: string) => {
    const adviser = advisers.find(a => a.name === adviserName);
    if (!adviser) return false;
    
    return reports.some(report => 
      report.candidateId === candidateId && 
      report.panelDateId === panelDateId &&
      report.adviserId === adviser.id
    );
  }, [reports, advisers]);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Interviews</h1>
        <div className="flex items-center">
          <label className="mr-2 text-sm font-medium text-gray-700">Filter by Panel Date:</label>
          <select 
            value={selectedPanelDate}
            onChange={handlePanelDateChange}
            className="input w-64"
          >
            <option value="">All Panel Dates</option>
            {panelDates.map((panelDate) => (
              <option key={panelDate.id} value={panelDate.id}>
                {new Date(panelDate.date).toLocaleDateString()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filteredCandidateId && (
        <div className="mb-4 text-blue-600">Showing interviews for selected candidate</div>
      )}
      <form onSubmit={handleSubmit(onSubmit)} className="mb-6 bg-white p-4 rounded-lg shadow-md">
        <div className="space-y-4">
          {/* Rest of the form fields */}
          <Controller
            name="candidateId"
            control={control}
            rules={{ required: 'Please select a candidate' }}
            render={({ field, fieldState: { error } }) => (
              <div>
                <select 
                  {...field} 
                  onChange={(e) => handleCandidateChange(e.target.value)}
                  className="input w-full"
                >
                  <option value="">Select Candidate</option>
                  {availableCandidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
                {error && <span className="text-red-500 text-sm">{error.message}</span>}
              </div>
            )}
          />
          {selectedCandidateCategory && (
            <div className="text-sm text-gray-600">
              Question Category: {selectedCandidateCategory}
            </div>
          )}
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700 mb-1">Advisers:</label>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {advisers.map((adviser) => (
                <div key={adviser.id} className="flex items-center">
                  <input
                    type="checkbox"
                    className="form-checkbox h-5 w-5 text-blue-600"
                    checked={selectedAdvisers.some(a => a.id === adviser.id)}
                    onChange={() => handleAdviserSelection(adviser.id)}
                    disabled={!selectedAdvisers.some(a => a.id === adviser.id) && selectedAdvisers.length >= MAX_ADVISERS}
                  />
                  <button
                    type="button"
                    onClick={() => toggleLeadAdviser(adviser.id)}
                    disabled={!selectedAdvisers.some(a => a.id === adviser.id)}
                    className={`ml-2 px-2 py-1 text-sm rounded ${
                      selectedAdvisers.find(a => a.id === adviser.id)?.isLead
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    {selectedAdvisers.find(a => a.id === adviser.id)?.isLead ? 'Lead' : 'Set as Lead'}
                  </button>
                  <span className="ml-2 text-base">{adviser.name}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Controller
              name="category"
              control={control}
              render={({ field }) => (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Interview Category</label>
                  <input 
                    {...field} 
                    className="input w-full bg-gray-100" 
                    readOnly 
                    value={field.value || 'Not assigned'}
                  />
                </div>
              )}
            />
            <Controller
              name="panelDateId"
              control={control}
              render={({ field }) => (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Panel Date</label>
                  <input 
                    {...field} 
                    className="input w-full bg-gray-100" 
                    readOnly 
                    value={field.value ? new Date(panelDates.find(pd => pd.id === field.value)?.date || '').toLocaleDateString() : 'Not assigned'}
                  />
                </div>
              )}
            />
          </div>
        </div>
        <div className="flex justify-between mt-4">
          <button type="submit" className="btn-primary">
            {editingId ? 'Update Interview' : 'Schedule Interview'}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit} className="btn-secondary">
              Cancel Edit
            </button>
          )}
        </div>
      </form>
      <div className="bg-white rounded-lg shadow-md overflow-hidden mt-6">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th 
                className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                onClick={toggleSort}
              >
                Candidate {sortOrder === 'asc' ? '▲' : '▼'}
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Adviser(s)</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reports</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Panel Date</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedInterviews.map((interview) => (
              <tr 
                key={interview.id} 
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => editInterview(interview)}
              >
                <td className="px-4 py-2 whitespace-nowrap">{interview.candidateName}</td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {interview.adviserNames.map(name => (
                    <div key={name} className="leading-tight">
                      {name === interview.leadAdviserName ? '* ' : ''}
                      {name}
                      {' '}
                      {getAdviserReportStatus(interview.candidateId, interview.panelDateId, name) 
                        ? <span className="text-green-500">✓</span> 
                        : <span className="text-red-500">✗</span>}
                    </div>
                  ))}
                </td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {getReportCount(interview.candidateId, interview.panelDateId, interview.adviserNames)} / {interview.adviserNames.length}
                </td>
                <td className="px-4 py-2 whitespace-nowrap">{interview.category}</td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {panelDates.find(pd => pd.id === interview.panelDateId)
                    ? new Date(panelDates.find(pd => pd.id === interview.panelDateId)!.date).toLocaleDateString()
                    : 'Not assigned'}
                </td>
                <td className="px-4 py-2 whitespace-nowrap text-sm font-medium">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      editInterview(interview);
                    }} 
                    className="text-blue-600 hover:text-blue-900 mr-2"
                    title="Edit Interview"
                  >
                    <Edit className="h-5 w-5" />
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteInterview(interview.id);
                    }} 
                    className="text-red-600 hover:text-red-900 mr-2"
                    title="Delete Interview"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      navigateToCandidateForm(interview.candidateId);
                    }} 
                    className="text-purple-600 hover:text-purple-900 mr-2"
                    title="Edit Candidate"
                  >
                    <User className="h-5 w-5" />
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      generateEmail(interview);
                    }} 
                    className={`text-blue-600 hover:text-blue-900 mr-2 ${
                      interview.emailSent ? 'text-green-600 hover:text-green-900' : ''
                    }`}
                    title={interview.emailSent ? "Email Sent" : "Generate Adviser Email"}
                  >
                    <Mail 
                      className={`h-5 w-5 ${interview.emailSent ? 'text-green-600' : ''}`}
                      stroke="currentColor"
                      fill="none"
                    />
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      navigateToReportForm(interview);
                    }} 
                    className="text-indigo-600 hover:text-indigo-900"
                    title="Add Report Bands"
                  >
                    <FileText className="h-5 w-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <div className="text-red-500 mt-2">{error}</div>}
      {interviewToDelete && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3 text-center">
              <h3 className="text-lg leading-6 font-medium text-gray-900">Delete Interview</h3>
              <div className="mt-2 px-7 py-3">
                <p className="text-sm text-gray-500">
                  Are you sure you want to delete this interview? This action cannot be undone.
                </p>
              </div>
              <div className="items-center px-4 py-3">
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 bg-red-500 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-300"
                >
                  Delete
                </button>
                <button
                  onClick={() => setInterviewToDelete(null)}
                  className="mt-3 px-4 py-2 bg-white text-gray-800 text-base font-medium rounded-md w-full shadow-sm border border-gray-300 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Interviews