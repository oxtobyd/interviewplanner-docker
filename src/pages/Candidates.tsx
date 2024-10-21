import React, { useState, useEffect, useRef } from "react";
import { useForm, SubmitHandler, Controller } from "react-hook-form";
import {
  Plus,
  Edit,
  Trash2,
  Paperclip,
  Check,
  X,
  AlertTriangle,
  FileText,
  Calendar,
  FileDown,
} from "lucide-react";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
  getDocs,
  setDoc,
  getDoc,
  arrayRemove,
  arrayUnion
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  uploadString,
} from "firebase/storage";
import { db, storage } from "../firebase";
import { FirebaseError } from "firebase/app";
import { useLocation, useNavigate } from "react-router-dom";

interface CandidateFile {
  name: string;
  url: string;
}

interface Candidate {
  id: string;
  surname: string;
  forename: string;
  email: string;
  questionCategory: string;
  paperworkReceived: "Yes" | "No" | "Partial";
  paperworkNotes?: string;
  fileUrl?: string;
  diocese: string;
  sponsoringBishop: string;
  ddoName: string;
  ddoEmail: string;
  ndaId: string;
  panelDateId: string;
  questionAsked?: string;
  revisedQuestion?: string; // Add this line
  files: CandidateFile[];
  proFormaUrl?: string;
  proFormaName?: string;
  initialPanelSecretary: string;
  letterGenerated: boolean;
  receivedPaperwork: { [key: string]: boolean }; // Add this line
}

interface NDA {
  id: string;
  name: string;
  email: string;
}

interface PanelDate {
  id: string;
  date: string;
}

const paperworkOptions = ["Yes", "No", "Partial"];

// Define these outside of the component
const candidateFields = [
  "surname",
  "forename",
  "email",
  "questionCategory",
  "diocese",
  "sponsoringBishop",
  "ddoName",
  "ddoEmail",
  "revisedQuestion",
];

const ndaFields = ["title", "name", "email"];

interface Template {
  id: string;
  name: string;
  content: string;
  type: "adviser_email" | "candidate_letter" | "panel_document";
  category: string;
  generalCategory: string;
  wordTemplateUrl: string | null;
}

interface Interview {
  id: string;
  candidateId: string;
  candidateName: string;
  adviserNames: string[];
  category: string;
  panelDateId: string;
  leadAdviserName: string;
  emailSent: boolean;
}

const Candidates: React.FC = () => {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [ndas, setNDAs] = useState<NDA[]>([]);
  const [panelDates, setPanelDates] = useState<PanelDate[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<Candidate>({
    defaultValues: {
      panelDateId: "",
      paperworkNotes: "",
    },
  });
  const [files, setFiles] = useState<File[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<CandidateFile[]>([]);
  const paperworkNotesRef = useRef<HTMLInputElement | null>(null);
  const location = useLocation();
  const [proFormaFile, setProFormaFile] = useState<File | null>(null);
  const proFormaRef = useRef<HTMLInputElement>(null);
  const [proFormaUrl, setProFormaUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [filterPaperwork, setFilterPaperwork] = useState<boolean>(false);
  const [filterNoInterviews, setFilterNoInterviews] = useState<boolean>(false);
  const navigate = useNavigate();
  const [questionCategories, setQuestionCategories] = useState<
    { id: string; category: string }[]
  >([]);
  const [submitSuccess, setSubmitSuccess] = useState<boolean>(false);
  const [candidateToDelete, setCandidateToDelete] = useState<string | null>(
    null
  );
  const [existingProFormaUrl, setExistingProFormaUrl] = useState<string | null>(
    null
  );
  const [selectedPanelDate, setSelectedPanelDate] = useState<string>("");
  const [dioceseWarning, setDioceseWarning] = useState<string | null>(null);
  const [missingTemplateInfo, setMissingTemplateInfo] = useState<{ category: string, name: string } | null>(null);
  const [localFiles, setLocalFiles] = useState<CandidateFile[]>([]);
  const [requiredPaperwork, setRequiredPaperwork] = useState<string[]>([]);
  const [urlPanelDate, setUrlPanelDate] = useState<string | null>(null);

  const paperworkReceived = watch("paperworkReceived");

  const capitalizeWords = (string: string) => {
    return string
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  // Add this function to fetch required paperwork when question category changes
  const fetchRequiredPaperwork = async (category: string) => {
    const q = query(collection(db, "questionCategories"), where("category", "==", category));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const categoryData = querySnapshot.docs[0].data();
      setRequiredPaperwork(categoryData.requiredPaperwork || []);
      
      // Get current values
      const currentValues = getValues();
      
      // Only set checkboxes for existing data
      const newReceivedPaperwork = (categoryData.requiredPaperwork || []).reduce((acc, item) => {
        acc[item] = currentValues.receivedPaperwork?.[item] || false;
        return acc;
      }, {} as Record<string, boolean>);
      
      setValue("receivedPaperwork", newReceivedPaperwork);
    } else {
      setRequiredPaperwork([]);
      setValue("receivedPaperwork", {});
    }
  };

  // Update the useEffect hook that watches for question category changes
  useEffect(() => {
    const subscription = watch((value, { name }) => {
      if (name === "questionCategory" && value.questionCategory) {
        fetchRequiredPaperwork(value.questionCategory);
      }
    });
    return () => subscription.unsubscribe();
  }, [watch]);

  useEffect(() => {
    console.log("Effect triggered: Fetching candidates based on URL params");
    const searchParams = new URLSearchParams(location.search);
    const panelDateId = searchParams.get("panelDateId");
    const paperworkFilter = searchParams.get("paperwork");
    const interviewsFilter = searchParams.get("interviews");
    const editCandidateId = searchParams.get("edit");

    // Set urlPanelDate based on URL parameter
    setUrlPanelDate(panelDateId);

    // If selectedPanelDate is not set, use the URL parameter
    if (!selectedPanelDate && panelDateId) {
      setSelectedPanelDate(panelDateId);
    }

    let candidatesQuery = collection(db, "candidates");

    if (selectedPanelDate) {
      candidatesQuery = query(
        candidatesQuery,
        where("panelDateId", "==", selectedPanelDate)
      );
    }

    setFilterPaperwork(paperworkFilter === "incomplete");
    setFilterNoInterviews(interviewsFilter === "none");

    const unsubscribe = onSnapshot(candidatesQuery, async (snapshot) => {
      console.log(
        `Firestore read: Candidates (${snapshot.docs.length} documents)`
      );
      let candidatesData = snapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as Candidate)
      );

      if (paperworkFilter === "incomplete") {
        candidatesData = candidatesData.filter(
          (candidate) =>
            candidate.paperworkReceived === "No" ||
            candidate.paperworkReceived === "Partial"
        );
      }

      if (interviewsFilter === "none") {
        console.log("Firestore read: Fetching interviews for filtering");
        const interviewsSnapshot = await getDocs(collection(db, "interviews"));
        const candidatesWithInterviews = new Set(
          interviewsSnapshot.docs.map((doc) => doc.data().candidateId)
        );
        candidatesData = candidatesData.filter(
          (candidate) => !candidatesWithInterviews.has(candidate.id)
        );
      }

      console.log(
        `Setting ${candidatesData.length} candidates after filtering`
      );
      setCandidates(candidatesData);
    });

    return () => {
      console.log("Unsubscribing from candidates listener");
      unsubscribe();
    };
  }, [location.search, setValue, selectedPanelDate]);

  useEffect(() => {
    console.log("Effect triggered: Fetching NDAs");
    const unsubscribe = onSnapshot(collection(db, "ndas"), (snapshot) => {
      console.log(`Firestore read: NDAs (${snapshot.docs.length} documents)`);
      const ndasData = snapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as NDA)
      );
      setNDAs(ndasData);
    });

    return () => {
      console.log("Unsubscribing from NDAs listener");
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    console.log("Effect triggered: Fetching panel dates");
    const unsubscribe = onSnapshot(collection(db, "panelDates"), (snapshot) => {
      console.log(
        `Firestore read: Panel Dates (${snapshot.docs.length} documents)`
      );
      const panelDatesData = snapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as PanelDate)
      );
      setPanelDates(
        panelDatesData.sort((a, b) => a.date.localeCompare(b.date))
      );
    });

    return () => {
      console.log("Unsubscribing from panel dates listener");
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    console.log("Effect triggered: Fetching question categories");
    const fetchQuestionCategories = async () => {
      const q = query(collection(db, "questionCategories"));
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        console.log(
          `Firestore read: Question Categories (${querySnapshot.docs.length} documents)`
        );
        const categories = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          category: doc.data().category,
        }));
        categories.sort((a, b) => a.category.localeCompare(b.category));
        setQuestionCategories(categories);
      });

      return () => {
        console.log("Unsubscribing from question categories listener");
        unsubscribe();
      };
    };

    fetchQuestionCategories();
  }, []);

  useEffect(() => {
    setValue("paperworkReceived", "");
  }, [setValue]);

  useEffect(() => {
    if (paperworkReceived === "Partial") {
      paperworkNotesRef.current?.focus();
    }
  }, [paperworkReceived]);

  useEffect(() => {
    if (editingId) {
      setLocalFiles(candidates.find(c => c.id === editingId)?.files || []);
    } else {
      setLocalFiles([]);
    }
  }, [editingId, candidates]);

  useEffect(() => {
    if (urlPanelDate && urlPanelDate !== selectedPanelDate) {
      setSelectedPanelDate(urlPanelDate);
    }
  }, [urlPanelDate]);

  const handleProFormaChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setProFormaFile(file);
      setProFormaUrl(URL.createObjectURL(file));

      const formData = new FormData();
      formData.append("proForma", file);

      try {
        const response = await fetch(
          "http://localhost:3001/api/extract-pro-forma-data",
          {
            method: "POST",
            body: formData,
          }
        );

        if (!response.ok) {
          throw new Error("Failed to process file");
        }

        const data = await response.json();
        console.log("Received data from server:", data);

        // Populate the form with the extracted data, formatting names
        setValue("surname", capitalizeWords(data.surname));
        setValue("forename", capitalizeWords(data.forename));
        setValue("email", data.email.toLowerCase());
        setValue("diocese", capitalizeWords(data.diocese));
        setValue("sponsoringBishop", capitalizeWords(data.sponsoringBishop));
        setValue("ddoName", data.ddoName);
        setValue("ddoEmail", data.ddoEmail.toLowerCase());
        setValue("questionAsked", data.questionToThePanel);

        // Check if diocese extraction failed
        if (data.diocese === "Diocese") {
          setDioceseWarning("Diocese name couldn't be extracted automatically. Please enter it manually.");
        } else {
          setDioceseWarning(null);
        }

      } catch (error) {
        console.error("Error processing Pro-Forma:", error);
        setError("Failed to process Pro-Forma file");
      }
    }
  };

  const removeProForma = () => {
    setProFormaFile(null);
    setProFormaUrl(null);
    if (proFormaRef.current) {
      proFormaRef.current.value = "";
    }
  };

  const resetFormAndStates = () => {
    reset({
      surname: "",
      forename: "",
      email: "",
      questionCategory: "",
      paperworkReceived: "",
      paperworkNotes: "",
      diocese: "",
      sponsoringBishop: "",
      ddoName: "",
      ddoEmail: "",
      ndaId: "",
      panelDateId: "",
      questionAsked: "",
      revisedQuestion: "",
      initialPanelSecretary: "",
      receivedPaperwork: {},
    });
    setRequiredPaperwork([]);
    setFiles([]);
    setUploadedFiles([]);
    setProFormaFile(null);
    setProFormaUrl(null);
    setExistingProFormaUrl(null);
    if (proFormaRef.current) {
      proFormaRef.current.value = "";
    }
  };

  const onSubmit: SubmitHandler<Candidate> = async (data) => {
    try {
      setLoading(true);
      setError(null);

      let candidateId = editingId;
      if (!candidateId) {
        const newCandidateRef = doc(collection(db, "candidates"));
        candidateId = newCandidateRef.id;
      }

      let proFormaUrl = existingProFormaUrl;
      let proFormaName = data.proFormaName;
      if (proFormaFile) {
        const storageRef = ref(
          storage,
          `candidates/${candidateId}/pro-forma/${proFormaFile.name}`
        );
        await uploadBytes(storageRef, proFormaFile);
        proFormaUrl = await getDownloadURL(storageRef);
        proFormaName = proFormaFile.name;
      }

      const uploadedFiles: CandidateFile[] = [];
      for (const file of files) {
        const storageRef = ref(
          storage,
          `candidates/${candidateId}/files/${file.name}`
        );
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        uploadedFiles.push({ name: file.name, url });
      }

      const candidateData: Partial<Candidate> = {
        ...data,
        proFormaUrl,
        proFormaName,
        files: [...uploadedFiles, ...(data.files || [])],
        paperworkReceived: data.paperworkReceived,
        receivedPaperwork: data.receivedPaperwork || {},
      };

      // Only include paperworkNotes if it's not undefined
      if (data.paperworkNotes !== undefined) {
        candidateData.paperworkNotes = data.paperworkNotes;
      }

      // Remove any undefined values from candidateData
      Object.keys(candidateData).forEach(key => {
        if (candidateData[key as keyof Candidate] === undefined) {
          delete candidateData[key as keyof Candidate];
        }
      });

      if (editingId) {
        await updateDoc(doc(db, "candidates", editingId), candidateData);
      } else {
        await addDoc(collection(db, "candidates"), candidateData);
      }

      // Reset form and states
      resetFormAndStates();
      setEditingId(null);
      setSubmitSuccess(true);

    } catch (err) {
      console.error("Error saving candidate:", err);
      setError("An error occurred while saving the candidate");
    } finally {
      setLoading(false);
      setIsUploading(false);
    }
  };

  const editCandidate = async (candidate: Candidate) => {
    console.log("Editing candidate:", candidate.id);
    setEditingId(candidate.id);
    
    // Reset everything first
    resetFormAndStates();

    // Fetch the latest data for the candidate
    const candidateDoc = await getDoc(doc(db, "candidates", candidate.id));
    if (candidateDoc.exists()) {
      const latestData = candidateDoc.data() as Candidate;
      
      // Now set the form with the latest data
      reset({
        ...latestData,
        ndaId: latestData.ndaId || "",
        panelDateId: latestData.panelDateId || "",
        receivedPaperwork: latestData.receivedPaperwork || {},
      });

      setUploadedFiles(latestData.files || []);
      setExistingProFormaUrl(latestData.proFormaUrl || null);
      if (latestData.proFormaUrl && latestData.proFormaName) {
        setProFormaUrl(latestData.proFormaUrl);
      } else {
        setProFormaFile(null);
        setProFormaUrl(null);
      }
      setValue("paperworkReceived", latestData.paperworkReceived || "");
      setValue("paperworkNotes", latestData.paperworkNotes || "");

      // Fetch required paperwork for this category
      await fetchRequiredPaperwork(latestData.questionCategory);
    } else {
      console.error("Candidate not found");
      setError("Candidate not found");
    }

    // Scroll to the top of the form
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteCandidate = (id: string) => {
    setCandidateToDelete(id);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prevFiles) => [...prevFiles, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prevFiles) => prevFiles.filter((_, i) => i !== index));
  };

  const removeUploadedFile = async (file: CandidateFile) => {
    if (!editingId) {
      console.error("No candidate is currently being edited");
      return;
    }

    try {
      // Create a reference to the file in Firebase Storage
      const fileRef = ref(storage, file.url);

      // Delete the file from Firebase Storage
      await deleteObject(fileRef);

      // Update the candidate document in Firestore
      const candidateRef = doc(db, "candidates", editingId);
      await updateDoc(candidateRef, {
        files: arrayRemove(file)
      });

      // Update local state
      setLocalFiles(prevFiles => prevFiles.filter(f => f.url !== file.url));

      console.log("File removed successfully");
    } catch (error) {
      console.error("Error removing file:", error);
      setError("An error occurred while removing the file.");
    }
  };

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
  };

  const getPaperworkIcon = (status: "Yes" | "No" | "Partial") => {
    switch (status) {
      case "Yes":
        return <Check className="h-5 w-5 text-green-500" />;
      case "No":
        return <X className="h-5 w-5 text-red-500" />;
      case "Partial":
        return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      default:
        return null;
    }
  };

  const handleInterviewAction = async (candidateId: string) => {
    console.log("Checking interviews for candidate:", candidateId);
    const interviewsQuery = query(
      collection(db, "interviews"),
      where("candidateId", "==", candidateId)
    );
    const interviewsSnapshot = await getDocs(interviewsQuery);
    console.log(
      `Firestore read: Interviews for candidate (${interviewsSnapshot.docs.length} documents)`
    );

    if (interviewsSnapshot.empty) {
      console.log("Navigating to create new interview");
      navigate(`/interviews?newInterview=${candidateId}`);
    } else {
      console.log("Navigating to view existing interviews");
      navigate(`/interviews?candidateId=${candidateId}`);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    reset({
      surname: "",
      forename: "",
      email: "",
      questionCategory: "",
      paperworkReceived: "",
      paperworkNotes: "",
      diocese: "",
      sponsoringBishop: "",
      ddoName: "",
      ddoEmail: "",
      ndaId: "",
      panelDateId: "",
      questionAsked: "",
      revisedQuestion: "",
      initialPanelSecretary: "",
    });
    setFiles([]);
    setUploadedFiles([]);
    setProFormaFile(null);
    setProFormaUrl(null);

    // Clear file input
    if (proFormaRef.current) {
      proFormaRef.current.value = "";
    }
  };

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const editCandidateId = searchParams.get("edit");

    if (editCandidateId) {
      const candidateToEdit = candidates.find((c) => c.id === editCandidateId);
      if (candidateToEdit) {
        editCandidate(candidateToEdit);
      }
    }
  }, [location.search, candidates]);

  const confirmDelete = async () => {
    if (candidateToDelete) {
      try {
        await deleteDoc(doc(db, "candidates", candidateToDelete));
        console.log("Candidate deleted successfully");
        setCandidateToDelete(null);
      } catch (error) {
        console.error("Error deleting candidate:", error);
        if (error instanceof Error) {
          setError(error.message);
        } else {
          setError("An unexpected error occurred");
        }
      }
    }
  };

  const handlePanelDateChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const newPanelDateId = event.target.value;
    setSelectedPanelDate(newPanelDateId);
    if (newPanelDateId) {
      navigate(`/candidates?panelDateId=${newPanelDateId}`);
    } else {
      navigate("/candidates");
    }
  };

  const generateCandidateLetterHTML = async (candidate: Candidate) => {
    try {
      console.log("Generating letter for candidate:", candidate);
  
      // Fetch interview information for the candidate
      const interviewSnapshot = await getDocs(
        query(
          collection(db, "interviews"),
          where("candidateId", "==", candidate.id)
        )
      );
  
      let templateName = 'x1 Interview x1 Adviser';
      if (!interviewSnapshot.empty) {
        const interviews = interviewSnapshot.docs.map(doc => doc.data() as Interview);
        const interviewCount = interviews.length;
        const totalAdviserCount = interviews.reduce((total, interview) => total + interview.adviserNames.length, 0);
  
        if (interviewCount === 1) {
          templateName = totalAdviserCount > 1 ? 'x1 Interview x2 Advisers' : 'x1 Interview x1 Adviser';
        } else if (interviewCount === 2) {
          templateName = 'x2 Interviews x2 Advisers';
        } else {
          console.error(`Unexpected number of interviews: ${interviewCount}`);
          return;
        }
      }
  
      console.log(`Selected template name: ${templateName}`);
  
      // Fetch the template based on the candidate's questionCategory and template name
      const templateSnapshot = await getDocs(
        query(
          collection(db, "templates"),
          where("type", "==", "candidate_letter"),
          where("category", "==", candidate.questionCategory),
          where("name", "==", templateName)
        )
      );
  
      if (templateSnapshot.empty) {
        console.error(`No matching template found for category: ${candidate.questionCategory} and name: ${templateName}`);
        setMissingTemplateInfo({ category: candidate.questionCategory, name: templateName });
        return;
      }
  
      const template = templateSnapshot.docs[0].data() as Template;
  
      // Fetch the panel date
      let panelDateString = "";
      console.log("Candidate panel date ID:", candidate.panelDateId);
      if (candidate.panelDateId) {
        const panelDate = panelDates.find(
          (pd) => pd.id === candidate.panelDateId
        );
        console.log("Panel date from state:", panelDate);
        if (panelDate) {
          panelDateString = new Date(panelDate.date).toLocaleDateString();
        } else {
          console.log("Panel date not found in state, fetching from Firestore");
          const panelDateDoc = await getDoc(
            doc(db, "panelDates", candidate.panelDateId)
          );
          console.log("Panel date doc:", panelDateDoc);
          if (panelDateDoc.exists()) {
            const panelDateData = panelDateDoc.data() as PanelDate;
            panelDateString = new Date(panelDateData.date).toLocaleDateString();
          }
        }
      }
      console.log("Final panel date string:", panelDateString);
  
      // Fetch NDA information
      let ndaName = "";
      let ndaEmail = "";
      let ndaTitle = "";
      if (candidate.ndaId) {
        const nda = ndas.find((n) => n.id === candidate.ndaId);
        if (nda) {
          ndaName = nda.name;
          ndaEmail = nda.email;
          ndaTitle = nda.title;
        } else {
          console.log("NDA not found in state, fetching from Firestore");
          const ndaDoc = await getDoc(doc(db, "ndas", candidate.ndaId));
          if (ndaDoc.exists()) {
            const ndaData = ndaDoc.data() as NDA;
            ndaName = ndaData.name;
            ndaEmail = ndaData.email;
            ndaTitle = ndaData.title || "";
          }
        }
      }
      console.log("NDA Name:", ndaName);
      console.log("NDA Email:", ndaEmail);
      console.log("NDA Title:", ndaTitle);
  
      let leadAdviserName = "";
      let otherAdviserName = "";
      let leadAdviserDetails: any = {};
      let otherAdviserDetails: any = {};
      let secondLeadAdviserName = "";
      let secondOtherAdviserName = "";
      let secondLeadAdviserDetails: any = {};
      let secondOtherAdviserDetails: any = {};
  
      const fetchAdviserDetails = async (adviserName: string) => {
        const adviserSnapshot = await getDocs(
          query(collection(db, "advisers"), where("name", "==", adviserName))
        );
        if (!adviserSnapshot.empty) {
          return adviserSnapshot.docs[0].data();
        }
        return null;
      };
  
      if (!interviewSnapshot.empty) {
        const interviews = interviewSnapshot.docs.map(doc => doc.data() as Interview);
        
        // Handle first interview
        if (interviews.length > 0) {
          const firstInterview = interviews[0];
          leadAdviserName = firstInterview.leadAdviserName;
          otherAdviserName = firstInterview.adviserNames.find(name => name !== leadAdviserName) || "";
          leadAdviserDetails = await fetchAdviserDetails(leadAdviserName);
          otherAdviserDetails = await fetchAdviserDetails(otherAdviserName);
        }
  
        // Handle second interview if it exists
        if (interviews.length > 1) {
          const secondInterview = interviews[1];
          secondLeadAdviserName = secondInterview.leadAdviserName;
          secondOtherAdviserName = secondInterview.adviserNames.find(name => name !== secondLeadAdviserName) || "";
          secondLeadAdviserDetails = await fetchAdviserDetails(secondLeadAdviserName);
          secondOtherAdviserDetails = await fetchAdviserDetails(secondOtherAdviserName);
        }
      }
      console.log("Lead Adviser Name:", leadAdviserName);
      console.log("Other Adviser Name:", otherAdviserName);
  
      // Replace placeholders in the template
      let letterContent = template.content;
      console.log("Initial letter content:", letterContent);
  
      for (const field of candidateFields) {
        const placeholder = `{{${field}}}`;
        console.log(`Replacing ${placeholder} with ${candidate[field] || ""}`);
        letterContent = letterContent.replace(
          new RegExp(placeholder, "g"),
          candidate[field] || ""
        );
      }
  
      // Replace date placeholder
      const formattedDate = new Date().toLocaleDateString();
      console.log(`Replacing {{date}} with ${formattedDate}`);
      letterContent = letterContent.replace(/{{date}}/g, formattedDate);
  
      // Replace PanelDate placeholder
      console.log(`Replacing {{PanelDate}} with ${panelDateString}`);
      letterContent = letterContent.replace(/{{panelDate}}/g, panelDateString);
  
      // Replace NDA placeholders
      console.log(`Replacing {{nda.name}} with ${ndaName}`);
      letterContent = letterContent.replace(/{{nda\.name}}/g, ndaName);
      console.log(`Replacing {{nda.email}} with ${ndaEmail}`);
      letterContent = letterContent.replace(/{{nda\.email}}/g, ndaEmail);
      console.log(`Replacing {{nda.title}} with ${ndaTitle}`);
      letterContent = letterContent.replace(/{{nda\.title}}/g, ndaTitle);
  
      // Replace leadAdviserName placeholder
      console.log(`Replacing {{leadAdviserName}} with ${leadAdviserName}`);
      letterContent = letterContent.replace(
        /{{leadAdviserName}}/g,
        leadAdviserName
      );
  
      // Replace adviserNames placeholder with the other adviser name
      console.log(`Replacing {{adviserNames}} with ${otherAdviserName}`);
      letterContent = letterContent.replace(
        /{{otherAdviserName}}/g,
        otherAdviserName
      );
  
      if (leadAdviserDetails) {
        letterContent = letterContent.replace(
          /{{leadAdviser\.title}}/g,
          leadAdviserDetails.title || ""
        );
        letterContent = letterContent.replace(
          /{{leadAdviser\.email}}/g,
          leadAdviserDetails.email || ""
        );
        letterContent = letterContent.replace(
          /{{leadAdviser\.mobile}}/g,
          leadAdviserDetails.mobile || ""
        );
        letterContent = letterContent.replace(
          /{{leadAdviser\.biography}}/g,
          leadAdviserDetails.biography || ""
        );
      }
  
      // Replace other adviser placeholders
      if (otherAdviserDetails) {
        letterContent = letterContent.replace(
          /{{otherAdviser\.title}}/g,
          otherAdviserDetails.title || ""
        );
        letterContent = letterContent.replace(
          /{{otherAdviser\.email}}/g,
          otherAdviserDetails.email || ""
        );
        letterContent = letterContent.replace(
          /{{otherAdviser\.mobile}}/g,
          otherAdviserDetails.mobile || ""
        );
        letterContent = letterContent.replace(
          /{{otherAdviser\.biography}}/g,
          otherAdviserDetails.biography || ""
        );
      }
  
      // Replace placeholders for the second set of advisers
      if (secondLeadAdviserName) {
        letterContent = letterContent.replace(/{{2ndleadAdviserName}}/g, secondLeadAdviserName);
        letterContent = letterContent.replace(/{{2ndotherAdviserName}}/g, secondOtherAdviserName);
  
        if (secondLeadAdviserDetails) {
          letterContent = letterContent.replace(/{{2ndleadAdviser\.title}}/g, secondLeadAdviserDetails.title || "");
          letterContent = letterContent.replace(/{{2ndleadAdviser\.email}}/g, secondLeadAdviserDetails.email || "");
          letterContent = letterContent.replace(/{{2ndleadAdviser\.mobile}}/g, secondLeadAdviserDetails.mobile || "");
          letterContent = letterContent.replace(/{{2ndleadAdviser\.biography}}/g, secondLeadAdviserDetails.biography || "");
        }
  
        if (secondOtherAdviserDetails) {
          letterContent = letterContent.replace(/{{2ndotherAdviser\.title}}/g, secondOtherAdviserDetails.title || "");
          letterContent = letterContent.replace(/{{2ndotherAdviser\.email}}/g, secondOtherAdviserDetails.email || "");
          letterContent = letterContent.replace(/{{2ndotherAdviser\.mobile}}/g, secondOtherAdviserDetails.mobile || "");
          letterContent = letterContent.replace(/{{2ndotherAdviser\.biography}}/g, secondOtherAdviserDetails.biography || "");
        }
      } else {
        // If there's no second interview, remove the entire section for the second interview
        letterContent = letterContent.replace(/INTERVIEW B[\s\S]*?Biography: {{2ndotherAdviser\.biography}}/g, '');
      }

      // Add CSS for alignment and styling
      const cssStyles = `
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.2;
            color: #000;
          }
          h1, h2, h3, h4, h5, h6 {
            margin-top: 1em;
            margin-bottom: 0.5em;
          }
          h1 { font-size: 2em; }
          h2 { font-size: 1.5em; }
          h3 { font-size: 1.17em; }
          h4 { font-size: 1em; }
          h5 { font-size: 0.83em; }
          h6 { font-size: 0.67em; }
          .ql-align-center {
            text-align: center;
          }
          .ql-align-right {
            text-align: right;
          }
          .ql-align-left {
            text-align: left;
          }
          .ql-align-justify {
            text-align: justify;
            line-height: 1.2;
          }
          .ql-indent-1 { padding-left: 3em; }
          .ql-indent-2 { padding-left: 6em; }
          .ql-indent-3 { padding-left: 9em; }
          .ql-indent-4 { padding-left: 12em; }
          .ql-indent-5 { padding-left: 15em; }
          .ql-indent-6 { padding-left: 18em; }
          .ql-indent-7 { padding-left: 21em; }
          .ql-indent-8 { padding-left: 24em; }
          a {
            color: #0000FF;
            text-decoration: underline;
          }
          strong { font-weight: bold; }
          em { font-style: italic; }
          s { text-decoration: line-through; }
          blockquote {
            border-left: 4px solid #ccc;
            margin-bottom: 5px;
            margin-top: 5px;
            padding-left: 16px;
            }
          code, .ql-code-block-container {
            background-color: #f0f0f0;
            border-radius: 3px;
             padding: 2px 4px;
            font-family: monospace;
          }
    ul, ol {
      padding-left: 1.5em;
      margin-bottom: 1em;
    }
    .ql-video {
      display: block;
      max-width: 100%;
    }
    img {
      max-width: 100%;
      height: auto;
    }
    .ql-size-small { font-size: 0.75em; }
    .ql-size-large { font-size: 1.5em; }
    .ql-size-huge { font-size: 2.5em; }
    [style*="color: windowtext"] { color: #000000; }
    p {
  margin: 0;
  padding: 0;
}
  </style>
      `;

      // Wrap the top section in a right-aligned div
      const letterheadRegex = /({{nda\.title}} {{nda\.name}}[\s\S]*?{{date}})/;
      letterContent = letterContent.replace(
        letterheadRegex,
        '<div class="letterhead">$1</div>'
      );

      // Wrap the bottom section in a left-aligned div
      const signatureRegex = /(Yours sincerely,[\s\S]*?Copy: DDO {{ddoName}})/;
      letterContent = letterContent.replace(
        signatureRegex,
        '<div class="signature">$1</div>'
      );

      // Add the CSS to the letter content
      letterContent = `<html><head>${cssStyles}</head><body>${letterContent}</body></html>`;

      console.log("Final letter content:", letterContent);

      // Create a Blob from the HTML content
      const blob = new Blob([letterContent], { type: "text/html" });

      // Generate a unique filename
      const filename = `${candidate.surname}_${candidate.forename}_letter_${Date.now()}.html`;

      // Create a reference to the file location in Firebase Storage
      const storageRef = ref(storage, `candidates/${candidate.id}/files/${filename}`);

      // Upload the file to Firebase Storage
      await uploadString(storageRef, letterContent, 'raw', { contentType: 'text/html' });

      // Get the download URL
      const downloadURL = await getDownloadURL(storageRef);

      const newFile = { name: filename, url: downloadURL };

      // Update the candidate document in Firestore with the new file and flag
      const candidateRef = doc(db, "candidates", candidate.id);
      await updateDoc(candidateRef, {
        files: arrayUnion(newFile),
        letterGenerated: true
      });

      // Update local state, ensuring the file is added only if it doesn't already exist
      setCandidates(prevCandidates =>
        prevCandidates.map(c =>
          c.id === candidate.id
            ? {
                ...c,
                files: c.files.some(file => file.url === newFile.url)
                  ? c.files
                  : [...c.files, newFile],
                letterGenerated: true
              }
            : c
        )
      );

      // Update localFiles state to reflect the changes
      setLocalFiles(prevFiles => {
        if (!prevFiles.some(file => file.url === newFile.url)) {
          return [...prevFiles, newFile];
        }
        return prevFiles;
      });

      console.log("Letter file generated and saved to Firebase Storage");

      // Trigger download
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      console.log("Letter file downloaded");

    } catch (error) {
      console.error("Error generating, saving, and downloading candidate letter:", error);
      setError("An error occurred while generating the letter. Please try again.");
    }
  };

  console.log("Rendering Candidates component");

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Candidates</h1>
        <div className="flex items-center">
          <label className="mr-2 text-sm font-medium text-gray-700">
            Filter by Panel Date:
          </label>
          <select
            id="panelDateFilter"
            value={selectedPanelDate || ""}
            onChange={handlePanelDateChange}
            className="input w-full"
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

      {submitSuccess && (
        <div
          className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative mb-4"
          role="alert"
        >
          <strong className="font-bold">Success!</strong>
          <span className="block sm:inline">
            {" "}
            The candidate has been {editingId ? "updated" : "added"}{" "}
            successfully.
          </span>
        </div>
      )}
      {filterPaperwork && (
        <div className="mb-4 text-amber-600">
          Showing candidates with incomplete paperwork
        </div>
      )}
      {filterNoInterviews && (
        <div className="mb-4 text-red-600">
          Showing candidates without interviews
        </div>
      )}
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mb-6 bg-white p-4 rounded-lg shadow-md"
      >
        <div className="space-y-4">
          {/* Panel Date, NDA, and Initial Panel Secretary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select
              {...register("panelDateId", {
                required: "Panel Date is required",
              })}
              className="input"
            >
              <option value="">Select Panel Date</option>
              {panelDates.map((panelDate) => (
                <option key={panelDate.id} value={panelDate.id}>
                  {new Date(panelDate.date).toLocaleDateString()}
                </option>
              ))}
            </select>
            {errors.panelDateId && (
              <span className="text-red-500">{errors.panelDateId.message}</span>
            )}
            <select {...register("ndaId")} className="input">
              <option value="">Select NDA</option>
              {ndas.map((nda) => (
                <option key={nda.id} value={nda.id}>
                  {nda.name}
                </option>
              ))}
            </select>
            <input
              {...register("initialPanelSecretary")}
              placeholder="Initial Panel Secretary"
              className="input"
            />
          </div>

          {/* Paperwork and Files */}
          <fieldset className="border border-gray-200 p-3 rounded">
  <legend className="text-sm font-medium px-2">
    Paperwork and Files
  </legend>
  <div className="flex flex-col space-y-3">
    <div className="flex flex-col sm:flex-row sm:space-x-3">
      <div className="w-full sm:w-1/2">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Pro-Forma:
        </label>
        <div className="flex items-center">
          <input
            type="file"
            onChange={handleProFormaChange}
            ref={proFormaRef}
            className="input flex-grow text-sm"
          />
          {(proFormaFile || existingProFormaUrl) && (
            <button
              type="button"
              onClick={removeProForma}
              className="text-red-500 ml-2"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        {(proFormaUrl || existingProFormaUrl) && (
          <div className="flex items-center text-sm text-gray-600 mt-1">
            <FileText className="h-4 w-4 mr-2" />
            <a
              href={proFormaUrl || existingProFormaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 truncate"
            >
              {proFormaFile?.name || watch("proFormaName")}
            </a>
          </div>
        )}
      </div>
      <div className="w-full sm:w-1/2 mt-3 sm:mt-0">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Question Category:
        </label>
        <select
          {...register("questionCategory", {
            required: "Question Category is required",
          })}
          className="input w-full"
        >
          <option value="">Select Question Category</option>
          {questionCategories.map((category) => (
            <option key={category.id} value={category.category}>
              {category.category}
            </option>
          ))}
        </select>
        {errors.questionCategory && (
          <span className="text-red-500 text-sm">
            {errors.questionCategory.message}
          </span>
        )}
      </div>
    </div>

              <div className="flex flex-col sm:flex-row sm:items-start space-y-3 sm:space-y-0 sm:space-x-3">
                <div className="w-full sm:w-1/2 border border-gray-200 p-2 rounded">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Files:
                  </label>
                  <div className="flex items-center mb-2">
                    <input
                      type="file"
                      onChange={handleFileChange}
                      multiple
                      className="input flex-grow text-sm"
                    />
                  </div>
                  <div className="space-y-1 max-h-60 overflow-y-auto text-xs mt-2">
                    {localFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center overflow-hidden">
                          <Paperclip className="h-3 w-3 mr-1 flex-shrink-0" />
                          <span className="break-all">{file.name}</span>
                        </div>
                        <button
                          onClick={() => removeUploadedFile(file)}
                          className="text-red-500 hover:text-red-700 ml-2 flex-shrink-0"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {files.map((file, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center overflow-hidden">
                          <Paperclip className="h-3 w-3 mr-1 flex-shrink-0" />
                          <span className="break-all">{file.name}</span>
                        </div>
                        <button
                          onClick={() => removeFile(index)}
                          className="text-red-500 hover:text-red-700 ml-2 flex-shrink-0"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="w-full sm:w-1/2 border border-gray-200 p-2 rounded flex flex-col">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Required Paperwork:
                    </label>
                    {requiredPaperwork.length > 0 ? (
                      <div className="space-y-1 text-xs">
                        {requiredPaperwork.map((item) => (
                          <div key={item} className="flex items-center">
                            <input
                              type="checkbox"
                              id={`paperwork-${item}`}
                              {...register(`receivedPaperwork.${item}`)}
                              className="form-checkbox h-3 w-3 text-blue-600"
                            />
                            <label htmlFor={`paperwork-${item}`} className="ml-2">
                              {item}
                            </label>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500">No required paperwork for this category.</p>
                    )}
                  </div>
                  
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Paperwork Received:
                    </label>
                    <select
                      {...register("paperworkReceived")}
                      className="input w-full text-sm"
                    >
                      <option value="">Select</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                      <option value="Partial">Partial</option>
                    </select>
                  </div>
                </div>
              </div>
              
              <div className="w-full">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Paperwork Notes:
                </label>
                <textarea
                  {...register("paperworkNotes")}
                  className="input w-full h-12"
                  placeholder="Enter any notes about the paperwork here"
                  ref={paperworkNotesRef}
                />
              </div>
            </div>
          </fieldset>

          {/* Candidate Information */}
          <fieldset className="border border-gray-200 p-3 rounded">
            <legend className="text-sm font-medium px-2">
              Candidate Information
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <input
                  {...register("surname", { required: "Surname is required" })}
                  placeholder="Surname"
                  className="input w-full"
                />
                {errors.surname && (
                  <span className="text-red-500 text-sm">
                    {errors.surname.message}
                  </span>
                )}
              </div>
              <div>
                <input
                  {...register("forename", {
                    required: "Forename is required",
                  })}
                  placeholder="Forename"
                  className="input w-full"
                />
                {errors.forename && (
                  <span className="text-red-500 text-sm">
                    {errors.forename.message}
                  </span>
                )}
              </div>
              <input
                {...register("email")}
                placeholder="Email"
                type="email"
                className="input"
              />
            </div>
          </fieldset>

          {/* Diocese Information */}
          <fieldset className="border border-gray-200 p-3 rounded mt-3">
            <legend className="text-sm font-medium px-2">
              Diocese Information
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <input
                  {...register("diocese", { required: "Diocese is required" })}
                  placeholder="Diocese"
                  className="input w-full"
                />
                {errors.diocese && (
                  <span className="text-red-500 text-sm">
                    {errors.diocese.message}
                  </span>
                )}
                {dioceseWarning && (
                  <p className="mt-2 text-sm text-yellow-600">{dioceseWarning}</p>
                )}
              </div>
              <input
                {...register("sponsoringBishop")}
                placeholder="Sponsoring Bishop"
                className="input"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <input
                {...register("ddoName")}
                placeholder="DDO Name"
                className="input"
              />
              <input
                {...register("ddoEmail")}
                placeholder="DDO Email"
                type="email"
                className="input"
              />
            </div>
          </fieldset>

          {/* Question Category, Asked Question, and Revised Question */}


          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <textarea
              {...register("questionAsked")}
              placeholder="Question Asked"
              className="input w-full h-24"
            />
            <textarea
              {...register("revisedQuestion")}
              placeholder="Revised Question"
              className="input w-full h-24"
            />
          </div>
        </div>
        <div className="flex justify-between mt-4">
          <button
            type="submit"
            className="btn-primary w-full sm:w-auto"
            disabled={isUploading}
          >
            {isUploading ? (
              <>
                <svg
                  className="animate-spin h-5 w-5 mr-3 inline"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Uploading...
              </>
            ) : editingId ? (
              "Update Candidate"
            ) : (
              "Add Candidate"
            )}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={cancelEdit}
              className="btn-secondary"
            >
              Cancel Edit
            </button>
          )}
        </div>
        {isUploading && (
          <div className="mt-2 text-sm text-blue-500">
            <svg
              className="animate-spin h-5 w-5 mr-3 inline"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            Uploading files... This may take a moment.
          </div>
        )}
      </form>
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {candidates.length > 0 ? (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Surname
                </th>
                {/* Remove the Email column */}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Question Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Paperwork
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  NDA
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Panel Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Revised Question
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {candidates.map((candidate) => (
                <tr
                  key={candidate.id}
                  className="hover:bg-gray-100 cursor-pointer"
                  onClick={() => editCandidate(candidate)}
                >
                  <td className="px-4 py-2 whitespace-nowrap">
                    {candidate.surname}
                  </td>
                  {/* Remove the Email cell */}
                  <td
                    className="px-4 py-2 whitespace-nowrap"
                    title={candidate.questionCategory}
                  >
                    {truncateText(candidate.questionCategory, 20)}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <div
                      className="flex items-center justify-center"
                      title={`Paperwork: ${candidate.paperworkReceived}`}
                    >
                      {getPaperworkIcon(candidate.paperworkReceived)}
                    </div>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {ndas.find((nda) => nda.id === candidate.ndaId)?.name ||
                      "Not assigned"}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {panelDates.find((pd) => pd.id === candidate.panelDateId)
                      ? new Date(
                          panelDates.find(
                            (pd) => pd.id === candidate.panelDateId
                          )!.date
                        ).toLocaleDateString()
                      : "Not assigned"}
                  </td>
                  <td
                    className="px-4 py-2 whitespace-nowrap"
                    title={candidate.revisedQuestion || ""}
                  >
                    {truncateText(candidate.revisedQuestion || "", 20)}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        editCandidate(candidate);
                      }}
                      className="text-blue-600 hover:text-blue-900 mr-2"
                      title="Edit Candidate"
                    >
                      <Edit className="h-5 w-5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteCandidate(candidate.id);
                      }}
                      className="text-red-600 hover:text-red-900 mr-2"
                      title="Delete Candidate"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleInterviewAction(candidate.id);
                      }}
                      className="text-blue-600 hover:text-green-900"
                      title="Manage Interviews"
                    >
                      <Calendar className="h-5 w-5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        generateCandidateLetterHTML(candidate);
                      }}
                      className={`text-${candidate.letterGenerated ? 'green' : 'black'}-600 hover:text-green-900 ml-2`}
                      title="Generate Candidate Letter"
                    >
                      <FileText className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-4 text-center text-gray-500">
            No candidates match the current filters.
          </div>
        )}
      </div>
      {candidateToDelete && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3 text-center">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                Delete Candidate
              </h3>
              <div className="mt-2 px-7 py-3">
                <p className="text-sm text-gray-500">
                  Are you sure you want to delete this candidate? This action
                  cannot be undone.
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
                  onClick={() => setCandidateToDelete(null)}
                  className="mt-3 px-4 py-2 bg-white text-gray-800 text-base font-medium rounded-md w-full shadow-sm border border-gray-300 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {missingTemplateInfo && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3 text-center">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                Missing Template
              </h3>
              <div className="mt-2 px-7 py-3">
                <p className="text-sm text-gray-500">
                  No template found for:
                  <br />
                  Category: {missingTemplateInfo.category}
                  <br />
                  Template Name: {missingTemplateInfo.name}
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Please contact the Admin to create this template.
                </p>
              </div>
              <div className="items-center px-4 py-3">
                <button
                  onClick={() => setMissingTemplateInfo(null)}
                  className="px-4 py-2 bg-blue-500 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export function escapeRTF(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\n/g, "\\par ")
    .replace(/[^\u0000-\u007F]/g, (char) => `\\u${char.charCodeAt(0)}`);
}

export default Candidates;
