import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm, Controller, FieldError } from 'react-hook-form';
import { collection, addDoc, query, where, getDocs, getDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useLocation, useNavigate } from 'react-router-dom';
import { Edit, Trash2, X, ChevronUp, ChevronDown } from 'lucide-react';

interface Attribute {
  id: string;
  name: string;
}

interface QuestionCategory {
  id: string;
  name: string;
  category?: string;
  generalCategory?: string;
  attributes: Attribute[];
  answerTheQuestion: boolean;
}

interface Report {
  id?: string;
  adviserId: string;
  candidateId: string;
  panelDateId: string;
  questionCategory: string;
  attributes: { [key: string]: { id: string; name: string; value: number | string } };
  responseToQuestion: 'Yes' | 'No' | '';
}

interface Adviser {
  id: string;
  name: string;
}

interface Candidate {
  id: string;
  forename: string;
  surname: string;
}

interface PanelDate {
  id: string;
  date: string;
}

const encodeAttributeName = (name: string) => encodeURIComponent(name.replace(/\./g, '%2E'));
const decodeAttributeName = (name: string) => decodeURIComponent(name).replace(/%2E/g, '.');

const AdviserReport: React.FC = () => {
  const [advisers, setAdvisers] = useState<Adviser[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [panelDates, setPanelDates] = useState<PanelDate[]>([]);
  const [questionCategories, setQuestionCategories] = useState<QuestionCategory[]>([]);
  const [selectedAttributes, setSelectedAttributes] = useState<Attribute[]>([]);
  const { control, handleSubmit, formState: { errors }, watch, setValue, reset } = useForm<Report>();
  const location = useLocation();
  const navigate = useNavigate();

  const [reports, setReports] = useState<Report[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [selectedPanelDate, setSelectedPanelDate] = useState<PanelDate | null>(null);
  const [selectedQuestionCategory, setSelectedQuestionCategory] = useState<QuestionCategory | null>(null);
  const [assignedAdvisers, setAssignedAdviserNames] = useState<string[]>([]);

  const [queryParamsState, setQueryParamsState] = useState<URLSearchParams | null>(null);
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<boolean>(false);

  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [reportToDelete, setReportToDelete] = useState<string | null>(null);

  const [showNoCandidateDialog, setShowNoCandidateDialog] = useState(false);

  const [showResponseToQuestion, setShowResponseToQuestion] = useState(false);

  const [hasFullSetOfReports, setHasFullSetOfReports] = useState(false);
  const [existingReports, setExistingReports] = useState<Report[]>([]);

  const [sortField, setSortField] = useState<'adviser' | 'candidate'>('adviser');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const fetchData = useCallback(async () => {
    const searchParams = new URLSearchParams(location.search);
    const urlPanelDateId = searchParams.get('panelDateId');
    const urlCandidateId = searchParams.get('candidateId');
    const urlCandidateName = searchParams.get('candidateName');
    const urlQuestionCategory = searchParams.get('questionCategory');
    const urlAssignedAdvisers = JSON.parse(searchParams.get('assignedAdvisers') || '[]');

    // Fetch all necessary data
    const [
      advisersSnapshot,
      candidatesSnapshot,
      panelDatesSnapshot,
      questionCategoriesSnapshot
    ] = await Promise.all([
      getDocs(collection(db, 'advisers')),
      getDocs(collection(db, 'candidates')),
      getDocs(collection(db, 'panelDates')),
      getDocs(collection(db, 'questionCategories'))
    ]);

    const advisersData = advisersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Adviser));
    const candidatesData = candidatesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Candidate));
    const panelDatesData = panelDatesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PanelDate));
    const questionCategoriesData = questionCategoriesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as QuestionCategory));

    setAdvisers(advisersData);
    setCandidates(candidatesData);
    setPanelDates(panelDatesData);
    setQuestionCategories(questionCategoriesData);

    // Handle incoming data from Interview form
    if (urlCandidateId) {
      const selectedCandidate = candidatesData.find(c => c.id === urlCandidateId);
      if (selectedCandidate) {
        setSelectedCandidate(selectedCandidate);
        setValue('candidateId', selectedCandidate.id);
      }
    }

    if (urlPanelDateId) {
      const selectedPanelDate = panelDatesData.find(pd => pd.id === urlPanelDateId);
      if (selectedPanelDate) {
        setSelectedPanelDate(selectedPanelDate);
        setValue('panelDateId', selectedPanelDate.id);
      }
    }

    if (urlQuestionCategory) {
      const selectedQuestionCategory = questionCategoriesData.find(qc => qc.category === urlQuestionCategory);
      if (selectedQuestionCategory) {
        setSelectedQuestionCategory(selectedQuestionCategory);
        setValue('questionCategory', selectedQuestionCategory.id);
        setSelectedAttributes(selectedQuestionCategory.attributes);
      }
    }

    setAssignedAdviserNames(urlAssignedAdvisers);

    // Check if a report already exists for the given adviser and candidate
    if (urlAssignedAdvisers.length === 1 && urlCandidateId && urlPanelDateId) {
      const adviserId = advisersData.find(a => a.name === urlAssignedAdvisers[0])?.id;
      if (adviserId) {
        const existingReportQuery = query(
          collection(db, 'reports'),
          where('adviserId', '==', adviserId),
          where('candidateId', '==', urlCandidateId),
          where('panelDateId', '==', urlPanelDateId)
        );
        const existingReportSnapshot = await getDocs(existingReportQuery);
        if (!existingReportSnapshot.empty) {
          const existingReport = { id: existingReportSnapshot.docs[0].id, ...existingReportSnapshot.docs[0].data() } as Report;
          setEditingReportId(existingReport.id);
          setValue('adviserId', existingReport.adviserId);
          setValue('attributes', existingReport.attributes);
          // Set other fields as needed
        }
      }
    }

    // Fetch reports for the table
    let reportsQuery = collection(db, 'reports');
    if (urlPanelDateId) {
      reportsQuery = query(reportsQuery, where('panelDateId', '==', urlPanelDateId));
    }
    if (urlCandidateId) {
      reportsQuery = query(reportsQuery, where('candidateId', '==', urlCandidateId));
    } else if (urlCandidateName) {
      const candidateIds = candidatesData
        .filter(c => `${c.forename} ${c.surname}`.toLowerCase().includes(urlCandidateName.toLowerCase()))
        .map(c => c.id);
      if (candidateIds.length > 0) {
        reportsQuery = query(reportsQuery, where('candidateId', 'in', candidateIds));
      }
    }
    const reportsSnapshot = await getDocs(reportsQuery);
    setReports(reportsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Report)));

    setQueryParamsState(searchParams);
  }, [location.search, setValue]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Add this useEffect to handle query params
  useEffect(() => {
    if (queryParamsState) {
      const assignedAdviserNames = JSON.parse(queryParamsState.get('assignedAdvisers') || '[]');
      if (assignedAdviserNames.length === 1) {
        setValue('adviserId', advisers.find(a => assignedAdviserNames.includes(a.name))?.id || '');
      } else {
        setValue('adviserId', '');
      }
      const candidateId = queryParamsState.get('candidateId');
      if (!candidateId) {
        setShowNoCandidateDialog(true);
      } else {
        setShowNoCandidateDialog(false);
        // Check if a report already exists for the given adviser and candidate
        const fetchExistingReport = async () => {
          if (assignedAdviserNames.length === 1 && candidateId) {
            const adviserId = advisers.find(a => assignedAdviserNames.includes(a.name))?.id;
            if (adviserId) {
              const existingReportQuery = query(
                collection(db, 'reports'),
                where('adviserId', '==', adviserId),
                where('candidateId', '==', candidateId),
                where('panelDateId', '==', queryParamsState.get('panelDateId'))
              );
              const existingReportSnapshot = await getDocs(existingReportQuery);
              if (!existingReportSnapshot.empty) {
                const existingReport = { id: existingReportSnapshot.docs[0].id, ...existingReportSnapshot.docs[0].data() } as Report;
                setEditingReportId(existingReport.id);
                setValue('adviserId', existingReport.adviserId);
                // Set attributes
                if (existingReport.attributes) {
                  Object.entries(existingReport.attributes).forEach(([encodedKey, value]) => {
                    const decodedKey = decodeAttributeName(encodedKey);
                    setValue(`attributes.${decodedKey}`, value);
                  });
                }
                setValue('responseToQuestion', existingReport.responseToQuestion); // Add this line
                // Set other fields as needed
                const questionCategory = questionCategories.find(qc => qc.id === existingReport.questionCategory);
                if (questionCategory) {
                  setSelectedQuestionCategory(questionCategory);
                  setSelectedAttributes(questionCategory.attributes);
                  setShowResponseToQuestion(questionCategory.answerTheQuestion);
                }
              }
            }
          }
        };
        fetchExistingReport();
      }
    }
  }, [queryParamsState, advisers, questionCategories, setValue]);

  useEffect(() => {
    if (selectedQuestionCategory) {
      setSelectedAttributes(selectedQuestionCategory.attributes);
      setShowResponseToQuestion(selectedQuestionCategory.answerTheQuestion);
      
      // Reset the form fields based on the new selection
      if (selectedQuestionCategory.answerTheQuestion) {
        // Clear attributes if we're showing Response to Question
        setValue('attributes', {});
      } else {
        // Clear Response to Question if we're showing attributes
        setValue('responseToQuestion', '');
      }
    }
  }, [selectedQuestionCategory, setValue]);

  const handlePanelDateChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newPanelDateId = event.target.value;
    if (newPanelDateId) {
      navigate(`/adviser-report?panelDateId=${newPanelDateId}`);
    } else {
      navigate('/adviser-report');
    }
  };

  const onSubmit = async (data: Report) => {
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      const attributes = selectedAttributes.reduce((acc, attr) => {
        acc[attr.id] = {
          id: attr.id,
          name: attr.name,
          value: data.attributes[attr.id] || '',
        };
        return acc;
      }, {} as { [key: string]: { id: string; name: string; value: number | string } });

      const reportData = {
        ...data,
        attributes: showResponseToQuestion ? {} : attributes,
        responseToQuestion: showResponseToQuestion ? data.responseToQuestion : '',
        candidateId: selectedCandidate?.id,
        panelDateId: selectedPanelDate?.id,
        questionCategory: selectedQuestionCategory?.id,
        timestamp: new Date()
      };

      if (editingReportId) {
        // Update existing report
        await updateDoc(doc(db, 'reports', editingReportId), reportData);
        setReports(prevReports => prevReports.map(report => 
          report.id === editingReportId ? { ...report, ...reportData } : report
        ));
      } else {
        // Add new report
        const docRef = await addDoc(collection(db, 'reports'), reportData);
        setReports(prevReports => [...prevReports, { id: docRef.id, ...reportData }]);
      }

      setSubmitSuccess(true);
      
      // Reset attribute values and Adviser dropdown
      const resetValues = {
        adviserId: '',
        attributes: selectedAttributes.reduce((acc, attribute) => {
          acc[attribute.id] = '';
          return acc;
        }, {} as { [key: string]: string })
      };

      reset(resetValues, { keepDefaultValues: true });

      // Clear editing state
      setEditingReportId(null);

      // Instead of navigating, we'll just clear the form
      // The URL parameters will remain unchanged
      // navigate('/adviser-report');
      // setShowNoCandidateDialog(true);

      // Re-apply the initial state based on URL parameters
      if (queryParamsState) {
        const urlCandidateId = queryParamsState.get('candidateId');
        const urlPanelDateId = queryParamsState.get('panelDateId');
        const urlQuestionCategory = queryParamsState.get('questionCategory');
        const urlAssignedAdvisers = JSON.parse(queryParamsState.get('assignedAdvisers') || '[]');

        if (urlCandidateId) {
          const candidate = candidates.find(c => c.id === urlCandidateId);
          if (candidate) {
            setSelectedCandidate(candidate);
            setValue('candidateId', candidate.id);
          }
        }

        if (urlPanelDateId) {
          const panelDate = panelDates.find(pd => pd.id === urlPanelDateId);
          if (panelDate) {
            setSelectedPanelDate(panelDate);
            setValue('panelDateId', panelDate.id);
          }
        }

        if (urlQuestionCategory) {
          const questionCategory = questionCategories.find(qc => qc.category === urlQuestionCategory);
          if (questionCategory) {
            setSelectedQuestionCategory(questionCategory);
            setValue('questionCategory', questionCategory.id);
            setSelectedAttributes(questionCategory.attributes);
            setShowResponseToQuestion(questionCategory.answerTheQuestion);
          }
        }

        if (urlAssignedAdvisers.length === 1) {
          const adviser = advisers.find(a => urlAssignedAdvisers.includes(a.name));
          if (adviser) {
            setValue('adviserId', adviser.id);
          }
        }
      }

    } catch (error) {
      console.error("Error saving document: ", error);
      setSubmitError('An error occurred while saving the report. Please try again.');
    }
  };

  const handleEdit = (report: Report) => {
    setEditingReportId(report.id);
    
    // Clear all form fields first
    reset({
      adviserId: '',
      candidateId: '',
      panelDateId: '',
      questionCategory: '',
      attributes: {},
      responseToQuestion: '',
    });

    // Set new values
    setValue('adviserId', report.adviserId);
    setValue('candidateId', report.candidateId);
    setValue('panelDateId', report.panelDateId);
    setValue('questionCategory', report.questionCategory);
    setValue('responseToQuestion', report.responseToQuestion);

    // Set other fields as needed
    const questionCategory = questionCategories.find(qc => qc.id === report.questionCategory);
    if (questionCategory) {
      setSelectedQuestionCategory(questionCategory);
      setSelectedAttributes(questionCategory.attributes);
      setShowResponseToQuestion(questionCategory.answerTheQuestion);
    }

    // Set new attribute values
    if (report.attributes) {
      Object.entries(report.attributes).forEach(([attributeId, attributeData]) => {
        setValue(`attributes.${attributeId}`, attributeData.value);
      });
    }

    // Set selected candidate and panel date
    const candidate = candidates.find(c => c.id === report.candidateId);
    if (candidate) {
      setSelectedCandidate(candidate);
    }
    const panelDate = panelDates.find(pd => pd.id === report.panelDateId);
    if (panelDate) {
      setSelectedPanelDate(panelDate);
    }

    // Scroll to the top of the form
    window.scrollTo(0, 0);
  };

  const handleCancelEdit = () => {
    setEditingReportId(null);
    
    // Clear all form fields, including attributes
    reset({
      adviserId: '',
      candidateId: '',
      panelDateId: '',
      questionCategory: '',
      attributes: {}, // This will clear all attribute fields
      responseToQuestion: '',
    });

    setSelectedCandidate(null);
    setSelectedPanelDate(null);
    setSelectedQuestionCategory(null);
    setSelectedAttributes([]);
    setSubmitError(null);
    setSubmitSuccess(false);

    // Re-apply the initial state based on URL parameters
    if (queryParamsState) {
      const urlCandidateId = queryParamsState.get('candidateId');
      const urlPanelDateId = queryParamsState.get('panelDateId');
      const urlQuestionCategory = queryParamsState.get('questionCategory');
      const urlAssignedAdvisers = JSON.parse(queryParamsState.get('assignedAdvisers') || '[]');

      if (urlCandidateId) {
        const candidate = candidates.find(c => c.id === urlCandidateId);
        if (candidate) {
          setSelectedCandidate(candidate);
          setValue('candidateId', candidate.id);
        }
      }

      if (urlPanelDateId) {
        const panelDate = panelDates.find(pd => pd.id === urlPanelDateId);
        if (panelDate) {
          setSelectedPanelDate(panelDate);
          setValue('panelDateId', panelDate.id);
        }
      }

      if (urlQuestionCategory) {
        const questionCategory = questionCategories.find(qc => qc.category === urlQuestionCategory);
        if (questionCategory) {
          setSelectedQuestionCategory(questionCategory);
          setValue('questionCategory', questionCategory.id);
          setSelectedAttributes(questionCategory.attributes);
          setShowResponseToQuestion(questionCategory.answerTheQuestion);
        }
      }

      if (urlAssignedAdvisers.length === 1) {
        const adviser = advisers.find(a => urlAssignedAdvisers.includes(a.name));
        if (adviser) {
          setValue('adviserId', adviser.id);
        }
      }
    }

    // Ensure attribute fields are cleared
    if (selectedAttributes) {
      selectedAttributes.forEach(attribute => {
        setValue(`attributes.${attribute.id}`, '');
      });
    }
  };

  const handleDelete = (reportId: string) => {
    setReportToDelete(reportId);
  };

  const confirmDelete = async () => {
    if (reportToDelete) {
      try {
        await deleteDoc(doc(db, 'reports', reportToDelete));
        setReports(prevReports => prevReports.filter(report => report.id !== reportToDelete));
        setReportToDelete(null);
      } catch (error) {
        console.error("Error deleting document: ", error);
        setSubmitError('An error occurred while deleting the report. Please try again.');
      }
    }
  };

  const sortedReports = useMemo(() => {
    return [...reports].sort((a, b) => {
      let aValue, bValue;
      if (sortField === 'adviser') {
        aValue = advisers.find(adv => adv.id === a.adviserId)?.name || '';
        bValue = advisers.find(adv => adv.id === b.adviserId)?.name || '';
      } else {
        const candidateA = candidates.find(c => c.id === a.candidateId);
        const candidateB = candidates.find(c => c.id === b.candidateId);
        aValue = candidateA ? `${candidateA.forename} ${candidateA.surname}` : '';
        bValue = candidateB ? `${candidateB.forename} ${candidateB.surname}` : '';
      }
      return sortOrder === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
    });
  }, [reports, sortField, sortOrder, advisers, candidates]);

  const toggleSort = (field: 'adviser' | 'candidate') => {
    if (field === sortField) {
      setSortOrder(prevOrder => prevOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  console.log('Rendering AdviserReport component');

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Adviser Report</h1>
        <div className="flex items-center">
          <label className="mr-2 text-sm font-medium text-gray-700">Filter by Panel Date:</label>
          <select 
            value={selectedPanelDate?.id || ''}
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

      {submitError && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
          <strong className="font-bold">Error!</strong>
          <span className="block sm:inline"> {submitError}</span>
        </div>
      )}
      {submitSuccess && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative mb-4" role="alert">
          <strong className="font-bold">Success!</strong>
          <span className="block sm:inline"> The report has been submitted successfully.</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="mb-6 bg-white p-4 rounded-lg shadow-md">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Adviser</label>
            <Controller
              name="adviserId"
              control={control}
              rules={{ required: "Adviser selection is required" }}
              render={({ field }) => (
                <select {...field} className="input w-full">
                  <option value="">Select Adviser</option>
                  {advisers
                    .filter(adviser => assignedAdvisers.length === 0 || assignedAdvisers.includes(adviser.name))
                    .map(adviser => (
                      <option key={adviser.id} value={adviser.id}>{adviser.name}</option>
                    ))}
                </select>
              )}
            />
            {errors.adviserId && <p className="text-red-500 text-sm mt-1">{errors.adviserId.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Candidate</label>
            <p className="input w-full bg-gray-100">
              {selectedCandidate ? `${selectedCandidate.forename} ${selectedCandidate.surname}` : 'Not selected'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Panel Date</label>
            <p className="input w-full bg-gray-100">
              {selectedPanelDate ? new Date(selectedPanelDate.date).toLocaleDateString() : 'Not selected'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Question Category</label>
            <p className="input w-full bg-gray-100">{selectedQuestionCategory?.category || 'Not selected'}</p>
            {selectedQuestionCategory && (
              <p className="text-sm text-gray-600 mt-1">
                Answer the Question: {selectedQuestionCategory.answerTheQuestion ? 'Yes' : 'No'}
              </p>
            )}
          </div>
        </div>

        {!showResponseToQuestion && (
          <div className="mt-4">
            <h2 className="text-lg font-semibold mb-2">Attributes</h2>
            <p className="text-sm text-gray-600 mb-2">Fill in the attributes that apply. Not all attributes need to be filled.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {selectedAttributes.map(attribute => (
                <div key={attribute.id}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{attribute.name}</label>
                  <Controller
                    name={`attributes.${attribute.id}`}
                    control={control}
                    rules={{ min: { value: 1, message: "Minimum value is 1" }, max: { value: 6, message: "Maximum value is 6" } }}
                    render={({ field }) => (
                      <select {...field} className="input w-full" disabled={showResponseToQuestion}>
                        <option value="">Select Banding</option>
                        {[1, 2, 3, 4, 5, 6].map(value => (
                          <option key={value} value={value.toString()}>{value}</option>
                        ))}
                      </select>
                    )}
                  />
                  {errors.attributes && errors.attributes[attribute.id] && (
                    <p className="text-red-500 text-sm mt-1">{(errors.attributes[attribute.id] as FieldError).message}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {showResponseToQuestion && (
          <div className="mt-4">
            <h2 className="text-lg font-semibold mb-2">Response to Question</h2>
            <Controller
              name="responseToQuestion"
              control={control}
              rules={{ required: "Response to Question is required" }}
              render={({ field }) => (
                <div>
                  <label className="inline-flex items-center mr-6">
                    <input
                      type="radio"
                      {...field}
                      value="Yes"
                      checked={field.value === 'Yes'}
                      className="form-radio h-5 w-5 text-blue-600"
                      disabled={!showResponseToQuestion}
                    />
                    <span className="ml-2">Yes</span>
                  </label>
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      {...field}
                      value="No"
                      checked={field.value === 'No'}
                      className="form-radio h-5 w-5 text-blue-600"
                      disabled={!showResponseToQuestion}
                    />
                    <span className="ml-2">No</span>
                  </label>
                </div>
              )}
            />
            {errors.responseToQuestion && <p className="text-red-500 text-sm mt-1">{errors.responseToQuestion.message}</p>}
          </div>
        )}

        <div className="mt-6 flex justify-between items-center">
          <button type="submit" className="btn-primary w-auto">
            {editingReportId ? 'Update Report' : 'Submit Report'}
          </button>
          {editingReportId && (
            <button 
              type="button" 
              onClick={handleCancelEdit} 
              className="btn-secondary w-auto flex items-center"
            >
              <X className="h-4 w-4 mr-2" />
              Cancel Edit
            </button>
          )}
        </div>
      </form>

      <div className="bg-white rounded-lg shadow-md overflow-hidden mt-8">
        <h2 className="text-xl font-semibold p-4 bg-gray-50">Submitted Reports</h2>
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th 
                className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                onClick={() => toggleSort('adviser')}
              >
                Adviser
                {sortField === 'adviser' && (
                  sortOrder === 'asc' ? <ChevronUp className="inline ml-1" /> : <ChevronDown className="inline ml-1" />
                )}
              </th>
              <th 
                className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                onClick={() => toggleSort('candidate')}
              >
                Candidate
                {sortField === 'candidate' && (
                  sortOrder === 'asc' ? <ChevronUp className="inline ml-1" /> : <ChevronDown className="inline ml-1" />
                )}
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Panel Date</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Question Category</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bandings</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <div className="leading-tight">
                  Response to<br />Question
                </div>
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedReports.map((report) => (
              <tr 
                key={report.id} 
                onClick={() => handleEdit(report)}
                className="hover:bg-gray-50 cursor-pointer"
              >
                <td className="px-4 py-2 whitespace-nowrap">{advisers.find(a => a.id === report.adviserId)?.name || 'Unknown'}</td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {(() => {
                    const candidate = candidates.find(c => c.id === report.candidateId);
                    if (candidate) {
                      const fullName = `${candidate.forename} ${candidate.surname}`;
                      return fullName.length > 20 ? fullName.substring(0, 20) + '...' : fullName;
                    }
                    return 'Unknown';
                  })()}
                </td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {panelDates.find(pd => pd.id === report.panelDateId)
                    ? new Date(panelDates.find(pd => pd.id === report.panelDateId)!.date).toLocaleDateString()
                    : 'Unknown'}
                </td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {(() => {
                    const qc = questionCategories.find(qc => qc.id === report.questionCategory);
                    if (qc) {
                      const categoryName = qc.name || qc.category || 'Unknown';
                      const truncatedName = categoryName.length > 30 
                        ? categoryName.substring(0, 30) + '...' 
                        : categoryName;
                      return (
                        <>
                          <div>{truncatedName}</div>
                          {qc.generalCategory && (
                            <div className="text-sm text-gray-500">
                              {qc.generalCategory.length > 30 
                                ? qc.generalCategory.substring(0, 30) + '...' 
                                : qc.generalCategory}
                            </div>
                          )}
                        </>
                      );
                    }
                    return 'Unknown';
                  })()}
                </td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {Object.values(report.attributes)
                    .map(attr => attr.value)
                    .filter(value => value !== '') // Filter out empty values
                    .join(', ') || 'N/A'}
                </td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {report.responseToQuestion || 'N/A'}
                </td>
                <td className="px-4 py-2 whitespace-nowrap text-sm font-medium">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(report);
                    }} 
                    className="text-blue-600 hover:text-blue-900 mr-2" 
                    title="Edit Report"
                  >
                    <Edit className="h-5 w-5" />
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(report.id);
                    }} 
                    className="text-red-600 hover:text-red-900" 
                    title="Delete Report"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {reportToDelete && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3 text-center">
              <h3 className="text-lg leading-6 font-medium text-gray-900">Delete Report</h3>
              <div className="mt-2 px-7 py-3">
                <p className="text-sm text-gray-500">
                  Are you sure you want to delete this report? This action cannot be undone.
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
                  onClick={() => setReportToDelete(null)}
                  className="mt-3 px-4 py-2 bg-white text-gray-800 text-base font-medium rounded-md w-full shadow-sm border border-gray-300 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showNoCandidateDialog && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3 text-center">
              <h3 className="text-lg leading-6 font-medium text-gray-900">No Candidate Selected</h3>
              <div className="mt-2 px-7 py-3">
                <p className="text-sm text-gray-500">
                  Please return to the Interview form to select an Interview Record, or select an existing Report from the table below.
                </p>
              </div>
              <div className="items-center px-4 py-3 space-y-3">
                <button
                  onClick={() => navigate('/interviews')}
                  className="px-4 py-2 bg-blue-500 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
                >
                  Go to Interviews
                </button>
                <button
                  onClick={() => setShowNoCandidateDialog(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-800 text-base font-medium rounded-md w-full shadow-sm hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400"
                >
                  Stay on This Page
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdviserReport;
